// -----------------------------------------------------------------------------
// The `supplies` widget: valid content for the core (budget, lengths), gauges
// bound to the created features, every supply shown somewhere, honest empty
// and unreachable states, and the "Read now" button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_GAUGES, buildSuppliesContent, splitSupplies } from '../src/widgets.js';
import { createDevices, createWorld, deviceId, printerOf } from './helpers/world.js';

const LANGS = ['en', 'fr', 'de', 'es'];

async function contentOf(world, settings, language = 'en') {
  const ack = await world.fake.widgetGet('supplies', { settings, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const byType = (content, type) => content.components.filter((c) => c.type === type);

test('every printer, every language: content the core renders as sent', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  for (const device of world.monitor.devices) {
    for (const language of LANGS) {
      const content = await contentOf(world, { printer: device.external_id }, language);
      assert.deepEqual(validateWidgetContent(content), [], `${device.name} (${language})`);
      // Every bound gauge points at a feature of the created device.
      for (const gauge of byType(content, 'gauge').filter((g) => g.device_feature)) {
        assert.ok(
          device.features.some((feature) => feature.external_id === gauge.device_feature),
          `${device.name}: ${gauge.device_feature}`,
        );
      }
    }
  }
});

test('colour laser: four toners in gauges, the lowest part too, the rest as rows', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const content = await contentOf(world, {});
  const gauges = byType(content, 'gauge');
  assert.equal(gauges.length, MAX_GAUGES);
  assert.deepEqual(
    gauges.map((gauge) => gauge.label),
    ['Black', 'Cyan', 'Magenta', 'Yellow', 'Black drum'],
  );
  assert.deepEqual(
    gauges.map((gauge) => gauge.color),
    ['success', 'danger', 'danger', 'danger', 'success'],
  );
  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map(({ label, value }) => [label, value]),
    [
      ['Status', 'Mało toneru (Y)'],
      ['Alerts', 'Toner or ink low, Cover open'],
      ['Pages printed', '1,611'],
      ['Cyan drum', '92 %'],
      ['Magenta drum', '92 %'],
      ['Yellow drum', '92 %'],
      ['Belt', '97 %'],
      ['Fuser', '97 %'],
      ['PF kit tray 1', '98 %'],
      ['Last reading', status.items.at(-1).value],
    ],
  );
  assert.equal(status.items[0].color, 'danger', 'a cover open stops the printer');
  const [button] = byType(content, 'button');
  assert.deepEqual(button.action, {
    key: 'read',
    params: { printer: deviceId(world.gladys, printer) },
  });
  assert.notEqual(button.style, 'primary', 'invisible in dark mode');
});

test('splitSupplies: no supply lost, lowest parts first', () => {
  const supplies = [
    { key: 'black_cartridge', value: 50, cartridge: true },
    { key: 'drum', value: 40, cartridge: false },
    { key: 'belt', value: 10, cartridge: false },
    { key: 'fuser', value: 90, cartridge: false },
    { key: 'laser_unit', value: 80, cartridge: false },
    { key: 'pf_kit_1', value: 70, cartridge: false },
    { key: 'pf_kit_mp', value: 5, cartridge: false },
  ];
  const { gauges, rows } = splitSupplies(supplies);
  assert.deepEqual(
    gauges.map(({ key }) => key),
    ['black_cartridge', 'pf_kit_mp', 'belt', 'drum', 'pf_kit_1'],
  );
  assert.deepEqual(
    rows.map(({ key }) => key),
    ['laser_unit', 'fuser'],
  );
});

test('a supply not yet a feature of the created device gets an inline gauge', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const device = world.monitor.devices[0];
  device.features = device.features.filter((f) => !f.external_id.endsWith(':drum'));
  const content = await contentOf(world, {});
  const drum = byType(content, 'gauge').find((gauge) => gauge.label === 'Drum');
  assert.equal(drum.device_feature, undefined);
  assert.equal(drum.value, 92);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('empty states: no printer, a removed printer, before the first reading', async (t) => {
  const world = await createWorld({ printers: [], mdns: [] });
  t.after(() => world.app.stop());
  const none = await contentOf(world, {}, 'fr');
  assert.match(none.components[0].text, /Découverte/);

  const device = { name: 'Brother HL-L2340DW', external_id: 'ext:x:printer:a', features: [] };
  const waiting = buildSuppliesContent({ device, snapshot: null, language: 'es' });
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.match(waiting.components.find((c) => c.variant === 'caption').text, /primera lectura/);

  const missing = buildSuppliesContent({
    device: null,
    snapshot: null,
    language: 'de',
    missing: true,
  });
  assert.match(missing.components[0].text, /nicht mehr in Gladys/);
});

test('an unreachable printer says so, without inventing alerts', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  printer.online = false;
  await world.monitor.pollAll();
  await world.monitor.pollAll();
  const content = await contentOf(world, {}, 'fr');
  const [status] = byType(content, 'status');
  assert.deepEqual(status.items[0], { label: 'État', value: 'Ne répond pas', color: 'danger' });
  assert.ok(!status.items.some((item) => item.label === 'Alertes'));
});

test('"Read now" reads the printer and sums it up in a toast', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);
  const before = world.network.exchanges;
  const ack = await world.fake.widgetAction('supplies', 'read', { printer: id });
  assert.equal(world.network.exchanges, before + 1);
  assert.deepEqual(ack.data.message, {
    en: 'Brother HL-L2340DW: OCZEKIWANIE · lowest supply: Black 75 %',
    fr: 'Brother HL-L2340DW : OCZEKIWANIE · consommable le plus bas : Noir 75 %',
    de: 'Brother HL-L2340DW: OCZEKIWANIE · niedrigster Füllstand: Schwarz 75 %',
    es: 'Brother HL-L2340DW: OCZEKIWANIE · consumible más bajo: Negro 75 %',
  });

  // No answer: said at once, the user is waiting for it.
  printer.online = false;
  const down = await world.fake.widgetAction('supplies', 'read', { printer: id });
  assert.equal(down.data.message.en, 'Brother HL-L2340DW is not responding.');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');

  const unknown = await world.fake.widgetAction('supplies', 'read', { printer: 'ext:nope' });
  assert.equal(unknown.success, false);
  const other = await world.fake.widgetAction('supplies', 'other', { printer: id });
  assert.equal(other.success, false);
});
