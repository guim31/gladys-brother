// -----------------------------------------------------------------------------
// Manifest action `test_printer` (Configuration screen): read one address now
// with the current SNMP settings and say what answers, before adding it to the
// manual list. Nothing is published or remembered.
// -----------------------------------------------------------------------------

import { UnsupportedPrinterError } from './brother/decode.js';
import { featureName } from './features.js';
import { isValidHost } from './config.js';
import { LANGUAGES, TEXT, everyLanguage, pick } from './texts.js';
import { lowestSupply } from './widgets.js';

export const ACTIONS = {
  async test_printer(monitor, { fields }) {
    const host = String(fields?.host ?? '')
      .trim()
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/[/:].*$/, '')
      .toLowerCase();
    if (!isValidHost(host)) {
      return everyLanguage((lang) => pick(TEXT, lang).invalidHost(String(fields?.host ?? '')));
    }
    let reading;
    try {
      reading = await monitor.probe(host);
    } catch (err) {
      const key = err instanceof UnsupportedPrinterError ? 'unsupported' : 'noAnswer';
      return everyLanguage((lang) => pick(TEXT, lang)[key](host));
    }
    const lowest = lowestSupply(reading);
    return Object.fromEntries(
      LANGUAGES.map((lang) => {
        const text = pick(TEXT, lang);
        const pages = reading.values.page_counter;
        return [
          lang,
          text.found({
            name: `Brother ${reading.model}`,
            type: text.printerTypes[reading.printerType],
            status: reading.status ?? text.unknownStatus,
            pages:
              typeof pages === 'number'
                ? text.pagesCount(new Intl.NumberFormat(lang).format(pages))
                : text.noPages,
            lowest: lowest
              ? text.lowest(featureName(lowest.key, lang, reading.printerType), lowest.value)
              : text.noLevel,
          }),
        ];
      }),
    );
  },
};
