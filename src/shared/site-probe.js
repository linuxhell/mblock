// SPDX-License-Identifier: GPL-3.0-only
// Self-contained: scripting.executeScript serializes this function. No resident
// content-script receiver is required, including after an extension update.
export function probeSite() {
  const markers = [], scripts = [];
  if (document.querySelector('script#antiadblock-core-js')) markers.push('antiadblock-core loader');
  if (document.querySelector('meta[name="antiadblockcore-verification"]')) markers.push('antiadblock-core meta');
  let examined = 0;
  for (const script of Array.from(document.scripts).slice(0, 150)) {
    if (script.src) { try { const url = new URL(script.src); if (/^https?:$/.test(url.protocol)) scripts.push(url.origin + url.pathname.slice(0, 500) + (url.search ? '?' + Array.from(url.searchParams.keys()).slice(0, 12).map(k => encodeURIComponent(k) + '=redacted').join('&') : '')); } catch {} }
    else if (examined < 500000) { const text = script.textContent.slice(0, 500000 - examined); examined += text.length; if (text.includes('ai_adb_process_blocks')) markers.push('ad-inserter ai_adb_process_blocks'); }
  }
  let text = '', count = 0, current;
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: node => node.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    while (count++ < 4000 && text.length < 100000 && (current = walker.nextNode())) if (current.nodeType === 3) text += current.nodeValue.slice(0, 100000 - text.length) + ' ';
  }
  return { url: location.origin + '/', markers: [...new Set(markers)], scripts, warningPresent: /ad.?block.{0,30}(?:detect|disable)|(?:detect|disable).{0,30}ad.?block|bloqueador de anúncios detectado/i.test(text) };
}
