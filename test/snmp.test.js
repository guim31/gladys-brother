// -----------------------------------------------------------------------------
// The SNMP client: GetRequest bytes, response decoding, v1 noSuchName
// pruning, v2c noSuchObject values, retries, and the per-host OID cache that
// keeps a running integration at one datagram per printer and per reading.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_OIDS, OIDS } from '../src/brother/constants.js';
import { UnsupportedPrinterError } from '../src/brother/decode.js';
import { readPrinter } from '../src/brother/reader.js';
import { BER } from '../src/snmp/ber.js';
import {
  SnmpTimeoutError,
  decodeMessage,
  encodeGetRequest,
  snmpGet,
  varbindValue,
} from '../src/snmp/client.js';
import { FIXTURES, createFakeNetwork, createPrinter } from './helpers/fakePrinter.js';

const options = (network, extra = {}) => ({
  transport: network,
  timeoutMs: 5,
  retries: 0,
  ...extra,
});

test('a GetRequest carries every OID, the community and the version', () => {
  const message = encodeGetRequest([OIDS.model, OIDS.serial], {
    community: 'public',
    version: 0,
    requestId: 42,
  });
  // SEQUENCE { INTEGER 0, OCTET STRING "public", GetRequest-PDU {...} }
  assert.equal(message.subarray(0, 1).toString('hex'), '30');
  assert.ok(message.includes(Buffer.from('public')));
  const decoded = decodeMessage(message);
  assert.equal(decoded.version, 0);
  assert.equal(decoded.community, 'public');
  assert.equal(decoded.pduType, BER.GET_REQUEST);
  assert.equal(decoded.requestId, 42);
  assert.deepEqual(
    decoded.varbinds.map(({ oid, tag }) => [oid, tag]),
    [
      [OIDS.model, BER.NULL],
      [OIDS.serial, BER.NULL],
    ],
  );
});

test('varbind values: numbers, raw bytes, null for the v2c markers', () => {
  assert.equal(varbindValue({ tag: BER.INTEGER, value: Buffer.from([0x6a]) }), 106);
  assert.equal(varbindValue({ tag: BER.COUNTER32, value: Buffer.from([0x00, 0xff]) }), 255);
  assert.equal(varbindValue({ tag: BER.TIMETICKS, value: Buffer.from([0x01, 0x00]) }), 256);
  assert.deepEqual(
    varbindValue({ tag: BER.OCTET_STRING, value: Buffer.from('ab', 'hex') }),
    Buffer.from('ab', 'hex'),
  );
  assert.equal(varbindValue({ tag: BER.NO_SUCH_OBJECT, value: Buffer.alloc(0) }), null);
  assert.equal(varbindValue({ tag: BER.NULL, value: Buffer.alloc(0) }), null);
});

test('v1: an OID the model lacks is dropped, then remembered for the next reading', async () => {
  // The MFC-J680DW answers neither the uptime, the page counter nor the
  // Host Resources OIDs: 6 requests the first time, 1 afterwards.
  const printer = createPrinter(FIXTURES['mfc-j680dw']);
  const network = createFakeNetwork([printer]);
  const oidCache = new Map();
  await readPrinter(printer.host, options(network, { oidCache }));
  assert.equal(network.exchanges, 6);
  const remembered = oidCache.get(`${printer.host}|1`);
  assert.ok(!remembered.includes(OIDS.uptime));
  assert.ok(remembered.includes(OIDS.model));

  await readPrinter(printer.host, options(network, { oidCache }));
  assert.equal(network.exchanges, 7);
  assert.equal(printer.requests.at(-1).varbinds.length, remembered.length);
});

test('v2c: one request, the missing OIDs come back as noSuchObject', async () => {
  const printer = createPrinter(FIXTURES['mfc-j680dw']);
  const network = createFakeNetwork([printer]);
  const { raw, reading } = await readPrinter(printer.host, options(network, { version: '2c' }));
  assert.equal(network.exchanges, 1);
  assert.equal(printer.requests[0].version, 1);
  assert.equal(printer.requests[0].varbinds.length, ALL_OIDS.length);
  assert.equal(raw[OIDS.uptime], null);
  assert.equal(reading.model, 'MFC-J680DW');
});

test('the community is the configured one', async () => {
  const printer = createPrinter(FIXTURES['hl-l2340dw'], { community: 'office' });
  const network = createFakeNetwork([printer]);
  await assert.rejects(readPrinter(printer.host, options(network)), SnmpTimeoutError);
  const { reading } = await readPrinter(printer.host, options(network, { community: 'office' }));
  assert.equal(reading.model, 'HL-L2340DW');
  assert.equal(printer.requests.at(-1).community, 'office');
});

test('a printer waking up gets a second chance within the same reading', async () => {
  const awake = createFakeNetwork([createPrinter(FIXTURES['hl-l2340dw'])]);
  await readPrinter('192.0.2.10', options(awake));

  const printer = createPrinter(FIXTURES['hl-l2340dw']);
  printer.dropNext = 1;
  const network = createFakeNetwork([printer]);
  const { reading } = await readPrinter(printer.host, options(network, { retries: 1 }));
  assert.equal(reading.model, 'HL-L2340DW');
  assert.equal(network.exchanges, awake.exchanges + 1);
});

test('no answer at all: a timeout after the retries, no endless loop', async () => {
  const network = createFakeNetwork([]);
  await assert.rejects(
    snmpGet('192.0.2.99', [OIDS.model], { transport: network, timeoutMs: 5, retries: 2 }),
    SnmpTimeoutError,
  );
  assert.equal(network.exchanges, 3);
});

test('an SNMP agent without the Brother model or serial is not a Brother printer', async () => {
  const fixture = structuredClone(FIXTURES['hl-l2340dw']);
  delete fixture.varbinds[OIDS.serial];
  const printer = createPrinter(fixture);
  const network = createFakeNetwork([printer]);
  await assert.rejects(readPrinter(printer.host, options(network)), UnsupportedPrinterError);

  const v2 = createFakeNetwork([createPrinter(fixture)]);
  await assert.rejects(
    readPrinter('192.0.2.10', options(v2, { version: '2c' })),
    UnsupportedPrinterError,
  );
});

test('the real UDP transport times out cleanly on a silent port', async () => {
  const { createUdpTransport } = await import('../src/snmp/client.js');
  // 127.0.0.1 on a port nobody listens to: no LAN traffic, the datagram is
  // dropped (or refused) locally.
  await assert.rejects(
    snmpGet('127.0.0.1', [OIDS.model], {
      transport: createUdpTransport(),
      port: 9,
      timeoutMs: 50,
      retries: 0,
    }),
  );
});
