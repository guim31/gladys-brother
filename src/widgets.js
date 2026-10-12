// -----------------------------------------------------------------------------
// Dashboard widget `supplies` (Gladys 5.1+): the gauges of one printer's
// cartridges and wear parts, its status and alerts, and a "Read now" button.
//
// Budget of the core: 8 components, 2 texts. Heading + 5 gauges + status +
// button = 8. The gauges go to the cartridges first, then to the lowest parts;
// every other supply becomes a row of the status list (10 rows at most). A
// gauge is bound to the feature of the created device when it has it (live
// needle); otherwise it carries the value of the last reading. Rendering never
// queries the printer: only the button does.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_BY_KEY, SUPPLY_KEYS } from './features.js';
import { ERROR_NAMES, LANGUAGES, NOT_RESPONDING, SHORT_NAMES, TEXT, pick } from './texts.js';
import { WIDGET_KEY } from './monitor.js';

export const READ_ACTION = 'read';
export const MAX_GAUGES = 5;
const MAX_STATUS_ITEMS = 10;
const MAX_ROW_TEXT = 40;

// Alerts that stop the printer: red. The others (paper low, toner low...): orange.
const BLOCKING_ERRORS = new Set([
  'no_paper',
  'no_toner',
  'door_open',
  'jammed',
  'offline',
  'service_requested',
  'input_tray_missing',
  'marker_supply_missing',
  'output_full',
  'input_tray_empty',
]);

