// SPDX-License-Identifier: GPL-3.0-only
export const api = globalThis.browser || chrome;
export const runtimeVersion = api.runtime.getManifest().version;
for (const element of globalThis.document?.querySelectorAll?.('[data-extension-version]') || []) {
  element.textContent = runtimeVersion;
}
import { t, initLocale, localeTag } from './locale.js';
export { t, localeTag };
await initLocale();
export const $ = s => document.querySelector(s);
export async function call(type, data = {}) {
  const result = await api.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw new Error(result?.error || 'A extensão não respondeu.'); return result.data;
}
export function status(text, error = false) { const el = $('#status'); if (el) { el.textContent = t(text); el.className = error ? 'status error' : 'status'; } }
export function time(value) { return value ? new Date(value).toLocaleString(localeTag()) : t('Ainda não'); }
export function number(value) { return Number(value || 0).toLocaleString(localeTag()); }
export function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = t(text); if (className) el.className = className; return el; }
export async function saveReport() {
  const report = await call('export');
  downloadFile('mblock-diagnostic-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json', JSON.stringify(report, null, 2), 'application/json');
}
export function downloadFile(filename, content, mime) { const url = URL.createObjectURL(new Blob([content], { type: mime })); const link = node('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export function setDisabled(element, disabled) { element.dataset.disabledState = String(!!disabled); if (element.dataset.busy !== 'true') element.disabled = !!disabled; }
export function busy(element, action) { return async () => {
  if (element.dataset.busy === 'true') return;
  const previous = element.disabled;
  element.dataset.busy = 'true'; element.setAttribute('aria-busy', 'true'); element.disabled = true;
  try { await action(); } catch (e) { status(e.message, true); }
  finally { delete element.dataset.busy; element.removeAttribute('aria-busy'); element.disabled = element.dataset.disabledState === undefined ? previous : element.dataset.disabledState === 'true'; }
}; }
