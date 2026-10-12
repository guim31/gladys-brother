// -----------------------------------------------------------------------------
// Configuration normalization: the rest of the code never sees a blank, a
// string number or an out-of-range interval.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts } from '../src/config.js';

test('defaults', () => {
  assert.deepEqual(normalizeConfig(), {
    hosts: [],
    invalidHosts: [],
    community: 'public',
    snmpVersion: '1',
    pollIntervalSeconds: DEFAULT_CONFIG.poll_interval,
    language: 'fr',
  });
});

test('host list: separators, pasted URLs, duplicates, invalid entries', () => {
  assert.deepEqual(
    parseHosts('192.0.2.1, 192.0.2.2;192.0.2.1\nhttp://192.0.2.3/general/status.html printer.lan'),
    { hosts: ['192.0.2.1', '192.0.2.2', '192.0.2.3', 'printer.lan'], invalid: [] },
  );
  assert.deepEqual(parseHosts('300.1.1.1, 192.0.2, -bad-'), {
    hosts: [],
    invalid: ['300.1.1.1', '192.0.2', '-bad-'],
  });
  assert.deepEqual(parseHosts(undefined), { hosts: [], invalid: [] });
});

test('community, version, interval and language', () => {
  const config = normalizeConfig({
    community: '  office ',
    snmp_version: '2c',
    poll_interval: '5',
    language: 'de',
  });
  assert.equal(config.community, 'office');
  assert.equal(config.snmpVersion, '2c');
  assert.equal(config.pollIntervalSeconds, 30);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ poll_interval: 99999 }).pollIntervalSeconds, 3600);
  assert.equal(normalizeConfig({ community: '' }).community, 'public');
  assert.equal(normalizeConfig({ snmp_version: '3' }).snmpVersion, '1');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
