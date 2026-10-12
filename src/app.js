// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake) and
// returns the monitor, so index.js stays a few lines and the tests drive the
// very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { normalizeConfig } from './config.js';
import { PrinterMonitor } from './monitor.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { CONNECTION_TEXT } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'brother-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, transport, timers, now, snmpTiming
 */
export function registerHandlers(gladys, options = {}) {
  const monitor = new PrinterMonitor({
    gladys,
    store: options.store ?? new Store(),
    transport: options.transport,
    timers: options.timers ?? true,
    now: options.now,
    snmpTiming: options.snmpTiming,
  });

  // Resolved once the monitor has started; every handler waits for it, so a
  // request arriving during the first discovery is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        await monitor.resync(config); // Gladys restarted: it may have lost states
        return;
      }
      started = true;
      await monitor.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, CONNECTION_TEXT.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.on('disconnected', () => monitor.stopTimer());

  gladys.onScanRequest(
    whenReady(async () => {
      await monitor.discover();
    }),
  );

  // Devices are published with should_poll: false (the container has its own
  // timer); this only serves a Gladys that would poll anyway.
  gladys.onPoll(
    whenReady(async (device) => {
      await monitor.pollDevice(device);
    }),
  );

  gladys.onDeviceCreated(whenReady((device) => monitor.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady(() => monitor.onDeviceChanged()));
  gladys.onDeviceDeleted(whenReady(() => monitor.onDeviceChanged()));

  gladys.onConfigUpdated(whenReady((newConfig) => monitor.reconfigure(normalizeConfig(newConfig))));

  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(
      key,
      whenReady((fields) => handler(monitor, { fields })),
    );
  }

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(monitor, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(monitor, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) =>
        widget.action(monitor, { actionKey, params, ...context }),
      ),
    );
  }

  return {
    monitor,
    ready,
    stop: () => monitor.stop(),
  };
}
