# mBlock

[Português](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)

An ad and tracker blocker for Chrome, Edge and Firefox using native Manifest V3 rules, per-site controls and local diagnostics. Version **0.3.1** removes the alpha label. This naming change does not certify parity with or superiority to uBlock Origin.

## Features

- Native network blocking through `declarativeNetRequest`, including a packaged default ruleset that protects first startup before worker initialization completes.
- **Block element** in the popup: click an element, preview and save a CSS filter scoped to the current hostname. Esc or Cancel restores the preview. Filters persist across reloads; delete them in **My filters** to undo permanently. The picker supports the top document, excluding frames and Shadow DOM.
- Automatic filter updates enabled by default, with **1, 6, 12, 24 or 48 hour** intervals. Stale lists are checked after startup; identical hashes reuse compiled filters.
- Transactional updates, previous-configuration rollback and retention of existing rules when a list fails validation.
- Per-domain profiles, global pause, per-site CSS, TXT/JSON import with preview, filter and settings export.
- Optional diagnostics lasting 30 seconds to 5 minutes, bounded memory, reduced URLs and local export. No telemetry.
- A packaged YouTube profile using GPLv3 uBlock scriptlets and conservative playback recovery. No universal ad-blocking or anti-detection guarantee.
- A local signature-based anti-adblock assistant, not generative AI. The FC Portables fix targets only its known loader signature.
- Portuguese, English and Simplified Chinese interfaces. Optional PayPal donations to `jv12802@gmail.com`.

## Installation

Use [release assets](https://github.com/linuxhell/mblock/releases). Future releases contain Chrome/Edge packages, a **Mozilla-signed** Firefox XPI and checksums. No source ZIP is uploaded as a release asset. GitHub automatically generates its own source links for tags.

| Browser | Installation |
| --- | --- |
| Chrome 121+ | Extract `mblock-chrome-VERSION.zip`; enable Developer mode at `chrome://extensions`, then Load unpacked. |
| Edge 121+ | Extract `mblock-edge-VERSION.zip`; enable Developer mode at `edge://extensions`, then Load unpacked. |
| Firefox 142+ | Install the signed `mblock-firefox-VERSION.xpi`. Renaming a ZIP does not create a valid signature. |

Update unpacked Chrome/Edge installs in the same directory, then reload the extension to preserve ID and data. Keep Firefox ID `mblock@linuxhell.github.io`. Reload open pages after changing filters, pause or CSS. Filter-list updates are separate from extension-code updates; packaged scriptlets and fixes require a new extension version.

## Comparison with uBlock Origin

The mission is to outperform uBlock Origin with reproducible evidence. **General superiority has not been demonstrated.** Element picking and automatic updates already exist in uBO; these additions are new to mBlock.

| Area | mBlock | Full uBlock Origin |
| --- | --- | --- |
| Network filtering | Native DNR, subject to MV3 quotas | Its own filtering engine |
| Filter syntax | A subset of ABP/uBO; rejected filters shown in dashboard | Broader syntax, scriptlets and procedural filters |
| Generic CSS default | Off; can be enabled per site | On by default |
| Diagnostics | Temporary session and reduced-URL export | Logger and advanced tools |
| Improvement target | Less page work, verifiable updates and simple diagnostics | Reference for coverage and compatibility |

The lists collected on November 12, 2026 still contain approximately 20,000 unsupported filters, including many scriptlets and procedural filters. mBlock therefore cannot be treated as equivalent. Lower CPU usage or fewer rules does not establish better blocking when functionality is omitted.

The [new RAM and CPU optimization](docs/PERFORMANCE-2026-11-12.md) reduced CPU for pausing/resuming protection by **90%**, duration by **81%**, and RSS after that operation by **229–251 MiB** versus the previous mBlock build. Local controls change without reloading all lists; CSS uses a bounded cache and the cosmetic index uses 51% fewer serialized bytes. No filters were removed.

During simple navigation, RAM gains were small/inconsistent and mBlock remained **14–35 MiB above uBO**. In the 24-frame fixture, it used **48–52% less CPU and 119–121 MiB less RSS than uBO**. Navigation CPU did not consistently improve over the previous mBlock build. These are synthetic tests; see the report for raw data and limits.

Earlier stages used different references and runs: [first reduction](docs/MEMORY-2026-11-12.md), [second](docs/MEMORY-SECOND-2026-11-12.md), and [third](docs/MEMORY-THIRD-2026-11-12.md). See the [audit](docs/AUDIT-0.3.0.md) and [validation](docs/VALIDATION.md). The benchmark confirms active blockers, essential content preservation, and complete filter equivalence between mBlock builds. It uses a historical Chromium shared by MV2/MV3 and does not represent every browser or website.

## Privacy and limitations

Lists are data; no downloaded executable code is run. Updates contact public list URLs. Diagnostics do not read cookies, request bodies or headers. Optional URL paths can contain personal information; review exports before sharing. HTTP/HTTPS permissions enable CSS and tools on the selected tab. Diagnostic network listeners are attached only during a session.

Anti-adblock invisibility is not guaranteed. Exact native logging in Chromium requires an unpacked extension. Element filters hide content with CSS; they do not by themselves prevent resources from downloading. Selectors may need revision after site changes.

## Development

Requires Node.js 22+, Python 3 and Git:

```sh
npm ci
npm test
npm run fetch:lists
npm run build
node scripts/lint-firefox.mjs
npx playwright install --with-deps chromium
npm run test:browser
npm run benchmark
npm run package
```

`npm run package` creates only Chrome/Edge packages and checksums in `artifacts/`. To package all installers, obtain the XPI from Mozilla and run `python3 scripts/package.py --require-firefox --signed-firefox /path/signed.xpi`. The script checks version, add-on ID and signature records; it does not cryptographically verify signatures. Mozilla is the trusted signing source.

The manual **Signed installation release** workflow validates, requests Mozilla signing and publishes the three installers. Configure repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. Publishing fails if signing fails. See [Firefox signing](docs/FIREFOX_SIGNING.md).

GPL-3.0-only. Sources remain in this repository; installers include licenses and attribution. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
