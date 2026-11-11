// SPDX-License-Identifier: GPL-3.0-only
// Reviewed, packaged site fix. Remote subscriptions cannot supply executable code.
export function builtInRules(settings) {
  if (settings.fixes === false || settings.sites?.['fcportables.com']?.fixes === false) return [];
  // Domains are checked by DNR, not repeated inside the regex. Split primary
  // and fallback signatures and use case-sensitive matching to stay below
  // Chromium's compiled-regex memory limit (2 KiB).
  return [
    '^https://[^/]+/[a-z0-9]{6}/[a-z0-9]{6}/[a-z]+\\.[a-f0-9]{16}\\.min\\.js\\?',
    '^https://[^/]+/[a-z0-9]{6}/[a-z.-]*[a-f0-9]{16}[^/?]*\\?'
  ].map(regexFilter => ({ priority: 50000, action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } }, condition: {
    initiatorDomains: ['fcportables.com'], requestDomains: ['fcportables.com'], resourceTypes: ['script'],
    isUrlFilterCaseSensitive: true, regexFilter
  } }));
}
