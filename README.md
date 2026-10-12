# Brother Printers for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration that
reads **Brother** printers and multifunction devices over **SNMP**, on the
local network: toner or ink levels, drum, belt, fuser, laser unit and paper
feed kits, page counters, and the message on the printer's display. No account,
no cloud. It complements the
[IPP Printers](https://github.com/guim31/gladys-ipp) integration, which gives
the state and ink levels of printers of every brand.

> **Developed without the hardware: feedback welcome.** The decoding was tested
> against real SNMP answers of 14 Brother models (the test data of the
> [`brother`](https://github.com/bieniu/brother) library used by Home
> Assistant), not on a printer. Please report what your model shows on the
> Gladys forum.

## Features

- **One device per printer**, identified by its serial number, with only the
  sensors the model reports: status (the display message), toner or ink per
  colour (%), drum or per-colour drums (%), belt, fuser, laser unit, paper feed
  kits (%), waste ink box (%), pages left before each part is due, pages
  printed (total, black and white, colour, duplex), drum page counter, uptime.
- **Laser or inkjet detected** from what the printer says (toner or ink names).
- **Honest offline state**: after two readings without an answer, the device
  badge turns _unreachable_ and its status says _Not responding_; the levels
  keep their last value.
- **Dashboard widget** "Brother supplies": gauges of the cartridges and most
  worn parts, status, alerts, pages printed, the other supplies, a _Read now_
  button.
- **Scene triggers**: "Printer supply low" (a supply goes down to 50, 25, 20,
  15, 10, 5 % or empty, once per crossing, again only after a replacement) and
  "Printer alert" (paper jam, out of paper, cover open… when it appears, with
  the display message).
- **Scene action** "Read a printer": reads now and passes on the pages printed,
  the lowest supply, the status and the alerts.
- Four languages (English, French, German, Spanish).

## Requirements

- Gladys Assistant 5.1 or later.
- A Brother printer on the network with **SNMP enabled** (the factory setting),
  v1 or v2c, reachable from Gladys in unicast UDP on port 161.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter
   `https://github.com/guim31/gladys-brother` (or install it from the catalog
   once it is listed there). The install screen shows the mDNS discovery
   request (`_printer._tcp`, `_ipp._tcp`).
2. Open the **Discover** tab: the printers found appear there. Add them.
3. A printer is missing? In **Configuration**, enter its IP address, save, and
   check **Discover** again. **Test a printer** reads an address and says what
   answers there.

The user guide is in [`docs/en.md`](docs/en.md) (also
[French](docs/fr.md), [German](docs/de.md), [Spanish](docs/es.md)); Gladys links
it from the Configuration screen.

## How it works

Every `poll_interval` seconds (60 by default), the container sends each printer
one SNMPv1 (or v2c) GetRequest for 14 OIDs: the Brother enterprise MIB (model,
serial, firmware, display text, and three binary blocks for the maintenance
levels, page counters and "next care" pages), plus a few standard MIB values
(uptime, display charset, page counter, alert register). An OID the model does
not have is dropped once and remembered, so a running integration sends one
datagram per printer and per reading. Only the values that changed are
published to Gladys.

The Brother blocks are lists of `code, 0x01, length, value` entries; they are
parsed by length, which also reads the legacy value/max pairs of older models
and the one-byte entries that the Python library's fixed-size chunking garbles
(HL-5350DN).

## Limitations

- Developed without the hardware (see above).
- The printer family (laser or inkjet) cannot be detected on a few old models:
  the cartridges are then named "Black cartridge"…
- "Printer alert" needs the standard printer alert register
  (`hrPrinterDetectedErrorState`); a printer that does not report it never
  fires it.
- Read only: nothing is ever written to the printer.
- SNMPv3 is not supported (Brother printers answer v1/v2c by default).

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js);
the SNMP client is a few hundred lines of BER in `src/snmp/`.

```bash
npm install
npm test              # node --test: decoder, SNMP, monitor, widget, scenes, i18n
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js                 SDK wiring (src/app.js registers the handlers)
src/app.js               every SDK handler -> the monitor (also used by the tests)
src/monitor.js           discovery, reading loop, states, transport badge, scene events
src/brother/             OIDs and codes, decoding, reading one printer
src/snmp/                BER encoding, GetRequest client over UDP
src/features.js          reading -> Gladys device, features and states
src/discovery.js         mDNS results (scanNetwork) and manual addresses
src/triggers.js          supply steps and new alerts
src/widgets.js           "Brother supplies" dashboard widget
src/scenes.js            "Read a printer" scene action
src/actions.js           "Test a printer" button
src/texts.js             every text, in four languages
test/fixtures/printers/  real printer answers (brother library), in wire format
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core, and `test/decode.test.js`
checks the decoding of the 14 models against the values the `brother`
library's own snapshots expect.

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="brother" \
BROTHER_DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [`brother`](https://github.com/bieniu/brother) by Maciej Bieniek
  (Apache-2.0): the OIDs, the meaning of the Brother codes and the charset
  handling are ported from it, and the test fixtures in
  `test/fixtures/printers/` are rebuilt from its test data (serial numbers and
  MAC addresses replaced by invented ones).
- Home Assistant's
  [`brother`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/brother)
  integration (Apache-2.0): the set of sensors and the zeroconf discovery.
- The Brother logo of the cover comes from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Brother_logo.svg)
  (public domain).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Brother
Industries. "Brother" is a trademark of Brother Industries, Ltd.

## License

[Apache-2.0](LICENSE)
