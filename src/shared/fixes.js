// SPDX-License-Identifier: GPL-3.0-only
// Reviewed, packaged family fix. Remote subscriptions cannot supply executable code.
// These URL signatures are intentionally narrow enough to be safe as global DNR rules.
export const ANTIADBLOCK_CORE_REGEXES = [
  '^https://[^/]+/[a-z0-9]{6}/[a-z0-9]{6}/[a-z]+\\.[a-f0-9]{16}\\.min\\.js\\?',
  '^https://[^/]+/[a-z0-9]{6}/[a-z.-]*[a-f0-9]{16}[^/?]*\\?'
];
export function builtInRules(settings) {
  if (settings.fixes === false) return [];
  return ANTIADBLOCK_CORE_REGEXES.map(regexFilter => ({
    priority: 50000,
    action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } },
    condition: {
      resourceTypes: ['script'],
      isUrlFilterCaseSensitive: true,
      regexFilter
    }
  }));
}
