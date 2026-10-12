// -----------------------------------------------------------------------------
// A simulated LAN of Brother printers, behind the SNMP transport seam of
// src/snmp/client.js: each request is decoded from its real BER bytes and
// answered with real BER bytes built from a fixture (test/fixtures/printers),
// the way the printer's agent does it — v1: noSuchName and its index for an
// OID the model does not have; v2c: a noSuchObject value instead.
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync } from 'node:fs';
import { BER, encodeInteger, encodeOidValue, encodeTlv } from '../../src/snmp/ber.js';
import { SnmpTimeoutError, decodeMessage } from '../../src/snmp/client.js';

const directory = new URL('../fixtures/printers/', import.meta.url);

/** Every fixture, by file name without extension. */
export const FIXTURES = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [name.slice(0, -5), JSON.parse(readFileSync(new URL(name, directory), 'utf8'))]),
);

const TAGS = {
  integer: BER.INTEGER,
  counter32: BER.COUNTER32,
  timeticks: BER.TIMETICKS,
  octets: BER.OCTET_STRING,
};

function encodeValue({ type, value, hex }) {
  if (type === 'octets') {
    return encodeTlv(BER.OCTET_STRING, Buffer.from(hex, 'hex'));
  }
  return encodeTlv(TAGS[type], encodeInteger(value));
}

/**
 * A printer on the simulated LAN.
 * @param {object} fixture one of FIXTURES
 * @param {object} [options]
 * @param {string} [options.host]
 * @param {string} [options.community] the community it accepts
 */
export function createPrinter(fixture, { host = '192.0.2.10', community = 'public' } = {}) {
  const printer = {
    host,
    community,
    fixture,
    // Copy: tests change values (a toner going down, a door opening).
    varbinds: structuredClone(fixture.varbinds),
    online: true,
    // Requests to drop before answering again (a printer waking up).
    dropNext: 0,
    requests: [],
    /** Change one maintenance-block entry (4-byte value), e.g. a toner level. */
    setMaintenance(code, rawValue) {
      setBlockEntry(this.varbinds, MAINTENANCE_OID, code, rawValue);
    },
    setCounter(code, rawValue) {
      setBlockEntry(this.varbinds, COUNTERS_OID, code, rawValue);
    },
    setStatusText(text) {
      this.varbinds[STATUS_OID] = {
        type: 'octets',
        hex: Buffer.from(text, 'utf8').toString('hex'),
      };
    },
    setErrors(hex) {
      this.varbinds[ERRORS_OID] = { type: 'octets', hex };
    },
  };
  return printer;
}

const MAINTENANCE_OID = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0';
const COUNTERS_OID = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0';
const STATUS_OID = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.4.5.2.0';
const ERRORS_OID = '1.3.6.1.2.1.25.3.5.1.2.1';

function setBlockEntry(varbinds, oid, code, rawValue) {
  const bytes = Buffer.from(varbinds[oid]?.hex ?? 'ff', 'hex');
  const entries = [];
  let offset = 0;
  while (offset + 3 <= bytes.length) {
    const end = offset + 3 + bytes[offset + 2];
    entries.push(bytes.subarray(offset, end));
    offset = end;
  }
  const value = Buffer.alloc(4);
  value.writeUInt32BE(rawValue);
  const entry = Buffer.concat([Buffer.from([code, 0x01, 0x04]), value]);
  const index = entries.findIndex((existing) => existing[0] === code);
  if (index >= 0) {
    entries[index] = entry;
  } else {
    entries.push(entry);
  }
  varbinds[oid] = {
    type: 'octets',
    hex: Buffer.concat([...entries, Buffer.from([0xff])]).toString('hex'),
  };
}

/**
 * The LAN: the transport the integration is given in the tests.
 * @param {ReturnType<typeof createPrinter>[]} printers
 */
export function createFakeNetwork(printers) {
  const byHost = new Map(printers.map((printer) => [printer.host, printer]));
  return {
    printers: byHost,
    exchanges: 0,
    targets: new Set(),
    async exchange(host, port, message, { timeoutMs }) {
      this.exchanges += 1;
      this.targets.add(host);
      const printer = byHost.get(host);
      const request = decodeMessage(message);
      if (!printer || !printer.online || port !== 161) {
        throw new SnmpTimeoutError(host, timeoutMs);
      }
      printer.requests.push(request);
      if (printer.dropNext > 0) {
        printer.dropNext -= 1;
        throw new SnmpTimeoutError(host, timeoutMs);
      }
      if (request.community !== printer.community) {
        // A wrong community gets no answer at all, as on a real agent.
        throw new SnmpTimeoutError(host, timeoutMs);
      }
      return answer(printer, request);
    },
  };
}

function answer(printer, request) {
  const v1 = request.version === 0;
  let errorStatus = 0;
  let errorIndex = 0;
  const varbinds = request.varbinds.map(({ oid }, index) => {
    const known = printer.varbinds[oid];
    let value;
    if (known) {
      value = encodeValue(known);
    } else if (v1) {
      if (errorStatus === 0) {
        errorStatus = 2; // noSuchName
        errorIndex = index + 1;
      }
      value = encodeTlv(BER.NULL, Buffer.alloc(0));
    } else {
      value = encodeTlv(BER.NO_SUCH_OBJECT, Buffer.alloc(0));
    }
    return encodeTlv(BER.SEQUENCE, Buffer.concat([encodeTlv(BER.OID, encodeOidValue(oid)), value]));
  });
  // A v1 error answer echoes the request's varbinds.
  const list =
    errorStatus !== 0
      ? request.varbinds.map(({ oid }) =>
          encodeTlv(
            BER.SEQUENCE,
            Buffer.concat([
              encodeTlv(BER.OID, encodeOidValue(oid)),
              encodeTlv(BER.NULL, Buffer.alloc(0)),
            ]),
          ),
        )
      : varbinds;
  const pdu = encodeTlv(
    BER.GET_RESPONSE,
    Buffer.concat([
      encodeTlv(BER.INTEGER, encodeInteger(request.requestId)),
      encodeTlv(BER.INTEGER, encodeInteger(errorStatus)),
      encodeTlv(BER.INTEGER, encodeInteger(errorIndex)),
      encodeTlv(BER.SEQUENCE, Buffer.concat(list)),
    ]),
  );
  return encodeTlv(
    BER.SEQUENCE,
    Buffer.concat([
      encodeTlv(BER.INTEGER, encodeInteger(request.version)),
      encodeTlv(BER.OCTET_STRING, Buffer.from(request.community, 'utf8')),
      pdu,
    ]),
  );
}
