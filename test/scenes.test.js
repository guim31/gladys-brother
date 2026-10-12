// -----------------------------------------------------------------------------
// Scene action `read_printer` and manifest action `test_printer`.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDevices, createWorld, deviceId, printerOf } from './helpers/world.js';

test('read_printer reads now and hands its key figures to the scene', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer], config: { language: 'es' } });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);
  const before = world.network.exchanges;

  const ack = await world.fake.sceneAction('read_printer', { printer: id });
  assert.equal(world.network.exchanges, before + 1);
  assert.deepEqual(ack.data.outputs, {
    reachable: true,
    status: 'Mało toneru (Y)',
    pages_printed: 1611,
    lowest_supply: 'Tóner amarillo',
    lowest_supply_percent: 2,
    alerts: 'Tóner o tinta bajo, Cubierta abierta',
  });
  // A scene action never fires a scene event (a scene could loop on it).
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('read_printer on a printer that does not answer: last figures, honest status', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  printer.online = false;
  const ack = await world.fake.sceneAction('read_printer', {
    printer: deviceId(world.gladys, printer),
  });
  assert.deepEqual(ack.data.outputs, {
    reachable: false,
    status: 'Not responding',
    pages_printed: 986,
    lowest_supply: 'Black toner',
    lowest_supply_percent: 75,
    alerts: '',
  });
});

test('read_printer on an unknown printer fails that action only', async (t) => {
  const world = await createWorld({ printers: [] });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('read_printer', { printer: 'ext:nope' });
  assert.equal(ack.success, false);
});

test('test_printer: what answers at an address, in every language', async (t) => {
  const printer = printerOf('mfc-j5110dw', '192.0.2.80');
  const world = await createWorld({ printers: [printer], mdns: [] });
  t.after(() => world.app.stop());

  const found = await world.fake.action('test_printer', { host: ' 192.0.2.80 ' });
  assert.equal(
    found.data.message.en,
    'Brother MFC-J5110DW found (inkjet): status "Ready", 3,384 pages printed, lowest supply: Waste ink box 75 %.',
  );
  assert.match(found.data.message.fr, /jet d’encre/);
  assert.deepEqual(world.fake.discoveredDevices, [], 'a test publishes nothing');

  const silent = await world.fake.action('test_printer', { host: '192.0.2.81' });
  assert.match(silent.data.message.de, /Keine SNMP-Antwort von 192\.0\.2\.81/);

  const invalid = await world.fake.action('test_printer', { host: '300.1.1.1' });
  assert.match(invalid.data.message.es, /no es una dirección IP/);
});

test('test_printer: an SNMP agent that is not a Brother printer', async (t) => {
  const printer = printerOf('hl-l2340dw', '192.0.2.82');
  delete printer.varbinds['1.3.6.1.4.1.2435.2.3.9.1.1.7.0'];
  const world = await createWorld({ printers: [printer], mdns: [] });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_printer', { host: '192.0.2.82' });
  assert.match(ack.data.message.en, /not a Brother printer/);
});
