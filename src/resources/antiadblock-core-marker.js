// SPDX-License-Identifier: GPL-3.0-only
// Global AntiAdblockCore family fix. Ordinary pages keep only the tiny marker
// watcher below; recovery machinery is allocated only after a known marker.
(() => {
  if (globalThis.__mblockAntiAdblockCoreMarkerV4) return;
  globalThis.__mblockAntiAdblockCoreMarkerV4 = true;

  const markerSelector = 'meta[name="antiadblockcore-verification"],script#antiadblock-core-js';
  let observer, stopTimer, activeHandler = null;

  function activate() {
    if (activeHandler) return true;
    try {
      if (!document.querySelector(markerSelector)) return false;
    } catch { return false; }

    const overlayText = /(?:adblocker detected|ad blocker detected|disable your adblocker|disable your ad blocker|how to disable your adblocker|i['’]ve disabled it)/i;
    let overlayRemovals = 0;

    const mark = state => {
      try {
        const root = document.documentElement;
        if (!root) return;
        const current = root.getAttribute('data-mblock-aabc-state');
        if (current !== 'redirected' || state === 'overlay-removed') root.setAttribute('data-mblock-aabc-state', state);
        root.setAttribute('data-mblock-aabc-overlay-removals', String(overlayRemovals));
      } catch {}
    };

    const exposeCleanResult = () => {
      try {
        globalThis.__tlm = true;
        globalThis.__tlx = true;
        globalThis.AABC_DETECTION = { detected: false, blockerType: null, path: 'MBLOCK', browser: navigator.userAgent };
        globalThis.AABC_ON_DETECT = () => {};
        mark('marker-active');
      } catch {}
    };

    const restorePage = () => {
      try {
        for (const root of [document.documentElement, document.body]) {
          if (!root) continue;
          if (/hidden|clip/i.test(root.style.overflow || '')) root.style.removeProperty('overflow');
          if (root.style.position === 'fixed') root.style.removeProperty('position');
          if (root.style.pointerEvents === 'none') root.style.removeProperty('pointer-events');
        }
      } catch {}
    };

    const removeRecoveryOverlay = root => {
      if (!root) return false;
      let removed = false;
      const candidates = [];
      if (root.nodeType === 1) candidates.push(root);
      if (root.querySelectorAll) candidates.push(...root.querySelectorAll('[role="dialog"],[aria-modal="true"],div,section'));
      let checked = 0;
      for (const el of candidates) {
        if (++checked > 240 || !el?.isConnected) break;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 3500 || !overlayText.test(text)) continue;
        const style = getComputedStyle(el);
        const modalLike = el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true' ||
          style.position === 'fixed' || style.position === 'sticky' || Number(style.zIndex) >= 1000;
        if (!modalLike) continue;
        let target = el;
        for (let i = 0; i < 3 && target.parentElement; i++) {
          const p = target.parentElement, ps = getComputedStyle(p);
          const pText = (p.textContent || '').replace(/\s+/g, ' ').trim();
          if (!overlayText.test(pText) || pText.length > 5000) break;
          if (ps.position === 'fixed' || Number(ps.zIndex) >= 1000 || p.getAttribute('aria-modal') === 'true') target = p;
          else break;
        }
        target.remove();
        overlayRemovals++;
        mark('overlay-removed');
        removed = true;
      }
      if (removed) restorePage();
      return removed;
    };

    activeHandler = records => {
      exposeCleanResult();
      for (const record of records) for (const node of record.addedNodes) removeRecoveryOverlay(node);
    };

    exposeCleanResult();
    removeRecoveryOverlay(document);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => observer?.disconnect(), 15000);
    return true;
  }

  observer = new MutationObserver(records => {
    if (activeHandler) {
      activeHandler(records);
      return;
    }
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.(markerSelector) || node.querySelector?.(markerSelector)) {
        activate();
        return;
      }
    }
  });

  const stopIfInactive = () => { if (!activeHandler) observer?.disconnect(); };
  observer.observe(document.documentElement || document, { childList: true, subtree: true });
  stopTimer = setTimeout(stopIfInactive, 8000);
  activate();
  addEventListener('DOMContentLoaded', () => {
    if (!activate()) { clearTimeout(stopTimer); stopTimer = setTimeout(stopIfInactive, 4000); }
  }, { once: true });
  addEventListener('load', () => {
    if (!activate()) { clearTimeout(stopTimer); stopTimer = setTimeout(stopIfInactive, 1000); }
  }, { once: true });
})();
