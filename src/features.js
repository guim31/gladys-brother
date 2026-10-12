// -----------------------------------------------------------------------------
// From a reading to a Gladys device and its states.
//
// One device per printer, its external id built on the serial number. Only the
// features the model reports are published. Feature keys are forever (they are
// in the external ids, so in the history, scenes and dashboards of the users);
// names are frozen by Gladys when the device is created, in the language of
// the `language` setting at that moment.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'printer';

// Display bounds of the counters (Gladys requires numbers; nothing is clamped).
const MAX_COUNT = 10_000_000;

const COLORS = ['black', 'cyan', 'magenta', 'yellow'];

/**
 * Names of the cartridges, per printer type and language. Written out rather
 * than composed: French and Spanish agree the colour with the noun.
 */
export const CARTRIDGE_NAMES = {
  laser: {
    en: {
      black: 'Black toner',
      cyan: 'Cyan toner',
      magenta: 'Magenta toner',
      yellow: 'Yellow toner',
    },
    fr: {
      black: 'Toner noir',
      cyan: 'Toner cyan',
      magenta: 'Toner magenta',
      yellow: 'Toner jaune',
    },
    de: {
      black: 'Toner Schwarz',
      cyan: 'Toner Cyan',
      magenta: 'Toner Magenta',
      yellow: 'Toner Gelb',
    },
    es: {
      black: 'Tóner negro',
      cyan: 'Tóner cian',
      magenta: 'Tóner magenta',
      yellow: 'Tóner amarillo',
    },
  },
  ink: {
    en: { black: 'Black ink', cyan: 'Cyan ink', magenta: 'Magenta ink', yellow: 'Yellow ink' },
    fr: {
      black: 'Encre noire',
      cyan: 'Encre cyan',
      magenta: 'Encre magenta',
      yellow: 'Encre jaune',
    },
    de: {
      black: 'Tinte Schwarz',
      cyan: 'Tinte Cyan',
      magenta: 'Tinte Magenta',
      yellow: 'Tinte Gelb',
    },
    es: {
      black: 'Tinta negra',
      cyan: 'Tinta cian',
      magenta: 'Tinta magenta',
      yellow: 'Tinta amarilla',
    },
  },
  unknown: {
    en: {
      black: 'Black cartridge',
      cyan: 'Cyan cartridge',
      magenta: 'Magenta cartridge',
      yellow: 'Yellow cartridge',
    },
    fr: {
      black: 'Cartouche noire',
      cyan: 'Cartouche cyan',
      magenta: 'Cartouche magenta',
      yellow: 'Cartouche jaune',
    },
    de: {
      black: 'Patrone Schwarz',
      cyan: 'Patrone Cyan',
      magenta: 'Patrone Magenta',
      yellow: 'Patrone Gelb',
    },
    es: {
      black: 'Cartucho negro',
      cyan: 'Cartucho cian',
      magenta: 'Cartucho magenta',
      yellow: 'Cartucho amarillo',
    },
  },
};

