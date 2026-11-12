// SPDX-License-Identifier: GPL-3.0-only
import { SOURCES, LIMITS, VERSION } from './sources.js';
import { validHost } from './core.js';
import { compileLists } from './compiler.js';
const OPTIONS = ['enabled', 'autoUpdate', 'genericCosmetic', 'fixes', 'youtube'];
const SITE_OPTIONS = ['paused', 'cosmetic', 'generic', 'fixes', 'youtube'];
const bytes = value => new TextEncoder().encode(value).length;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function normalizeRules(text) {
  if (typeof text !== 'string') throw new Error('As regras devem ser texto.');
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw new Error('O arquivo contém caracteres de controle inválidos.');
  if (bytes(normalized) > LIMITS.customBytes) throw new Error('Regras pessoais excedem 2 MiB.');
  if (normalized.split('\n').length > 60000) throw new Error('O arquivo excede 60.000 linhas de regras pessoais.');
  return normalized;
}
export function validateConfiguration(config) {
  if (!object(config)) throw new Error('Configuração de backup inválida.');
  const out = {};
  for (const key of Object.keys(config)) if (![...OPTIONS, 'sites', 'sourceIds', 'customRules', 'intervalHours'].includes(key)) throw new Error('Campo de configuração não suportado: ' + key);
  for (const key of OPTIONS) if (key in config) { if (typeof config[key] !== 'boolean') throw new Error('Preferência booleana inválida: ' + key); out[key] = config[key]; }
  if ('intervalHours' in config && config.intervalHours !== 12) throw new Error('O intervalo de atualização do backup não é suportado.');
  if ('customRules' in config) out.customRules = normalizeRules(config.customRules);
  if ('sourceIds' in config) {
    if (!Array.isArray(config.sourceIds) || config.sourceIds.length > SOURCES.length || !config.sourceIds.every(id => SOURCES.some(s => s.id === id))) throw new Error('O backup contém uma lista desconhecida.');
    out.sourceIds = [...new Set(config.sourceIds)];
  }
  if ('sites' in config) {
    if (!object(config.sites) || Object.keys(config.sites).length > 80) throw new Error('Perfis de sites inválidos ou limite de 80 sites excedido.');
    out.sites = {};
    for (const [host, policy] of Object.entries(config.sites)) {
      if (!validHost(host) || host !== host.toLowerCase() || !object(policy)) throw new Error('O backup contém um domínio inválido.');
      const validated = {};
      for (const [key, value] of Object.entries(policy)) { if (!SITE_OPTIONS.includes(key) || typeof value !== 'boolean') throw new Error('O backup contém uma opção de site inválida.'); validated[key] = value; }
      out.sites[host] = validated;
    }
  }
  return out;
}
export function parseRuleFile(content) {
  if (typeof content !== 'string' || bytes(content) > LIMITS.backupBytes) throw new Error('Arquivo de importação excede 6 MiB.');
  const raw = content.replace(/^\uFEFF/, '');
  if (!raw.trimStart().startsWith('{') && !raw.trimStart().startsWith('[')) return { format: 'txt', customRules: normalizeRules(raw), configuration: null };
  // ABP list headers are text, not JSON arrays.
  if (/^\s*\[Adblock[^\]]*\]/i.test(raw)) return { format: 'txt', customRules: normalizeRules(raw), configuration: null };
  let data;
  try { data = JSON.parse(raw, (key, value) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('unsafe-key'); return value; }); }
  catch { throw new Error('Arquivo JSON inválido. Nenhuma regra foi alterada.'); }
  if (!object(data) || data.schema !== 'mblock-rules-v1' || data.schemaVersion !== 1 || !object(data.configuration)) throw new Error('Este JSON não é um backup de regras do mBlock.');
  const configuration = validateConfiguration(data.configuration);
  if (!('customRules' in configuration)) throw new Error('O backup não contém regras pessoais.');
  return { format: 'json', customRules: configuration.customRules, configuration };
}
function mergeRules(existing, incoming) {
  const seen = new Set(), result = []; let duplicates = 0;
  for (const line of (existing + '\n' + incoming).split('\n')) {
    const key = line.trim(); if (!key) continue;
    if (seen.has(key)) { if (!key.startsWith('!') && !key.startsWith('[')) duplicates++; continue; }
    seen.add(key); result.push(line);
  }
  return { text: result.join('\n') + (result.length ? '\n' : ''), duplicates };
}
export function planImport(content, settings, { mode = 'merge', includeSettings = true, target = 'chrome', maxRules = 29800 } = {}) {
  if (!['merge', 'replace'].includes(mode)) throw new Error('Modo de importação inválido.');
  const parsed = parseRuleFile(content), merged = mode === 'merge' ? mergeRules(normalizeRules(settings.customRules), parsed.customRules) : mergeRules('', parsed.customRules);
  const patch = { customRules: normalizeRules(merged.text) };
  if (includeSettings && parsed.configuration) {
    const { customRules, ...rest } = parsed.configuration;
    Object.assign(patch, rest);
    if (mode === 'merge') {
      if (rest.sourceIds) patch.sourceIds = [...new Set([...settings.sourceIds, ...rest.sourceIds])];
      if (rest.sites) { patch.sites = { ...settings.sites }; for (const [host, policy] of Object.entries(rest.sites)) patch.sites[host] = { ...patch.sites[host], ...policy }; }
    }
  }
  if (patch.sites && Object.keys(patch.sites).length > 80) throw new Error('A importação excederia o limite de 80 sites.');
  const incoming = compileLists([{ id: 'import', text: parsed.customRules }], { target, maxRules });
  return { patch, summary: { format: parsed.format, mode, duplicates: merged.duplicates, incomingNetwork: incoming.stats.networkFilters, incomingCosmetic: incoming.stats.cosmetics, unsupported: incoming.stats.unsupported, conditional: incoming.report.import.conditional, unsupportedSamples: incoming.report.import.samples, customBytes: bytes(patch.customRules), siteProfiles: Object.keys(patch.sites || settings.sites).length, sourceIds: patch.sourceIds || settings.sourceIds, preferencesIncluded: !!(includeSettings && parsed.configuration) } };
}
export function exportRules(settings, format) {
  if (format === 'txt') return { filename: `mblock-regras-${VERSION}.txt`, mime: 'text/plain;charset=utf-8', content: '! mBlock personal filters\n! Exported ' + new Date().toISOString() + '\n' + normalizeRules(settings.customRules) };
  if (format !== 'json') throw new Error('Formato de exportação inválido.');
  const configuration = validateConfiguration(Object.fromEntries([...OPTIONS, 'sites', 'sourceIds', 'customRules', 'intervalHours'].filter(k => settings[k] !== undefined).map(k => [k, settings[k]])));
  const data = { schema: 'mblock-rules-v1', schemaVersion: 1, extensionVersion: VERSION, exportedAt: new Date().toISOString(), configuration };
  return { filename: `mblock-backup-${VERSION}.json`, mime: 'application/json', content: JSON.stringify(data, null, 2) + '\n' };
}
