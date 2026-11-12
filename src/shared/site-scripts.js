// SPDX-License-Identifier: GPL-3.0-only
import { domainMatches, sitePolicy, stable } from './core.js';
import { YOUTUBE_PROFILE } from './youtube-profile.js';
export const YOUTUBE_ROOTS = ['youtube.com', 'youtube-nocookie.com', 'youtubekids.com'];
export const ANTIADBLOCK_CORE_SCRIPT_ID = 'mblock-antiadblock-core-v2';
export function isYouTube(host) { return YOUTUBE_ROOTS.some(root => domainMatches(host, root)); }
export function desiredSiteScripts(settings, profile = YOUTUBE_PROFILE) {
  if (!settings.enabled) return [];
  const result = [];
  if (settings.fixes !== false) {
    const excluded = Object.entries(settings.sites || {})
      .filter(([, policy]) => policy?.paused === true || policy?.fixes === false)
      .map(([host]) => '*://*.' + host + '/*');
    result.push({
      id: ANTIADBLOCK_CORE_SCRIPT_ID,
      matches: ['http://*/*', 'https://*/*'],
      excludeMatches: excluded,
      js: ['resources/antiadblock-core-marker.js'],
      world: 'MAIN',
      runAt: 'document_start',
      allFrames: false,
      persistAcrossSessions: true
    });
  }
  if (settings.youtube !== false && profile.files?.length) {
    for (const root of YOUTUBE_ROOTS) {
      const boundaries = [root, ...Object.keys(settings.sites || {}).filter(d => d !== root && domainMatches(d, root))].sort((a, b) => a.length - b.length);
      const active = host => { const p = sitePolicy(settings, host); return !p.paused && p.youtube; };
      for (const host of boundaries) {
        const ancestor = boundaries.filter(d => d !== host && domainMatches(host, d)).sort((a, b) => b.length - a.length)[0];
        if (!active(host) || (ancestor && active(ancestor))) continue;
        const excludes = boundaries.filter(d => d !== host && domainMatches(d, host) && !active(d));
        for (const file of profile.files) result.push({ id: 'mblock-youtube-' + (profile.hash?.slice(0, 12) || 'local') + '-' + result.length, matches: ['*://*.' + host + '/*'], excludeMatches: excludes.map(d => '*://*.' + d + '/*'), js: [file.path], world: file.world, runAt: 'document_start', allFrames: false, persistAcrossSessions: true });
      }
    }
  }
  return result;
}
export function scriptTargetsHost(script, host) { const domain = pattern => pattern.split('://*.')[1]?.split('/')[0]; return script.matches.some(p => domain(p) && domainMatches(host, domain(p))) && !(script.excludeMatches || []).some(p => domain(p) && domainMatches(host, domain(p))); }
export async function syncSiteScripts(api, settings, profile = YOUTUBE_PROFILE) {
  const managed = id => id === ANTIADBLOCK_CORE_SCRIPT_ID || id.startsWith('mblock-youtube-');
  const current = (await api.scripting.getRegisteredContentScripts()).filter(s => managed(s.id));
  const desired = desiredSiteScripts(settings, profile);
  const comparable = scripts => scripts.map(s => ({ id: s.id, matches: [...s.matches].sort(), excludeMatches: [...(s.excludeMatches || [])].sort(), js: s.js, world: s.world, runAt: s.runAt, allFrames: s.allFrames ?? false, persistAcrossSessions: s.persistAcrossSessions ?? true })).sort((a, b) => a.id.localeCompare(b.id));
  if (stable(comparable(current)) === stable(comparable(desired))) return;
  const oldById = new Map(current.map(s => [s.id, s])), wanted = new Set(desired.map(s => s.id));
  const add = desired.filter(s => !oldById.has(s.id)), update = desired.filter(s => oldById.has(s.id));
  if (add.length) await api.scripting.registerContentScripts(add);
  if (update.length) await api.scripting.updateContentScripts(update);
  const remove = current.filter(s => !wanted.has(s.id)).map(s => s.id); if (remove.length) await api.scripting.unregisterContentScripts({ ids: remove });
}
