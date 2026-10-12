// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the tables of the code and
// the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { CARTRIDGE_NAMES, FEATURES, NAMES } from '../src/features.js';
import {
  CONNECTION_TEXT,
  ERROR_NAMES,
  LANGUAGES as TEXT_LANGUAGES,
  NOT_RESPONDING,
  SHORT_NAMES,
  TEXT,
} from '../src/texts.js';
import { SUPPLY_KEYS } from '../src/features.js';
import { PRINTER_ERRORS } from '../src/brother/constants.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 400,
  message: 200,
  short: 24,
  row: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value, key), `${name}.${lang}.${key}`, lang, max(key)));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(TEXT_LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 85, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('feature names exist in every language, for every feature and family', () => {
  const keys = FEATURES.filter(({ kind }) => kind !== 'cartridge').map(({ key }) => key);
  assert.deepEqual(sorted(Object.keys(NAMES.en)), sorted(keys));
  assert.deepEqual(
    tableProblems(NAMES, 'NAMES', () => MAX.featureName),
    [],
  );
  for (const [family, names] of Object.entries(CARTRIDGE_NAMES)) {
    assert.deepEqual(
      tableProblems(names, `CARTRIDGE_NAMES.${family}`, () => MAX.featureName),
      [],
    );
  }
});

test('widget, status and alert texts fit their slots', () => {
  assert.deepEqual(sorted(Object.keys(SHORT_NAMES.en)), sorted(SUPPLY_KEYS));
  assert.deepEqual(sorted(Object.keys(ERROR_NAMES.en)), sorted(PRINTER_ERRORS));
  const found = [
    ...tableProblems(SHORT_NAMES, 'SHORT_NAMES', () => MAX.short),
    ...tableProblems(ERROR_NAMES, 'ERROR_NAMES', () => MAX.row),
    ...problems(NOT_RESPONDING, 'NOT_RESPONDING', MAX.row),
    ...Object.entries(CONNECTION_TEXT).flatMap(([key, value]) =>
      problems(value, `CONNECTION_TEXT.${key}`, MAX.message),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the message table of the code has the four languages', () => {
  const sample = {
    name: 'Brother MFC-L8690CDW',
    type: 'laser',
    status: 'Prêt',
    pages: '12 345 pages',
    lowest: 'Toner jaune 5 %',
  };
  const render = (value) => {
    if (typeof value === 'function') {
      return value(sample, 'Résumé');
    }
    if (typeof value === 'object') {
      return Object.values(value).join(' ');
    }
    return value;
  };
  const limits = { readNow: MAX.short, state: MAX.row, alerts: MAX.row, pages: MAX.row };
  const found = tableProblems(TEXT, 'TEXT', (key) => limits[key] ?? MAX.message, render);
  assert.deepEqual(found, []);
  for (const lang of LANGS) {
    assert.deepEqual(sorted(Object.keys(TEXT[lang].printerTypes)), ['ink', 'laser', 'unknown']);
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Drum', fr: 'Tambour', de: 'Trommel' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Drucker', 'Ihre IP', 'mit Ihrem', 'Ihren', 'Ihrer']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_triggers[0].fields[2].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_triggers[0].fields[2].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation ---------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);
const headings = (markdown) => markdown.split('\n').filter((line) => /^#{1,3} /.test(line));

test('the documentation exists in the four languages, with the same sections', () => {
  const shape = (markdown) => headings(markdown).map((line) => line.match(/^#+/)[0].length);
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(shape(docs[lang]), shape(docs.en), `docs/${lang}.md sections`);
    assert.equal(
      (docs[lang].match(/^\|/gm) ?? []).length,
      (docs.en.match(/^\|/gm) ?? []).length,
      `docs/${lang}.md table rows`,
    );
  }
  assert.ok(headings(docs.en).length >= 8);
});

test('the documentation says it was written without the hardware', () => {
  assert.match(docs.en, /Developed without the hardware: feedback welcome/);
  assert.match(docs.fr, /Développée sans le matériel : vos retours sont les bienvenus/);
  assert.match(docs.de, /Ohne die Hardware entwickelt: Rückmeldungen willkommen/);
  assert.match(docs.es, /Desarrollada sin el hardware: se agradecen sus comentarios/);
  assert.doesNotMatch(docs.de, POLITE_GERMAN);
});

test('the documentation names every trigger, filter step and alert of the manifest', () => {
  for (const lang of LANGS) {
    for (const trigger of manifest.scene_triggers) {
      assert.ok(docs[lang].includes(trigger.label[lang]), `${lang}: ${trigger.label[lang]}`);
    }
    for (const action of manifest.scene_actions) {
      assert.ok(docs[lang].includes(action.label[lang]), `${lang}: ${action.label[lang]}`);
    }
    assert.ok(docs[lang].includes(manifest.widgets[0].label[lang]), `${lang}: widget`);
  }
});
