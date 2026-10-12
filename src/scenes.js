// -----------------------------------------------------------------------------
// Scene action `read_printer` (Gladys 5.1+): read a printer now and hand its
// key figures to the next actions of the scene — the pages printed for a
// monthly report, the lowest supply for a "time to order" message.
//
// A scene action does not receive the user's language: names follow the
// `language` setting. Never fires a scene event (a scene bound to the event
// would loop).
// -----------------------------------------------------------------------------

import { featureName } from './features.js';
import { ERROR_NAMES, NOT_RESPONDING, pick } from './texts.js';
import { lowestSupply } from './widgets.js';

export const SCENE_ACTIONS = {
  async read_printer(monitor, { fields }) {
    const device = monitor.findDevice(fields?.printer);
    if (!device) {
      throw new Error(`Unknown printer: ${fields?.printer}`);
    }
    const result = await monitor.pollDevice(device, { force: false, immediate: true });
    const snapshot = monitor.snapshot(device.external_id);
    const reading = snapshot?.reading ?? null;
    const language = monitor.config.language;
    const lowest = lowestSupply(reading);
    // Unreachable: the last known figures, if any, with an honest status.
    return {
      reachable: result.ok,
      status: result.ok ? (reading?.status ?? '') : pick(NOT_RESPONDING, language),
      pages_printed: reading?.values.page_counter ?? null,
      lowest_supply: lowest ? featureName(lowest.key, language, reading.printerType) : '',
      lowest_supply_percent: lowest ? lowest.value : null,
      alerts: result.ok
        ? (reading?.errors ?? []).map((error) => pick(ERROR_NAMES, language)[error]).join(', ')
        : '',
    };
  },
};
