// -----------------------------------------------------------------------------
// Scene triggers: `supply_low` fires once per step a supply goes down through,
// `printer_error` when an alert appears; nothing on the first reading, nothing
// twice across a restart (the state is kept in /data).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { THRESHOLDS, evaluateSupply, newErrors } from '../src/triggers.js';
import { createDevices, createWorld, deviceId, printerOf } from './helpers/world.js';

test('evaluateSupply: crossings, first reading, re-arming with a margin', () => {
  // First reading at 8 %: steps 10, 15... are already "fired", nothing to send.
  assert.deepEqual(evaluateSupply(8, undefined), { fired: [50, 25, 20, 15, 10], crossed: [] });
  // 26 → 9: four steps crossed at once, highest first.
  const at26 = evaluateSupply(26, undefined).fired;
  assert.deepEqual(evaluateSupply(9, at26).crossed, [25, 20, 15, 10]);
  // Wobbling around 10 does not fire again...
  const at9 = evaluateSupply(9, at26).fired;
  const at12 = evaluateSupply(12, at9);
  assert.ok(at12.fired.includes(10));
  assert.deepEqual(evaluateSupply(10, at12.fired).crossed, []);
  // ...a new cartridge re-arms every step.
  const at100 = evaluateSupply(100, at9);
  assert.deepEqual(at100.fired, []);
  assert.deepEqual(evaluateSupply(10, at100.fired).crossed, [50, 25, 20, 15, 10]);
  // Empty is a step of its own.
  assert.deepEqual(evaluateSupply(0, evaluateSupply(3, []).fired).crossed, [0]);
  assert.deepEqual(THRESHOLDS, [50, 25, 20, 15, 10, 5, 0]);
});

test('newErrors: only the alerts that appeared, never on a first reading', () => {
  assert.deepEqual(newErrors(['jammed', 'low_paper'], ['low_paper']), ['jammed']);
  assert.deepEqual(newErrors(['jammed'], undefined), []);
  assert.deepEqual(newErrors(null, []), []);
});

test('a toner going down fires supply_low once per step, with its variables', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer], config: { language: 'fr' } });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);
  assert.deepEqual(world.fake.sceneEvents, [], 'nothing on the first reading');

  printer.setMaintenance(0x6f, 2100); // black 26 % → 21 %
  await world.monitor.pollAll();
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'supply_low',
      data: {
        printer: id,
        printer_name: 'Brother DCP-L3550CDW',
        supply: 'black_cartridge',
        supply_name: 'Toner noir',
        percent: 21,
        threshold: 25,
      },
    },
  ]);

  await world.monitor.pollAll();
  assert.equal(world.fake.sceneEvents.length, 1, 'not twice');

  printer.setMaintenance(0x6f, 900); // 9 %: crosses 20, 15 and 10
  await world.monitor.pollAll();
  assert.deepEqual(
    world.fake.sceneEvents.slice(1).map(({ data }) => data.threshold),
    [20, 15, 10],
  );
});

test('the fired steps survive a restart: no repeat, no miss', async (t) => {
  const printer = printerOf('dcp-l3550cdw');
  const first = await createWorld({ printers: [printer] });
  await createDevices(first);
  const devices = first.fake.devices;
  printer.setMaintenance(0x6f, 2100);
  await first.monitor.pollAll();
  assert.equal(first.fake.sceneEvents.length, 1);
  await first.app.stop();
  const saved = JSON.parse(await readFile(join(first.dataDir, 'brother-state.json'), 'utf8'));
  assert.ok(saved.printers[deviceId(first.gladys, printer)].fired.black_cartridge.includes(25));

  // While the integration was stopped, the toner went down to 18 %.
  printer.setMaintenance(0x6f, 1800);
  const second = await createWorld({
    printers: [printer],
    dataDir: first.dataDir,
    gladysDevices: devices,
  });
  t.after(() => second.app.stop());
  assert.deepEqual(
    second.fake.sceneEvents.map(({ data }) => data.threshold),
    [20],
  );
});

test('a new alert fires printer_error with the display text; a lasting one does not', async (t) => {
  const printer = printerOf('mfc-j5110dw');
  const world = await createWorld({ printers: [printer], config: { language: 'de' } });
  t.after(() => world.app.stop());
  await createDevices(world);
  const id = deviceId(world.gladys, printer);

  printer.setErrors('0400'); // jammed
  printer.setStatusText('Papierstau');
  await world.monitor.pollAll();
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'printer_error',
      data: {
        printer: id,
        printer_name: 'Brother MFC-J5110DW',
        error: 'jammed',
        error_name: 'Papierstau',
        status: 'Papierstau',
      },
    },
  ]);
  await world.monitor.pollAll();
  assert.equal(world.fake.sceneEvents.length, 1);

  // Cleared, then again: a new event.
  printer.setErrors('00');
  await world.monitor.pollAll();
  printer.setErrors('0c00'); // cover open + jam
  await world.monitor.pollAll();
  assert.deepEqual(
    world.fake.sceneEvents.slice(1).map(({ data }) => data.error),
    ['door_open', 'jammed'],
  );
});

test('every key of an event is a declared filter or variable', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const printer = printerOf('dcp-l3550cdw');
  const world = await createWorld({ printers: [printer] });
  try {
    await createDevices(world);
    printer.setMaintenance(0x6f, 900);
    printer.setErrors('0400');
    await world.monitor.pollAll();
    const fired = new Set(world.fake.sceneEvents.map(({ key }) => key));
    assert.deepEqual([...fired].sort(), ['printer_error', 'supply_low']);
    for (const event of world.fake.sceneEvents) {
      const trigger = manifest.scene_triggers.find(({ key }) => key === event.key);
      const declared = [
        ...trigger.fields.map(({ key }) => key),
        ...trigger.variables.map(({ key }) => key),
      ];
      assert.deepEqual(Object.keys(event.data).sort(), [...new Set(declared)].sort(), event.key);
    }
  } finally {
    await world.app.stop();
  }
});

test('the supply and alert filter options are the keys the code sends', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const { SUPPLY_KEYS } = await import('../src/features.js');
  const { PRINTER_ERRORS } = await import('../src/brother/constants.js');
  const options = (trigger, field) =>
    manifest.scene_triggers
      .find(({ key }) => key === trigger)
      .fields.find(({ key }) => key === field)
      .options.map(({ value }) => value);
  assert.deepEqual(options('supply_low', 'supply').sort(), [...SUPPLY_KEYS].sort());
  assert.deepEqual(options('printer_error', 'error').sort(), [...PRINTER_ERRORS].sort());
  assert.deepEqual(options('supply_low', 'threshold'), THRESHOLDS.map(String));
});
