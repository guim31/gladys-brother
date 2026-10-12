# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Brother printers and multifunction devices read over SNMP (v1 or v2c) on the
  local network: one Gladys device per printer, with only what the model
  reports — the message on the display, toner or ink per colour, drum or
  per-colour drums, belt, fuser, laser unit, paper feed kits, waste ink box,
  pages left before each part is due, pages printed (total, black and white,
  colour, duplex), drum page counter and uptime.
- Automatic discovery of the printers announcing themselves over mDNS, and a
  manual list of IP addresses; a **Test a printer** button.
- Laser or inkjet detected from the printer, for the cartridge names (toner or
  ink).
- A printer that stops answering is shown as unreachable, with the status
  "Not responding"; its levels keep their last value.
- Dashboard widget **Brother supplies**: gauges, status, alerts, pages printed,
  the other supplies and a **Read now** button.
- Scene triggers **Printer supply low** (a supply goes down to the chosen
  level, once per crossing) and **Printer alert** (paper jam, out of paper,
  cover open…, with the message on the display).
- Scene action **Read a printer**: pages printed, lowest supply, status and
  alerts for the next actions of the scene.
- Sensor names and texts in English, French, German and Spanish (French by
  default).
