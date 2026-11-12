// SPDX-License-Identifier: GPL-3.0-only
// Local evidence classifier, NOT a generative AI model. Never claims certainty
// from a visible warning alone, and never executes downloaded code.
import { hostFromURL, domainMatches, sitePolicy } from './core.js';
import { ANTIADBLOCK_CORE_FIX_ROOTS, builtInRules } from './fixes.js';
import { YOUTUBE_PROFILE } from './youtube-profile.js';
import { isYouTube } from './site-scripts.js';
export function analyzeEvidence(evidence, settings, runtime = {}) {
  const host = hostFromURL(evidence.url), markers = new Set(evidence.markers || []), scripts = evidence.scripts || [];
  const engines = [];
  const core = markers.has('antiadblock-core loader') && markers.has('antiadblock-core meta');
  if (core) engines.push({ name: 'AntiAdblockCore family', confidence: 'high', evidence: ['script#antiadblock-core-js', 'meta[name=antiadblockcore-verification]'], version: 'not verified' });
  else if ([...markers].some(x => x.startsWith('antiadblock-core'))) engines.push({ name: 'AntiAdblockCore family', confidence: 'medium', evidence: [...markers].filter(x => x.startsWith('antiadblock-core')), version: 'not verified' });
  if (markers.has('ad-inserter ai_adb_process_blocks')) engines.push({ name: 'WordPress Ad Inserter anti-adblock module', confidence: 'high', evidence: ['inline function signature: ai_adb_process_blocks'], version: 'not verified' });
  if (scripts.some(s => /\/(?:fuckadblock|blockadblock)(?:[.-][\d.]+)?(?:\.min)?\.js(?:[?#]|$)/i.test(s))) engines.push({ name: 'BlockAdBlock / FuckAdBlock family', confidence: 'medium', evidence: ['external script filename signature'], version: 'not verified' });
  const knownRules = builtInRules({});
  const fixRoot = ANTIADBLOCK_CORE_FIX_ROOTS.find(root => domainMatches(host, root));
  const rootRules = fixRoot ? knownRules.filter(r => r.condition.initiatorDomains?.includes(fixRoot)) : [];
  const loader = fixRoot && scripts.find(s => domainMatches(hostFromURL(s), fixRoot) && rootRules.some(r => new RegExp(r.condition.regexFilter).test(s)));
  const proposals = [];
  if (host && fixRoot && core && loader) proposals.push({ id: fixRoot + '-core-v1', mechanism: 'rotating external loader with fallback', kind: 'packaged_redirect', confidence: 'high', enabled: settings.fixes !== false && settings.sites?.[fixRoot]?.fixes !== false, rules: rootRules, validation: 'observed loader signature; isolated fixture regression test; live page requires verification', automaticallyGenerated: false });
  let youtube;
  if (isYouTube(host)) {
    const profile = runtime.youtubeProfile || YOUTUBE_PROFILE, policy = sitePolicy({ enabled: true, genericCosmetic: false, ...settings }, host);
    engines.push({ name: 'YouTube player / Innertube', confidence: runtime.youtubePlayer?.playerPresent ? 'high' : 'medium', evidence: ['YouTube origin', ...(runtime.youtubePlayer?.playerPresent ? ['movie_player DOM'] : [])], version: 'not verified' });
    youtube = { configured: settings.youtube !== false && policy.youtube && !policy.paused, registered: runtime.youtubeRegistered ?? false, applied: runtime.youtubePlayback?.active === true && runtime.youtubePlayback?.profileHash === profile.hash, profile: profile.id, profileHash: profile.hash, packagedFilters: profile.count, scope: 'top_frame', player: runtime.youtubePlayer || null, playback: runtime.youtubePlayback || null };
    if (profile.count) proposals.push({ id: 'youtube-v1', kind: 'packaged_scriptlets', enabled: youtube.configured && youtube.registered && youtube.applied, available: !policy.paused, confidence: 'high', automaticallyGenerated: false, validation: 'packaged upstream filters and guarded playback recovery; fixture tests; account-specific live results can vary' });
  }
  return { schema: 'mblock-site-analysis-v2', engine: 'local-heuristics', generativeAI: false, host, engines, proposals, warningPresent: !!evidence.warningPresent, ...(youtube ? { youtube } : {}), canApplyKnownFix: proposals.some(p => !p.enabled && p.available !== false), canAutomaticallyRepair: !youtube && proposals.some(p => !p.enabled), unknownMechanism: engines.length === 0, nextStep: youtube ? (!youtube.configured ? 'enable protection and the packaged YouTube module' : !youtube.applied ? 'apply the known fix to this open tab or open YouTube in a new tab' : 'if ads persist, export diagnostics including the profile hash and playback counters') : proposals.length ? 'enable known packaged fix, reload and compare diagnostics' : 'collect a diagnostic and review a new site-specific rule; do not apply an unverified guess', limitations: ['client-visible signals only', 'a missing anti-adblock warning does not mean ads are blocked', 'vendor/version can be hidden or imitated', 'no generative AI or arbitrary rule generation in this version'] };
}
