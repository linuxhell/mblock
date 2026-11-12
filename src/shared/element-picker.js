// SPDX-License-Identifier: GPL-3.0-only
// This function is serialized by scripting.executeScript: keep it self-contained.
export function installElementPicker(token, labels) {
  globalThis.__mblockPickerClose?.();
  const api = globalThis.browser || chrome;
  let chosen, selector = '', previewing = false, saving = false, closed = false;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}section{pointer-events:auto;position:fixed;right:16px;bottom:16px;max-width:min(400px,90vw);background:#171b23;color:white;border:2px solid #e34152;border-radius:12px;padding:16px;font:14px/1.5 system-ui}button{font:inherit;margin:6px 6px 0 0;padding:6px;cursor:pointer}textarea{box-sizing:border-box;width:100%;color:white;background:#252b38}p{margin:4px 0}#outline{position:fixed;pointer-events:none;border:2px solid #e34152;box-sizing:border-box;background:#e3415225}';
  const panel = document.createElement('section'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', labels.title);
  const heading = document.createElement('strong'); heading.textContent = labels.title;
  const description = document.createElement('p'); description.textContent = labels.instruction;
  const field = document.createElement('textarea'); field.readOnly = true; field.rows = 3; field.setAttribute('aria-label', labels.title);
  const outline = document.createElement('div'); outline.id = 'outline'; outline.hidden = true;
  const buttons = {};
  for (const name of ['preview', 'save', 'again', 'cancel']) { const b = document.createElement('button'); b.textContent = labels[name]; buttons[name] = b; }
  panel.append(heading, description, field, ...Object.values(buttons)); shadow.append(style, outline, panel); document.documentElement.append(host);
  function candidate(element) {
    if (!(element instanceof Element) || element.getRootNode() !== document || /^(HTML|BODY|HEAD)$/.test(element.tagName)) return '';
    const parts = []; let node = element;
    for (let depth = 0; node && depth < 8 && node !== document.documentElement; depth++, node = node.parentElement) {
      const tag = node.localName;
      if (!/^[a-z][a-z0-9-]*$/.test(tag)) return '';
      if (/^[a-zA-Z_][\w-]*$/.test(node.id) && document.querySelectorAll('#' + node.id).length === 1) { parts.unshift('#' + node.id); return parts.join(' > '); }
      const classes = [...node.classList].filter(c => /^[a-zA-Z_][\w-]*$/.test(c)).slice(0, 3);
      const simple = tag + classes.map(c => '.' + c).join('');
      if (!parts.length && classes.length && document.querySelectorAll(simple).length === 1) return simple;
      const siblings = node.parentElement ? [...node.parentElement.children].filter(e => e.localName === tag) : [];
      parts.unshift(tag + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')' : ''));
      const path = parts.join(' > ');
      if (document.querySelectorAll(path).length === 1) return path;
    }
    return '';
  }
  function paint(element) {
    if (!element || !element.isConnected) { outline.hidden = true; return; }
    const r = element.getBoundingClientRect(); outline.hidden = false;
    Object.assign(outline.style, { left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px' });
  }
  function move(e) { if (!chosen && !e.composedPath().includes(host)) paint(e.target); }
  function click(e) {
    if (e.composedPath().includes(host)) return;
    e.preventDefault(); e.stopImmediatePropagation(); if (!e.isTrusted || chosen) return;
    const result = candidate(e.target); if (!result) return;
    chosen = e.target; selector = result; field.value = location.hostname + '##' + selector; buttons.preview.disabled = buttons.save.disabled = false; paint(chosen);
  }
  async function setPreview(enabled) {
    if (!selector) return false;
    const response = await api.runtime.sendMessage({ type:'picker_preview', token, selector, enabled });
    if (!response?.ok) throw Error(response?.error || labels.failed);
    previewing = enabled;
    outline.hidden = enabled;
    if (!enabled) paint(chosen);
    return true;
  }
  function close() {
    if (closed) return; closed = true;
    clearTimeout(expiry); if (previewing && selector) api.runtime.sendMessage({ type:'picker_preview', token, selector, enabled:false }).catch?.(()=>{}); host.remove();
    window.removeEventListener('pointermove', move, true); window.removeEventListener('click', click, true); window.removeEventListener('keydown', key, true);
    window.removeEventListener('pagehide', close); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition);
    if (globalThis.__mblockPickerClose === close) delete globalThis.__mblockPickerClose;
  }
  function key(e) { if (e.key === 'Escape' && !saving) { e.preventDefault(); close(); } }
  function reposition() { if (chosen && !previewing) paint(chosen); else outline.hidden = true; }
  buttons.preview.onclick = async () => {
    if (!selector || saving) return;
    buttons.preview.disabled = true;
    try { await setPreview(!previewing); }
    catch (error) { description.textContent = labels.failed + ' ' + String(error.message).slice(0, 200); }
    finally { if (!closed) buttons.preview.disabled = false; }
  };
  buttons.again.onclick = async () => {
    if (previewing && selector) try { await setPreview(false); } catch {}
    chosen = null; selector = ''; previewing = false; field.value = ''; buttons.preview.disabled = buttons.save.disabled = true; outline.hidden = true;
  };
  buttons.cancel.onclick = close;
  buttons.save.onclick = async e => {
    if (!e.isTrusted || saving || !selector) return;
    saving = true; Object.values(buttons).forEach(b => b.disabled = true);
    try {
      if (previewing) await setPreview(false);
      const response = await api.runtime.sendMessage({ type:'picker_save', token, selector });
      if (!response?.ok) throw Error(response?.error || labels.failed);
      close();
    } catch (error) { description.textContent = labels.failed + ' ' + String(error.message).slice(0, 200); }
    finally { saving = false; if (!closed) Object.values(buttons).forEach(b => b.disabled = false); }
  };
  buttons.preview.disabled = buttons.save.disabled = true;
  window.addEventListener('pointermove', move, true); window.addEventListener('click', click, true); window.addEventListener('keydown', key, true);
  window.addEventListener('pagehide', close, { once:true }); window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
  const expiry = setTimeout(close, 300000); globalThis.__mblockPickerClose = close;
}
