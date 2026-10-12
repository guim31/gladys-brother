// -----------------------------------------------------------------------------
// Minimal SNMP client (UDP 161, v1 or v2c): one GetRequest carrying several
// OIDs, the way the `brother` Python library reads a printer in one exchange.
//
// Only unicast datagrams to the printer's own address, one request at a time:
// no walk, no broadcast, no sweep. A printer in deep sleep may drop the first
// datagram while it wakes up, hence a short timeout and a couple of retries
// rather than one long wait.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { randomInt } from 'node:crypto';
import {
  BER,
  decodeInteger,
  decodeOidValue,
  encodeInteger,
  encodeOidValue,
  encodeTlv,
  readTlv,
} from './ber.js';

export const DEFAULT_SNMP_PORT = 161;
export const DEFAULT_COMMUNITY = 'public';

// The SNMP version field: 0 is v1, 1 is v2c.
export const SNMP_VERSIONS = { 1: 0, '2c': 1 };

// error-status values of a v1 response (RFC 1157).
export const ERROR_STATUS = { NO_ERROR: 0, TOO_BIG: 1, NO_SUCH_NAME: 2 };

export class SnmpTimeoutError extends Error {
  constructor(host, timeoutMs) {
    super(`No SNMP answer from ${host} after ${timeoutMs} ms`);
    this.name = 'SnmpTimeoutError';
  }
}

/**
 * Build a GetRequest for several OIDs.
 * @param {string[]} oids
 * @param {{ community: string, version: number, requestId: number }} options
 * @returns {Buffer}
 */
export function encodeGetRequest(oids, { community, version, requestId }) {
  const varbinds = oids.map((oid) =>
    encodeTlv(
      BER.SEQUENCE,
      Buffer.concat([
        encodeTlv(BER.OID, encodeOidValue(oid)),
        encodeTlv(BER.NULL, Buffer.alloc(0)),
      ]),
    ),
  );
  const pdu = encodeTlv(
    BER.GET_REQUEST,
    Buffer.concat([
      encodeTlv(BER.INTEGER, encodeInteger(requestId)),
      encodeTlv(BER.INTEGER, encodeInteger(0)), // error-status
      encodeTlv(BER.INTEGER, encodeInteger(0)), // error-index
      encodeTlv(BER.SEQUENCE, Buffer.concat(varbinds)),
    ]),
  );
  return encodeTlv(
    BER.SEQUENCE,
    Buffer.concat([
      encodeTlv(BER.INTEGER, encodeInteger(version)),
      encodeTlv(BER.OCTET_STRING, Buffer.from(community, 'utf8')),
      pdu,
    ]),
  );
}

/**
 * Decode an SNMP message (request or response) into its PDU fields.
 * @param {Buffer} buffer
 * @returns {{ version: number, community: string, pduType: number, requestId: number,
 *             errorStatus: number, errorIndex: number,
 *             varbinds: Array<{ oid: string, tag: number, value: Buffer }> }}
 */
export function decodeMessage(buffer) {
  const envelope = readTlv(buffer);
  if (envelope.tag !== BER.SEQUENCE) {
    throw new Error('Not an SNMP message');
  }
  const body = envelope.value;
  const version = readTlv(body, 0);
  const community = readTlv(body, version.next);
  const pdu = readTlv(body, community.next);

  const requestId = readTlv(pdu.value, 0);
  const errorStatus = readTlv(pdu.value, requestId.next);
  const errorIndex = readTlv(pdu.value, errorStatus.next);
  const list = readTlv(pdu.value, errorIndex.next);

  const varbinds = [];
  let offset = 0;
  while (offset < list.value.length) {
    const entry = readTlv(list.value, offset);
    const oid = readTlv(entry.value, 0);
    const value = readTlv(entry.value, oid.next);
    varbinds.push({ oid: decodeOidValue(oid.value), tag: value.tag, value: value.value });
    offset = entry.next;
  }

  return {
    version: decodeInteger(version.value),
    community: community.value.toString('utf8'),
    pduType: pdu.tag,
    requestId: decodeInteger(requestId.value),
    errorStatus: decodeInteger(errorStatus.value),
    errorIndex: decodeInteger(errorIndex.value),
    varbinds,
  };
}

/**
 * Turn a varbind into a JS value: a number for the integer-shaped types, the
 * raw bytes for an octet string (the Brother blocks are binary, the status
 * text has a printer-chosen charset: decoding is the caller's job), null for
 * NULL and the v2c "no such object / instance" markers.
 * @param {{ tag: number, value: Buffer }} varbind
 * @returns {number|Buffer|null}
 */
export function varbindValue({ tag, value }) {
  switch (tag) {
    case BER.INTEGER:
    case BER.COUNTER32:
    case BER.GAUGE32:
    case BER.TIMETICKS:
    case BER.COUNTER64:
      return decodeInteger(value);
    case BER.OCTET_STRING:
      return Buffer.from(value);
    default:
      return null;
  }
}

/**
 * The real network: one UDP socket per exchange, closed afterwards.
 * @returns {{ exchange: (host: string, port: number, message: Buffer,
 *             options: { timeoutMs: number, requestId: number }) => Promise<Buffer> }}
 */
export function createUdpTransport() {
  return {
    exchange(host, port, message, { timeoutMs, requestId }) {
      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
        let done = false;
        const finish = (err, payload) => {
          if (done) {
            return;
          }
          done = true;
          clearTimeout(timer);
          try {
            socket.close();
          } catch {
            // already closed by an error event
          }
          if (err) {
            reject(err);
          } else {
            resolve(payload);
          }
        };
        const timer = setTimeout(() => finish(new SnmpTimeoutError(host, timeoutMs)), timeoutMs);
        socket.on('message', (payload) => {
          try {
            // A late answer to a previous attempt carries another request id.
            if (decodeMessage(payload).requestId === requestId) {
              finish(null, payload);
            }
          } catch {
            // not an SNMP answer: keep waiting
          }
        });
        socket.on('error', (err) => finish(err));
        socket.send(message, port, host, (err) => {
          if (err) {
            finish(err);
          }
        });
      });
    },
  };
}

/**
 * Send one GetRequest and return the decoded response. Retries on timeout
 * only: an answer, even an error, ends the exchange.
 * @param {string} host
 * @param {string[]} oids
 * @param {{ transport: ReturnType<typeof createUdpTransport>, port?: number,
 *           community?: string, version?: '1'|'2c', timeoutMs?: number,
 *           retries?: number }} options
 * @returns {Promise<ReturnType<typeof decodeMessage>>}
 */
export async function snmpGet(host, oids, options) {
  const {
    transport,
    port = DEFAULT_SNMP_PORT,
    community = DEFAULT_COMMUNITY,
    version = '1',
    timeoutMs = 2500,
    retries = 2,
  } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const requestId = randomInt(1, 0x7fffffff);
    const message = encodeGetRequest(oids, {
      community,
      version: SNMP_VERSIONS[version] ?? SNMP_VERSIONS[1],
      requestId,
    });
    try {
      const payload = await transport.exchange(host, port, message, { timeoutMs, requestId });
      const response = decodeMessage(payload);
      if (response.pduType !== BER.GET_RESPONSE) {
        throw new Error(`Unexpected SNMP PDU 0x${response.pduType.toString(16)}`);
      }
      return response;
    } catch (err) {
      lastError = err;
      if (!(err instanceof SnmpTimeoutError)) {
        throw err;
      }
    }
  }
  throw lastError;
}
