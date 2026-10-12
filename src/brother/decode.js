// -----------------------------------------------------------------------------
// Decoding of a Brother SNMP answer into a reading: pure functions over the
// raw varbind values (numbers and Buffers), so every rule is testable against
// the real answers kept in test/fixtures/printers.
//
// Ported from the `brother` Python library (Maciej Bieniek, Apache-2.0), with
// one difference: the Brother blocks are parsed as what they are, a list of
// entries `code, 0x01, length, value...` ended by a 0xff checksum, instead of
// fixed 7-byte chunks. The chunking garbles the models whose entries are not
// all 4 bytes long (HL-5350DN: one-byte status entries); parsing by length
// reads them right, and reads the legacy value/max pairs (MFC-5490CN) with the
// same code.
// -----------------------------------------------------------------------------

import {
  CHARSETS,
  COUNTER_CODES,
  DEVICE_STATUS,
  INK_MAINTENANCE_CODES,
  INK_ONLY_CODES,
  LASER_MAINTENANCE_CODES,
  LASER_ONLY_CODES,
  NEXTCARE_CODES,
  OIDS,
  PERCENT_KEYS,
  PLAIN_PERCENT_KEYS,
  PRINTER_ERRORS,
  PRINTER_STATUS,
} from './constants.js';
import { decodeRoman8 } from './roman8.js';

export class UnsupportedPrinterError extends Error {
  constructor(message = 'Not a Brother printer this integration can read (no model or serial)') {
    super(message);
    this.name = 'UnsupportedPrinterError';
  }
}

/**
 * Split a Brother block into its entries.
 * @param {Buffer|null|undefined} bytes
 * @returns {Array<{ code: number, value: Buffer }>}
 */
export function parseBlock(bytes) {
  const entries = [];
  if (!Buffer.isBuffer(bytes)) {
    return entries;
  }
  let offset = 0;
  while (offset + 3 <= bytes.length) {
    // Every entry seen so far has 0x01 in second position; anything else is a
    // layout this code does not know: stop rather than guess.
    if (bytes[offset + 1] !== 0x01) {
      break;
    }
    const end = offset + 3 + bytes[offset + 2];
    if (end > bytes.length) {
      break;
    }
    entries.push({ code: bytes[offset], value: bytes.subarray(offset + 3, end) });
    offset = end;
  }
  return entries;
}

/**
 * Python's round(): half to even. Kept so the percentages match what Home
 * Assistant shows for the same printer.
 * @param {number} value
 * @returns {number}
 */
export function roundHalfEven(value) {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

/**
 * The number an entry holds for a key, or null when its shape is not one the
 * key can be read from.
 * @param {string} key
 * @param {Buffer} value
 * @returns {number|null}
 */
export function entryValue(key, value) {
  if (PERCENT_KEYS.has(key)) {
    let percent = null;
    if (value.length === 4) {
      // Hundredths of a percent.
      percent = roundHalfEven(value.readUInt32BE(0) / 100);
    } else if (value.length === 2 && value[1] > 0) {
      // Legacy models: value and maximum.
      percent = roundHalfEven((value[0] / value[1]) * 100);
    }
    return percent === null ? null : Math.min(100, Math.max(0, percent));
  }
  if (PLAIN_PERCENT_KEYS.has(key)) {
    return value.length === 4 ? Math.min(100, value.readUInt32BE(0)) : null;
  }
  // Counters and pages left: always a 32-bit integer.
  return value.length === 4 ? value.readUInt32BE(0) : null;
}

/**
 * Read the IEEE 1284 device id field `name` ("MDL", "CID"...).
 * @param {string} deviceId
 * @param {string} name
 * @returns {string|null}
 */
export function deviceIdField(deviceId, name) {
  const match = new RegExp(`(?:^|;)\\s*${name}:([^;]*)`, 'i').exec(deviceId ?? '');
  return match ? match[1].trim() : null;
}

/**
 * The model as Home Assistant names it: "HL-L2340DW" from "HL-L2340DW series".
 * @param {string} deviceId
 * @returns {string|null}
 */
export function modelFromDeviceId(deviceId) {
  const match = /MDL:([\w-]+)/.exec(deviceId ?? '');
  return match ? match[1] : null;
}

/**
 * Laser or inkjet? The library leaves it to the user; it is detected here, in
 * order of reliability: the command set id of the device id, the model name,
 * then the codes only one family reports.
 * @param {{ deviceId: string, model: string, maintenance: Array<{ code: number }>,
 *           nextcare: Array<{ code: number }> }} input
 * @returns {'laser'|'ink'|'unknown'}
 */
export function detectPrinterType({ deviceId, model, maintenance, nextcare }) {
  const cid = deviceIdField(deviceId, 'CID') ?? '';
  if (/laser/i.test(cid)) {
    return 'laser';
  }
  if (/jpeg|ink/i.test(cid)) {
    return 'ink';
  }
  // DCP-J…, MFC-J…, HL-J… are inkjets, DCP-T…, MFC-T… ink tank inkjets;
  // the …-L… ranges are lasers.
  if (/^(DCP|MFC|HL)-[JT]\d/i.test(model ?? '')) {
    return 'ink';
  }
  if (/^(DCP|MFC|HL|HL-EX)-L\d/i.test(model ?? '')) {
    return 'laser';
  }
  if (maintenance.some(({ code }) => INK_ONLY_CODES.has(code))) {
    return 'ink';
  }
  if (nextcare.length > 0 || maintenance.some(({ code }) => LASER_ONLY_CODES.has(code))) {
    return 'laser';
  }
  return 'unknown';
}

/**
 * The text on the printer's display. Some firmwares send UTF-8 while declaring
 * Roman-8 (DCP-T735DW, firmware 1.5): UTF-8 is tried first, then the declared
 * charset. Multi-line displays (HL-5350DN) separate their lines with CR.
 * @param {Buffer|null|undefined} bytes
 * @param {number|null|undefined} charset IANA MIBenum
 * @returns {string|null}
 */
export function decodeStatus(bytes, charset) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return null;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const label = CHARSETS[charset] ?? 'roman8';
    if (label === 'roman8') {
      text = decodeRoman8(bytes);
    } else {
      try {
        text = new TextDecoder(label).decode(bytes);
      } catch {
        text = bytes.toString('latin1'); // a Node build without that charset
      }
    }
  }
  const lines = text
    .replace(/\0/g, '')
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join(' · ') : null;
}