export function widgetLanguage(language) {
  const short = String(language ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : 'en';
}

export function levelColor(percent) {
  if (percent <= 10) {
    return WIDGET_COLORS.DANGER;
  }
  if (percent <= 25) {
    return WIDGET_COLORS.WARNING;
  }
  return WIDGET_COLORS.SUCCESS;
}

const cut = (text, max = MAX_ROW_TEXT) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The supplies of a reading, cartridges first then parts, each with its value.
 * @returns {Array<{ key: string, value: number, cartridge: boolean }>}
 */
export function suppliesOf(reading) {
  return SUPPLY_KEYS.filter((key) => typeof reading?.values[key] === 'number').map((key) => ({
    key,
    value: reading.values[key],
    cartridge: FEATURE_BY_KEY.get(key).kind === 'cartridge',
  }));
}

/** Which supplies get a gauge, which a status row (lowest first). */
export function splitSupplies(supplies) {
  const cartridges = supplies.filter((supply) => supply.cartridge);
  const parts = supplies
    .filter((supply) => !supply.cartridge)
    .map((supply, index) => ({ ...supply, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const gauges = [...cartridges, ...parts].slice(0, MAX_GAUGES);
  const rows = supplies
    .filter((supply) => !gauges.some((gauged) => gauged.key === supply.key))
    .sort((a, b) => a.value - b.value);
  return { gauges, rows };
}

/** The lowest supply of a reading, or null. */
export function lowestSupply(reading) {
  const supplies = suppliesOf(reading);
  if (supplies.length === 0) {
    return null;
  }
  return supplies.reduce((lowest, supply) => (supply.value < lowest.value ? supply : lowest));
}

function alertsText(errors, language) {
  return (errors ?? []).map((error) => pick(ERROR_NAMES, language)[error]).join(', ');
}

function statusColor(snapshot) {
  if (snapshot.reachable === false) {
    return WIDGET_COLORS.DANGER;
  }
  const errors = snapshot.reading?.errors ?? [];
  if (errors.some((error) => BLOCKING_ERRORS.has(error))) {
    return WIDGET_COLORS.DANGER;
  }
  return errors.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

function formatTime(date, language, now) {
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    language,
    sameDay ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'short', timeStyle: 'short' },
  ).format(date);
}

function readButton(device, language) {
  return {
    type: 'button',
    label: pick(TEXT, language).readNow,
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: READ_ACTION, params: { printer: device.external_id } },
  };
}

function gauge(device, supply, language) {
  const featureId = `${device.external_id}:${supply.key}`;
  const label = pick(SHORT_NAMES, language)[supply.key];
  const bound = device.features?.some((feature) => feature.external_id === featureId);
  return bound
    ? { type: 'gauge', device_feature: featureId, label, color: levelColor(supply.value) }
    : {
        type: 'gauge',
        value: supply.value,
        min: 0,
        max: 100,
        unit: '%',
        label,
        color: levelColor(supply.value),
      };
}

/**
 * Build the widget content.
 * @param {{ device: object|null, snapshot: object|null, language: string,
 *           missing?: boolean, now?: Date }} input
 */
export function buildSuppliesContent({ device, snapshot, language, missing = false, now }) {
  const lang = widgetLanguage(language);
  const text = pick(TEXT, lang);
  if (!device) {
    return {
      ttl_seconds: 300,
      components: [
        { type: 'text', variant: 'body', text: missing ? text.missing : text.noPrinter },
      ],
    };
  }
  const heading = { type: 'text', variant: 'heading', text: cut(device.name) };
  const reading = snapshot?.reading ?? null;

  if (!reading) {
    // Not read yet since the start: bind the gauges to the device's features.
    const gauges = SUPPLY_KEYS.filter((key) =>
      device.features?.some((feature) => feature.external_id === `${device.external_id}:${key}`),
    )
      .slice(0, MAX_GAUGES)
      .map((key) => ({
        type: 'gauge',
        device_feature: `${device.external_id}:${key}`,
        label: pick(SHORT_NAMES, lang)[key],
      }));
    const waiting =
      snapshot?.reachable === false ? pick(NOT_RESPONDING, lang) : cut(text.waiting, 80);
    return {
      ttl_seconds: 60,
      components: [
        heading,
        ...gauges,
        { type: 'text', variant: 'caption', text: waiting },
        readButton(device, lang),
      ],
    };
  }

  const { gauges, rows } = splitSupplies(suppliesOf(reading));
  const statusValue =
    snapshot.reachable === false
      ? pick(NOT_RESPONDING, lang)
      : (reading.status ?? text.unknownStatus);
  const fixed = [{ label: text.state, value: cut(statusValue), color: statusColor(snapshot) }];
  const alerts = snapshot.reachable === false ? '' : alertsText(reading.errors, lang);
  if (alerts) {
    fixed.push({ label: text.alerts, value: cut(alerts), color: statusColor(snapshot) });
  }
  if (typeof reading.values.page_counter === 'number') {
    fixed.push({
      label: text.pages,
      value: new Intl.NumberFormat(lang).format(reading.values.page_counter),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  const last = snapshot.at
    ? {
        label: text.lastReading,
        value: formatTime(snapshot.at, lang, now ?? new Date()),
        color: WIDGET_COLORS.NEUTRAL,
      }
    : null;
  const room = MAX_STATUS_ITEMS - fixed.length - (last ? 1 : 0);
  const supplyRows = rows.slice(0, Math.max(0, room)).map((supply) => ({
    label: pick(SHORT_NAMES, lang)[supply.key],
    value: `${supply.value} %`,
    color: levelColor(supply.value),
  }));

  return {
    ttl_seconds: 300,
    components: [
      heading,
      ...gauges.map((supply) => gauge(device, supply, lang)),
      { type: 'status', items: [...fixed, ...supplyRows, ...(last ? [last] : [])] },
      readButton(device, lang),
    ],
  };
}

/** One-line summary of a printer, for the toast. */
export function summary(snapshot, language) {
  const text = pick(TEXT, language);
  const status = snapshot?.reading?.status ?? text.unknownStatus;
  const lowest = lowestSupply(snapshot?.reading);
  return lowest
    ? `${status} · ${text.lowest(pick(SHORT_NAMES, language)[lowest.key], lowest.value)}`
    : status;
}

/** The printers the widget can show: the created devices (cache re-read once if empty). */
async function widgetDevices(monitor) {
  if (monitor.devices.length === 0) {
    await monitor.reloadDevices().catch(() => {});
  }
  return monitor.devices;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language }) {
      const devices = await widgetDevices(monitor);
      const wanted = typeof settings?.printer === 'string' && settings.printer !== '';
      const device = wanted ? (monitor.findDevice(settings.printer) ?? null) : (devices[0] ?? null);
      return buildSuppliesContent({
        device,
        snapshot: device ? monitor.snapshot(device.external_id) : null,
        language,
        missing: wanted && !device && devices.length > 0,
        now: monitor.now(),
      });
    },

    async action(monitor, { actionKey, params }) {
      if (actionKey !== READ_ACTION) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      await widgetDevices(monitor);
      const device = monitor.findDevice(params?.printer);
      if (!device) {
        throw new Error(`Unknown printer: ${params?.printer}`);
      }
      const result = await monitor.pollDevice(device, { force: true, immediate: true });
      const snapshot = monitor.snapshot(device.external_id);
      return Object.fromEntries(
        LANGUAGES.map((lang) => {
          const text = pick(TEXT, lang);
          const message = result.ok
            ? text.toast(device.name, summary(snapshot, lang))
            : text.unreachableToast(device.name);
          return [lang, cut(message, 200)];
        }),
      );
    },
  },
};
