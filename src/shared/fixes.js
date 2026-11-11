// SPDX-License-Identifier: GPL-3.0-only
// Reviewed, packaged site fix. Remote subscriptions cannot supply executable code.
export function builtInRules(settings) {
  if (settings.fixes === false || settings.sites?.['fcportables.com']?.fixes === false) return [];
  return [{ priority: 50000, action: { type: 'redirect', redirect: { extensionPath: '/resources/fcportables-core.js' } }, condition: {
    initiatorDomains: ['fcportables.com'], requestDomains: ['fcportables.com'], resourceTypes: ['script'],
    regexFilter: '^https://(?:[a-z0-9-]+\\.)?fcportables\\.com/[a-z0-9]{6}/(?:[a-z0-9]{6}/)?(?:(?:app|main|core|site|theme|common|vendor|lib|bundle|chunk|runtime|index|polyfill|client)[.-])?[a-f0-9]{16}(?:_[A-Za-z]+)?(?:\\.min)?(?:\\.m?js)?\\?(?:ver|version|src)='
  } }];
}
