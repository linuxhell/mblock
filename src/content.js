// SPDX-License-Identifier: GPL-3.0-only
// Isolated world. No page globals, DOM markers, permanent observers or polling.
(() => {
  if (globalThis.__mblockContentAttached) return;
  globalThis.__mblockContentAttached = true;
  const api = globalThis.browser || chrome;
  let diagnostic = false, errors = 0, stopped = false, lastScan = 0;
  let taskMs = 0, resourceListener, stopTimer, scanTimers = [];
  const send = async (type, data = {}) => { try { const r = await api.runtime.sendMessage({ type, ...data }); return r?.ok ? r.data : null; } catch { return null; } };
  // Read a bounded text sample without innerText forcing a full-page layout.
  function pageText() {
    if (!document.body) return '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: node => node.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let text = '', count = 0, current;
    while (count++ < 4000 && text.length < 100000 && (current = walker.nextNode())) if (current.nodeType === 3) text += current.nodeValue.slice(0, 100000 - text.length) + ' ';
    return text.toLowerCase();
  }
  function scan() {
    if (!diagnostic || stopped || Date.now() - lastScan < 500) return;
    const start = performance.now(); lastScan = Date.now();
    // Signals only: this does not assert that a site has definitely detected mBlock.
    const text = pageText();
    const phrases = ['ad blocker detected', 'adblock detected', 'disable your ad blocker', 'disable adblock', 'bloqueador de anúncios detectado', 'desative seu bloqueador', 'please disable your adblock'];
    const signal = phrases.find(s => text.includes(s)) || '';
    const markers = [];
    for (const [selector, name] of [['script#antiadblock-core-js', 'antiadblock-core loader'], ['meta[name="antiadblockcore-verification"]', 'antiadblock-core meta'], ['[id*="adblock"][role="dialog"]', 'adblock dialog']]) if (document.querySelector(selector)) markers.push(name);
    const nav = performance.getEntriesByType('navigation')[0]; taskMs += performance.now() - start;
    send('page_diagnostic', { payload: { antiAdblockSignal: !!signal, signal, markers, resourceErrors: errors, timings: { domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0), load: Math.round(nav?.loadEventEnd || 0), contentTaskMs: Number(taskMs.toFixed(2)) } } });
  }
  function disable() {
    diagnostic = false; clearTimeout(stopTimer); scanTimers.forEach(clearTimeout); scanTimers = [];
    if (resourceListener) window.removeEventListener('error', resourceListener, true); resourceListener = null;
  }
  function enable(until = Date.now() + 30000) {
    disable();
    const remaining = Math.max(0, Math.min(300000, until - Date.now())); if (!remaining) return;
    diagnostic = true;
    if (!resourceListener) { resourceListener = e => { if (e.target !== window) errors++; }; window.addEventListener('error', resourceListener, true); }
    scan(); scanTimers = [setTimeout(scan, 2000), setTimeout(scan, 8000)];
    // Hard stop even if the worker closes before its diagnostic alarm.
    stopTimer = setTimeout(disable, remaining);
  }
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id) return;
    if (message?.type === 'diagnostic_state') { if (message.enabled) enable(message.until); else disable(); respond({ ok: true }); }
  });
  const documentKey = crypto.randomUUID();
  send('frame_ready', { documentKey }).then(state => { if (state?.diagnostic) enable(state.diagnosticUntil); });
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  window.addEventListener('load', scan, { once: true });
  window.addEventListener('pagehide', () => { stopped = true; disable(); }, { once: true });
})();
