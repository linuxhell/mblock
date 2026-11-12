// SPDX-License-Identifier: GPL-3.0-only
// Satisfy the reviewed AntiAdblockCore loader success check without starting
// its overlay or fallback request loop. Restricted to explicitly supported sites.
(() => { if (/(^|\.)(?:fcportables|filecatchers)\.com$/.test(location.hostname)) { window.__tlm = true; window.__tlx = true; } })();
