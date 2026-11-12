// SPDX-License-Identifier: GPL-3.0-only
// Reviewed, packaged site fix. Remote subscriptions cannot supply executable code.
export const ANTIADBLOCK_CORE_FIX_ROOTS = ['fcportables.com', 'filecatchers.com'];
const CORE_REGEXES = [
  '^https://[^/]+/[a-z0-9]{6}/[a-z0-9]{6}/[a-z]+\\.[a-f0-9]{16}\\.min\\.js\\?',
  '^https://[^/]+/[a-z0-9]{6}/[a-z.-]*[a-f0-9]{16}[^/?]*\\?'
];
export function builtInRules(settings) {
  if (settings.fixes === false) return [];
  const rules = [];
  for (const root of ANTIADBLOCK_CORE_FIX_ROOTS) {
    if (settings.sites?.[root]?.fixes === false) continue;
    // Domains are checked by DNR, not repeated inside the regex. Split primary
    // and fallback signatures and use case-sensitive matching to stay below
    // Chromium's compiled-regex memory limit (2 KiB).
    for (const regexFilter of CORE_REGEXES) rules.push({
      priority: 50000,
      action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } },
      condition: {
        initiatorDomains: [root], requestDomains: [root], resourceTypes: ['script'],
        isUrlFilterCaseSensitive: true, regexFilter
      }
    });
  }
  return rules;
}
