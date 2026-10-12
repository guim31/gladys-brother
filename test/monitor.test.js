// -----------------------------------------------------------------------------
// The monitor against the SDK's fake Gladys and simulated printers: discovery
// (mDNS and manual list), the device and its states, publishing only what
// changed, the honest "not responding" state, a printer that changed address.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OIDS } from '../src/brother/constants.js';
import { UNREACHABLE_AFTER } from '../src/monitor.js';
import { createDevices, createWorld, deviceId, mdnsEntry, printerOf } from './helpers/world.js';

test('mDNS discovery: Brother printer services only, one device per printer', async (t) => {
  const laser = printerOf('hl-l2340dw', '192.0.2.20');
  const ink = printerOf('mfc-j5110dw', '192.0.2.21');
  const world = await createWorld({
    printers: [laser, ink],
    mdns: [
      mdnsEntry(laser),
      mdnsEntry(laser, { service: '_ipp._tcp' }), // same printer, second service
      mdnsEntry(ink, { service: '_ipp._tcp' }),
      // What the core also mixes in: other services of chatty hosts.
      { name: 'NAS._smb._tcp.local', host: 'nas.local', addresses: ['192.0.2.30'], port: 445 },
      {
        name: 'HP OfficeJet._ipp._tcp.local',
        host: 'hp.local',
        addresses: ['192.0.2.31'],
        port: 631,
        txt: ['ty=HP OfficeJet', 'usb_MFG=HP'],
      },
    ],
  });
  t.after(() => world.app.stop());

  assert.deepEqual(world.fake.discoveredDevices.map((device) => device.name).sort(), [
    'Brother HL-L2340DW',
    'Brother MFC-J5110DW',
  ]);
  // Never a single SNMP datagram to a host that is not a Brother printer.
  assert.deepEqual([...world.network.targets].sort(), ['192.0.2.20', '192.0.2.21']);
  assert.equal(world.fake.scans[0].type, 'mdns');
});

