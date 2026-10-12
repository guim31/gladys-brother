// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a simulated LAN of Brother
// printers answering real SNMP bytes, a temporary /data, and the integration
// wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FIXTURES, createFakeNetwork, createPrinter } from './fakePrinter.js';

// The integration logs every reading; keep the test output readable.
// LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

/** One printer per fixture, each on its own documentation address. */
export const allPrinters = () =>
  Object.values(FIXTURES).map((fixture, index) =>
    createPrinter(fixture, { host: `192.0.2.${10 + index}` }),
  );

/** The mDNS answer a printer gives (as the core returns it). */
export function mdnsEntry(printer, { service = '_printer._tcp' } = {}) {
  return {
    name: `Brother ${printer.fixture.model} series.${service}.local`,
    host: `BRN008077000001.local`,
    addresses: [printer.host],
    port: service === '_ipp._tcp' ? 631 : 515,
    txt: ['txtvers=1', `ty=Brother ${printer.fixture.model} series`, 'usb_MFG=Brother'],
  };
}

/**
 * @param {object} [options]
 * @param {Array} [options.printers] from createPrinter
 * @param {object} [options.config] raw integration config
 * @param {Array|null} [options.mdns] mDNS entries; null: the scan fails
 * @param {Array} [options.gladysDevices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 * @param {() => Date} [options.now]
 */
export async function createWorld({
  printers = allPrinters(),
  config = {},
  mdns,
  gladysDevices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-brother-')),
  now,
} = {}) {
  const network = createFakeNetwork(printers);
  const entries = mdns === undefined ? printers.map((printer) => mdnsEntry(printer)) : mdns;
  const gladys = createFakeGladys({
    config,
    devices: gladysDevices,
    scanResults: { mdns: entries ?? [] },
  });
  if (entries === null) {
    gladys.scanNetwork = async () => {
      throw new Error('403 mDNS discovery not declared');
    };
  }
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    transport: network,
    timers: false,
    snmpTiming: { timeoutMs: 5, retries: 1 },
    now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, printers, app, monitor: app.monitor, dataDir };
}

/** External id of the device of a simulated printer. */
export const deviceId = (gladys, printer) =>
  gladys.externalIds(
    'printer',
    Buffer.from(printer.fixture.varbinds['1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.1.0'].hex, 'hex')
      .toString('latin1')
      .toLowerCase(),
  ).device;

/** Create discovered devices in Gladys, as the user would ("Add"). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated({ ...device, id: `id-${device.external_id}` });
  }
}

/** The printer fixture by name, on its own address. */
export const printerOf = (name, host = '192.0.2.50') => createPrinter(FIXTURES[name], { host });