/** Names of every other feature, per language. */
export const NAMES = {
  en: {
    status: 'Status',
    drum: 'Drum',
    black_drum: 'Black drum',
    cyan_drum: 'Cyan drum',
    magenta_drum: 'Magenta drum',
    yellow_drum: 'Yellow drum',
    belt: 'Belt unit',
    fuser: 'Fuser unit',
    laser_unit: 'Laser unit',
    pf_kit_1: 'Paper feed kit (tray 1)',
    pf_kit_mp: 'Paper feed kit (MP tray)',
    waste_ink_box: 'Waste ink box',
    drum_remaining_pages: 'Drum: pages left',
    black_drum_remaining_pages: 'Black drum: pages left',
    cyan_drum_remaining_pages: 'Cyan drum: pages left',
    magenta_drum_remaining_pages: 'Magenta drum: pages left',
    yellow_drum_remaining_pages: 'Yellow drum: pages left',
    belt_remaining_pages: 'Belt unit: pages left',
    fuser_remaining_pages: 'Fuser unit: pages left',
    laser_unit_remaining_pages: 'Laser unit: pages left',
    pf_kit_1_remaining_pages: 'PF kit tray 1: pages left',
    pf_kit_mp_remaining_pages: 'PF kit MP tray: pages left',
    page_counter: 'Pages printed',
    bw_page_counter: 'Black and white pages',
    color_page_counter: 'Colour pages',
    duplex_page_counter: 'Duplex pages',
    drum_page_counter: 'Drum: pages printed',
    uptime: 'Uptime',
  },
  fr: {
    status: 'État',
    drum: 'Tambour',
    black_drum: 'Tambour noir',
    cyan_drum: 'Tambour cyan',
    magenta_drum: 'Tambour magenta',
    yellow_drum: 'Tambour jaune',
    belt: 'Courroie',
    fuser: 'Unité de fusion',
    laser_unit: 'Unité laser',
    pf_kit_1: "Kit d'alimentation (bac 1)",
    pf_kit_mp: "Kit d'alimentation (bac MU)",
    waste_ink_box: "Réservoir d'encre usagée",
    drum_remaining_pages: 'Tambour : pages restantes',
    black_drum_remaining_pages: 'Tambour noir : pages restantes',
    cyan_drum_remaining_pages: 'Tambour cyan : pages restantes',
    magenta_drum_remaining_pages: 'Tambour magenta : pages restantes',
    yellow_drum_remaining_pages: 'Tambour jaune : pages restantes',
    belt_remaining_pages: 'Courroie : pages restantes',
    fuser_remaining_pages: 'Unité de fusion : pages restantes',
    laser_unit_remaining_pages: 'Unité laser : pages restantes',
    pf_kit_1_remaining_pages: 'Kit bac 1 : pages restantes',
    pf_kit_mp_remaining_pages: 'Kit bac MU : pages restantes',
    page_counter: 'Pages imprimées',
    bw_page_counter: 'Pages noir et blanc',
    color_page_counter: 'Pages couleur',
    duplex_page_counter: 'Pages recto verso',
    drum_page_counter: 'Tambour : pages imprimées',
    uptime: 'Temps de fonctionnement',
  },
  de: {
    status: 'Status',
    drum: 'Trommel',
    black_drum: 'Trommel Schwarz',
    cyan_drum: 'Trommel Cyan',
    magenta_drum: 'Trommel Magenta',
    yellow_drum: 'Trommel Gelb',
    belt: 'Transfereinheit',
    fuser: 'Fixiereinheit',
    laser_unit: 'Lasereinheit',
    pf_kit_1: 'Papiereinzugskit (Fach 1)',
    pf_kit_mp: 'Papiereinzugskit (MF-Zufuhr)',
    waste_ink_box: 'Tintenauffangbehälter',
    drum_remaining_pages: 'Trommel: verbleibende Seiten',
    black_drum_remaining_pages: 'Trommel Schwarz: verbl. Seiten',
    cyan_drum_remaining_pages: 'Trommel Cyan: verbl. Seiten',
    magenta_drum_remaining_pages: 'Trommel Magenta: verbl. Seiten',
    yellow_drum_remaining_pages: 'Trommel Gelb: verbl. Seiten',
    belt_remaining_pages: 'Transfereinheit: verbl. Seiten',
    fuser_remaining_pages: 'Fixiereinheit: verbl. Seiten',
    laser_unit_remaining_pages: 'Lasereinheit: verbl. Seiten',
    pf_kit_1_remaining_pages: 'Einzugskit Fach 1: verbl. Seiten',
    pf_kit_mp_remaining_pages: 'Einzugskit MF: verbl. Seiten',
    page_counter: 'Gedruckte Seiten',
    bw_page_counter: 'Schwarzweiß-Seiten',
    color_page_counter: 'Farbseiten',
    duplex_page_counter: 'Duplexseiten',
    drum_page_counter: 'Trommel: gedruckte Seiten',
    uptime: 'Betriebszeit',
  },
  es: {
    status: 'Estado',
    drum: 'Tambor',
    black_drum: 'Tambor negro',
    cyan_drum: 'Tambor cian',
    magenta_drum: 'Tambor magenta',
    yellow_drum: 'Tambor amarillo',
    belt: 'Unidad de correa',
    fuser: 'Unidad de fusión',
    laser_unit: 'Unidad láser',
    pf_kit_1: 'Kit de alimentación (bandeja 1)',
    pf_kit_mp: 'Kit de alimentación (bandeja MP)',
    waste_ink_box: 'Depósito de tinta residual',
    drum_remaining_pages: 'Tambor: páginas restantes',
    black_drum_remaining_pages: 'Tambor negro: páginas restantes',
    cyan_drum_remaining_pages: 'Tambor cian: páginas restantes',
    magenta_drum_remaining_pages: 'Tambor magenta: páginas restantes',
    yellow_drum_remaining_pages: 'Tambor amarillo: páginas restantes',
    belt_remaining_pages: 'Unidad de correa: páginas restantes',
    fuser_remaining_pages: 'Unidad de fusión: páginas restantes',
    laser_unit_remaining_pages: 'Unidad láser: páginas restantes',
    pf_kit_1_remaining_pages: 'Kit bandeja 1: páginas restantes',
    pf_kit_mp_remaining_pages: 'Kit bandeja MP: páginas restantes',
    page_counter: 'Páginas impresas',
    bw_page_counter: 'Páginas en blanco y negro',
    color_page_counter: 'Páginas en color',
    duplex_page_counter: 'Páginas a doble cara',
    drum_page_counter: 'Tambor: páginas impresas',
    uptime: 'Tiempo de funcionamiento',
  },
};

