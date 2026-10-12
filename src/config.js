// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { DEFAULT_COMMUNITY } from './snmp/client.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const SNMP_VERSION_CHOICES = ['1', '2c'];

export const POLL_INTERVAL = { min: 30, max: 3600 };

export const DEFAULT_CONFIG = {
  printer_hosts: '',
  snmp_version: '1',
  poll_interval: 60,
  language: 'en',
};

// An IPv4 address or a DNS name. mDNS names (`brother.local`) do not resolve
// inside the integration container: the documentation asks for IP addresses,
// but a resolvable name is accepted.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_HOSTS = 32;

/**
 * Parse the manual host list (commas, semicolons, spaces or new lines).
 * @param {unknown} raw
 * @returns {{ hosts: string[], invalid: string[] }}
 */
export function parseHosts(raw) {
  const hosts = [];
  const invalid = [];
  const entries = typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  for (const entry of entries) {
    // Users paste the address of the printer's web page: keep the host part.
    const host = entry
      .trim()
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/[/:].*$/, '')
      .toLowerCase();
    if (!host) {
      continue;
    }
    if (!isValidHost(host)) {
      invalid.push(entry.trim());
    } else if (!hosts.includes(host) && hosts.length < MAX_HOSTS) {
      hosts.push(host);
    }
  }
  return { hosts, invalid };
}

export function isValidHost(host) {
  const ipv4 = host.match(IPV4_PATTERN);
  if (ipv4) {
    return ipv4.slice(1, 5).every((part) => Number(part) <= 255);
  }
  // A dotted string made of digits only is a mistyped address, not a name.
  if (/^[\d.]+$/.test(host)) {
    return false;
  }
  return HOST_PATTERN.test(host);
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { hosts, invalid } = parseHosts(source.printer_hosts ?? DEFAULT_CONFIG.printer_hosts);
  const community =
    typeof source.community === 'string' && source.community.trim() !== ''
      ? source.community.trim()
      : DEFAULT_COMMUNITY;
  const interval = Number(source.poll_interval);
  return {
    hosts,
    invalidHosts: invalid,
    community,
    snmpVersion: SNMP_VERSION_CHOICES.includes(String(source.snmp_version))
      ? String(source.snmp_version)
      : DEFAULT_CONFIG.snmp_version,
    pollIntervalSeconds: Number.isFinite(interval)
      ? Math.min(POLL_INTERVAL.max, Math.max(POLL_INTERVAL.min, Math.round(interval)))
      : DEFAULT_CONFIG.poll_interval,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
