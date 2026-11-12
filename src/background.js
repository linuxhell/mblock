// SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_SETTINGS, hostFromURL, validHost, sitePolicy, controlRules, redactURL, RingBuffer, domainMatches, sameRules } from './shared/core.js';
import { SOURCES, LIMITS, VERSION } from './shared/sources.js';
import { compileLists, cosmeticSelectors, safeSelector } from './shared/compiler.js';
import { builtInRules } from './shared/fixes.js';
import { fetchList } from './shared/fetch-lists.js';
import * as db from './shared/db.js';
import { readBundle } from './shared/bundle.js';
import { analyzeEvidence } from './shared/assistant.js';
import { BUILD_TARGET } from './shared/platform.js';
import { syncSiteScripts, isYouTube, scriptTargetsHost } from './shared/site-scripts.js';
import { YOUTUBE_PROFILE } from './shared/youtube-profile.js';
import { exportRules, planImport, normalizeRules } from './shared/rule-transfer.js';
import { probeYouTubePlayer } from './shared/youtube-probe.js';
import { probeYouTubePlayback } from './shared/youtube-playback.js';
import { probeSite } from './shared/site-probe.js';
import { updateAlarm, validUpdateInterval, unchangedLists } from './shared/update-policy.js';
import { installElementPicker } from './shared/element-picker.js';
import { CosmeticCache } from './shared/cosmetic-cache.js';
import { controlsOnly, planControlChange, nextConfigurationTime } from './shared/control-state.js';
const api = globalThis.browser || chrome;
const dnr = api.declarativeNetRequest;
const bootstrapIds = api.runtime.getManifest().declarative_net_request.rule_resources.filter(r => r.id.startsWith('bootstrap')).map(r => r.id);
let settings, metadata, target, activeDiagnostic = null, journal, mutation = Promise.resolve(), updating = false;
let initPromise, flushTimer, diagnosticAttached = false, diagCount = 0, rulesChanging = false;
const cssByDocument = new Map(), cosmeticCache = new CosmeticCache();
async function bounded(promise, milliseconds = 3000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('O site demorou para responder. Recarregue a aba e tente novamente.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function youtubeRuntime(tabId) {
  let youtubePlayer; try { const results = await bounded(api.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', func: probeYouTubePlayer })); youtubePlayer = results[0]?.result || { probeFailed: true }; } catch { youtubePlayer = { probeFailed: true }; }
  let youtubePlayback; try { const results = await bounded(api.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: probeYouTubePlayback })); youtubePlayback = results[0]?.result || null; } catch { youtubePlayback = null; }
  const scripts = await api.scripting.getRegisteredContentScripts();
  const host = hostFromURL((await api.tabs.get(tabId)).url);
  return { youtubeProfile: YOUTUBE_PROFILE, youtubePlayer, youtubePlayback, youtubeRegistered: scripts.some(s => s.id.startsWith('mblock-youtube-') && scriptTargetsHost(s, host)) };
}
async function siteEvidence(tabId) { const results = await bounded(api.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: probeSite })); return results[0]?.result; }
async function reloadAndWait(tabId) {
  await api.tabs.reload(tabId);
  await bounded(new Promise(resolve => {
    const listener = (id, change) => {
      if (id !== tabId || change.status !== 'complete') return;
      api.tabs.onUpdated.removeListener(listener); resolve();
    };
    api.tabs.onUpdated.addListener(listener);
    setTimeout(() => { api.tabs.onUpdated.removeListener(listener); resolve(); }, 8000);
  }), 9000);
}
async function attachDiagnosticPage(tabId, until) {
  const message = { type: 'diagnostic_state', enabled: true, until };
  try { await bounded(api.tabs.sendMessage(tabId, message, { frameId: 0 })); }
  catch (error) {
    if (!/receiving end|establish connection|message port closed/i.test(errMessage(error))) { event('diagnostic_page_unavailable', { tabId, error: errMessage(error) }, 'warn'); return; }
    try {
      await bounded(api.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', files: ['content.js'] }));
      await bounded(api.tabs.sendMessage(tabId, message, { frameId: 0 })); event('diagnostic_page_reattached', { tabId });
    } catch (retryError) { event('diagnostic_page_unavailable', { tabId, error: errMessage(retryError) }, 'warn'); }
  }
}
const area = api.storage.session || api.storage.local;
function serial(fn) { const p = mutation.then(fn, fn); mutation = p.catch(() => {}); return p; }
function event(type, detail = {}, level = 'info') {
  if (!journal) journal = new RingBuffer(LIMITS.logEntries);
  journal.push({ at: new Date().toISOString(), type, level, ...detail });
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; area.set({ journal: journal.toJSON() }).catch(() => {}); }, 1000);
}
function errMessage(error) { return String(error?.message || error).slice(0, 700); }
function isUI(sender) { return sender.id === api.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(api.runtime.getURL('ui/')); }
function requireUI(sender) { if (!isUI(sender)) throw new Error('Operação permitida apenas no painel da extensão.'); }
function targetName() { return BUILD_TARGET; }
function availableLimit() { return Math.min(30000, dnr.MAX_NUMBER_OF_DYNAMIC_RULES || 5000); }
function allRules(compiled, config) { return [...compiled.rules, ...builtInRules(config), ...controlRules(config)].map((rule, i) => ({ ...rule, id: i + 1 })); }
function snapshot(compiled, config, sources, texts) { return { at: nextConfigurationTime(metadata?.at), transactionId:crypto.randomUUID(), engineVersion: VERSION, target, compiled, rules: allRules(compiled, config), settings: config, sources, texts }; }
function rebuildSnapshot(old) { const config = { ...DEFAULT_SETTINGS, ...old.settings }, lists = [...old.texts]; if (config.customRules.trim()) lists.push({ id: 'custom', text: config.customRules }); return snapshot(compileLists(lists, { target, maxRules: availableLimit() - 200 }), config, old.sources, old.texts); }
async function activate(...args) { rulesChanging = true; try { return await installSnapshot(...args); } finally { rulesChanging = false; } }
async function installSnapshot(next, previous, saveSettings = true) {
  const oldRules = await dnr.getDynamicRules();
  const oldSettings = settings;
  if (next.rules.length > availableLimit()) throw new Error('Limite de regras dinâmicas excedido; configuração anterior mantida.');
  const unsafe = next.rules.filter(r => !['block', 'allow', 'allowAllRequests', 'upgradeScheme'].includes(r.action.type)).length;
  if (unsafe > (dnr.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5000)) throw new Error('Limite de regras de redirecionamento excedido.');
  if (dnr.isRegexSupported) for (const r of next.rules.filter(r => r.condition.regexFilter)) { const result = await dnr.isRegexSupported({ regex: r.condition.regexFilter, isCaseSensitive: r.condition.isUrlFilterCaseSensitive === true }); if (!result.isSupported) throw new Error('Regex incompatível: ' + (result.reason || 'unknown')); }
  // Durable intent enables recovery if a worker or browser stops between API/DB writes.
  await db.put('meta', 'pending', next);
  let applied = false;
  try {
    if (!sameRules(oldRules, next.rules)) {
      await dnr.updateDynamicRules({ removeRuleIds: oldRules.map(r => r.id), addRules: next.rules });
      applied = true;
    }
    await syncSiteScripts(api, next.settings);
    metadata=await db.commitSnapshot(next, previous, { cosmeticsChanged:next.compiled !== previous?.compiled, rulesChanged:applied || next.compiled !== previous?.compiled });
    settings=next.settings;
  } catch (error) {
    // The browser update is atomic. Restore the old rules if the DB commit failed.
    try { if (applied) { await dnr.updateDynamicRules({ removeRuleIds: next.rules.map(r => r.id), addRules: oldRules }); } await syncSiteScripts(api, oldSettings); }
    catch (rollbackError) { event('critical_recovery_needed', { error: errMessage(rollbackError) }, 'error'); throw new Error('Falha na restauração. Reinicie a extensão para recuperar a transação.'); }
    await db.put('meta', 'pending', null);
    throw error;
  }
  if (saveSettings) await api.storage.local.set({settings}).catch(error=>event('settings_cache_write_failed',{error:errMessage(error)},'warn'));
  await db.put('meta', 'pending', null);
  await dnr.updateEnabledRulesets({ disableRulesetIds: bootstrapIds });
  cssByDocument.clear(); cosmeticCache.clear();
}
async function initialize() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    target = targetName();
    const saved = await api.storage.local.get('settings'); settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    if (!settings.sourceIds) settings.sourceIds = SOURCES.filter(s => s.enabled).map(s => s.id);
    const transient = await area.get(['journal', 'activeDiagnostic']);
    journal = new RingBuffer(LIMITS.logEntries, transient.journal?.entries || []); journal.dropped = transient.journal?.dropped || 0;
    activeDiagnostic = transient.activeDiagnostic || null;
    const pending = await db.get('meta', 'pending');
    if (pending) {
      const previous = await db.get('snapshots', 'active');
      await dnr.updateDynamicRules({ removeRuleIds: (await dnr.getDynamicRules()).map(r => r.id), addRules: pending.rules });
      await syncSiteScripts(api, pending.settings);
      if (!pending.transactionId || pending.transactionId !== previous?.transactionId) await db.commitSnapshot(pending, previous);
      settings = pending.settings; await api.storage.local.set({ settings }); await db.put('meta', 'pending', null);
      event('transaction_recovered');
    }
    metadata = await db.get('meta', 'active');
    if (!metadata) {
      const bundle = await readBundle(async file => (await fetch(api.runtime.getURL(file))).json());
      await activate(snapshot(bundle.compiled, settings, bundle.sources, bundle.texts), null);
      event('installed', { version: VERSION, rules: metadata.stats.nativeRules });
    } else {
      settings = { ...DEFAULT_SETTINGS, ...metadata.settings };
      if (metadata.engineVersion !== VERSION) { const old = await db.get('snapshots', 'active'); await activate(rebuildSnapshot({ ...old, settings }), old); event('engine_upgraded', { version: VERSION }); }
      else await syncSiteScripts(api, settings);
      // Browser rules survive restarts; no recompilation and no full rules read on normal wake.
      await dnr.updateEnabledRulesets({ disableRulesetIds: bootstrapIds });
    }
    if (dnr.setExtensionActionOptions) await dnr.setExtensionActionOptions({ displayActionCountAsBadgeText: true }).catch(() => {});
    await scheduleUpdate();
    await expireDiagnostic();
    if (activeDiagnostic) attachDiagnostic();
  })();
  try { await initPromise; } catch (error) { initPromise = null; event('initialization_error', { error: errMessage(error) }, 'error'); throw error; }
}
async function scheduleUpdate() {
  const plan = updateAlarm(settings, metadata?.sources);
  if (!plan) { await api.alarms.clear('update'); return; }
  const current = await api.alarms.get('update');
  if (!current || current.periodInMinutes !== plan.periodInMinutes) await api.alarms.create('update', plan);
}
async function updateLists() {
  if (updating) throw new Error('Uma atualização já está em andamento.');
  updating = true; event('update_started');
  try {
    const lists = [], sources = [];
    const selected = SOURCES.filter(s => settings.sourceIds.includes(s.id));
    for (let i = 0; i < selected.length; i += 2) {
      const results = await Promise.all(selected.slice(i, i + 2).map(s => fetchList(s)));
      for (const r of results) { lists.push({ id: r.id, text: r.text }); sources.push(r.status); }
    }
    if (settings.customRules.trim()) lists.push({ id: 'custom', text: settings.customRules });
    const old = await db.get('snapshots', 'active');
    const unchanged = unchangedLists(old.sources, sources);
    const compiled = unchanged ? old.compiled : compileLists(lists, { target, maxRules: availableLimit() - 200 });
    await activate(snapshot(compiled, settings, sources, lists.filter(x => x.id !== 'custom')), old);
    event('update_succeeded', { rules: metadata.stats.nativeRules, unsupported: compiled.stats.unsupported, unchanged });
    return metadata;
  } catch (error) { event('update_failed_previous_retained', { error: errMessage(error) }, 'error'); throw error; }
  finally { updating = false; }
}
async function changeControls(patch) {
  if(!controlsOnly(patch))return false;
  const plan=planControlChange(await db.configurationState(),patch);if(!plan)return false;
  const oldSettings=settings,oldRules=plan.previous.extraRules,nextRules=plan.next.extraRules;
  if(plan.metadata.stats.nativeRules>availableLimit())throw Error('Limite de regras dinâmicas excedido; configuração anterior mantida.');
  if(dnr.isRegexSupported)for(const rule of nextRules.filter(r=>r.condition.regexFilter)){
    const result=await dnr.isRegexSupported({regex:rule.condition.regexFilter,isCaseSensitive:rule.condition.isUrlFilterCaseSensitive===true});
    if(!result.isSupported)throw Error('Regex incompatível: '+(result.reason||'unknown'));
  }
  const scriptsChanged=Object.keys(patch).some(key=>['enabled','youtube','fixes','sites'].includes(key));
  await db.putControlIntent(plan.next);rulesChanging=true;let applied=false;
  try{
    try{
      if(!sameRules(oldRules,nextRules)){await dnr.updateDynamicRules({removeRuleIds:oldRules.map(r=>r.id),addRules:nextRules});applied=true;}
      if(scriptsChanged)await syncSiteScripts(api,plan.next.settings);
      await db.commitControls(plan);
    }catch(error){
      try{
        if(applied)await dnr.updateDynamicRules({removeRuleIds:nextRules.map(r=>r.id),addRules:oldRules});
        if(scriptsChanged)await syncSiteScripts(api,oldSettings);
      }catch(rollbackError){event('critical_recovery_needed',{error:errMessage(rollbackError)},'error');throw Error('Falha na restauração. Reinicie a extensão para recuperar a transação.');}
      await db.put('meta','pending',null);throw error;
    }
    settings=plan.next.settings;metadata=plan.metadata;
    // The DB is authoritative; a failed settings mirror must not undo a commit.
    await api.storage.local.set({settings}).catch(error=>event('settings_cache_write_failed',{error:errMessage(error)},'warn'));
    await db.put('meta','pending',null);cssByDocument.clear();cosmeticCache.clear();
    await api.alarms.clear('update');await scheduleUpdate();event('settings_changed',{keys:Object.keys(patch)});return true;
  }finally{rulesChanging=false;}
}
async function changeSettings(patch) {
  const preferences = await db.commitPreferences(patch);
  if (preferences) {
    settings = preferences.settings; metadata = preferences;
    await api.storage.local.set({settings}).catch(error=>event('settings_cache_write_failed',{error:errMessage(error)},'warn'));
    await api.alarms.clear('update'); await scheduleUpdate();
    event('settings_changed', { keys:Object.keys(patch) }); return;
  }
  if(await changeControls(patch))return;
  const old = await db.get('snapshots', 'active');
  const next = { ...settings, ...patch };
  let sources = [...old.sources];
  const texts = old.texts.filter(x => next.sourceIds.includes(x.id));
  if (next.customRules.trim()) texts.push({ id: 'custom', text: next.customRules });
  const missing = next.sourceIds.filter(id => !texts.some(x => x.id === id));
  for (const id of missing) { const r = await fetchList(SOURCES.find(x => x.id === id)); texts.push({ id, text: r.text }); sources = sources.filter(s => s.id !== id).concat(r.status); }
  const recompile = ['sourceIds', 'customRules'].some(key => key in patch);
  const compiled = recompile ? compileLists(texts, { target, maxRules: availableLimit() - 200 }) : old.compiled;
  await activate(snapshot(compiled, next, sources.filter(s => next.sourceIds.includes(s.id)), texts.filter(x => x.id !== 'custom')), old);
  await api.alarms.clear('update'); await scheduleUpdate();
  event('settings_changed', { keys: Object.keys(patch) });
}
function activeFor(tabId) { return activeDiagnostic && activeDiagnostic.tabId === tabId && activeDiagnostic.until > Date.now(); }
function diagnosticEvent(type, request, detail = {}) {
  if (!activeFor(request.tabId)) return;
  // Bounded even on a noisy page; no request bodies, cookies or headers are read.
  if (++diagCount > 2000) { if (diagCount === 2001) event('diagnostic_rate_limit', { limit: 2000 }); return; }
  event(type, { tabId: request.tabId, requestId: request.requestId, url: redactURL(request.url, activeDiagnostic.details), urlDetails: activeDiagnostic.details, resourceType: request.type, ...detail });
}
const onRequest = r => diagnosticEvent('request', r);
const onRequestError = r => diagnosticEvent('network_error', r, { error: String(r.error).slice(0, 200) });
const onMatch = info => diagnosticEvent(rulesChanging ? 'native_rule_match_during_update' : 'native_rule_match', info.request, { ruleId: info.rule.ruleId, rulesetId: info.rule.rulesetId, generation: rulesChanging ? null : metadata?.at });
function attachDiagnostic() {
  if (diagnosticAttached || !activeDiagnostic) return;
  const filter = { urls: ['http://*/*', 'https://*/*'], tabId: activeDiagnostic.tabId };
  api.webRequest.onBeforeRequest.addListener(onRequest, filter);
  api.webRequest.onErrorOccurred.addListener(onRequestError, filter);
  try { if (dnr.onRuleMatchedDebug) dnr.onRuleMatchedDebug.addListener(onMatch); } catch (error) { event('native_logger_unavailable', { error: errMessage(error) }, 'warn'); }
  diagnosticAttached = true;
}
function detachDiagnostic() {
  api.webRequest.onBeforeRequest.removeListener(onRequest); api.webRequest.onErrorOccurred.removeListener(onRequestError);
  try { if (dnr.onRuleMatchedDebug) dnr.onRuleMatchedDebug.removeListener(onMatch); } catch {}
  diagnosticAttached = false;
}
async function expireDiagnostic() {
  if (activeDiagnostic && activeDiagnostic.until <= Date.now()) {
    const { tabId, host } = activeDiagnostic; activeDiagnostic = null; detachDiagnostic();
    await area.set({ activeDiagnostic: null }); await api.alarms.clear('diagnostic');
    await bounded(api.tabs.sendMessage(tabId, { type: 'diagnostic_state', enabled: false }, { frameId: 0 })).catch(() => {});
    if (isYouTube(host)) try { const results = await bounded(api.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: probeYouTubePlayback })); event('youtube_playback_summary', { tabId, playback: results[0]?.result || null }); } catch {}
    event('diagnostic_stopped');
  }
}
async function startDiagnostic(tabId, details, durationSeconds = LIMITS.diagSeconds) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Selecione uma aba de site.');
  if (![30, 60, 120, LIMITS.diagMaxSeconds].includes(durationSeconds)) throw new Error('Duração de diagnóstico inválida.');
  const tab = await api.tabs.get(tabId); if (!hostFromURL(tab.url)) throw new Error('Abra um site HTTP/HTTPS.');
  if (activeDiagnostic && activeDiagnostic.tabId !== tabId) { const priorTabId = activeDiagnostic.tabId; bounded(api.tabs.sendMessage(priorTabId, { type: 'diagnostic_state', enabled: false }, { frameId: 0 })).catch(() => {}); }
  detachDiagnostic(); diagCount = 0;
  const startedAt = Date.now();
  activeDiagnostic = { tabId, host: hostFromURL(tab.url), startedAt, until: startedAt + durationSeconds * 1000, durationSeconds, details: !!details };
  await area.set({ activeDiagnostic }); await api.alarms.create('diagnostic', { when: activeDiagnostic.until }); attachDiagnostic();
  event('diagnostic_started', { tabId, host: activeDiagnostic.host, durationSeconds, details: activeDiagnostic.details });
  await attachDiagnosticPage(tabId, activeDiagnostic.until);
  if (isYouTube(hostFromURL(tab.url))) youtubeRuntime(tabId).then(probe => { if (activeFor(tabId)) event('youtube_profile', { tabId, profile: YOUTUBE_PROFILE.id, hash: YOUTUBE_PROFILE.hash, filters: YOUTUBE_PROFILE.count, enabled: !sitePolicy(settings, hostFromURL(tab.url)).paused && sitePolicy(settings, hostFromURL(tab.url)).youtube, applied: probe.youtubePlayback?.active && probe.youtubePlayback?.profileHash === YOUTUBE_PROFILE.hash, scope: 'top_frame', player: probe.youtubePlayer, playback: probe.youtubePlayback }); }).catch(() => {});
}
async function applyCosmetics(sender, documentKey) {
  const host = hostFromURL(sender.url);
  const topHost = sender.frameId === 0 ? host : hostFromURL(sender.tab.url) || hostFromURL((await api.tabs.get(sender.tab.id)).url);
  const topPolicy = sitePolicy(settings, topHost), policy = sitePolicy(settings, host);
  const diagnostic = !!activeFor(sender.tab.id) && sender.frameId === 0;
  const diagnosticUntil = diagnostic ? activeDiagnostic.until : null;
  if (!host || topPolicy.paused || policy.paused || !topPolicy.cosmetic || !policy.cosmetic) return { selectors: 0, diagnostic, diagnosticUntil };
  const identity = sender.documentId || (typeof documentKey === 'string' && /^[a-z0-9-]{1,80}$/i.test(documentKey) ? documentKey : '');
  const key = sender.tab.id + ':' + sender.frameId + ':' + identity;
  if (identity && cssByDocument.has(key)) return { selectors: cssByDocument.get(key), diagnostic, diagnosticUntil };
  const generic=topPolicy.generic&&policy.generic,revision=cosmeticCache.revision;
  const result=await cosmeticCache.load(host+':'+Number(generic),async()=>{
    const selectors=cosmeticSelectors(await db.getCosmeticData(host,generic),host,generic);
    return {selectors:selectors.length,css:selectors.map(s=>':is('+s+'){display:none!important;}').join('\n')};
  });
  if(revision!==cosmeticCache.revision)return applyCosmetics(sender,documentKey);
  if (cssByDocument.size > 500) cssByDocument.clear();
  if(result.selectors)await api.scripting.insertCSS({target:{tabId:sender.tab.id,frameIds:[sender.frameId]},css:result.css,origin:'USER'});
  if(identity)cssByDocument.set(key,result.selectors);
  if(diagnostic)event('cosmetics_applied',{tabId:sender.tab.id,host,selectors:result.selectors,generic});
  return {selectors:result.selectors,diagnostic,diagnosticUntil};
}
async function exportReport() {
  await expireDiagnostic();
  const { settings: privateSettings, ...publicMetadata } = metadata;
  publicMetadata.report = { ...publicMetadata.report };
  if (publicMetadata.report.custom) publicMetadata.report.custom = { lines: publicMetadata.report.custom.lines, network: publicMetadata.report.custom.network, cosmetic: publicMetadata.report.custom.cosmetic, unsupported: publicMetadata.report.custom.unsupported, note: 'Custom filter content omitted' };
  const ruleRefs = [...new Map(journal.entries.filter(x => x.type === 'native_rule_match').map(x => [x.generation + ':' + x.ruleId, { id: x.ruleId, generation: x.generation }])).values()].slice(-200);
  const matchedRules = [];
  for (const { id, generation } of ruleRefs) {
    if (generation !== metadata.at) { matchedRules.push({ id, generation, available: false, note: 'This event used an older ruleset. Its rule ID must not be resolved against the current rules.' }); continue; }
    const record = await db.get('rules', id); if (!record) continue;
    // Grouped hosts can have hundreds of origins; only relevant domains are exported.
    const requests = journal.entries.filter(x => x.ruleId === id && x.generation === generation).map(x => hostFromURL(x.url));
    const origins = record.origins.filter(o => !o.host || requests.some(h => domainMatches(h, o.host))).slice(0, 20).map(o => o.source === 'custom' ? { source: 'custom', filter: '[regra pessoal omitida]' } : o);
    matchedRules.push({ id, generation, available: true, action: record.rule.action, origins });
  }
  return { schema: 'mblock-diagnostic-v1', extension: { version: VERSION, target }, exportedAt: new Date().toISOString(), environment: { userAgent: navigator.userAgent }, capabilities: { nativeRuleLogging: diagnosticAttached && !!dnr.onRuleMatchedDebug, nativeLoggingNote: 'In Chromium, exact rule-match events require an unpacked extension. No event is not proof that blocking did not occur.', networkBlocking: 'declarativeNetRequest', remoteCode: false }, privacy: { cookies: false, bodies: false, headers: false, queryValues: false, pathDetails: journal.entries.some(e => e.urlDetails) }, youtubeProfile: { id: YOUTUBE_PROFILE.id, hash: YOUTUBE_PROFILE.hash, count: YOUTUBE_PROFILE.count, upstream: YOUTUBE_PROFILE.upstream, scope: 'top_frame' }, configuration: { enabled: settings.enabled, genericCosmetic: settings.genericCosmetic, youtube: settings.youtube !== false, fixes: settings.fixes !== false, sites: settings.sites, sourceIds: settings.sourceIds, customRuleCount: settings.customRules.split('\n').filter(x => x.trim()).length }, metadata: publicMetadata, diagnostic: activeDiagnostic, journal: journal.toJSON(), matchedRules };
}
async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') throw new Error('Mensagem inválida.');
  await initialize(); await expireDiagnostic();
  if (message.type === 'frame_ready') { if (!sender.tab || !hostFromURL(sender.url)) throw new Error('Origem inválida.'); return applyCosmetics(sender, message.documentKey); }
  if (message.type === 'page_diagnostic') {
    if (!sender.tab || !activeFor(sender.tab.id)) return {};
    const p = message.payload || {};
    event('page_snapshot', { tabId: sender.tab.id, host: hostFromURL(sender.url), antiAdblockSignal: !!p.antiAdblockSignal, signal: typeof p.signal === 'string' ? p.signal.slice(0, 70) : '', markers: Array.isArray(p.markers) ? p.markers.filter(x => typeof x === 'string').slice(0, 6).map(x => x.slice(0, 80)) : [], antiAdblockCore: p.antiAdblockCore || null, timings: { domContentLoaded: Number(p.timings?.domContentLoaded) || 0, load: Number(p.timings?.load) || 0, contentTaskMs: Number(p.timings?.contentTaskMs) || 0 }, resourceErrors: Math.min(1000, Number(p.resourceErrors) || 0) }); return {};
  }
  if (message.type === 'picker_preview') {
    const pending = sender.tab && await db.get('meta', 'picker:' + sender.tab.id);
    const host = hostFromURL(sender.url);
    if (!pending || pending.token !== message.token || pending.until < Date.now() || sender.frameId !== 0 || host !== pending.host) throw new Error('Seleção expirada. Abra o bloqueador de elementos novamente.');
    const selector = message.selector;
    if (typeof selector !== 'string' || !safeSelector(selector) || /[\r\n]/.test(selector)) throw new Error('Seletor inválido.');
    if (sitePolicy(settings, host).paused || !sitePolicy(settings, host).cosmetic) throw new Error('Ative a proteção e a ocultação por CSS neste site.');
    const css = ':is(' + selector + '){display:none!important}';
    const target = { tabId: sender.tab.id, frameIds: [0] };
    if (pending.selector && pending.selector !== selector) throw new Error('O elemento selecionado mudou. Selecione novamente.');
    const matched = (await api.scripting.executeScript({ target, func:s => { try { return document.querySelectorAll(s).length; } catch { return -1; } }, args:[selector] }))[0]?.result ?? -1;
    if (message.enabled === true && matched <= 0 && !pending.selector) throw new Error('O elemento mudou antes da prévia. Selecione novamente.');
    if (message.enabled === true && !pending.selector && matched > 0) await db.put('meta', 'picker:' + sender.tab.id, { ...pending, selector });
    if (message.enabled === true) await api.scripting.insertCSS({ target, css, origin:'USER' });
    else await api.scripting.removeCSS({ target, css, origin:'USER' });
    if (pending.selector && matched === 0) event('picker_target_replaced', { host, selector: selector.slice(0, 300) });
    event('picker_preview', { host, selector: selector.slice(0, 300), enabled: message.enabled === true, matched, authorized: !!pending.selector || matched > 0 });
    return { matched };
  }
  if (message.type === 'picker_save') return serial(async () => {
    const pending = sender.tab && await db.get('meta', 'picker:' + sender.tab.id);
    const host = hostFromURL(sender.url);
    if (!pending || pending.token !== message.token || pending.until < Date.now() || sender.frameId !== 0 || host !== pending.host) throw new Error('Seleção expirada. Abra o bloqueador de elementos novamente.');
    const selector = message.selector;
    if (typeof selector !== 'string' || !safeSelector(selector) || /[\r\n]/.test(selector)) throw new Error('Seletor inválido.');
    if (sitePolicy(settings, host).paused || !sitePolicy(settings, host).cosmetic) throw new Error('Ative a proteção e a ocultação por CSS neste site.');
    // CSS syntax must also be accepted by the document before any durable write.
    if (pending.selector && pending.selector !== selector) throw new Error('O elemento selecionado mudou. Selecione novamente.');
    const validation = await api.scripting.executeScript({ target:{tabId:sender.tab.id,frameIds:[0]}, func:s => { try { return document.querySelectorAll(s).length; } catch { return -1; } }, args:[selector] });
    const matched = validation[0]?.result ?? -1;
    if (matched <= 0 && pending.selector !== selector) throw new Error('Seletor inválido.');
    const rule = host + '##' + selector;
    if (!settings.customRules.split('\n').some(line => line.trim() === rule)) await changeSettings({ customRules:normalizeRules(settings.customRules.trimEnd() + '\n' + rule + '\n') });
    await api.scripting.insertCSS({target:{tabId:sender.tab.id,frameIds:[0]},css:':is(' + selector + '){display:none!important}',origin:'USER'});
    await db.remove('meta', 'picker:' + sender.tab.id);
    event('element_filter_created', { host, selector: selector.slice(0, 300), matched, survivedReplacement: matched === 0 && pending.selector === selector }); return {};
  });
  requireUI(sender);
  switch (message.type) {
    case 'state': return { settings, metadata, sources: SOURCES, activeDiagnostic, updating, limit: availableLimit(), version: VERSION, target, youtubeProfile: { id: YOUTUBE_PROFILE.id, count: YOUTUBE_PROFILE.count, hash: YOUTUBE_PROFILE.hash, upstream: YOUTUBE_PROFILE.upstream, allFrames: YOUTUBE_PROFILE.allFrames } };
    case 'picker_start': {
      const tab = await api.tabs.get(message.tabId), host = hostFromURL(tab.url);
      if (!validHost(host)) throw new Error('Abra um site HTTP/HTTPS.');
      const policy = sitePolicy(settings, host);
      if (policy.paused || !policy.cosmetic) throw new Error('Ative a proteção e a ocultação por CSS neste site.');
      const token = crypto.randomUUID();
      const keys = ['title','instruction','preview','save','again','cancel','failed'];
      if (!message.labels || !keys.every(k => typeof message.labels[k] === 'string' && message.labels[k].length < 400)) throw new Error('Mensagem inválida.');
      await db.prunePickerSessions();
      await db.put('meta', 'picker:' + tab.id, { token, host, until:Date.now() + 300000 });
      await bounded(api.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:installElementPicker,args:[token,Object.fromEntries(keys.map(k => [k,message.labels[k]]))]})); return {};
    }
    case 'site_policy': {
      const host = String(message.host || '').toLowerCase(); if (!validHost(host)) throw new Error('Domínio inválido.');
      const policy = {};
      for (const key of ['paused', 'cosmetic', 'generic', 'fixes', 'youtube']) if (typeof message.policy?.[key] === 'boolean') policy[key] = message.policy[key];
      await serial(() => {
        if (Object.keys(settings.sites).length >= 80 && !settings.sites[host]) throw new Error('Limite de 80 sites personalizados.');
        return changeSettings({ sites: { ...settings.sites, [host]: { ...settings.sites[host], ...policy } } });
      }); return {};
    }
    case 'settings': {
      const p = {};
      for (const key of ['enabled', 'autoUpdate', 'genericCosmetic', 'fixes', 'youtube']) if (typeof message.patch?.[key] === 'boolean') p[key] = message.patch[key];
      if (message.patch && 'intervalHours' in message.patch) { if (!validUpdateInterval(message.patch.intervalHours)) throw new Error('Intervalo de atualização inválido.'); p.intervalHours = message.patch.intervalHours; }
      if (message.patch?.sourceIds) { if (!Array.isArray(message.patch.sourceIds) || !message.patch.sourceIds.every(x => SOURCES.some(s => s.id === x))) throw new Error('Fonte inválida.'); p.sourceIds = [...new Set(message.patch.sourceIds)]; }
      if (typeof message.patch?.customRules === 'string') p.customRules = normalizeRules(message.patch.customRules);
      await serial(() => changeSettings(p)); return {};
    }
    case 'update': return serial(updateLists);
    case 'rollback': return serial(async () => { const prior = await db.get('snapshots', 'previous'); if (!prior) throw new Error('Ainda não há versão anterior.'); const current = await db.get('snapshots', 'active'); await activate(prior.engineVersion === VERSION ? prior : rebuildSnapshot(prior), current); event('rollback_succeeded'); await api.alarms.clear('update'); await scheduleUpdate(); return {}; });
    case 'rules_export': return exportRules(settings, message.format);
    case 'rules_import_preview': return serial(async () => {
      const options = { mode: message.mode, includeSettings: message.includeSettings === true, target, maxRules: availableLimit() - 200 };
      const plan = planImport(message.content, settings, options);
      const token = crypto.randomUUID(); await db.put('meta', 'importPreview', { token, content: message.content, options, generation: metadata.at, until: Date.now() + 10 * 60000 });
      return { token, ...plan.summary };
    });
    case 'rules_import_apply': return serial(async () => {
      const pending = await db.get('meta', 'importPreview');
      if (!pending || pending.token !== message.token || pending.until < Date.now()) throw new Error('A prévia expirou. Valide o arquivo novamente.');
      if (pending.generation !== metadata.at) throw new Error('A configuração mudou. Gere uma nova prévia antes de importar.');
      const plan = planImport(pending.content, settings, pending.options);
      if (plan.summary.unsupported && message.allowUnsupported !== true) throw new Error('A importação contém regras não suportadas. Revise a prévia.');
      await changeSettings(plan.patch); await db.put('meta', 'importPreview', null); event('rules_imported', { mode: plan.summary.mode, unsupported: plan.summary.unsupported }); return plan.summary;
    });
    case 'diagnostic_start': await startDiagnostic(message.tabId, message.details, message.durationSeconds); return {};
    case 'diagnostic_stop': if (activeDiagnostic) activeDiagnostic.until = 0; await expireDiagnostic(); return {};
    case 'logs': return journal.toJSON();
    case 'assistant_analyze': {
      if (!Number.isInteger(message.tabId) || message.tabId < 0) throw new Error('Selecione uma aba de site.');
      const tab = await api.tabs.get(message.tabId); if (!hostFromURL(tab.url)) throw new Error('Abra um site HTTP/HTTPS.');
      const evidence = await siteEvidence(tab.id);
      if (!evidence || hostFromURL(evidence.url) !== hostFromURL(tab.url)) throw new Error('Origem inválida.');
      const result = analyzeEvidence(evidence, settings, isYouTube(hostFromURL(tab.url)) ? await youtubeRuntime(tab.id) : {});
      event('assistant_analysis', { host: result.host, engines: result.engines.map(x => x.name), proposals: result.proposals.map(x => x.id), antiAdblockCore: evidence.antiAdblockCore || null, generativeAI: false });
      return result;
    }
    case 'assistant_enable_known_fix': {
      const tab = await api.tabs.get(message.tabId); const host = hostFromURL(tab.url);
      if (isYouTube(host) && YOUTUBE_PROFILE.count > 0) {
        if (sitePolicy(settings, host).paused) throw new Error('Reative a proteção neste site antes de aplicar a correção.');
        await serial(() => changeSettings({ youtube: true, sites: { ...settings.sites, [host]: { ...settings.sites[host], youtube: true } } }));
        const current = await youtubeRuntime(tab.id);
        if (!current.youtubePlayback?.active || current.youtubePlayback.profileHash !== YOUTUBE_PROFILE.hash) for (const file of YOUTUBE_PROFILE.files) await bounded(api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: file.world, files: [file.path] }));
        event('known_fix_enabled', { host, fix: 'youtube-v1', appliedToOpenTab: true }); return {};
      }
      if (!host) throw new Error('Não há correção conhecida para este site.');
      const evidence = await siteEvidence(tab.id);
      const analysis = analyzeEvidence(evidence, settings);
      const proposal = analysis.proposals.find(x => x.id === 'antiadblock-core-v4');
      if (!proposal) throw new Error('A assinatura conhecida não foi encontrada.');
      const loaderUrl = evidence.antiAdblockCore?.loaderUrl || '';
      const loaderHost = evidence.antiAdblockCore?.loaderHost || '';
      const learned = [...(Array.isArray(settings.antiAdblockCoreRules) ? settings.antiAdblockCoreRules : [])]
        .filter(x => x?.siteHost !== host);
      if (loaderHost && loaderHost !== host) learned.push({ siteHost: host, loaderHost });
      const nextRules = learned.slice(-40);
      event('antiadblock_fix_started', { host, loaderHost: evidence.antiAdblockCore?.loaderHost || '', priorState: evidence.antiAdblockCore?.fixState || 'not-run' });
      await serial(() => changeSettings({ fixes: true, antiAdblockCoreRules: nextRules, sites: { ...settings.sites, [host]: { ...settings.sites[host], fixes: true } } }));
      if (loaderHost && loaderHost !== host) event('antiadblock_fix_rule_installed', { host, loaderHost, observedLoaderUrl: loaderUrl ? redactURL(loaderUrl, true) : '', learnedRules: nextRules.length });
      await bounded(api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN', files: ['resources/antiadblock-core-marker.js'] }));
      await reloadAndWait(tab.id);
      await new Promise(resolve => setTimeout(resolve, 1200));
      const verifiedEvidence = await siteEvidence(tab.id);
      const verifiedAnalysis = analyzeEvidence(verifiedEvidence, settings);
      const verifiedProposal = verifiedAnalysis.proposals.find(x => x.id === 'antiadblock-core-v4');
      const state = verifiedProposal?.fixState || verifiedEvidence.antiAdblockCore?.fixState || 'not-run';
      const verified = verifiedProposal?.enabled === true;
      const verification = verifiedProposal?.verification || 'pending';
      event(verified ? 'antiadblock_fix_verified' : 'antiadblock_fix_unverified', { host, state, verification, warningPresent: !!verifiedEvidence.warningPresent, loaderHost: verifiedEvidence.antiAdblockCore?.loaderHost || '', overlayRemovals: verifiedEvidence.antiAdblockCore?.overlayRemovals || 0 }, verified ? 'info' : 'warn');
      return { fix: 'antiadblock-core-v4', configured: true, learned: !!loaderHost && loaderHost !== host, loaderHost, reloaded: true, verified, state, verification, warningPresent: !!verifiedEvidence.warningPresent, trace: verifiedEvidence.antiAdblockCore || null };
    }
    case 'clear_logs': journal.clear(); await area.set({ journal: journal.toJSON() }); return {};
    case 'export': return exportReport();
    case 'explain_rule': return message.generation && message.generation !== metadata.at ? null : await db.get('rules', Number(message.id));
    case 'simulate': {
      if (!hostFromURL(message.url) || !hostFromURL(message.initiator)) throw new Error('Use URLs HTTP/HTTPS válidas.');
      if (!dnr.testMatchOutcome) throw new Error('Simulação nativa indisponível neste navegador.');
      const result = await dnr.testMatchOutcome({ url: message.url, initiator: message.initiator, type: String(message.resourceType || 'script') });
      const rules = []; for (const m of result.matchedRules) rules.push({ ...m, detail: await db.get('rules', m.ruleId) }); return { ...result, rules };
    }
    default: throw new Error('Comando desconhecido.');
  }
}
api.runtime.onMessage.addListener((message, sender, respond) => { handle(message, sender).then(data => respond({ ok: true, data }), error => { event('operation_error', { command: String(message?.type).slice(0, 50), error: errMessage(error) }, 'error'); respond({ ok: false, error: errMessage(error) }); }); return true; });
api.runtime.onInstalled.addListener(() => { initialize().catch(() => {}); });
api.runtime.onStartup.addListener(() => { initialize().catch(() => {}); });
api.alarms.onAlarm.addListener(alarm => { (async () => { await initialize(); if (alarm.name === 'update' && settings.autoUpdate) await serial(updateLists); if (alarm.name === 'diagnostic') await expireDiagnostic(); })().catch(e => event('alarm_error', { error: errMessage(e) }, 'error')); });
api.tabs.onRemoved.addListener(tabId => { db.remove('meta', 'picker:' + tabId).catch(() => {}); if (activeDiagnostic?.tabId === tabId) { activeDiagnostic.until = 0; expireDiagnostic().catch(() => {}); } for (const key of cssByDocument.keys()) if (key.startsWith(tabId + ':')) cssByDocument.delete(key); });
initialize().catch(() => {});
