// SPDX-License-Identifier: GPL-3.0-only
// Minimal isolated-world bootstrap. Diagnostics are injected on demand.
(() => {
  if (globalThis.__mblockContentAttached) return;
  globalThis.__mblockContentAttached = true;
  const api = globalThis.browser || chrome;
  const documentKey = crypto.randomUUID();
  try {
    const pending = api.runtime.sendMessage({ type: 'frame_ready', documentKey });
    pending?.catch?.(() => {});
  } catch {}
})();
