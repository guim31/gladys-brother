// -----------------------------------------------------------------------------
// Reading one printer: a single GetRequest of every OID, pruned once of the
// ones the model does not have.
//
// SNMPv1 answers an unknown OID with a noSuchName error and its index, and
// returns nothing else: the OID is dropped and the request sent again, like
// the library's initialization does. The pruned list is remembered per host,
// so a running integration sends one datagram per printer and per poll.
// SNMPv2c answers each unknown OID with a noSuchObject value instead.
// -----------------------------------------------------------------------------

import { ALL_OIDS, MANDATORY_OIDS } from './constants.js';
import { UnsupportedPrinterError, decodeReading } from './decode.js';
import { ERROR_STATUS, snmpGet, varbindValue } from '../snmp/client.js';

export class SnmpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SnmpError';
  }
}

/**
 * @param {string} host
 * @param {{ transport: object, community?: string, version?: '1'|'2c',
 *           timeoutMs?: number, retries?: number, oidCache?: Map<string, string[]> }} options
 * @returns {Promise<{ raw: Record<string, number|Buffer|null>,
 *                     reading: ReturnType<typeof decodeReading> }>}
 */
export async function readPrinter(host, options) {
  const { oidCache = new Map(), ...snmpOptions } = options;
  const cacheKey = `${host}|${snmpOptions.version ?? '1'}`;
  let oids = oidCache.get(cacheKey) ?? [...ALL_OIDS];

  for (let attempt = 0; attempt <= ALL_OIDS.length; attempt += 1) {
    const response = await snmpGet(host, oids, snmpOptions);
    if (response.errorStatus === ERROR_STATUS.NO_SUCH_NAME && response.errorIndex > 0) {
      const missing = oids[response.errorIndex - 1];
      if (missing === undefined || MANDATORY_OIDS.includes(missing)) {
        throw new UnsupportedPrinterError();
      }
      oids = oids.filter((oid) => oid !== missing);
      continue;
    }
    if (response.errorStatus !== ERROR_STATUS.NO_ERROR) {
      throw new SnmpError(
        `SNMP error ${response.errorStatus} (index ${response.errorIndex}) from ${host}`,
      );
    }
    const raw = {};
    for (const varbind of response.varbinds) {
      raw[varbind.oid] = varbindValue(varbind);
    }
    const reading = decodeReading(raw);
    oidCache.set(cacheKey, oids);
    return { raw, reading };
  }
  throw new SnmpError(`Too many unknown OIDs on ${host}`);
}
