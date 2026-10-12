// -----------------------------------------------------------------------------
// Scene triggers: what happened between two readings of a printer.
//
// The scene filters of Gladys only compare for equality: a threshold cannot be
// a filter on a percentage. So the container fires one `supply_low` event per
// step of a fixed ladder a supply goes down through, carrying the step as
// `threshold`; the scene picks its step in a required select. Each step fires
// once, and is re-armed when the supply is back REARM_MARGIN points above it
// (a new cartridge), so an estimate wobbling around a step does not repeat it.
//
// `printer_error` fires when the printer raises a standard alert it did not
// have at the previous reading (paper jam, cover open...).
//
// Nothing fires on the first reading of a printer: a toner already at 5 % when
// the integration starts is a state, not a crossing. The previous values are
// kept in /data, so a restart is not a first reading.
// -----------------------------------------------------------------------------

export const TRIGGERS = { SUPPLY_LOW: 'supply_low', PRINTER_ERROR: 'printer_error' };

// The steps offered in the scene editor (percent), highest first.
export const THRESHOLDS = [50, 25, 20, 15, 10, 5, 0];
export const DEFAULT_THRESHOLD = 10;
export const REARM_MARGIN = 5;

/**
 * Compare a supply level with the steps already fired for it.
 * @param {number} value current percentage
 * @param {number[]|undefined} fired steps fired and not re-armed yet;
 *   undefined on the first reading of this supply
 * @returns {{ fired: number[], crossed: number[] }} the new fired list, and
 *   the steps crossed now (to fire), highest first
 */
export function evaluateSupply(value, fired) {
  const firstReading = fired === undefined;
  const next = [];
  const crossed = [];
  for (const threshold of THRESHOLDS) {
    const wasFired = !firstReading && fired.includes(threshold);
    if (value <= threshold) {
      next.push(threshold);
      if (!firstReading && !wasFired) {
        crossed.push(threshold);
      }
    } else if (wasFired && value < threshold + REARM_MARGIN) {
      next.push(threshold); // not far enough above the step yet
    }
  }
  return { fired: next, crossed };
}

/**
 * The alerts raised since the previous reading.
 * @param {string[]|null} errors current alerts (null: not reported)
 * @param {string[]|undefined} previous alerts of the previous reading
 * @returns {string[]}
 */
export function newErrors(errors, previous) {
  if (!Array.isArray(errors) || !Array.isArray(previous)) {
    return [];
  }
  return errors.filter((error) => !previous.includes(error));
}
