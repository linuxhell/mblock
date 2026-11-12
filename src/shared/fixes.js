// SPDX-License-Identifier: GPL-3.0-only
// Reviewed, packaged family fixes. Remote subscriptions cannot supply executable code.
export const ANTIADBLOCK_CORE_REGEXES = [
  '^https://[^/]+/[a-z0-9]{6}/[a-z0-9]{6}/[a-z]+\\.[a-f0-9]{16}\\.min\\.js\\?',
  '^https://[^/]+/[a-z0-9]{6}/[a-z.-]*[a-f0-9]{16}[^/?]*\\?'
];
const escapeRegex = value => value.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
function learnedAntiAdblockCoreRules(settings) {
  const learned = Array.isArray(settings.antiAdblockCoreRules) ? settings.antiAdblockCoreRules.slice(-40) : [];
  const rules = [];
  for (const entry of learned) {
    if (!entry || typeof entry.siteHost !== 'string' || typeof entry.loaderUrl !== 'string') continue;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(entry.siteHost)) continue;
    let u; try { u = new URL(entry.loaderUrl); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) continue;
    const clean = u.origin + u.pathname.slice(0, 500);
    rules.push({
      priority: 70000,
      action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } },
      condition: {
        initiatorDomains: [entry.siteHost.toLowerCase()],
        resourceTypes: ['script'],
        isUrlFilterCaseSensitive: true,
        regexFilter: '^' + escapeRegex(clean) + '(?:[?#]|$)'
      }
    });
  }
  return rules;
}
export function builtInRules(settings) {
  if (settings.fixes === false) return [];
  const legacy = ANTIADBLOCK_CORE_REGEXES.map(regexFilter => ({
    priority: 50000,
    action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } },
    condition: { resourceTypes: ['script'], isUrlFilterCaseSensitive: true, regexFilter }
  }));
  return [...legacy, ...learnedAntiAdblockCoreRules(settings)];
}