/**
 * Every feature this integration can publish, in display order. `kind`:
 * cartridge (toner or ink level), part (wear part life), pages (pages left
 * before a part is due), counter, status, uptime.
 */
export const FEATURES = [
  { key: 'status', kind: 'status' },
  ...COLORS.map((color) => ({ key: `${color}_cartridge`, kind: 'cartridge', color })),
  { key: 'drum', kind: 'part' },
  ...COLORS.map((color) => ({ key: `${color}_drum`, kind: 'part' })),
  { key: 'belt', kind: 'part' },
  { key: 'fuser', kind: 'part' },
  { key: 'laser_unit', kind: 'part' },
  { key: 'pf_kit_1', kind: 'part' },
  { key: 'pf_kit_mp', kind: 'part' },
  { key: 'waste_ink_box', kind: 'part' },
  { key: 'drum_remaining_pages', kind: 'pages' },
  ...COLORS.map((color) => ({ key: `${color}_drum_remaining_pages`, kind: 'pages' })),
  { key: 'belt_remaining_pages', kind: 'pages' },
  { key: 'fuser_remaining_pages', kind: 'pages' },
  { key: 'laser_unit_remaining_pages', kind: 'pages' },
  { key: 'pf_kit_1_remaining_pages', kind: 'pages' },
  { key: 'pf_kit_mp_remaining_pages', kind: 'pages' },
  { key: 'page_counter', kind: 'counter' },
  { key: 'bw_page_counter', kind: 'counter' },
  { key: 'color_page_counter', kind: 'counter' },
  { key: 'duplex_page_counter', kind: 'counter' },
  { key: 'drum_page_counter', kind: 'counter' },
  { key: 'uptime', kind: 'uptime' },
];

export const FEATURE_BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

/** The keys whose value is a remaining life in percent: the supplies. */
export const SUPPLY_KEYS = FEATURES.filter(
  ({ kind }) => kind === 'cartridge' || kind === 'part',
).map(({ key }) => key);

