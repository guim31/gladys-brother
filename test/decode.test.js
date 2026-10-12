// -----------------------------------------------------------------------------
// The decoder against real printer answers: the 14 models of the `brother`
// library's tests (test/fixtures/printers), rebuilt in wire format, read
// through the real SNMP encoding, and compared with the values the library's
// own snapshots expect for the sensors Home Assistant shows.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrinter } from '../src/brother/reader.js';
import {
  decodePrinterErrors,
  decodeStatus,
  detectPrinterType,
  entryValue,
  parseBlock,
  roundHalfEven,
} from '../src/brother/decode.js';
import { decodeRoman8 } from '../src/brother/roman8.js';
import { FIXTURES, createFakeNetwork, createPrinter } from './helpers/fakePrinter.js';

// Library sensor name → this integration's key, for the values Home
// Assistant exposes. The others (raw cartridge counters, status flags,
// per-colour page and drum counters) are not published.
const LIBRARY_KEYS = {
  page_counter: 'page_counter',
  bw_counter: 'bw_page_counter',
  color_counter: 'color_page_counter',
  duplex_unit_pages_counter: 'duplex_page_counter',
  drum_counter: 'drum_page_counter',
  drum_remaining_life: 'drum',
  drum_remaining_pages: 'drum_remaining_pages',
  belt_unit_remaining_life: 'belt',
  belt_unit_remaining_pages: 'belt_remaining_pages',
  fuser_remaining_life: 'fuser',
  fuser_unit_remaining_pages: 'fuser_remaining_pages',
  laser_remaining_life: 'laser_unit',
  laser_unit_remaining_pages: 'laser_unit_remaining_pages',
  pf_kit_1_remaining_life: 'pf_kit_1',
  pf_kit_1_remaining_pages: 'pf_kit_1_remaining_pages',
  pf_kit_mp_remaining_life: 'pf_kit_mp',
  pf_kit_mp_remaining_pages: 'pf_kit_mp_remaining_pages',
  ink_capture_box_remaining_life: 'waste_ink_box',
};
for (const color of ['black', 'cyan', 'magenta', 'yellow']) {
  LIBRARY_KEYS[`${color}_drum_remaining_life`] = `${color}_drum`;
  LIBRARY_KEYS[`${color}_drum_remaining_pages`] = `${color}_drum_remaining_pages`;
  LIBRARY_KEYS[`${color}_toner_remaining`] = `${color}_cartridge`;
  LIBRARY_KEYS[`${color}_ink_remaining`] = `${color}_cartridge`;
}

function expectedValues(expected) {
  const values = {};
  for (const [name, value] of Object.entries(expected)) {
    if (LIBRARY_KEYS[name]) {
      values[LIBRARY_KEYS[name]] = value;
    }
  }
  return values;
}

async function read(fixture, options = {}) {
  const printer = createPrinter(fixture);
  const network = createFakeNetwork([printer]);
  const result = await readPrinter(printer.host, {
    transport: network,
    timeoutMs: 5,
    retries: 0,
    ...options,
  });
  return { ...result, printer, network };
}

for (const [name, fixture] of Object.entries(FIXTURES)) {
  test(`${name}: the values of the brother library`, async () => {
    const { reading } = await read(fixture);
    const expected = fixture.library_expected;

    assert.equal(reading.model, fixture.model);
    // The library leaves the type to the user: the detection must agree with
    // the type its tests use — or say "unknown", never the wrong family.
    assert.ok(
      [fixture.library_printer_type, 'unknown'].includes(reading.printerType),
      `${name}: detected ${reading.printerType}, the library uses ${fixture.library_printer_type}`,
    );
    if (name !== 'dcp-t735dw') {
      assert.deepEqual(reading.values, expectedValues(expected));
    } else {
      assert.equal(reading.values.page_counter, expected.page_counter);
    }
    // Same display text, without the library's lower-casing.
    assert.equal(reading.status.toLowerCase().replace(' · ', ' '), expected.status);
    if (expected.printer_errors) {
      assert.deepEqual(reading.errors, expected.printer_errors);
    }
    if (expected.printer_status) {
      assert.equal(reading.printerStatus, expected.printer_status);
    }
    if (expected.device_status) {
      assert.equal(reading.deviceStatus, expected.device_status);
    }
  });
}

test('the printer family is detected for every fixture but the legacy MFC-5490CN', async () => {
  const detected = {};
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    detected[name] = (await read(fixture)).reading.printerType;
  }
  assert.deepEqual(detected, {
    'dcp-1618w': 'laser',
    'dcp-7070dw': 'laser',
    'dcp-9020cdw': 'laser',
    'dcp-j132w': 'ink',
    'dcp-l2540dn': 'laser',
    'dcp-l3550cdw': 'laser',
    'dcp-t735dw': 'ink',
    'hl-2270dw': 'laser',
    'hl-5350dn': 'laser',
    'hl-l2340dw': 'laser',
    'mfc-5490cn': 'unknown',
    'mfc-j5110dw': 'ink',
    'mfc-j680dw': 'ink',
    'mfc-t910dw': 'ink',
  });
});

test('identity: model, serial, MAC and firmware', async () => {
  const { reading } = await read(FIXTURES['hl-l2340dw']);
  assert.equal(reading.model, 'HL-L2340DW');
  assert.equal(reading.serial, 'U00000K1N000010');
  assert.equal(reading.mac, '00:80:77:00:00:0a');
  assert.equal(reading.firmware, '1.17');
  assert.equal(reading.uptimeSeconds, 4136135);
});

