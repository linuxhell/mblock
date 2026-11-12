import { $, api, call, status, time, number, node, busy, setDisabled, saveReport, downloadFile, t, localeTag } from './common.js';
import { hostFromURL, sitePolicy } from '../shared/core.js';
let state, tabs = [], logs = { entries: [] }, timer, diagTimer, importPreview;
const bind = (selector, fn) => { const action = busy($(selector), fn); $(selector).onclick = async () => { await action(); if (selector === '#apply-import') updateImportButton(); }; };
function selectedTab() { return tabs.find(t => t.id === Number($('#tab').value)); }
function renderSite() {
  const host = hostFromURL(selectedTab()?.url);
  $('#site-host').textContent = host || t('Selecione uma aba de site.');
  const p = sitePolicy(state.settings, host);
  $('#site-paused').checked = p.paused; $('#site-cosmetic').checked = p.cosmetic; $('#site-generic').checked = p.generic;
  $('#site-fixes').checked = state.settings.sites?.['fcportables.com']?.fixes !== false && state.settings.fixes !== false;
  $('#site-fixes').disabled = !/(^|\.)fcportables\.com$/.test(host);
  setDisabled($('#save-site'), !host);
  for (const id of ['start', 'reload', 'analyze', 'site-paused', 'site-cosmetic', 'site-generic']) setDisabled($('#' + id), !host);
  renderKnownFix(null);
  if (selectedTab()) $('#test-origin').value = selectedTab().url;
}
function renderKnownFix(result) {
  const available = result?.proposals.some(proposal => !proposal.enabled);
  const message = !result ? 'Analise o site para verificar correções disponíveis.' : !result.proposals.length ? 'Nenhuma correção conhecida disponível para este site.' : available ? 'Correção disponível. Ative e recarregue o site.' : 'A correção conhecida já está ativa. Recarregue o site para aplicar.';
  setDisabled($('#apply-known-fix'), !available); $('#known-fix-status').textContent = t(message);
}
function renderDiagnostic() {
  clearInterval(diagTimer);
  const paint = () => {
    const diag = state.activeDiagnostic, seconds = diag ? Math.max(0, Math.ceil((diag.until - Date.now()) / 1000)) : 0;
    $('#diag-state').textContent = seconds ? t('● Coletando em {host}: faltam {seconds} segundos. Você pode continuar navegando.', {host:diag.host,seconds}) : t('Nenhuma sessão ativa.');
    setDisabled($('#stop'), !seconds);
    if (!seconds) clearInterval(diagTimer);
    return seconds;
  };
  if (paint()) diagTimer = setInterval(() => { if (!paint()) call('state').then(latest => { state.activeDiagnostic = latest.activeDiagnostic; return refreshLogs(); }).catch(e => status(e.message, true)); }, 1000);
}
async function refreshTabs() {
  const prior = $('#tab').value || new URLSearchParams(location.search).get('tab') || String(state.activeDiagnostic?.tabId || '');
  tabs = (await api.tabs.query({})).filter(t => hostFromURL(t.url));
  $('#tab').replaceChildren(node('option', 'Selecione uma aba')); $('#tab').firstChild.value = '';
  for (const tab of tabs) { const option = node('option', hostFromURL(tab.url) + (tab.active ? ' · ' + t('ativa') : '')); option.value = tab.id; $('#tab').append(option); }
  if (tabs.some(t => String(t.id) === prior)) $('#tab').value = prior;
  else if (tabs.length === 1) $('#tab').value = tabs[0].id;
  renderSite();
}
async function refresh() {
  state = await call('state');
  $('#native').textContent = number(state.metadata?.stats.nativeRules); $('#limit').textContent = number(state.limit);
  $('#network').textContent = number(state.metadata?.stats.networkFilters); $('#cosmetics').textContent = number(state.metadata?.stats.cosmetics);
  $('#engine').textContent = state.target + ' · Manifest V3';
  $('#updated').textContent = t('Configuração instalada: {time}', { time: time(state.metadata?.at) });
  $('#enabled').checked = state.settings.enabled; $('#automatic').checked = state.settings.autoUpdate; $('#generic').checked = state.settings.genericCosmetic; $('#fixes').checked = state.settings.fixes !== false;
  $('#youtube').checked = state.settings.youtube !== false;
  $('#youtube-profile').textContent = t('Perfil do YouTube: {count} filtros avançados. Recarregue as abas do YouTube após alterar esta opção.', {count:number(state.youtubeProfile?.count)});
  $('#custom').value = state.settings.customRules; setDisabled($('#rollback'), !state.metadata?.hasPrevious);
  renderDiagnostic();
  $('#sources').replaceChildren();
  for (const s of state.sources) {
    const r = node('tr'), name = node('td'), label = node('label', undefined, 'check'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = state.settings.sourceIds.includes(s.id); checkbox.dataset.source = s.id;
    label.append(checkbox, node('span', s.name)); name.append(label); r.append(name);
    const metadata = state.metadata?.sources.find(x => x.id === s.id), stats = state.metadata?.report[s.id];
    r.append(node('td', metadata ? time(metadata.fetchedAt) : 'Inativa'), node('td', number(stats?.network)), node('td', number(stats?.cosmetic)), node('td', number(stats?.packaged)), node('td', number(stats?.unsupported)));
    const source = node('td'), a = node('a', 'Ver lista'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; source.append(a); r.append(source); $('#sources').append(r);
  }
  $('#unsupported-title').textContent = t('{count} filtros não suportados · ver motivos', { count: number(state.metadata?.stats.unsupported) });
  $('#compatibility').textContent = JSON.stringify(state.metadata?.report, null, 2);
  renderSite();
}
function renderLogs() {
  const search = $('#search').value.toLowerCase();
  const entries = logs.entries.filter(e => !search || JSON.stringify(e).toLowerCase().includes(search)).slice(-500).reverse();
  $('#log-count').textContent = t('{count} eventos armazenados; {dropped} descartados pelo limite. Exibindo os últimos {shown} resultados.', {count:number(logs.entries.length),dropped:number(logs.dropped),shown:entries.length});
  $('#events').replaceChildren();
  for (const e of entries) {
    const r = node('tr'); r.append(node('td', new Date(e.at).toLocaleTimeString(localeTag())), node('td', e.type, e.level === 'error' ? 'error' : ''));
    r.append(node('td', e.url || e.error || e.host || e.signal || JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['at', 'type', 'level'].includes(k))))));
    const cell = node('td'); if (e.ruleId) { const b = node('button', '#' + e.ruleId); b.onclick = busy(b, async () => { const rule = e.type === 'native_rule_match_during_update' ? null : await call('explain_rule', { id: e.ruleId, generation: e.generation }); const safe = rule ? { ...rule, origins: rule.origins.slice(0, 30), note: t('Até 30 origens exibidas; o JSON exportado seleciona as origens por domínio.') } : { note: t('Regra indisponível; a lista pode ter sido atualizada.') }; $('#rule-detail').textContent = JSON.stringify(safe, null, 2); $('#rule-details').open = true; }); cell.append(b); } r.append(cell); $('#events').append(r);
  }
}
async function refreshLogs() { logs = await call('logs'); renderLogs(); }
bind('#save-settings', async () => { status('Aplicando preferências…'); await call('settings', { patch: { enabled: $('#enabled').checked, autoUpdate: $('#automatic').checked, genericCosmetic: $('#generic').checked, fixes: $('#fixes').checked, youtube: $('#youtube').checked } }); await refresh(); status('Preferências salvas. Recarregue as páginas abertas.'); });
bind('#update', async () => { status('Baixando e validando as listas…'); await call('update'); await refresh(); await refreshLogs(); status('Atualização concluída.'); });
bind('#rollback', async () => { await call('rollback'); await refresh(); status('Configuração anterior restaurada. Recarregue os sites.'); });
bind('#save-sources', async () => { status('Validando seleção e baixando listas novas…'); const ids = [...document.querySelectorAll('[data-source]:checked')].map(x => x.dataset.source); await call('settings', { patch: { sourceIds: ids } }); await refresh(); status('Listas salvas.'); });
bind('#save-custom', async () => { status('Validando regras pessoais…'); await call('settings', { patch: { customRules: $('#custom').value } }); await refresh(); status('Regras processadas. Consulte os filtros não suportados acima.'); });
for (const format of ['txt','json']) bind('#export-rules-' + format, async () => { const file = await call('rules_export', {format}); downloadFile(file.filename,file.content,file.mime); status('Regras exportadas. O arquivo contém apenas o que foi salvo.'); });
function updateImportButton() { setDisabled($('#apply-import'), !importPreview || (importPreview.unsupported > 0 && !$('#import-unsupported').checked)); }
function invalidateImport() { importPreview = null; updateImportButton(); $('#import-preview').textContent = t('Nenhum arquivo validado.'); }
for (const id of ['import-file','import-mode','import-settings']) $('#' + id).onchange = invalidateImport;
$('#import-unsupported').onchange = updateImportButton;
bind('#preview-import', async () => {
  invalidateImport(); const file = $('#import-file').files[0]; if (!file) throw new Error('Selecione um arquivo TXT ou JSON.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Arquivo de importação excede 6 MiB.');
  const preview = await call('rules_import_preview', {content:await file.text(),mode:$('#import-mode').value,includeSettings:$('#import-settings').checked}); importPreview = preview;
  const lines = [t('Arquivo: {name}',{name:file.name}),t('Formato: {format}',{format:preview.format.toUpperCase()}),t('Filtros de rede recebidos: {count}',{count:number(preview.incomingNetwork)}),t('Filtros cosméticos recebidos: {count}',{count:number(preview.incomingCosmetic)}),t('Duplicadas removidas: {count}',{count:number(preview.duplicates)}),t('Regras não suportadas: {count}',{count:number(preview.unsupported)}),t('Perfis de site após importação: {count}',{count:number(preview.siteProfiles)}),t('Listas selecionadas: {count}',{count:preview.sourceIds.length})];
  if (preview.preferencesIncluded) lines.push(t('Perfis e preferências do backup serão restaurados.'));
  if (preview.unsupportedSamples.length) lines.push('\n' + JSON.stringify(preview.unsupportedSamples,null,2));
  $('#import-preview').textContent = lines.join('\n'); updateImportButton(); status('Prévia pronta. Revise as alterações e aplique a importação.');
});
bind('#apply-import', async () => { if (!importPreview) throw new Error('Valide o arquivo antes de importar.'); await call('rules_import_apply',{token:importPreview.token,allowUnsupported:$('#import-unsupported').checked}); invalidateImport(); await refresh(); status('Importação concluída. Recarregue os sites abertos.'); });
bind('#save-site', async () => { const host = hostFromURL(selectedTab()?.url); await call('site_policy', { host, policy: { paused: $('#site-paused').checked, cosmetic: $('#site-cosmetic').checked, generic: $('#site-generic').checked } }); if (!$('#site-fixes').disabled) await call('site_policy', { host: 'fcportables.com', policy: { fixes: $('#site-fixes').checked } }); await refresh(); status('Perfil salvo. Recarregue a aba.'); });
bind('#start', async () => { await call('diagnostic_start', { tabId: Number($('#tab').value), details: $('#details').checked, durationSeconds: Number($('#diag-duration').value) }); await refresh(); await refreshLogs(); status('Diagnóstico iniciado. Recarregue o site e reproduza o problema.'); });
bind('#stop', async () => { await call('diagnostic_stop'); await refresh(); status('Diagnóstico encerrado.'); });
bind('#reload', async () => { if (!selectedTab()) throw new Error('Selecione uma aba.'); await api.tabs.reload(selectedTab().id); status('Aba recarregada.'); });
bind('#refresh-tabs', refreshTabs); bind('#refresh-logs', refreshLogs);
bind('#clear', async () => { await call('clear_logs'); await refreshLogs(); status('Eventos apagados.'); });
bind('#export', async () => { await saveReport(); status('Arquivo JSON exportado. Você pode anexá-lo aqui para análise.'); });
bind('#simulate', async () => { const r = await call('simulate', { url: $('#test-url').value, initiator: $('#test-origin').value, resourceType: $('#test-type').value }); $('#test-result').textContent = JSON.stringify(r, null, 2); status('Simulação concluída.'); });
bind('#analyze', async () => { const tab = selectedTab(); if (!tab) throw new Error('Selecione uma aba.'); renderKnownFix(null); const result = await call('assistant_analyze', { tabId: tab.id }); if (selectedTab()?.id !== tab.id) return; $('#assistant-result').textContent = JSON.stringify(result, null, 2); renderKnownFix(result); status('Análise concluída.'); });
bind('#apply-known-fix', async () => { if (!selectedTab()) throw new Error('Selecione uma aba.'); await call('assistant_enable_known_fix', { tabId: selectedTab().id }); await refresh(); renderKnownFix({proposals:[{enabled:true}]}); status('Correção conhecida ativada. Recarregue a aba e repita o diagnóstico.'); });
$('#tab').onchange = renderSite; $('#search').oninput = renderLogs;
$('#live').onchange = () => { clearInterval(timer); if ($('#live').checked) timer = setInterval(() => refreshLogs().catch(e => status(e.message, true)), 2000); };
window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(diagTimer); });
refresh().then(refreshTabs).then(refreshLogs).catch(e => status(e.message, true));
