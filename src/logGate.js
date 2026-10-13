// -----------------------------------------------------------------------------
// Repeated failures logged once: a warning at the first failure of a kind, one
// info line when it works again, debug in between. A printer switched off at
// night or a Gladys that refuses states would otherwise write the same line on
// every reading.
// -----------------------------------------------------------------------------

/**
 * @param {{ debug: Function, info: Function, warn: Function }} logger
 */
export function createLogGate(logger) {
  const failing = new Set();
  return {
    /**
     * @param {string} key what failed (one key per kind of failure)
     * @param {string} message
     */
    failure(key, message) {
      if (failing.has(key)) {
        logger.debug(message);
        return;
      }
      failing.add(key);
      logger.warn(message);
    },
    /**
     * @param {string} key
     * @param {string} [message] logged at info only after a failure
     */
    success(key, message) {
      if (failing.delete(key) && message) {
        logger.info(message);
      }
    },
    isFailing: (key) => failing.has(key),
  };
}