test('HL-5350DN: one-byte entries are read by their length, not garbled', async () => {
  // The library's 7-byte chunking turns these into black_toner_status=21037313.
  const entries = parseBlock(
    Buffer.from('110104000061a83101010141010103630101035401010166010101ff', 'hex'),
  );
  assert.deepEqual(
    entries.map(({ code, value }) => [code, value.length]),
    [
      [0x11, 4],
      [0x31, 1],
      [0x41, 1],
      [0x63, 1],
      [0x54, 1],
      [0x66, 1],
    ],
  );
  // A one-byte drum entry is not a percentage: ignored, not published as 0 %.
  assert.equal(entryValue('drum', Buffer.from([3])), null);
  const { reading } = await read(FIXTURES['hl-5350dn']);
  assert.equal(reading.values.drum, undefined);
  assert.equal(reading.values.drum_page_counter, 25000);
  assert.equal(reading.status, 'ENERGIESPAREN · TROMMEL ERSETZ.');
});

test('legacy value/max pairs (MFC-5490CN) give percentages', () => {
  assert.equal(entryValue('black_cartridge', Buffer.from([4, 20])), 20);
  assert.equal(entryValue('cyan_cartridge', Buffer.from([12, 20])), 60);
  assert.equal(entryValue('cyan_cartridge', Buffer.from([12, 0])), null);
});

test('percentages: hundredths, half to even like Python, clamped', () => {
  assert.equal(entryValue('drum', Buffer.from('000023f0', 'hex')), 92);
  assert.equal(entryValue('black_cartridge', Buffer.from('000004e2', 'hex')), 12); // 12.5
  assert.equal(entryValue('black_cartridge', Buffer.from('0000057e', 'hex')), 14); // 14.06
  assert.equal(entryValue('black_cartridge', Buffer.from('00002af8', 'hex')), 100); // 110 %
  assert.equal(entryValue('waste_ink_box', Buffer.from('0000004b', 'hex')), 75);
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(3.4), 3);
});

test('a block with an unknown layout is not guessed', () => {
  assert.deepEqual(parseBlock(Buffer.from('6f02040000ffff', 'hex')), []);
  assert.deepEqual(parseBlock(Buffer.from('6f0104000019', 'hex')), []); // truncated
  assert.deepEqual(parseBlock(null), []);
});

test('family detection: device id first, then model, then the codes', () => {
  const none = { maintenance: [], nextcare: [] };
  const detect = (deviceId, model, extra = {}) =>
    detectPrinterType({ deviceId, model, ...none, ...extra });
  assert.equal(detect('CID:Brother Laser Type1;', 'MFC-J5330DW'), 'laser');
  assert.equal(detect('CID:Brother Generic Jpeg Type2;', 'DCP-L2530DW'), 'ink');
  assert.equal(detect('', 'MFC-J5330DW'), 'ink');
  assert.equal(detect('', 'DCP-T720DW'), 'ink');
  assert.equal(detect('', 'HL-L2350DW'), 'laser');
  assert.equal(detect('', 'MFC-490CW', { maintenance: [{ code: 0x85 }] }), 'ink');
  assert.equal(detect('', 'HL-4150CDN', { maintenance: [{ code: 0x69 }] }), 'laser');
  assert.equal(detect('', 'HL-2240', { nextcare: [{ code: 0x82 }] }), 'laser');
  assert.equal(detect('', 'MFC-5490CN'), 'unknown');
});

test('display text: UTF-8 first, then the declared charset', () => {
  // Polish in ISO-8859-2 (charset 5), Russian in ISO-8859-5 (8), Turkish (12).
  assert.equal(decodeStatus(Buffer.from('4d61b36f20746f6e657275', 'hex'), 5), 'Mało toneru');
  assert.equal(decodeStatus(Buffer.from('c1d0d3d0', 'hex'), 8), 'Сага');
  assert.equal(decodeStatus(Buffer.from('757975fe', 'hex'), 12), 'uyuş');
  // HP Roman-8 (2004): "ë" is 0xcd; an unknown charset is read as Roman-8 too.
  assert.equal(decodeStatus(Buffer.from('4b6f706965cd6e', 'hex'), 2004), 'Kopieën');
  assert.equal(decodeStatus(Buffer.from('4b6f706965cd6e', 'hex'), 999), 'Kopieën');
  // DCP-T735DW firmware 1.5: UTF-8 bytes declared as Roman-8.
  assert.equal(decodeStatus(Buffer.from('休眠', 'utf8'), 2004), '休眠');
  // Padding, NULs and the two lines of an LCD.
  assert.equal(decodeStatus(Buffer.from('SLEEP           \0\0'), 2004), 'SLEEP');
  assert.equal(decodeStatus(Buffer.from('  \r  '), 2004), null);
  assert.equal(decodeStatus(Buffer.alloc(0), 2004), null);
  assert.equal(decodeRoman8(Buffer.from([0xff])), '�');
});

test('alerts: bits from the most significant bit of the first octet', () => {
  // The library's own cases (MFC-J5110DW).
  assert.deepEqual(decodePrinterErrors(Buffer.from('00', 'hex')), []);
  assert.deepEqual(decodePrinterErrors(Buffer.from('02', 'hex')), ['offline']);
  assert.deepEqual(decodePrinterErrors(Buffer.from('0a', 'hex')), ['door_open', 'offline']);
  assert.deepEqual(decodePrinterErrors(Buffer.from('2800', 'hex')), ['low_toner', 'door_open']);
  assert.deepEqual(decodePrinterErrors(Buffer.from('0002', 'hex')), ['overdue_prevent_maint']);
  assert.deepEqual(decodePrinterErrors(Buffer.from('4000', 'hex')), ['no_paper']);
  assert.equal(decodePrinterErrors(null), null);
});
