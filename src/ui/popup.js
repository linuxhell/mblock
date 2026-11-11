import { $, api, call, status, number, busy, t } from './common.js';
import { hostFromURL, sitePolicy } from '../shared/core.js';
let tab, host, state;
async function refresh() {
  state = await call('state'); [tab] = await api.tabs.query({ active: true, currentWindow: true }); host = hostFromURL(tab?.url);
  const policy = sitePolicy(state.settings, host);
  $('#host').textContent = host || t('Abra um site para usar os controles.');
  $('#protection').textContent = t(state.settings.enabled ? 'Proteção ativa' : 'Proteção pausada');
  $('#global').textContent = t(state.settings.enabled ? 'Pausar tudo' : 'Ativar');
  $('#paused').checked = policy.paused; $('#cosmetic').checked = policy.cosmetic; $('#generic').checked = policy.generic;
  for (const id of ['paused', 'cosmetic', 'generic', 'diagnose', 'reload']) $('#' + id).disabled = !host;
  $('#rules').textContent = number(state.metadata?.stats.nativeRules); $('#filters').textContent = number(state.metadata?.stats.networkFilters);
}
for (const [id, key, invert] of [['paused', 'paused', false], ['cosmetic', 'cosmetic', false], ['generic', 'generic', false]]) {
  $('#' + id).addEventListener('change', busy($('#' + id), async () => { await call('site_policy', { host, policy: { [key]: invert ? !$('#' + id).checked : $('#' + id).checked } }); await refresh(); status('Salvo. Recarregue o site.'); }));
}
$('#global').onclick = busy($('#global'), async () => { await call('settings', { patch: { enabled: !state.settings.enabled } }); await refresh(); status('Salvo. Recarregue o site.'); });
$('#reload').onclick = busy($('#reload'), async () => { await api.tabs.reload(tab.id); window.close(); });
$('#dashboard').onclick = () => api.runtime.openOptionsPage();
$('#diagnose').onclick = busy($('#diagnose'), async () => { await call('diagnostic_start', { tabId: tab.id, details: false }); await api.tabs.create({ url: api.runtime.getURL('ui/dashboard.html') + '?tab=' + tab.id }); status('Diagnóstico ativo. Recarregue a aba do site.'); });
$('#update').onclick = busy($('#update'), async () => { status('Baixando e validando as listas…'); await call('update'); await refresh(); status('Filtros atualizados.'); });
refresh().catch(e => status(e.message, true));