test('a Brother service recognized by its TXT record only', async (t) => {
  const printer = printerOf('dcp-l2540dn', '192.0.2.22');
  const entry = { ...mdnsEntry(printer), name: 'Office printer._printer._tcp.local' };
  const world = await createWorld({ printers: [printer], mdns: [entry] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('manual list when mDNS is unavailable; the same printer twice is one device', async (t) => {
  const printer = printerOf('dcp-l3550cdw', '192.0.2.40');
  const world = await createWorld({
    printers: [printer],
    mdns: null,
    config: { printer_hosts: '192.0.2.40, http://192.0.2.40/general/status.html, 192.0.2.99' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.deepEqual(world.monitor.lastDiscovery.mdns, 'unavailable');
  assert.deepEqual(
    world.monitor.lastDiscovery.failures.map(({ host }) => host),
    ['192.0.2.99'],
  );
});

test('nothing found: connected, with a hint in the Configuration screen', async (t) => {
  const world = await createWorld({ printers: [], mdns: [] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.match(world.fake.connectionStatus.message.en, /IP address/);
  assert.equal(world.fake.discoveredDevices.length, 0);
});

test('the device: serial-based id, params, no Gladys polling, only reported features', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  const [device] = world.fake.discoveredDevices;

  assert.equal(device.external_id, 'ext:test-integration:printer:u00000k1n000010');
  assert.equal(device.external_id, deviceId(world.gladys, printer));
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(Object.fromEntries(device.params.map(({ name, value }) => [name, value])), {
    HOST: '192.0.2.50',
    MODEL: 'HL-L2340DW',
    SERIAL: 'U00000K1N000010',
    PRINTER_TYPE: 'laser',
    FIRMWARE: '1.17',
    MAC: '00:80:77:00:00:0a',
  });
  // A mono laser: no colour, no belt, no waste ink box.
  assert.deepEqual(
    device.features.map(({ external_id: id }) => id.slice(device.external_id.length + 1)),
    [
      'status',
      'black_cartridge',
      'drum',
      'drum_remaining_pages',
      'page_counter',
      'drum_page_counter',
      'uptime',
    ],
  );
  assert.deepEqual(
    device.features.map(({ name }) => name),
    [
      'Status',
      'Black toner',
      'Drum',
      'Drum: pages left',
      'Pages printed',
      'Drum: pages printed',
      'Uptime',
    ],
  );
});

test('feature names follow the language setting, cartridges follow the family', async (t) => {
  const world = await createWorld({
    printers: [printerOf('mfc-j5110dw', '192.0.2.60'), printerOf('mfc-5490cn', '192.0.2.61')],
    config: { language: 'fr' },
  });
  t.after(() => world.app.stop());
  const names = Object.fromEntries(
    world.fake.discoveredDevices.map((device) => [
      device.model,
      device.features.map(({ name }) => name),
    ]),
  );
  assert.ok(names['MFC-J5110DW'].includes('Encre noire'));
  assert.ok(names['MFC-J5110DW'].includes("Réservoir d'encre usagée"));
  // Legacy model, family unknown: a neutral name.
  assert.ok(names['MFC-5490CN'].includes('Cartouche jaune'));
});

test('creating the device publishes every state at once, then only the changes', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  const id = deviceId(world.gladys, printer);
  assert.equal(world.fake.states.length, 0, 'nothing before the device exists');

  await createDevices(world);
  assert.equal(world.fake.lastState(`${id}:yellow_cartridge`), 2);
  assert.equal(world.fake.lastState(`${id}:status`), 'Mało toneru (Y)');
  assert.equal(world.fake.lastState(`${id}:page_counter`), 1611);
  assert.equal(world.fake.lastState(`${id}:belt_remaining_pages`), 48436);
  const published = world.fake.states.length;
  assert.equal(published, world.fake.discoveredDevices[0].features.length);
  assert.deepEqual(world.fake.widgetRefreshes, ['supplies']);
  assert.deepEqual(world.fake.transports, [{ device_external_id: id, transport: 'local' }]);

  // Nothing changed: nothing sent.
  await world.monitor.pollAll();
  assert.equal(world.fake.states.length, published);

  // Two pages printed, the toner goes down.
  printer.setCounter(0x00, 1613);
  printer.setMaintenance(0x6f, 2500);
  await world.monitor.pollAll();
  assert.deepEqual(
    world.fake.states.slice(published).map((state) => state.device_feature_external_id),
    [`${id}:black_cartridge`, `${id}:page_counter`],
  );
  assert.equal(world.fake.lastState(`${id}:black_cartridge`), 25);
});

test('a sleeping printer is not declared unreachable at the first missed reading', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);

  printer.online = false;
  for (let i = 1; i < UNREACHABLE_AFTER; i += 1) {
    await world.monitor.pollAll();
  }
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.equal(world.fake.lastState(`${id}:status`), 'OCZEKIWANIE');

  await world.monitor.pollAll();
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(world.fake.lastState(`${id}:status`), 'Not responding');
  // The levels stay at their last known value: no fake zero.
  assert.equal(world.fake.lastState(`${id}:black_cartridge`), 75);

  // Further misses send nothing more.
  const sent = world.fake.states.length + world.fake.transports.length;
  await world.monitor.pollAll();
  assert.equal(world.fake.states.length + world.fake.transports.length, sent);

  printer.online = true;
  await world.monitor.pollAll();
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.equal(world.fake.lastState(`${id}:status`), 'OCZEKIWANIE');
});

test('a printer that changed address is found again by the next discovery', async (t) => {
  const printer = printerOf('hl-l2340dw', '192.0.2.70');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);

  // DHCP: the printer moves, another Brother takes its old address.
  const other = printerOf('dcp-7070dw', '192.0.2.70');
  printer.host = '192.0.2.71';
  world.network.printers.clear();
  world.network.printers.set('192.0.2.71', printer);
  world.network.printers.set('192.0.2.70', other);
  world.fake.scanResults.mdns = [mdnsEntry(printer), mdnsEntry(other)];

  const result = await world.monitor.pollDevice(world.monitor.findDevice(id));
  assert.equal(result.ok, false);
  assert.match(result.error.message, /another printer \(Brother DCP-7070DW\)/);

  await world.fake.scanRequest();
  const device = world.fake.discoveredDevices.find((candidate) => candidate.external_id === id);
  assert.equal(device.params.find(({ name }) => name === 'HOST').value, '192.0.2.71');
  const again = await world.monitor.pollDevice(world.monitor.findDevice(id));
  assert.equal(again.ok, true);
});

test('unreachable for a while: one rediscovery, no more than every 30 minutes', async (t) => {
  let clock = new Date('2026-10-12T10:00:00Z');
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer], now: () => clock });
  t.after(() => world.app.stop());
  await createDevices(world);
  const scans = world.fake.scans.length;

  printer.online = false;
  for (let i = 0; i < UNREACHABLE_AFTER; i += 1) {
    await world.monitor.pollAll();
  }
  assert.equal(world.fake.scans.length, scans, 'not right after the start-up discovery');
  clock = new Date('2026-10-12T10:31:00Z');
  await world.monitor.pollAll();
  assert.equal(world.fake.scans.length, scans + 1);
  await world.monitor.pollAll();
  assert.equal(world.fake.scans.length, scans + 1);
});

test('a reconnection re-sends every state (Gladys may have restarted)', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const before = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(world.fake.states.length, before * 2);
});

test('config update: new community, re-discovery, every state again', async (t) => {
  const printer = printerOf('hl-l2340dw');
  printer.community = 'office';
  const world = await createWorld({
    printers: [printer],
    config: { printer_hosts: '192.0.2.50' },
    mdns: [],
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 0);
  await world.fake.configUpdated({ printer_hosts: '192.0.2.50', community: 'office' });
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(printer.requests.at(-1).community, 'office');
});

test('two readings of the same printer at once share one SNMP exchange', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const device = world.monitor.devices[0];
  const before = world.network.exchanges;
  await Promise.all([
    world.monitor.pollDevice(device),
    world.monitor.pollDevice(device, { force: true }),
  ]);
  assert.equal(world.network.exchanges, before + 1);
});

test('a printer without the Host Resources OIDs still works (no alerts reported)', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(world.monitor.snapshot(world.monitor.devices[0].external_id).reading.errors, null);
  assert.equal(printer.fixture.varbinds[OIDS.printerErrors], undefined);
});
