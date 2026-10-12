# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Network**: SNMP GetRequests (UDP 161) to the printers' own addresses only —
  the ones found by the mDNS scan Gladys runs for it and the ones typed in the
  configuration — one request at a time. It never writes to a printer (no SNMP
  SET), never broadcasts, and talks to no service outside the local network.
- **Secrets**: the SNMP community, when another one than `public` is set, is a
  `secret` field of the configuration, stored by Gladys and never sent back to
  the browser nor logged.
- **`/data`**: `brother-state.json` keeps, per printer, the supply levels and
  alerts of the last reading and the scene trigger steps already fired. No
  credential is written there.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the printers' own firmware and SNMP agent, and the security of SNMP v1/v2c
itself (cleartext community strings: keep the printers on a trusted network).
