// SPDX-License-Identifier: GPL-3.0-only
// Satisfy the loader's documented-on-page success check without starting the
// anti-adblock overlay or its fallback request loop. Restricted to FC Portables.
(() => { if (/(^|\.)fcportables\.com$/.test(location.hostname)) { window.__tlm = true; window.__tlx = true; } })();
