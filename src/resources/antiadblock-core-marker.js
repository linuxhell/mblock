// SPDX-License-Identifier: GPL-3.0-only
// Global AntiAdblockCore family fix. It remains inert until AntiAdblockCore's
// own DOM markers are present, then neutralizes the current Recovery overlay
// without depending on loader host, path, hash or CDN.
(() => {
  if (globalThis.__mblockAntiAdblockCoreMarkerV3) return;
  globalThis.__mblockAntiAdblockCoreMarkerV3 = true;

  const markerSelector = 'meta[name="antiadblockcore-verification"],script#antiadblock-core-js';
  const overlayText = /(?:adblocker detected|ad blocker detected|disable your adblocker|disable your ad blocker|how to disable your adblocker|i['’]ve disabled it)/i;
  let active = false, observer, stopTimer, overlayRemovals = 0;
  const stopIfInactive = () => { if (!active) observer?.disconnect(); };
  const mark = state => { try { const root=document.documentElement; if (!root) return; const current=root.getAttribute('data-mblock-aabc-state'); if (current !== 'redirected' || state === 'overlay-removed') root.setAttribute('data-mblock-aabc-state', state); root.setAttribute('data-mblock-aabc-overlay-removals', String(overlayRemovals)); } catch {} };

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
    if (!active || !root) return false;
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

  const activate = () => {
    if (active) return true;
    try {
      if (!document.querySelector(markerSelector)) return false;
      active = true;
      exposeCleanResult();
      removeRecoveryOverlay(document);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => observer?.disconnect(), 15000);
      return true;
    } catch { return false; }
  };

  observer = new MutationObserver(records => {
    if (!active) {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(markerSelector) || node.querySelector?.(markerSelector)) {
          activate();
          break;
        }
      }
    }
    if (active) {
      exposeCleanResult();
      for (const record of records) for (const node of record.addedNodes) removeRecoveryOverlay(node);
    }
  });

  const root = document.documentElement || document;
  observer.observe(root, { childList: true, subtree: true });
  // On ordinary sites this observer is only needed while the initial document is
  // being assembled. Do not keep a subtree observer alive for the lifetime of
  // every page when no AntiAdblockCore marker ever appears.
  stopTimer = setTimeout(stopIfInactive, 8000);
  activate();
  addEventListener('DOMContentLoaded', () => {
    activate();
    if (active) removeRecoveryOverlay(document);
    else { clearTimeout(stopTimer); stopTimer = setTimeout(stopIfInactive, 4000); }
  }, { once: true });
  addEventListener('load', () => {
    activate();
    if (!active) { clearTimeout(stopTimer); stopTimer = setTimeout(stopIfInactive, 1000); }
  }, { once: true });
})();
