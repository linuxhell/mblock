// SPDX-License-Identifier: GPL-3.0-only
// Local evidence classifier, NOT a generative AI model. Never claims certainty
// from a visible warning alone, and never executes downloaded code.
import { hostFromURL, domainMatches } from './core.js';
import { builtInRules } from './fixes.js';
export function analyzeEvidence(evidence, settings) {
  const host = hostFromURL(evidence.url), markers = new Set(evidence.markers || []), scripts = evidence.scripts || [];
  const engines = [];
  const core = markers.has('antiadblock-core loader') && markers.has('antiadblock-core meta');
  if (core) engines.push({ name: 'AntiAdblockCore family', confidence: 'high', evidence: ['script#antiadblock-core-js', 'meta[name=antiadblockcore-verification]'], version: 'not verified' });
  else if ([...markers].some(x => x.startsWith('antiadblock-core'))) engines.push({ name: 'AntiAdblockCore family', confidence: 'medium', evidence: [...markers].filter(x => x.startsWith('antiadblock-core')), version: 'not verified' });
  if (markers.has('ad-inserter ai_adb_process_blocks')) engines.push({ name: 'WordPress Ad Inserter anti-adblock module', confidence: 'high', evidence: ['inline function signature: ai_adb_process_blocks'], version: 'not verified' });
  if (scripts.some(s => /\/(?:fuckadblock|blockadblock)(?:[.-][\d.]+)?(?:\.min)?\.js(?:[?#]|$)/i.test(s))) engines.push({ name: 'BlockAdBlock / FuckAdBlock family', confidence: 'medium', evidence: ['external script filename signature'], version: 'not verified' });
  const known = builtInRules({})[0], re = new RegExp(known.condition.regexFilter);
  const loader = scripts.find(s => re.test(s));
  const proposals = [];
  if (host && domainMatches(host, 'fcportables.com') && core && loader) proposals.push({ id: 'fcportables-core-v1', mechanism: 'rotating external loader with fallback', kind: 'packaged_redirect', confidence: 'high', enabled: settings.fixes !== false && settings.sites?.['fcportables.com']?.fixes !== false, rule: known, validation: 'observed loader signature; isolated fixture regression test; live page requires verification', automaticallyGenerated: false });
  return { schema: 'mblock-site-analysis-v1', engine: 'local-heuristics', generativeAI: false, host, engines, proposals, warningPresent: !!evidence.warningPresent, canAutomaticallyRepair: proposals.length > 0, unknownMechanism: engines.length === 0, nextStep: proposals.length ? 'enable known packaged fix, reload and compare diagnostics' : 'collect a diagnostic and review a new site-specific rule; do not apply an unverified guess', limitations: ['client-visible signals only', 'vendor/version can be hidden or imitated', 'no arbitrary rule generation or automatic live-site validation in this alpha'] };
}
