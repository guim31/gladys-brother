// -----------------------------------------------------------------------------
// Printer discovery: the manual list of the configuration, plus the printers
// the Gladys core finds over mDNS for us (the container sees no multicast).
//
// Brother printers announce `_printer._tcp` (the service Home Assistant
// watches, instance names starting with "Brother") and `_ipp._tcp`. Each
// candidate address is then read once in unicast SNMP: only an answer with a
// Brother model and serial makes a printer.
// -----------------------------------------------------------------------------

import { createLogger, parseMdnsTxt } from '@gladysassistant/integration-sdk';
import { readPrinter } from './brother/reader.js';
import { platformId } from './features.js';

const logger = createLogger({ name: 'brother-discovery' });

export const MDNS_SERVICES = ['_printer._tcp', '_ipp._tcp'];

/**
 * Is this mDNS entry a Brother printer service? The core's scan also returns
 * the SRV records of the other services a host announces (SSH, SMB...):
 * only the printer services are kept, and only Brother ones, so discovery
 * never sends SNMP to a host that is not a Brother printer.
 * @param {{ name?: string, txt?: string[] }} entry
 * @returns {boolean}
 */
export function isBrotherServiceEntry(entry) {
  if (typeof entry?.name !== 'string' || !/\._(printer|ipp)\._tcp\b/i.test(entry.name)) {
    return false;
  }
  if (/^brother\b/i.test(entry.name)) {
    return true;
  }
  const txt = parseMdnsTxt(Array.isArray(entry.txt) ? entry.txt : []);
  return ['usb_mfg', 'ty', 'product', 'mfg'].some((key) => /brother/i.test(String(txt[key] ?? '')));
}

/**
 * The IPv4 address to read an mDNS entry at (a `.local` name does not resolve
 * in the container).
 * @param {{ host?: string, addresses?: string[] }} entry
 * @returns {string|null}
 */
export function entryAddress(entry) {
  const ipv4 = (entry.addresses ?? []).find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address));
  if (ipv4) {
    return ipv4;
  }
  return entry.host && !/\.local\.?$/i.test(entry.host) ? entry.host : null;
}

/**
 * Discover the printers: probe the manual hosts and the mDNS candidates, keep
 * one entry per serial number.
 * @param {object} gladys SDK instance
 * @param {object} config normalized configuration
 * @param {{ snmp: object, scanTimeoutSeconds?: number }} options `snmp` = the
 *   readPrinter options (transport, community, version, timeouts, cache)
 * @returns {Promise<{ printers: Array<{ host: string, reading: object }>,
 *                     failures: Array<{ host: string, error: Error }>,
 *                     mdns: 'ok'|'unavailable' }>}
 */
export async function discoverPrinters(gladys, config, { snmp, scanTimeoutSeconds = 5 }) {
  const candidates = [...config.hosts];
  let mdns = 'ok';
  try {
    const entries = await gladys.scanNetwork('mdns', { timeoutSeconds: scanTimeoutSeconds });
    const list = Array.isArray(entries) ? entries : [];
    for (const entry of list.filter(isBrotherServiceEntry)) {
      const address = entryAddress(entry);
      if (address && !candidates.includes(address)) {
        candidates.push(address);
      }
    }
  } catch (err) {
    mdns = 'unavailable';
    logger.warn(`mDNS scan unavailable (${err.message}): manual list only`);
  }

  const printers = [];
  const failures = [];
  const seen = new Set();
  for (const host of candidates) {
    try {
      const { reading } = await readPrinter(host, snmp);
      const id = platformId(reading);
      if (seen.has(id)) {
        continue; // the same printer, typed by hand and found over mDNS
      }
      seen.add(id);
      printers.push({ host, reading });
      logger.info(`Found Brother ${reading.model} (${reading.printerType}) at ${host}`);
    } catch (err) {
      failures.push({ host, error: err });
      logger.warn(`No Brother printer read at ${host}: ${err.message}`);
    }
  }
  return { printers, failures, mdns };
}
