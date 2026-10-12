// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG, LANGUAGES, POLL_INTERVAL, SNMP_VERSION_CHOICES } from '../src/config.js';
import { MDNS_SERVICES } from '../src/discovery.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { TRIGGERS } from '../src/triggers.js';
import { WIDGETS } from '../src/widgets.js';
import { createDevices, createWorld, deviceId, printerOf } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, local transport, categories of IPP Printers, mDNS', () => {
  assert.equal(manifest.name, 'Brother Printers');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-brother:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-brother/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['appliances', 'network']);
  assert.deepEqual(
    manifest.network_discovery,
    MDNS_SERVICES.map((service) => ({ type: 'mdns', service })),
  );
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(declared, CAPABILITY_FIELDS);
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `${declared.join(', ')} requires gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('every manifest action, scene action and widget has a handler, and vice versa', async (t) => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());

  // And they are registered on the SDK: "not implemented" otherwise.
  const world = await createWorld({ printers: [], mdns: [] });
  t.after(() => world.app.stop());
  for (const key of keysOf(manifest.actions)) {
    const ack = await world.fake.action(key, { host: '192.0.2.250' });
    assert.notEqual(ack.error, 'not implemented', key);
  }
  for (const key of keysOf(manifest.scene_actions)) {
    const ack = await world.fake.sceneAction(key, {});
    assert.notEqual(ack.error, 'not implemented', key);
  }
  for (const key of keysOf(manifest.widgets)) {
    assert.equal((await world.fake.widgetGet(key)).success, true, key);
  }
});

test('the scene triggers the code fires are the declared ones', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('scene action outputs are the declared ones', async (t) => {
  const printer = printerOf('hl-l2340dw');
  const world = await createWorld({ printers: [printer] });
  t.after(() => world.app.stop());
  await createDevices(world);
  const ack = await world.fake.sceneAction('read_printer', {
    printer: deviceId(world.gladys, printer),
  });
  const [action] = manifest.scene_actions;
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), keysOf(action.outputs).sort());
  for (const output of action.outputs) {
    assert.equal(typeof ack.data.outputs[output.key], output.type, output.key);
  }
});

test('config_schema defaults and choices stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
    }
  }
  const field = (key) => manifest.config_schema.find((candidate) => candidate.key === key);
  assert.deepEqual(
    field('language').options.map(({ value }) => value),
    LANGUAGES,
  );
  assert.deepEqual(
    field('snmp_version').options.map(({ value }) => value),
    SNMP_VERSION_CHOICES,
  );
  assert.equal(field('poll_interval').min, POLL_INTERVAL.min);
  assert.equal(field('poll_interval').max, POLL_INTERVAL.max);
  // Integers only: the core renders number fields without `step`.
  assert.ok(Number.isInteger(field('poll_interval').default));
  // The community is a password of sorts: never sent back to the browser.
  assert.equal(field('community').type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length >= 4);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('no secret field in an action form (impossible to fill in Gladys)', () => {
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret', `${action.key}.${field.key}`);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
  }
});
