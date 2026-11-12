// SPDX-License-Identifier: GPL-3.0-only
// Packaged AntiAdblockCore replacement. No remote code is executed.
(() => {
  try {
    globalThis.__tlm = true;
    globalThis.__tlx = true;
    globalThis.AABC_DETECTION = { detected: false, blockerType: null, path: 'MBLOCK_REDIRECT', browser: navigator.userAgent };
    globalThis.AABC_ON_DETECT = () => {};
    document.documentElement?.setAttribute('data-mblock-aabc-state', 'redirected');
  } catch {}
})();
