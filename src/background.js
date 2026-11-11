// SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_SETTINGS, hostFromURL, validHost, sitePolicy, controlRules, redactURL, RingBuffer, domainMatches } from './shared/core.js';
import { SOURCES, LIMITS, VERSION } from './shared/sources.js';
import { compileLists, cosmeticSelectors } from './shared/compiler.js';
import { builtInRules } from './shared/fixes.js';
import { fetchList } from './shared/fetch-lists.js';
import * as db from './shared/db.js';
import { readBundle } from './shared/bundle.js';
import { analyzeEvidence } from './shared/assistant.js';
const api = globalThis.browser || chrome;
const dnr = api.declarativeNetRequest;
let settings, metadata, target, activeDiagnostic = null, journal, mutation = Promise.resolve(), updating = false;
let initPromise, flushTimer, diagnosticAttached = false, diagCount = 0;
const cssByDocument = new Map();
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
function targetName() { return api.runtime.getManifest().browser_specific_settings ? 'firefox' : 'chrome'; }
function availableLimit() { return Math.min(30000, dnr.MAX_NUMBER_OF_DYNAMIC_RULES || 5000); }
function allRules(compiled, config) { return [...compiled.rules, ...builtInRules(config), ...controlRules(config)].map((rule, i) => ({ ...rule, id: i + 1 })); }
function snapshot(compiled, config, sources, texts) { return { at: new Date().toISOString(), target, compiled, rules: allRules(compiled, config), settings: config, sources, texts }; }
async function activate(next, previous, saveSettings = true) {
  const oldRules = await dnr.getDynamicRules();
  if (next.rules.length > availableLimit()) throw new Error('Limite de regras dinâmicas excedido; configuração anterior mantida.');
  const unsafe = next.rules.filter(r => !['block', 'allow', 'allowAllRequests', 'upgradeScheme'].includes(r.action.type)).length;
  if (unsafe > (dnr.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5000)) throw new Error('Limite de regras de redirecionamento excedido.');
  // Durable intent enables recovery if a worker or browser stops between API/DB writes.
  await db.put('meta', 'pending', next);
  let applied = false;
  try {
    await dnr.updateDynamicRules({ removeRuleIds: oldRules.map(r => r.id), addRules: next.rules });
    applied = true;
    await db.commitSnapshot(next, previous);
  } catch (error) {
    // The browser update is atomic. Restore the old rules if the DB commit failed.
    try { if (applied) await dnr.updateDynamicRules({ removeRuleIds: next.rules.map(r => r.id), addRules: oldRules }); }
    catch (rollbackError) { event('critical_recovery_needed', { error: errMessage(rollbackError) }, 'error'); throw new Error('Falha na restauração. Reinicie a extensão para recuperar a transação.'); }
    await db.put('meta', 'pending', null);
    throw error;
  }
  if (saveSettings) { await api.storage.local.set({ settings: next.settings }); settings = next.settings; }
  await db.put('meta', 'pending', null);
  metadata = await db.get('meta', 'active');
  await dnr.updateEnabledRulesets({ disableRulesetIds: ['bootstrap'] });
  cssByDocument.clear();
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
      await db.commitSnapshot(pending, previous);
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
      // Browser rules survive restarts; no recompilation and no full rules read on normal wake.
      await dnr.updateEnabledRulesets({ disableRulesetIds: ['bootstrap'] });
    }
    if (dnr.setExtensionActionOptions) await dnr.setExtensionActionOptions({ displayActionCountAsBadgeText: true }).catch(() => {});
    await scheduleUpdate();
    await expireDiagnostic();
    if (activeDiagnostic) attachDiagnostic();
  })();
  try { await initPromise; } catch (error) { initPromise = null; event('initialization_error', { error: errMessage(error) }, 'error'); throw error; }
}
async function scheduleUpdate() {
  if (settings.autoUpdate) { if (!await api.alarms.get('update')) await api.alarms.create('update', { delayInMinutes: 2, periodInMinutes: settings.intervalHours * 60 }); }
  else await api.alarms.clear('update');
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
    const compiled = compileLists(lists, { target, maxRules: availableLimit() - 200 });
    const old = await db.get('snapshots', 'active');
    await activate(snapshot(compiled, settings, sources, lists.filter(x => x.id !== 'custom')), old);
    event('update_succeeded', { rules: metadata.stats.nativeRules, unsupported: compiled.stats.unsupported });
    return metadata;
  } catch (error) { event('update_failed_previous_retained', { error: errMessage(error) }, 'error'); throw error; }
  finally { updating = false; }
}
async function changeSettings(patch) {
  const old = await db.get('snapshots', 'active');
  const next = { ...settings, ...patch };
  const texts = old.texts.filter(x => next.sourceIds.includes(x.id));
  if (next.customRules.trim()) texts.push({ id: 'custom', text: next.customRules });
  const missing = next.sourceIds.filter(id => !texts.some(x => x.id === id));
  for (const id of missing) { const r = await fetchList(SOURCES.find(x => x.id === id)); texts.push({ id, text: r.text }); old.sources = old.sources.filter(s => s.id !== id).concat(r.status); }
  const compiled = compileLists(texts, { target, maxRules: availableLimit() - 200 });
  await activate(snapshot(compiled, next, old.sources.filter(s => next.sourceIds.includes(s.id)), texts.filter(x => x.id !== 'custom')), old);
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
const onMatch = info => diagnosticEvent('native_rule_match', info.request, { ruleId: info.rule.ruleId, rulesetId: info.rule.rulesetId });
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
  if (activeDiagnostic && activeDiagnostic.until <= Date.now()) { const tabId = activeDiagnostic.tabId; activeDiagnostic = null; detachDiagnostic(); await area.set({ activeDiagnostic: null }); await api.alarms.clear('diagnostic'); await api.tabs.sendMessage(tabId, { type: 'diagnostic_state', enabled: false }).catch(() => {}); event('diagnostic_stopped'); }
}
async function startDiagnostic(tabId, details) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Selecione uma aba de site.');
  const tab = await api.tabs.get(tabId); if (!hostFromURL(tab.url)) throw new Error('Abra um site HTTP/HTTPS.');
  detachDiagnostic(); diagCount = 0;
  activeDiagnostic = { tabId, host: hostFromURL(tab.url), startedAt: Date.now(), until: Date.now() + LIMITS.diagMinutes * 60000, details: !!details };
  await area.set({ activeDiagnostic }); await api.alarms.create('diagnostic', { when: activeDiagnostic.until }); attachDiagnostic();
  event('diagnostic_started', { tabId, host: activeDiagnostic.host, details: activeDiagnostic.details });
  await api.tabs.sendMessage(tabId, { type: 'diagnostic_state', enabled: true }).catch(() => {});
}
async function applyCosmetics(sender) {
  const host = hostFromURL(sender.url), topHost = hostFromURL((await api.tabs.get(sender.tab.id)).url);
  const topPolicy = sitePolicy(settings, topHost), policy = sitePolicy(settings, host);
  const diagnostic = !!activeFor(sender.tab.id);
  if (!host || topPolicy.paused || policy.paused || !topPolicy.cosmetic || !policy.cosmetic) return { selectors: 0, diagnostic };
  const cos = await db.getCosmetics(host, topPolicy.generic && policy.generic);
  const current = await db.get('meta', 'hideExceptions') || [];
  const selectors = cosmeticSelectors({ cosmetics: cos, hideExceptions: current }, host, topPolicy.generic && policy.generic);
  const key = sender.tab.id + ':' + (sender.documentId || sender.frameId);
  if (cssByDocument.has(key)) return { selectors: cssByDocument.get(key), diagnostic };
  if (cssByDocument.size > 500) cssByDocument.clear();
  if (selectors.length) {
    // :is() is forgiving: one obsolete CSS selector cannot invalidate its neighbours.
    const css = selectors.map(s => ':is(' + s + '){display:none!important;}').join('\n');
    await api.scripting.insertCSS({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, css, origin: 'USER' });
  }
  cssByDocument.set(key, selectors.length);
  if (diagnostic) event('cosmetics_applied', { tabId: sender.tab.id, host, selectors: selectors.length, generic: topPolicy.generic && policy.generic });
  return { selectors: selectors.length, diagnostic };
}
async function exportReport() {
  await expireDiagnostic();
  const { settings: privateSettings, ...publicMetadata } = metadata;
  publicMetadata.report = { ...publicMetadata.report };
  if (publicMetadata.report.custom) publicMetadata.report.custom = { lines: publicMetadata.report.custom.lines, network: publicMetadata.report.custom.network, cosmetic: publicMetadata.report.custom.cosmetic, unsupported: publicMetadata.report.custom.unsupported, note: 'Custom filter content omitted' };
  const ruleIds = [...new Set(journal.entries.filter(x => x.type === 'native_rule_match').map(x => x.ruleId))].slice(0, 200);
  const matchedRules = [];
  for (const id of ruleIds) {
    const record = await db.get('rules', id); if (!record) continue;
    // Grouped hosts can have hundreds of origins; only relevant domains are exported.
    const requests = journal.entries.filter(x => x.ruleId === id).map(x => hostFromURL(x.url));
    const origins = record.origins.filter(o => !o.host || requests.some(h => domainMatches(h, o.host))).slice(0, 20).map(o => o.source === 'custom' ? { source: 'custom', filter: '[regra pessoal omitida]' } : o);
    matchedRules.push({ id, action: record.rule.action, origins });
  }
  return { schema: 'mblock-diagnostic-v1', extension: { version: VERSION, target }, exportedAt: new Date().toISOString(), environment: { userAgent: navigator.userAgent }, capabilities: { nativeRuleLogging: diagnosticAttached && !!dnr.onRuleMatchedDebug, nativeLoggingNote: 'In Chromium, exact rule-match events require an unpacked extension. No event is not proof that blocking did not occur.', networkBlocking: 'declarativeNetRequest', remoteCode: false }, privacy: { cookies: false, bodies: false, headers: false, queryValues: false, pathDetails: journal.entries.some(e => e.urlDetails) }, configuration: { enabled: settings.enabled, genericCosmetic: settings.genericCosmetic, fixes: settings.fixes !== false, sites: settings.sites, sourceIds: settings.sourceIds, customRuleCount: settings.customRules.split('\n').filter(x => x.trim()).length }, metadata: publicMetadata, diagnostic: activeDiagnostic, journal: journal.toJSON(), matchedRules };
}
async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') throw new Error('Mensagem inválida.');
  await initialize(); await expireDiagnostic();
  if (message.type === 'frame_ready') { if (!sender.tab || !hostFromURL(sender.url)) throw new Error('Origem inválida.'); return applyCosmetics(sender); }
  if (message.type === 'page_diagnostic') {
    if (!sender.tab || !activeFor(sender.tab.id)) return {};
    const p = message.payload || {};
    event('page_snapshot', { tabId: sender.tab.id, host: hostFromURL(sender.url), antiAdblockSignal: !!p.antiAdblockSignal, signal: typeof p.signal === 'string' ? p.signal.slice(0, 70) : '', markers: Array.isArray(p.markers) ? p.markers.filter(x => typeof x === 'string').slice(0, 6).map(x => x.slice(0, 80)) : [], timings: { domContentLoaded: Number(p.timings?.domContentLoaded) || 0, load: Number(p.timings?.load) || 0, contentTaskMs: Number(p.timings?.contentTaskMs) || 0 }, resourceErrors: Math.min(1000, Number(p.resourceErrors) || 0) }); return {};
  }
  requireUI(sender);
  switch (message.type) {
    case 'state': return { settings, metadata, sources: SOURCES, activeDiagnostic, updating, limit: availableLimit(), version: VERSION, target };
    case 'site_policy': {
      const host = String(message.host || '').toLowerCase(); if (!validHost(host)) throw new Error('Domínio inválido.');
      const previous = settings.sites[host] || {}, policy = {};
      for (const key of ['paused', 'cosmetic', 'generic', 'fixes']) if (typeof message.policy?.[key] === 'boolean') policy[key] = message.policy[key];
      if (Object.keys(settings.sites).length >= 80 && !settings.sites[host]) throw new Error('Limite de 80 sites personalizados.');
      await serial(() => changeSettings({ sites: { ...settings.sites, [host]: { ...previous, ...policy } } })); return {};
    }
    case 'settings': {
      const p = {};
      for (const key of ['enabled', 'autoUpdate', 'genericCosmetic', 'fixes']) if (typeof message.patch?.[key] === 'boolean') p[key] = message.patch[key];
      if (message.patch?.sourceIds) { if (!Array.isArray(message.patch.sourceIds) || !message.patch.sourceIds.every(x => SOURCES.some(s => s.id === x))) throw new Error('Fonte inválida.'); p.sourceIds = [...new Set(message.patch.sourceIds)]; }
      if (typeof message.patch?.customRules === 'string') { if (new TextEncoder().encode(message.patch.customRules).length > LIMITS.customBytes) throw new Error('Regras pessoais excedem 100 KB.'); p.customRules = message.patch.customRules; }
      await serial(() => changeSettings(p)); return {};
    }
    case 'update': return serial(updateLists);
    case 'rollback': return serial(async () => { const prior = await db.get('snapshots', 'previous'); if (!prior) throw new Error('Ainda não há versão anterior.'); const current = await db.get('snapshots', 'active'); await activate(prior, current); event('rollback_succeeded'); await api.alarms.clear('update'); await scheduleUpdate(); return {}; });
    case 'diagnostic_start': await startDiagnostic(message.tabId, message.details); return {};
    case 'diagnostic_stop': if (activeDiagnostic) activeDiagnostic.until = 0; await expireDiagnostic(); return {};
    case 'logs': return journal.toJSON();
    case 'assistant_analyze': {
      if (!Number.isInteger(message.tabId) || message.tabId < 0) throw new Error('Selecione uma aba de site.');
      const tab = await api.tabs.get(message.tabId); if (!hostFromURL(tab.url)) throw new Error('Abra um site HTTP/HTTPS.');
      let evidence; try { evidence = await api.tabs.sendMessage(tab.id, { type: 'assistant_probe' }, { frameId: 0 }); } catch { throw new Error('Recarregue o site para iniciar a análise.'); }
      if (!evidence || hostFromURL(evidence.url) !== hostFromURL(tab.url)) throw new Error('Origem inválida.');
      const result = analyzeEvidence(evidence, settings);
      event('assistant_analysis', { host: result.host, engines: result.engines.map(x => x.name), proposals: result.proposals.map(x => x.id), generativeAI: false });
      return result;
    }
    case 'assistant_enable_known_fix': {
      const tab = await api.tabs.get(message.tabId); const host = hostFromURL(tab.url);
      if (!host || !domainMatches(host, 'fcportables.com')) throw new Error('Não há correção conhecida para este site.');
      const evidence = await api.tabs.sendMessage(tab.id, { type: 'assistant_probe' }, { frameId: 0 });
      const analysis = analyzeEvidence(evidence, settings); if (!analysis.proposals.some(x => x.id === 'fcportables-core-v1')) throw new Error('A assinatura conhecida não foi encontrada.');
      await serial(() => changeSettings({ fixes: true, sites: { ...settings.sites, 'fcportables.com': { ...settings.sites['fcportables.com'], fixes: true } } }));
      event('known_fix_enabled', { host, fix: 'fcportables-core-v1' }); return {};
    }
    case 'clear_logs': journal.clear(); await area.set({ journal: journal.toJSON() }); return {};
    case 'export': return exportReport();
    case 'explain_rule': return await db.get('rules', Number(message.id));
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
api.tabs.onRemoved.addListener(tabId => { if (activeDiagnostic?.tabId === tabId) { activeDiagnostic.until = 0; expireDiagnostic().catch(() => {}); } for (const key of cssByDocument.keys()) if (key.startsWith(tabId + ':')) cssByDocument.delete(key); });
initialize().catch(() => {});
