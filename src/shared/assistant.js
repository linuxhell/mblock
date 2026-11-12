// SPDX-License-Identifier: GPL-3.0-only
// Local evidence classifier, NOT a generative AI model. Never claims certainty
// from a visible warning alone, and never executes downloaded code.
import { hostFromURL, domainMatches, sitePolicy } from './core.js';
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
  const proposals = [];
  if (host && core) {
    const policy = sitePolicy({ enabled: true, genericCosmetic: false, ...settings }, host);
    const trace = evidence.antiAdblockCore || {};
    const configured = settings.fixes !== false && policy.fixes !== false;
    const learned = Array.isArray(settings.antiAdblockCoreRules) && settings.antiAdblockCoreRules.some(x => { let loaderHost=x?.loaderHost||''; if (!loaderHost && x?.loaderUrl) try { loaderHost=new URL(x.loaderUrl).hostname; } catch {} return x?.siteHost === host && loaderHost === trace.loaderHost; });
    const redirected = trace.fixState === 'redirected';
    const overlaySuppressed = trace.fixState === 'overlay-removed';
    const recoveryVerified = learned && trace.fixState === 'marker-active' && evidence.warningPresent === false;
    const verified = redirected || overlaySuppressed || recoveryVerified;
    const verification = redirected ? 'native-redirect' : overlaySuppressed ? 'overlay-suppression' : recoveryVerified ? 'document-start-recovery' : 'pending';
    const fixState = recoveryVerified ? 'recovery-active' : (trace.fixState || 'not-run');
    proposals.push({ id: 'antiadblock-core-v4', mechanism: 'learned rotating loader-host redirect with document-start recovery fallback', kind: 'packaged_repair', confidence: 'high', enabled: verified, configured, learned, fixState, verification, loaderObserved: !!trace.loaderUrl, available: !policy.paused, validation: 'AntiAdblockCore markers observed; learned loader-host rule is active. Success is verified by native redirect, overlay suppression, or learned document-start recovery with no warning after reload.', automaticallyGenerated: false });
  }
  let youtube;
  if (isYouTube(host)) {
    const profile = runtime.youtubeProfile || YOUTUBE_PROFILE, policy = sitePolicy({ enabled: true, genericCosmetic: false, ...settings }, host);
    engines.push({ name: 'YouTube player / Innertube', confidence: runtime.youtubePlayer?.playerPresent ? 'high' : 'medium', evidence: ['YouTube origin', ...(runtime.youtubePlayer?.playerPresent ? ['movie_player DOM'] : [])], version: 'not verified' });
    youtube = { configured: settings.youtube !== false && policy.youtube && !policy.paused, registered: runtime.youtubeRegistered ?? false, applied: runtime.youtubePlayback?.active === true && runtime.youtubePlayback?.profileHash === profile.hash, profile: profile.id, profileHash: profile.hash, packagedFilters: profile.count, scope: 'top_frame', player: runtime.youtubePlayer || null, playback: runtime.youtubePlayback || null };
    if (profile.count) proposals.push({ id: 'youtube-v1', kind: 'packaged_scriptlets', enabled: youtube.configured && youtube.registered && youtube.applied, available: !policy.paused, confidence: 'high', automaticallyGenerated: false, validation: 'packaged upstream filters and guarded playback recovery; fixture tests; account-specific live results can vary' });
  }
  return { schema: 'mblock-site-analysis-v2', engine: 'local-heuristics', generativeAI: false, host, engines, proposals, warningPresent: !!evidence.warningPresent, ...(youtube ? { youtube } : {}), canApplyKnownFix: proposals.some(p => !p.enabled && p.available !== false), canAutomaticallyRepair: !youtube && proposals.some(p => !p.enabled), unknownMechanism: engines.length === 0, nextStep: youtube ? (!youtube.configured ? 'enable protection and the packaged YouTube module' : !youtube.applied ? 'apply the known fix to this open tab or open YouTube in a new tab' : 'if ads persist, export diagnostics including the profile hash and playback counters') : proposals.length ? (proposals[0].enabled ? 'known fix verified in this document' : proposals[0].configured ? 'known fix configured but not verified; apply repair to learn and redirect the observed loader' : 'enable and apply the known packaged fix') : 'collect a diagnostic and review a new site-specific rule; do not apply an unverified guess', limitations: ['client-visible signals only', 'a missing anti-adblock warning does not mean ads are blocked', 'vendor/version can be hidden or imitated', 'no generative AI or arbitrary rule generation in this version'] };
}
