// SPDX-License-Identifier: GPL-3.0-only
// Satisfy the reviewed AntiAdblockCore loader success check without starting
// its overlay or fallback request loop. This resource is only reached through
// the narrow packaged AntiAdblockCore URL signatures in fixes.js.
(() => { window.__tlm = true; window.__tlx = true; })();