const SHAPES = {
  status: {
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
  },
  cartridge: {
    category: CATEGORIES.LEVEL_SENSOR,
    type: TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  },
  part: {
    category: CATEGORIES.MAINTENANCE,
    type: TYPES.MAINTENANCE.LIFE_REMAINING,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  },
  pages: {
    category: CATEGORIES.COUNTER_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    min: 0,
    max: MAX_COUNT,
  },
  counter: {
    category: CATEGORIES.COUNTER_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    min: 0,
    max: MAX_COUNT,
  },
  uptime: {
    category: CATEGORIES.DURATION,
    type: TYPES.DURATION.INTEGER,
    unit: UNITS.HOURS,
    min: 0,
    max: 100_000,
  },
};

/**
 * Name of a feature (or supply) in a language.
 * @param {string} key
 * @param {string} language en, fr, de or es
 * @param {'laser'|'ink'|'unknown'} printerType
 * @returns {string}
 */
export function featureName(key, language, printerType) {
  const feature = FEATURE_BY_KEY.get(key);
  if (feature?.kind === 'cartridge') {
    const names = CARTRIDGE_NAMES[printerType] ?? CARTRIDGE_NAMES.unknown;
    return (names[language] ?? names.en)[feature.color];
  }
  return (NAMES[language] ?? NAMES.en)[key] ?? key;
}

/**
 * The value of each feature in a reading (status as text, the rest numbers).
 * @param {object} reading from decodeReading
 * @returns {Map<string, number|string>}
 */
export function readingValues(reading) {
  const values = new Map();
  if (reading.status) {
    values.set('status', reading.status);
  }
  for (const { key } of FEATURES) {
    if (typeof reading.values[key] === 'number') {
      values.set(key, reading.values[key]);
    }
  }
  if (typeof reading.uptimeSeconds === 'number') {
    values.set('uptime', Math.floor(reading.uptimeSeconds / 3600));
  }
  return values;
}

/** Stable platform id of a printer: its serial number. */
export function platformId(reading) {
  return reading.serial.trim().toLowerCase();
}

/**
 * Build the Gladys device of a printer.
 * @param {object} gladys SDK instance (for externalIds)
 * @param {{ host: string, reading: object }} printer
 * @param {{ language: string }} config
 */
export function buildDevice(gladys, { host, reading }, config) {
  const ids = gladys.externalIds(DEVICE_TYPE, platformId(reading));
  const values = readingValues(reading);
  const params = [
    { name: 'HOST', value: host },
    { name: 'MODEL', value: reading.model },
    { name: 'SERIAL', value: reading.serial },
    { name: 'PRINTER_TYPE', value: reading.printerType },
  ];
  if (reading.firmware) {
    params.push({ name: 'FIRMWARE', value: reading.firmware });
  }
  if (reading.mac) {
    params.push({ name: 'MAC', value: reading.mac });
  }
  return {
    name: `Brother ${reading.model}`,
    external_id: ids.device,
    model: reading.model,
    should_poll: false,
    params,
    features: FEATURES.filter(({ key }) => values.has(key)).map(({ key, kind }) => ({
      name: featureName(key, config.language, reading.printerType),
      external_id: ids.feature(key),
      ...SHAPES[kind],
      read_only: true,
      has_feedback: false,
      keep_history: kind !== 'uptime',
    })),
  };
}

/**
 * The states of a reading, in the publishStates format.
 * @param {string} deviceExternalId
 * @param {object} reading
 */
export function buildStates(deviceExternalId, reading) {
  return [...readingValues(reading)].map(([key, value]) =>
    typeof value === 'string'
      ? { device_feature_external_id: `${deviceExternalId}:${key}`, text: value.slice(0, 200) }
      : { device_feature_external_id: `${deviceExternalId}:${key}`, state: value },
  );
}

/** Read a device param. */
export function deviceParam(device, name) {
  return device?.params?.find((param) => param.name === name)?.value;
}
