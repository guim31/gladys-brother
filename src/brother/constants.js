// -----------------------------------------------------------------------------
// What a Brother printer answers over SNMP, after the `brother` Python library
// by Maciej Bieniek (github.com/bieniu/brother, Apache-2.0), the one Home
// Assistant uses: the OIDs, the codes of the Brother binary blocks and their
// meaning. The keys on the right are this integration's feature keys: they
// end up in Gladys external ids and must never change.
// -----------------------------------------------------------------------------

export const OIDS = {
  // Standard MIBs
  charset: '1.3.6.1.2.1.43.7.1.1.4.1.1', // prtLocalizationCharacterSet (IANA MIBenum)
  pageCount: '1.3.6.1.2.1.43.10.2.1.4.1.1', // prtMarkerLifeCount, older models
  uptime: '1.3.6.1.2.1.1.3.0', // sysUpTime, hundredths of a second
  mac: '1.3.6.1.2.1.2.2.1.6.1', // ifPhysAddress of the first interface
  deviceStatus: '1.3.6.1.2.1.25.3.2.1.5.1', // hrDeviceStatus
  printerStatus: '1.3.6.1.2.1.25.3.5.1.1.1', // hrPrinterStatus
  printerErrors: '1.3.6.1.2.1.25.3.5.1.2.1', // hrPrinterDetectedErrorState
  // Brother enterprise MIB (1.3.6.1.4.1.2435)
  model: '1.3.6.1.4.1.2435.2.3.9.1.1.7.0', // IEEE 1284 device id ("MFG:Brother;MDL:...")
  serial: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.1.0',
  status: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.4.5.2.0', // the text on the printer's display
  maintenance: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0',
  counters: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0',
  nextcare: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.11.0',
  firmware: '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.17.0',
};

// Without these two, it is not a Brother printer this integration can read.
export const MANDATORY_OIDS = [OIDS.model, OIDS.serial];

// Every OID read on each poll, in one GetRequest.
export const ALL_OIDS = Object.values(OIDS);

// Printer families: the maintenance block uses the same codes for the
// cartridges of both, but the parts differ (drum, belt, fuser on a laser;
// the waste ink box on an inkjet), and so do the names (toner or ink).
export const PRINTER_TYPES = ['laser', 'ink', 'unknown'];

// Counters block (OID ...5.5.10.0): pages printed.
export const COUNTER_CODES = {
  0x00: 'page_counter',
  0x01: 'bw_page_counter',
  0x02: 'color_page_counter',
  0x06: 'duplex_page_counter',
};

// Maintenance block (OID ...5.5.8.0), codes common to both families: the
// cartridges, in hundredths of a percent (0x6f-0x72), or as value/max pairs
// on the legacy models (0xa1-0xa4).
const CARTRIDGE_CODES = {
  0x6f: 'black_cartridge',
  0x70: 'cyan_cartridge',
  0x71: 'magenta_cartridge',
  0x72: 'yellow_cartridge',
  0xa1: 'black_cartridge',
  0xa2: 'cyan_cartridge',
  0xa3: 'magenta_cartridge',
  0xa4: 'yellow_cartridge',
};

export const LASER_MAINTENANCE_CODES = {
  ...CARTRIDGE_CODES,
  0x11: 'drum_page_counter',
  0x41: 'drum',
  0x69: 'belt',
  0x6a: 'fuser',
  0x6b: 'laser_unit',
  0x6c: 'pf_kit_mp',
  0x6d: 'pf_kit_1',
  0x79: 'cyan_drum',
  0x7a: 'magenta_drum',
  0x7b: 'yellow_drum',
  0x80: 'black_drum',
};

export const INK_MAINTENANCE_CODES = {
  ...CARTRIDGE_CODES,
  0x85: 'waste_ink_box',
};

// "Next care" block (OID ...5.5.11.0, lasers only): pages left before a part
// is due.
export const NEXTCARE_CODES = {
  0x73: 'laser_unit_remaining_pages',
  0x77: 'pf_kit_1_remaining_pages',
  0x82: 'drum_remaining_pages',
  0x86: 'pf_kit_mp_remaining_pages',
  0x88: 'belt_remaining_pages',
  0x89: 'fuser_remaining_pages',
  0xa4: 'black_drum_remaining_pages',
  0xa5: 'cyan_drum_remaining_pages',
  0xa6: 'magenta_drum_remaining_pages',
  0xa7: 'yellow_drum_remaining_pages',
};

// Codes whose value is a remaining life in hundredths of a percent (or a
// value/max pair on the legacy models).
export const PERCENT_KEYS = new Set([
  'black_cartridge',
  'cyan_cartridge',
  'magenta_cartridge',
  'yellow_cartridge',
  'drum',
  'belt',
  'fuser',
  'laser_unit',
  'pf_kit_mp',
  'pf_kit_1',
  'cyan_drum',
  'magenta_drum',
  'yellow_drum',
  'black_drum',
]);

// The waste ink box reports a plain percentage (75 = 75 % left).
export const PLAIN_PERCENT_KEYS = new Set(['waste_ink_box']);

// Codes that only exist on a laser: one of them in the maintenance block, or
// a non-empty next-care block, tells a laser.
export const LASER_ONLY_CODES = new Set([0x41, 0x69, 0x6a, 0x6b, 0x79, 0x7a, 0x7b, 0x80]);
export const INK_ONLY_CODES = new Set([0x85]);

// hrDeviceStatus and hrPrinterStatus (RFC 2790).
export const DEVICE_STATUS = { 1: 'unknown', 2: 'running', 3: 'warning', 4: 'testing', 5: 'down' };
export const PRINTER_STATUS = { 1: 'other', 2: 'unknown', 3: 'idle', 4: 'printing', 5: 'warmup' };

// hrPrinterDetectedErrorState (RFC 3805): bit 0 is the most significant bit of
// the first octet. These keys are the values of the `error` scene filter.
export const PRINTER_ERRORS = [
  'low_paper',
  'no_paper',
  'low_toner',
  'no_toner',
  'door_open',
  'jammed',
  'offline',
  'service_requested',
  'input_tray_missing',
  'output_tray_missing',
  'marker_supply_missing',
  'output_near_full',
  'output_full',
  'input_tray_empty',
  'overdue_prevent_maint',
];

// prtLocalizationCharacterSet (IANA MIBenum) → TextDecoder label. HP Roman-8
// (2004) has no TextDecoder: see roman8.js. An unknown charset is read as
// Roman-8, like the library does.
export const CHARSETS = {
  5: 'iso-8859-2',
  8: 'iso-8859-5',
  12: 'iso-8859-9',
  106: 'utf-8',
  2004: 'roman8',
};