/**
 * hrPrinterDetectedErrorState → the error keys whose bit is set.
 * @param {Buffer|null|undefined} bytes
 * @returns {string[]|null} null when the printer does not report it
 */
export function decodePrinterErrors(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    return null;
  }
  return PRINTER_ERRORS.filter((_, bit) => {
    const byte = bytes[Math.floor(bit / 8)];
    return byte !== undefined && (byte & (0x80 >> (bit % 8))) !== 0;
  });
}

/**
 * @param {Buffer|null|undefined} bytes
 * @returns {string|null}
 */
export function decodeMac(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 6) {
    return null;
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(':');
}

/**
 * @param {Buffer|null|undefined} bytes
 * @returns {string|null}
 */
export function decodeText(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    return null;
  }
  const text = bytes.toString('latin1').replace(/\0/g, '').trim();
  return text === '' ? null : text;
}

/**
 * @param {Array<{ code: number, value: Buffer }>} entries
 * @param {Record<number, string>} codes
 * @param {Record<string, number>} values filled in place; a later entry wins,
 *   like in the library
 */
function readEntries(entries, codes, values) {
  for (const { code, value } of entries) {
    const key = codes[code];
    if (key === undefined) {
      continue;
    }
    const number = entryValue(key, value);
    if (number !== null) {
      values[key] = number;
    }
  }
}

/**
 * Decode one SNMP answer.
 * @param {Record<string, number|Buffer|null>} raw OID → varbind value
 * @returns {{ model: string, serial: string, mac: string|null, firmware: string|null,
 *             printerType: 'laser'|'ink'|'unknown', status: string|null,
 *             deviceStatus: string|null, printerStatus: string|null,
 *             errors: string[]|null, uptimeSeconds: number|null,
 *             values: Record<string, number> }}
 */
export function decodeReading(raw) {
  const deviceId = decodeText(raw[OIDS.model]);
  const model = modelFromDeviceId(deviceId);
  const serial = decodeText(raw[OIDS.serial]);
  if (!model || !serial) {
    throw new UnsupportedPrinterError();
  }

  const maintenance = parseBlock(raw[OIDS.maintenance]);
  const nextcare = parseBlock(raw[OIDS.nextcare]);
  const printerType = detectPrinterType({ deviceId, model, maintenance, nextcare });

  const values = {};
  readEntries(parseBlock(raw[OIDS.counters]), COUNTER_CODES, values);
  const maintenanceCodes =
    printerType === 'laser'
      ? LASER_MAINTENANCE_CODES
      : printerType === 'ink'
        ? INK_MAINTENANCE_CODES
        : { ...LASER_MAINTENANCE_CODES, ...INK_MAINTENANCE_CODES };
  readEntries(maintenance, maintenanceCodes, values);
  if (printerType !== 'ink') {
    readEntries(nextcare, NEXTCARE_CODES, values);
  }
  // Older models have no counters block, only the Printer MIB counter.
  if (values.page_counter === undefined && typeof raw[OIDS.pageCount] === 'number') {
    values.page_counter = raw[OIDS.pageCount];
  }

  const uptime = raw[OIDS.uptime];
  return {
    model,
    serial,
    mac: decodeMac(raw[OIDS.mac]),
    firmware: decodeText(raw[OIDS.firmware]),
    printerType,
    status: decodeStatus(raw[OIDS.status], raw[OIDS.charset]),
    deviceStatus: DEVICE_STATUS[raw[OIDS.deviceStatus]] ?? null,
    printerStatus: PRINTER_STATUS[raw[OIDS.printerStatus]] ?? null,
    errors: decodePrinterErrors(raw[OIDS.printerErrors]),
    uptimeSeconds: typeof uptime === 'number' && uptime >= 0 ? Math.floor(uptime / 100) : null,
    values,
  };
}
