// -----------------------------------------------------------------------------
// What the integration writes in `docker logs` at the default level (info):
// the lifecycle only. A normal reading cycle writes nothing, a printer
// switched off for the night writes one line when it stops answering and one
// when it comes back, whatever the number of readings and rediscoveries in
// between. Also the container's own timer, which reads the printers without
// any help from the Gladys scheduler (core 5.2.0 never polls devices created
// without should_poll, GladysAssistant/Gladys#3198).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNREACHABLE_AFTER } from '../src/monitor.js';
import { createDevices, createWorld, deviceId, printerOf } from './helpers/world.js';

/** Capture the lines the SDK logger writes at `level` and above. */
function captureLogs(t, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  const { log, error } = console;
  process.env.LOG_LEVEL = level;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  const restore = () => {
    console.log = log;
    console.error = error;
    process.env.LOG_LEVEL = previous;
  };
  t.after(restore);
  return { lines, restore };
}

const matching = (lines, pattern) => lines.filter((line) => pattern.test(line));

test('a normal reading cycle writes nothing at info level', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);

  const { lines } = captureLogs(t);
  for (let i = 0; i < 5; i += 1) {
    await world.monitor.pollAll();
  }
  // Pages printed: new states, still no line.
  printer.setCounter(0x00, 1700);
  await world.monitor.pollAll();
  assert.deepEqual(lines, []);
});

test('a printer switched off: one line lost, one line back, rediscoveries stay quiet', async (t) => {
  let clock = new Date('2026-10-12T22:00:00Z');
  const printer = printerOf('hl-l2340dw', '192.0.2.60');
  const other = printerOf('dcp-l2540dn', '192.0.2.61');
  const { lines } = captureLogs(t);
  const world = await createWorld({
    printers: [printer, other],
    // The first printer typed by hand, plus an address where nothing answers.
    config: { printer_hosts: '192.0.2.60, 192.0.2.99' },
    now: () => clock,
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);

  // Start-up: each printer found once, the dead address reported once.
  assert.equal(matching(lines, /Found Brother/).length, 2);
  assert.equal(matching(lines, /No Brother printer read at 192\.0\.2\.99/).length, 1);
  const scans = world.fake.scans.length;
  const startup = lines.length;

  // Three nights: the printer is off, many readings, an automatic
  // rediscovery each night, and a few scans asked from Gladys.
  const mdnsByDay = world.fake.scanResults.mdns;
  for (let night = 0; night < 3; night += 1) {
    const before = lines.length;
    printer.online = false;
    world.fake.scanResults.mdns = mdnsByDay.filter(
      (entry) => !entry.addresses.includes(printer.host),
    );
    for (let i = 0; i < 20; i += 1) {
      clock = new Date(clock.getTime() + 31 * 60 * 1000);
      await world.monitor.pollAll();
    }
    await world.fake.scanRequest();
    await world.fake.scanRequest();
    assert.equal(world.fake.lastState(`${id}:status`), 'Not responding');
    const lost = lines.slice(before);
    assert.equal(lost.length, 1, lost.join('\n'));
    assert.match(lost[0], /is not responding/);

    // Morning: one line.
    printer.online = true;
    world.fake.scanResults.mdns = mdnsByDay;
    for (let i = 0; i < UNREACHABLE_AFTER + 2; i += 1) {
      clock = new Date(clock.getTime() + 60 * 1000);
      await world.monitor.pollAll();
    }
    await world.fake.scanRequest();
    const back = lines.slice(before + 1);
    assert.equal(back.length, 1, back.join('\n'));
    assert.match(back[0], /is responding again/);
  }
  // 3 nights x (1 automatic + 2 asked) + 3 mornings.
  assert.equal(world.fake.scans.length, scans + 12);
  assert.equal(lines.length, startup + 6);
});

test('repeated refusals from Gladys: one warning, one line when it works again', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);

  const { lines } = captureLogs(t);
  const publish = world.gladys.publishChangedStates.bind(world.gladys);
  world.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let page = 1; page <= 5; page += 1) {
    printer.setCounter(0x00, 2000 + page); // a change to publish each time
    await world.monitor.pollAll();
  }
  assert.equal(matching(lines, /refused/).length, 1);
  world.gladys.publishChangedStates = publish;
  printer.setCounter(0x00, 3000);
  await world.monitor.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /accepted again/);
});

test('the community never appears in the logs', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const { lines } = captureLogs(t, 'debug');
  const world = await createWorld({
    printers: [printer],
    config: { community: 's3cret-community', printer_hosts: '192.0.2.99' },
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  await world.monitor.pollAll();
  assert.ok(lines.length > 0);
  assert.deepEqual(matching(lines, /s3cret-community/), []);
});

test('the container timer reads the printers without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({
    printers: [printer],
    timers: true,
    // As core 5.2.0 for a device with should_poll: false: never a poll.
    beforeRegister: (gladys) => {
      gladys.onPoll = () => {};
    },
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);
  const [device] = world.fake.discoveredDevices;
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);

  printer.setCounter(0x00, 1700);
  const exchanges = world.network.exchanges;
  t.mock.timers.tick(59_000);
  assert.equal(world.network.exchanges, exchanges, 'not before poll_interval (60 s)');
  t.mock.timers.tick(1_000);
  await world.monitor.loop;
  assert.ok(world.network.exchanges > exchanges);
  assert.equal(world.fake.lastState(`${id}:page_counter`), 1700);

  printer.setCounter(0x00, 1710);
  t.mock.timers.tick(60_000);
  await world.monitor.loop;
  assert.equal(world.fake.lastState(`${id}:page_counter`), 1710);
});
