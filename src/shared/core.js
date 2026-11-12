// SPDX-License-Identifier: GPL-3.0-only
export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, autoUpdate: true, intervalHours: 12, genericCosmetic: false, youtube: true, sites: {}, sourceIds: null, customRules: '' });
export function hostFromURL(value) { try { const u = new URL(value); return /^(https?:)$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, '') : ''; } catch { return ''; } }
export function validHost(value) {
  return typeof value === 'string' && value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}
export function domainMatches(host, domain) { return host === domain || host.endsWith('.' + domain); }
export function sitePolicy(settings, host) {
  let found = ''; let policy = {};
  for (const [domain, value] of Object.entries(settings.sites || {}).filter(([d]) => domainMatches(host, d)).sort(([a], [b]) => a.length - b.length)) { found = domain; policy = { ...policy, ...value }; }
  return { paused: !settings.enabled || policy.paused === true, cosmetic: policy.cosmetic !== false, generic: policy.generic ?? settings.genericCosmetic, youtube: settings.youtube !== false && policy.youtube !== false, domain: found || host };
}
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function redactURL(value, details = false) {
  try { const u = new URL(value); if (!/^https?:$/.test(u.protocol)) return '[' + u.protocol.replace(':', '') + ']';
    // Even detailed mode never exports query values, fragments or credentials.
    const keys = [...new Set([...u.searchParams.keys()])].slice(0, 15).map(k => encodeURIComponent(k.slice(0, 60)) + '=…');
    return u.origin + (details ? u.pathname.slice(0, 500) : (u.pathname === '/' ? '/' : '/[caminho]')) + (details && keys.length ? '?' + keys.join('&') : '');
  } catch { return '[URL inválida]'; }
}
export class RingBuffer {
  constructor(limit, entries = []) { this.limit = limit; this.entries = entries.slice(-limit); this.dropped = Math.max(0, entries.length - limit); }
  push(event) { if (this.entries.length >= this.limit) { this.entries.shift(); this.dropped++; } this.entries.push(event); }
  clear() { this.entries = []; this.dropped = 0; }
  toJSON() { return { entries: this.entries, dropped: this.dropped, limit: this.limit }; }
}
export function controlRules(settings) {
  const rules = [];
  if (!settings.enabled) rules.push({ priority: 1000000, action: { type: 'allow' }, condition: { urlFilter: '*' } });
  for (const [domain, value] of Object.entries(settings.sites || {})) {
    if (!validHost(domain) || !value.paused) continue;
    const excluded = Object.entries(settings.sites).filter(([d, v]) => d !== domain && domainMatches(d, domain) && v.paused === false).map(([d]) => d);
    rules.push({ priority: 900000, action: { type: 'allowAllRequests' }, condition: { requestDomains: [domain], resourceTypes: ['main_frame', 'sub_frame'], ...(excluded.length ? { excludedRequestDomains: excluded } : {}) } });
    rules.push({ priority: 900000, action: { type: 'allow' }, condition: { initiatorDomains: [domain], ...(excluded.length ? { excludedInitiatorDomains: excluded } : {}) } });
  }
  return rules;
}
