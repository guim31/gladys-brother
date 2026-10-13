// -----------------------------------------------------------------------------
// The printer monitor: discovery, the reading loop over the printers created
// in Gladys, states, transport badge, scene events, and the last reading of
// each printer for the widget and the scene action.
//
// Cadence: one SNMP GetRequest per printer every `poll_interval` seconds, on
// the container's own timer (the devices are published with should_poll:
// false: the Gladys scheduler stops at one minute and its frequency is frozen
// when the device is created). Printers are read one after the other, never
// in parallel, and a printer is never read twice at the same time: the timer,
// the widget button and the scene action share the reading in progress.
//
// A printer in deep sleep may miss a request: it is declared unreachable only
// after UNREACHABLE_AFTER readings in a row without an answer (each one with
// its own retries). Then its transport badge turns "unreachable" and its
// status says so; the first answer puts both back.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createDiscoveryMemory, discoverPrinters } from './discovery.js';
import { createLogGate } from './logGate.js';
import { readPrinter } from './brother/reader.js';
import {
  DEVICE_TYPE,
  SUPPLY_KEYS,
  buildDevice,
  buildStates,
  deviceParam,
  featureName,
  platformId,
} from './features.js';
import { CONNECTION_TEXT, ERROR_NAMES, NOT_RESPONDING, pick } from './texts.js';
import { TRIGGERS, evaluateSupply, newErrors } from './triggers.js';
import { createUdpTransport } from './snmp/client.js';

const logger = createLogger({ name: 'brother' });

export const WIDGET_KEY = 'supplies';
export const UNREACHABLE_AFTER = 2;
// Looking for a printer that changed address (DHCP) costs an mDNS scan and a
// probe of every candidate: at most once in this delay.
export const REDISCOVERY_DELAY_MS = 30 * 60 * 1000;

const DEFAULT_SNMP_TIMING = { timeoutMs: 2500, retries: 2 };

