// SPDX-License-Identifier: GPL-3.0-only
export const api = globalThis.browser || chrome;
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
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'mblock-diagnostic-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function busy(element, action) { return async () => { element.disabled = true; try { await action(); } catch (e) { status(e.message, true); } finally { element.disabled = false; } }; }
