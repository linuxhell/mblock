// SPDX-License-Identifier: GPL-3.0-only
// Global AntiAdblockCore family fix. It does nothing unless the page exposes
// AntiAdblockCore's own DOM markers, and disconnects immediately after arming.
(() => {
  if (globalThis.__mblockAntiAdblockCoreMarkerV2) return;
  globalThis.__mblockAntiAdblockCoreMarkerV2 = true;
  let observer;
  const arm = () => {
    try {
      if (!document.querySelector('meta[name="antiadblockcore-verification"],script#antiadblock-core-js')) return false;
      globalThis.__tlm = true;
      globalThis.__tlx = true;
      observer?.disconnect();
      return true;
    } catch { return false; }
  };
  if (arm()) return;
  observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('meta[name="antiadblockcore-verification"],script#antiadblock-core-js') ||
          node.querySelector?.('meta[name="antiadblockcore-verification"],script#antiadblock-core-js')) {
        arm();
        return;
      }
    }
  });
  const start = () => {
    if (arm()) return;
    const root = document.documentElement || document;
    observer.observe(root, { childList: true, subtree: true });
  };
  start();
  addEventListener('DOMContentLoaded', () => { if (!arm()) setTimeout(() => observer?.disconnect(), 5000); }, { once: true });
})();