export class PrinterMonitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store persistence under /data
   * @param {object} [options.transport] SNMP transport (test seam)
   * @param {boolean} [options.timers] false in the tests: no interval
   * @param {() => Date} [options.now]
   * @param {object} [options.snmpTiming] { timeoutMs, retries }
   */
  constructor({ gladys, store, transport, timers = true, now, snmpTiming }) {
    this.gladys = gladys;
    this.store = store;
    this.transport = transport ?? createUdpTransport();
    this.timers = timers;
    this.now = now ?? (() => new Date());
    this.snmpTiming = { ...DEFAULT_SNMP_TIMING, ...snmpTiming };
    this.config = null;
    this.devices = [];
    this.hosts = new Map(); // device external_id → address found by discovery
    this.snapshots = new Map(); // device external_id → last reading and reachability
    this.transportsSent = new Map(); // device external_id → last badge published
    this.memory = {}; // persisted: per device, fired steps and alerts
    this.oidCache = new Map();
    this.inFlight = new Map();
    this.lastDiscovery = { printers: [], failures: [], mdns: 'ok' };
    this.lastRediscovery = 0;
    this.discoveryMemory = createDiscoveryMemory();
    this.logGate = createLogGate(logger);
    this.rediscoveryWanted = false;
    this.timer = null;
    this.loop = null;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.memory = saved.printers && typeof saved.printers === 'object' ? saved.printers : {};
    await this.discover();
    await this.reloadDevices();
    await this.pollAll({ force: true });
    this.startTimer();
    await this.reportConnection();
  }

  /** After a reconnection: Gladys may have lost states while we were away. */
  async resync(config) {
    this.config = config;
    await this.reloadDevices();
    await this.pollAll({ force: true });
    this.startTimer();
    await this.reportConnection();
  }

  async reconfigure(config) {
    this.config = config;
    this.oidCache.clear(); // the community or the SNMP version may have changed
    await this.discover();
    await this.reloadDevices();
    await this.pollAll({ force: true });
    this.startTimer();
    await this.reportConnection();
  }

  async stop() {
    this.stopTimer();
    await this.loop?.catch(() => {});
    await this.store.flush();
  }

  startTimer() {
    this.stopTimer();
    if (!this.timers) {
      return;
    }
    this.timer = setInterval(() => {
      this.pollAll().then(
        () => this.logGate.success('loop', 'Reading loop working again'),
        (err) => this.logGate.failure('loop', `Reading loop failed: ${err.message}`),
      );
    }, this.config.pollIntervalSeconds * 1000);
    this.timer.unref?.();
  }

  stopTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snmpOptions() {
    return {
      transport: this.transport,
      community: this.config.community,
      version: this.config.snmpVersion,
      oidCache: this.oidCache,
      ...this.snmpTiming,
    };
  }

  // --- Devices ---------------------------------------------------------------

  isPrinterDevice(device) {
    return (
      typeof device?.external_id === 'string' &&
      device.external_id.startsWith(this.gladys.externalId(`${DEVICE_TYPE}:`))
    );
  }

  async reloadDevices() {
    this.devices = (await this.gladys.getDevices()).filter((device) =>
      this.isPrinterDevice(device),
    );
  }

  findDevice(externalId) {
    return this.devices.find((device) => device.external_id === externalId) ?? null;
  }

  async onDeviceCreated(device) {
    await this.reloadDevices();
    const created = this.findDevice(device?.external_id);
    if (!created) {
      return;
    }
    // Every state again: the ones published before the device existed were
    // dropped by Gladys.
    await this.pollDevice(created, { force: true });
    this.refreshWidget();
  }

  async onDeviceChanged() {
    await this.reloadDevices();
    this.refreshWidget();
  }

  // --- Discovery -------------------------------------------------------------

  async discover() {
    const result = await discoverPrinters(this.gladys, this.config, {
      snmp: this.snmpOptions(),
      memory: this.discoveryMemory,
    });
    this.lastDiscovery = result;
    this.lastRediscovery = this.now().getTime();
    const devices = result.printers.map((printer) => {
      const device = buildDevice(this.gladys, printer, this.config);
      this.hosts.set(device.external_id, printer.host);
      return device;
    });
    try {
      // Upserts the params (HOST) of the printers already created: a printer
      // that changed address is found again.
      await this.gladys.publishDiscoveredDevices(devices);
      this.logGate.success('discovered', 'Discovered printers accepted by Gladys again');
    } catch (err) {
      this.logGate.failure(
        'discovered',
        `publishDiscoveredDevices refused by Gladys: ${err.message}`,
      );
      throw err;
    }
    return result;
  }

  async reportConnection() {
    const nothing = this.devices.length === 0 && this.lastDiscovery.printers.length === 0;
    await this.gladys.setConnectionStatus(true, nothing ? CONNECTION_TEXT.noPrinter : undefined);
  }

  // --- Readings --------------------------------------------------------------

  /**
   * Read every created printer once, one after the other.
   * @param {{ force?: boolean }} [options] force: publish every state again
   */
  async pollAll({ force = false } = {}) {
    if (this.loop) {
      return this.loop; // the previous round is not over yet
    }
    this.loop = (async () => {
      let changed = false;
      for (const device of this.devices) {
        const result = await this.pollDevice(device, { force });
        changed = changed || result.changed;
      }
      if (changed) {
        this.refreshWidget();
      }
      await this.rediscoverIfNeeded();
    })();
    try {
      await this.loop;
    } finally {
      this.loop = null;
    }
  }

  /**
   * Read one printer and publish what changed.
   * @param {{ force?: boolean, immediate?: boolean }} [options] force: publish
   *   every state again; immediate: a user is waiting for this answer (widget
   *   button, scene action), a printer that does not answer is reported
   *   unreachable at once instead of after UNREACHABLE_AFTER readings
   * @returns {Promise<{ ok: boolean, changed: boolean, error?: Error }>}
   */
  pollDevice(device, { force = false, immediate = false } = {}) {
    const running = this.inFlight.get(device.external_id);
    if (running) {
      return running;
    }
    const promise = this.readAndPublish(device, { force, immediate }).finally(() => {
      this.inFlight.delete(device.external_id);
    });
    this.inFlight.set(device.external_id, promise);
    return promise;
  }

  hostOf(device) {
    return this.hosts.get(device.external_id) ?? deviceParam(device, 'HOST');
  }

  async readAndPublish(device, { force, immediate }) {
    const id = device.external_id;
    const snapshot = this.snapshots.get(id) ?? {
      reading: null,
      at: null,
      reachable: null,
      failures: 0,
      unreachableSince: null,
    };
    this.snapshots.set(id, snapshot);
    const host = this.hostOf(device);

    let reading;
    try {
      if (!host) {
        throw new Error('no address known for this printer');
      }
      ({ reading } = await readPrinter(host, this.snmpOptions()));
      const answering = this.gladys.externalIds(DEVICE_TYPE, platformId(reading)).device;
      if (answering !== id) {
        // DHCP gave the address to another printer: not this one.
        throw new Error(`another printer (Brother ${reading.model}) answers at ${host}`);
      }
    } catch (err) {
      return this.recordFailure(device, snapshot, err, { immediate, host });
    }

    const previous = snapshot.reading;
    const wasUnreachable = snapshot.reachable === false;
    if (wasUnreachable) {
      logger.info(`${device.name} (${host}) is responding again`);
    }
    Object.assign(snapshot, {
      reading,
      at: this.now(),
      reachable: true,
      failures: 0,
      unreachableSince: null,
      error: null,
    });
    await this.publishTransport(id, 'local');
    await this.publishStates(id, buildStates(id, reading), { force });
    await this.fireEvents(device, reading);

    const changed =
      force ||
      wasUnreachable ||
      previous?.status !== reading.status ||
      JSON.stringify(previous?.errors) !== JSON.stringify(reading.errors) ||
      SUPPLY_KEYS.some((key) => previous?.values[key] !== reading.values[key]);
    return { ok: true, changed };
  }

  async recordFailure(device, snapshot, err, { immediate, host }) {
    snapshot.failures += 1;
    snapshot.error = err;
    logger.debug(`${device.name} (${host}) not read: ${err.message}`);
    let changed = false;
    if (snapshot.reachable !== false && (snapshot.failures >= UNREACHABLE_AFTER || immediate)) {
      logger.warn(`${device.name} (${host}) is not responding: ${err.message}`);
      snapshot.reachable = false;
      snapshot.unreachableSince = this.now();
      changed = true;
      this.rediscoveryWanted = true;
      await this.publishTransport(device.external_id, 'unreachable');
      await this.publishStates(
        device.external_id,
        [
          {
            device_feature_external_id: `${device.external_id}:status`,
            text: pick(NOT_RESPONDING, this.config.language),
          },
        ],
        { force: false },
      );
    }
    return { ok: false, changed, error: err };
  }

  async publishStates(deviceId, states, { force }) {
    try {
      if (force) {
        this.gladys.forgetPublishedStates(deviceId);
      }
      await this.gladys.publishChangedStates(states);
      this.logGate.success(`states:${deviceId}`, `States of ${deviceId} accepted again`);
    } catch (err) {
      this.logGate.failure(`states:${deviceId}`, `States of ${deviceId} refused: ${err.message}`);
    }
  }

  async publishTransport(deviceId, transport) {
    if (this.transportsSent.get(deviceId) === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: deviceId, transport }]);
      this.transportsSent.set(deviceId, transport);
    } catch (err) {
      logger.debug(`Transport badge of ${deviceId} not updated: ${err.message}`);
    }
  }

  async rediscoverIfNeeded() {
    if (!this.rediscoveryWanted || this.lastDiscovery.mdns !== 'ok') {
      return;
    }
    if (this.now().getTime() - this.lastRediscovery < REDISCOVERY_DELAY_MS) {
      return;
    }
    this.rediscoveryWanted = false;
    try {
      await this.discover();
      this.logGate.success('rediscovery');
    } catch (err) {
      this.logGate.failure('rediscovery', `Rediscovery failed: ${err.message}`);
    }
  }

  // --- Scene events ----------------------------------------------------------

  async fireEvents(device, reading) {
    const id = device.external_id;
    const language = this.config.language;
    const before = JSON.stringify(this.memory[id] ?? null);
    const memory = this.memory[id] ?? {};
    memory.fired ??= {};
    const firstReading = this.memory[id] === undefined;
    const events = [];

    for (const key of SUPPLY_KEYS) {
      const value = reading.values[key];
      if (typeof value !== 'number') {
        continue;
      }
      const { fired, crossed } = evaluateSupply(
        value,
        firstReading ? undefined : memory.fired[key],
      );
      memory.fired[key] = fired;
      for (const threshold of crossed) {
        events.push({
          key: TRIGGERS.SUPPLY_LOW,
          data: {
            printer: id,
            printer_name: device.name,
            supply: key,
            supply_name: featureName(key, language, reading.printerType),
            percent: value,
            threshold,
          },
        });
      }
    }

    for (const error of newErrors(reading.errors, firstReading ? undefined : memory.errors)) {
      events.push({
        key: TRIGGERS.PRINTER_ERROR,
        data: {
          printer: id,
          printer_name: device.name,
          error,
          error_name: pick(ERROR_NAMES, language)[error],
          status: reading.status ?? '',
        },
      });
    }
    memory.errors = reading.errors;

    this.memory[id] = memory;
    if (JSON.stringify(memory) !== before) {
      this.store.save({ printers: this.memory });
    }
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
        this.logGate.success('scene-event', 'Scene events accepted again');
        logger.info(`Scene event ${event.key} for ${device.name}`);
      } catch (err) {
        this.logGate.failure('scene-event', `Scene event ${event.key} refused: ${err.message}`);
      }
    }
  }

  // --- For the widget, the scene action and the test action ------------------

  snapshot(externalId) {
    return this.snapshots.get(externalId) ?? null;
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not requested: ${err.message}`);
    }
  }

  /** Read an address once, without remembering anything (test action). */
  async probe(host) {
    const { oidCache: _ignored, ...options } = this.snmpOptions();
    const { reading } = await readPrinter(host, options);
    return reading;
  }
}
