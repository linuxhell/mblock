import { $, api, call, status, time, number, node, busy, saveReport, t, localeTag } from './common.js';
import { hostFromURL, sitePolicy } from '../shared/core.js';
let state, tabs = [], logs = { entries: [] }, timer;
const bind = (selector, fn) => { $(selector).onclick = busy($(selector), fn); };
function selectedTab() { return tabs.find(t => t.id === Number($('#tab').value)); }
function renderSite() {
  const host = hostFromURL(selectedTab()?.url);
  $('#site-host').textContent = host || t('Selecione uma aba de site.');
  const p = sitePolicy(state.settings, host);
  $('#site-paused').checked = p.paused; $('#site-cosmetic').checked = p.cosmetic; $('#site-generic').checked = p.generic;
  $('#site-fixes').checked = state.settings.sites?.['fcportables.com']?.fixes !== false && state.settings.fixes !== false;
  $('#site-fixes').disabled = !/(^|\.)fcportables\.com$/.test(host);
  $('#save-site').disabled = !host;
  if (selectedTab()) $('#test-origin').value = selectedTab().url;
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
  $('#custom').value = state.settings.customRules; $('#rollback').disabled = !state.metadata?.hasPrevious;
  const diag = state.activeDiagnostic;
  $('#diag-state').textContent = diag ? t('● Monitorando {host} até {time}. Reproduza o problema na aba.', { host: diag.host, time: new Date(diag.until).toLocaleTimeString(localeTag()) }) : t('Nenhuma sessão ativa.');
  $('#stop').disabled = !diag;
  $('#sources').replaceChildren();
  for (const s of state.sources) {
    const r = node('tr'), name = node('td'), label = node('label', undefined, 'check'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = state.settings.sourceIds.includes(s.id); checkbox.dataset.source = s.id;
    label.append(checkbox, node('span', s.name)); name.append(label); r.append(name);
    const metadata = state.metadata?.sources.find(x => x.id === s.id), stats = state.metadata?.report[s.id];
    r.append(node('td', metadata ? time(metadata.fetchedAt) : 'Inativa'), node('td', number(stats?.network)), node('td', number(stats?.cosmetic)), node('td', number(stats?.unsupported)));
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
bind('#save-settings', async () => { status('Aplicando preferências…'); await call('settings', { patch: { enabled: $('#enabled').checked, autoUpdate: $('#automatic').checked, genericCosmetic: $('#generic').checked, fixes: $('#fixes').checked } }); await refresh(); status('Preferências salvas. Recarregue as páginas abertas.'); });
bind('#update', async () => { status('Baixando e validando as listas…'); await call('update'); await refresh(); await refreshLogs(); status('Atualização concluída.'); });
bind('#rollback', async () => { await call('rollback'); await refresh(); status('Configuração anterior restaurada. Recarregue os sites.'); });
bind('#save-sources', async () => { status('Validando seleção e baixando listas novas…'); const ids = [...document.querySelectorAll('[data-source]:checked')].map(x => x.dataset.source); await call('settings', { patch: { sourceIds: ids } }); await refresh(); status('Listas salvas.'); });
bind('#save-custom', async () => { status('Validando regras pessoais…'); await call('settings', { patch: { customRules: $('#custom').value } }); await refresh(); status('Regras processadas. Consulte os filtros não suportados acima.'); });
bind('#save-site', async () => { const host = hostFromURL(selectedTab()?.url); await call('site_policy', { host, policy: { paused: $('#site-paused').checked, cosmetic: $('#site-cosmetic').checked, generic: $('#site-generic').checked } }); if (!$('#site-fixes').disabled) await call('site_policy', { host: 'fcportables.com', policy: { fixes: $('#site-fixes').checked } }); await refresh(); status('Perfil salvo. Recarregue a aba.'); });
bind('#start', async () => { await call('diagnostic_start', { tabId: Number($('#tab').value), details: $('#details').checked }); await refresh(); await refreshLogs(); status('Diagnóstico iniciado. Recarregue o site e reproduza o problema.'); });
bind('#stop', async () => { await call('diagnostic_stop'); await refresh(); status('Diagnóstico encerrado.'); });
bind('#reload', async () => { if (!selectedTab()) throw new Error('Selecione uma aba.'); await api.tabs.reload(selectedTab().id); status('Aba recarregada.'); });
bind('#refresh-tabs', refreshTabs); bind('#refresh-logs', refreshLogs);
bind('#clear', async () => { await call('clear_logs'); await refreshLogs(); status('Eventos apagados.'); });
bind('#export', async () => { await saveReport(); status('Arquivo JSON exportado. Você pode anexá-lo aqui para análise.'); });
bind('#simulate', async () => { const r = await call('simulate', { url: $('#test-url').value, initiator: $('#test-origin').value, resourceType: $('#test-type').value }); $('#test-result').textContent = JSON.stringify(r, null, 2); status('Simulação concluída.'); });
bind('#analyze', async () => { const tab = selectedTab(); if (!tab) throw new Error('Selecione uma aba.'); const result = await call('assistant_analyze', { tabId: tab.id }); $('#assistant-result').textContent = JSON.stringify(result, null, 2); $('#apply-known-fix').disabled = !result.proposals.length; status('Análise concluída.'); });
bind('#apply-known-fix', async () => { if (!selectedTab()) throw new Error('Selecione uma aba.'); await call('assistant_enable_known_fix', { tabId: selectedTab().id }); await refresh(); status('Correção conhecida ativada. Recarregue a aba e repita o diagnóstico.'); });
$('#tab').onchange = renderSite; $('#search').oninput = renderLogs;
$('#live').onchange = () => { clearInterval(timer); if ($('#live').checked) timer = setInterval(() => refreshLogs().catch(e => status(e.message, true)), 2000); };
window.addEventListener('pagehide', () => clearInterval(timer));
refresh().then(refreshTabs).then(refreshLogs).catch(e => status(e.message, true));
