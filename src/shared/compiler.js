// SPDX-License-Identifier: GPL-3.0-only
// Conservative compiler: unknown modifiers reject the WHOLE filter. Never widen it.
import { validHost, stable, domainMatches } from './core.js';
import { LIMITS } from './sources.js';
import { YOUTUBE_PROFILE } from './youtube-profile.js';
const TYPES = { script: 'script', image: 'image', stylesheet: 'stylesheet', css: 'stylesheet', object: 'object', 'object-subrequest': 'object', subdocument: 'sub_frame', frame: 'sub_frame', xmlhttprequest: 'xmlhttprequest', xhr: 'xmlhttprequest', font: 'font', media: 'media', websocket: 'websocket', ping: 'ping', other: 'other', document: 'main_frame', doc: 'main_frame' };
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
function domains(input) {
  const yes = [], no = [];
  for (const raw of input.split('|')) { const neg = raw.startsWith('~'), d = (neg ? raw.slice(1) : raw).toLowerCase(); if (!validHost(d)) return null; (neg ? no : yes).push(d); }
  return { yes: [...new Set(yes)].sort(), no: [...new Set(no)].sort() };
}
export function safeSelector(s) {
  // Do not accept declarations, scriptlets, procedural filters or network-bearing CSS.
  return !!s && s.length <= 1024 && !/[{};\\\x00-\x1f]/.test(s) && !/(?:url\s*\(|@|\+js\(|:-?abp-|:has-text\(|:matches-|:upward\(|:xpath\(|:remove\(|:style\(|:watch-attr\(|:min-text-length\(|:others\()/i.test(s);
}
export function parseLine(line, source = 'custom') {
  let s = line.trim();
  if (!s || s.startsWith('!') || s.startsWith('[') || s.startsWith('# ')) return { kind: 'comment' };
  if (s.length > 8192) return { kind: 'unsupported', reason: 'linha longa' };
  if (/\$badfilter(?:,|$)|,badfilter(?:,|$)/.test(s)) { const dollar = s.lastIndexOf('$'); const rest = s.slice(dollar + 1).split(',').filter(x => x !== 'badfilter'); return { kind: 'badfilter', target: s.slice(0, dollar) + (rest.length ? '$' + rest.join(',') : '') }; }
  if (/#(?:\$|%|\^|@\$|@%)#?/.test(s)) return { kind: 'unsupported', reason: 'filtro estendido' };
  const cosmetic = /^(.*?)#(@?)#(.+)$/.exec(s);
  if (cosmetic) {
    const [, scope, exception, selector] = cosmetic;
    if (!safeSelector(selector)) return { kind: 'unsupported', reason: 'scriptlet/procedural/CSS não suportado' };
    const d = scope ? domains(scope.replaceAll(',', '|')) : { yes: [], no: [] };
    if (!d) return { kind: 'unsupported', reason: 'domínio cosmético não suportado' };
    return { kind: 'cosmetic', selector, include: d.yes, exclude: d.no, exception: !!exception, source };
  }
  if (s.includes('##') || s.includes('#@#')) return { kind: 'unsupported', reason: 'cosmético inválido' };
  if (s.startsWith('0.0.0.0 ') || s.startsWith('127.0.0.1 ')) {
    const h = s.split(/\s+/)[1]; if (!validHost(h)) return { kind: 'unsupported', reason: 'hosts inválido' }; s = '||' + h + '^';
  }
  const exception = s.startsWith('@@'); if (exception) s = s.slice(2);
  // The last $ is the ABP option separator, except in /regular expressions/.
  if (s.startsWith('/')) { const end = s.lastIndexOf('/'); if (end > 0 && (end === s.length - 1 || s[end + 1] === '$')) return { kind: 'unsupported', reason: 'regex (versão inicial)' }; }
  const split = s.lastIndexOf('$'); const pattern = split >= 0 ? s.slice(0, split) : s;
  const options = split >= 0 ? s.slice(split + 1).split(',') : [];
  const condition = {}, yesTypes = [], noTypes = []; let important = false, hide = null, all = false;
  for (const option of options) {
    const neg = option.startsWith('~'); const op = neg ? option.slice(1) : option;
    if (TYPES[op]) { (neg ? noTypes : yesTypes).push(TYPES[op]); continue; }
    if (option === 'all' && !exception) { all = true; continue; }
    if (op === 'third-party' || op === '3p' || op === 'first-party' || op === '1p') {
      const third = op === 'third-party' || op === '3p'; const value = third !== neg ? 'thirdParty' : 'firstParty';
      if (condition.domainType && condition.domainType !== value) return { kind: 'unsupported', reason: 'party contraditório' };
      condition.domainType = value; continue;
    }
    if (option === 'match-case') { condition.isUrlFilterCaseSensitive = true; continue; }
    if (option === 'important' && !exception) { important = true; continue; }
    if (option === 'generichide' || option === 'ghide' || option === 'elemhide' || option === 'ehide') {
      if (!exception || options.length !== 1) return { kind: 'unsupported', reason: 'opções de ocultação combinadas' }; hide = option === 'generichide' || option === 'ghide' ? 'generic' : 'all'; continue;
    }
    if (/^(?:domain|from|to)=/.test(option)) {
      const [key, value] = option.split('='); const d = domains(value || ''); if (!d) return { kind: 'unsupported', reason: 'domínio não suportado' };
      const inc = key === 'to' ? 'requestDomains' : 'initiatorDomains', exc = key === 'to' ? 'excludedRequestDomains' : 'excludedInitiatorDomains';
      if (condition[inc] || condition[exc]) return { kind: 'unsupported', reason: 'domínio repetido' };
      if (d.yes.length) condition[inc] = d.yes; if (d.no.length) condition[exc] = d.no; continue;
    }
    // redirect/replace/removeparam/csp/denyallow/popup/etc need separate semantics.
    return { kind: 'unsupported', reason: 'modificador: ' + option.slice(0, 70) };
  }
  if (hide) {
    const m = /^\|\|([a-z0-9.-]+)\^$/.exec(pattern);
    return m && validHost(m[1]) ? { kind: 'hideException', domain: m[1], mode: hide, source } : { kind: 'unsupported', reason: 'exceção cosmética complexa' };
  }
  if (!pattern || /[^\x20-\x7e]/.test(pattern) || pattern.startsWith('||*') || pattern.length > 2048) return { kind: 'unsupported', reason: 'padrão URL inválido' };
  const inc = [...new Set(yesTypes)].filter(x => !noTypes.includes(x)).sort();
  if (yesTypes.length && !inc.length) return { kind: 'unsupported', reason: 'tipos contraditórios' };
  if (inc.length) condition.resourceTypes = inc;
  else condition.resourceTypes = ALL_TYPES.filter(x => (all || x !== 'main_frame') && !noTypes.includes(x));
  // Main-frame blocking requires an explicit $document; avoids accidental navigation blocking.
  if (!condition.resourceTypes.length) return { kind: 'unsupported', reason: 'nenhum tipo' };
  condition.urlFilter = pattern;
  return { kind: 'network', priority: important ? 30 : exception ? 20 : 10, action: { type: exception ? 'allow' : 'block' }, condition, source, raw: line.trim() };
}
function evalCondition(expression, target) {
  const vars = { env_mv3: true, env_firefox: target === 'firefox', env_chromium: target !== 'firefox', env_edge: target === 'edge', cap_html_filtering: false, cap_user_stylesheet: true, cap_ipaddress: false, env_mobile: false, env_safari: false };
  const tokens = expression.match(/\|\||&&|!|\(|\)|[a-zA-Z_][\w]*/g) || [];
  if (tokens.join('') !== expression.replace(/\s+/g, '') || tokens.some(t => /^[a-zA-Z_]/.test(t) && !(t in vars))) return null;
  let i = 0;
  const primary = () => { const token = tokens[i++]; if (token === '!') return !primary(); if (token === '(') { const v = or(); if (tokens[i++] !== ')') throw Error(); return v; } if (token in vars) return vars[token]; throw Error(); };
  const and = () => { let v = primary(); while (tokens[i] === '&&') { i++; const r = primary(); v = v && r; } return v; };
  const or = () => { let v = and(); while (tokens[i] === '||') { i++; const r = and(); v = v || r; } return v; };
  try { const r = or(); return i === tokens.length ? r : null; } catch { return null; }
}
export function compileLists(lists, { target = 'chrome', maxRules = 29000, packagedFilters = YOUTUBE_PROFILE.rules } = {}) {
  const packaged = new Set(packagedFilters.map(([source, line]) => source + '\n' + line));
  const records = [], cosmetics = [], hideExceptions = [], report = {}, disabled = new Set();
  for (const { id, text } of lists) {
    if (new TextEncoder().encode(text).length > LIMITS.inputBytes) throw new Error('Lista muito grande: ' + id);
    const stats = report[id] = { lines: 0, network: 0, cosmetic: 0, packaged: 0, unsupported: 0, conditional: 0, reasons: {}, samples: [] };
    const stack = []; const lines = text.split(/\r?\n/); if (lines.length > LIMITS.lines) throw new Error('Muitas linhas: ' + id);
    for (const raw of lines) {
      stats.lines++; const line = raw.trim();
      if (line.startsWith('!#if ')) { stack.push({ value: evalCondition(line.slice(5), target), alternative: false }); continue; }
      if (line === '!#else') { if (!stack.length || stack.at(-1).alternative) throw new Error('Condicional inválido: ' + id); stack.at(-1).alternative = true; continue; }
      if (line === '!#endif') { if (!stack.length) throw new Error('Condicional inválido: ' + id); stack.pop(); continue; }
      if (stack.some(s => s.value === null || (s.alternative ? s.value : !s.value))) { if (line && !line.startsWith('!')) stats.conditional++; continue; }
      if (line.startsWith('!#include ')) { stats.unsupported++; stats.reasons['include não expandido'] = (stats.reasons['include não expandido'] || 0) + 1; continue; }
      if (packaged.has(id + '\n' + line)) { stats.packaged++; continue; }
      const parsed = parseLine(line, id);
      if (parsed.kind === 'badfilter') { disabled.add(parsed.target); continue; }
      if (parsed.kind === 'network') { records.push(parsed); stats.network++; }
      if (parsed.kind === 'cosmetic') { cosmetics.push(parsed); stats.cosmetic++; }
      if (parsed.kind === 'hideException') hideExceptions.push(parsed);
      if (parsed.kind === 'unsupported') { stats.unsupported++; stats.reasons[parsed.reason] = (stats.reasons[parsed.reason] || 0) + 1; if (stats.samples.length < 6) stats.samples.push({ line: line.slice(0, 250), reason: parsed.reason }); }
    }
    if (stack.length) throw new Error('Condicional incompleto: ' + id);
  }
  const exact = new Map(), domainGroups = new Map(); let duplicates = 0, disabledCount = 0;
  for (const r of records) {
    if (disabled.has(r.raw)) { disabledCount++; continue; }
    const rule = { priority: r.source === 'custom' ? r.priority + 100000 : r.priority, action: r.action, condition: r.condition };
    const key = stable(rule);
    if (exact.has(key)) { duplicates++; continue; }
    exact.set(key, { rule, source: r.source, filter: r.raw });
  }
  const items = [];
  for (const entry of exact.values()) {
    const m = /^\|\|([a-z0-9.-]+)\^$/.exec(entry.rule.condition.urlFilter);
    if (!m || !validHost(m[1]) || entry.rule.condition.requestDomains || entry.rule.condition.isUrlFilterCaseSensitive) { items.push({ rule: entry.rule, origins: [{ source: entry.source, filter: entry.filter }] }); continue; }
    const condition = { ...entry.rule.condition }; delete condition.urlFilter;
    const k = stable({ ...entry.rule, condition });
    if (!domainGroups.has(k)) domainGroups.set(k, { template: { ...entry.rule, condition }, hosts: new Map() });
    domainGroups.get(k).hosts.set(m[1], { source: entry.source, filter: entry.filter, host: m[1] });
  }
  for (const { template, hosts } of domainGroups.values()) {
    const entries = [...hosts.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (let i = 0; i < entries.length; i += 500) { const chunk = entries.slice(i, i + 500); items.push({ rule: { ...template, condition: { ...template.condition, requestDomains: chunk.map(e => e[0]) } }, origins: chunk.map(e => e[1]) }); }
  }
  items.sort((a, b) => stable(a.rule).localeCompare(stable(b.rule)));
  if (items.length > maxRules) throw new Error(`São necessárias ${items.length} regras; limite disponível ${maxRules}. A configuração anterior foi mantida. Desative uma lista opcional.`);
  const uniqueCosmetic = [...new Map(cosmetics.map(c => [stable(c), c])).values()];
  if (uniqueCosmetic.length > LIMITS.selectors) throw new Error('Limite de seletores excedido; configuração anterior mantida.');
  return { rules: items.map((x, i) => ({ id: i + 1, ...x.rule })), provenance: items.map(x => x.origins), cosmetics: uniqueCosmetic, hideExceptions, report, stats: { networkFilters: records.length - disabledCount - duplicates, nativeRules: items.length, cosmetics: uniqueCosmetic.length, duplicates, badfilters: disabledCount, unsupported: Object.values(report).reduce((a, s) => a + s.unsupported, 0) } };
}
export function cosmeticSelectors(compiled, host, generic) {
  const exception = compiled.hideExceptions.filter(x => domainMatches(host, x.domain));
  if (exception.some(x => x.mode === 'all')) return [];
  const useGeneric = generic && !exception.some(x => x.mode === 'generic');
  const relevant = compiled.cosmetics.filter(c => (!c.include.length || c.include.some(d => domainMatches(host, d))) && !c.exclude.some(d => domainMatches(host, d)));
  const except = new Set(relevant.filter(c => c.exception).map(c => c.selector));
  return [...new Set(relevant.filter(c => !c.exception && (c.include.length || useGeneric) && !except.has(c.selector)).map(c => c.selector))];
}
