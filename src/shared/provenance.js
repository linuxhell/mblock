// SPDX-License-Identifier: GPL-3.0-only
// Lossless dictionaries: domain groups already contain their hostnames in rules.
// Keep one copy of common source names and option suffixes, not one per origin.
export function compactProvenance(compiled) {
  if (compiled.provenanceEncoding) return compiled;
  const sources = [], suffixes = [], sourceIds = new Map(), suffixIds = new Map();
  function intern(value, values, ids) { if (!ids.has(value)) { ids.set(value, values.length); values.push(value); } return ids.get(value); }
  const provenance = compiled.provenance.map((origins, index) => {
    const hosts = new Map((compiled.rules[index]?.condition.requestDomains || []).map((host, i) => [host, i]));
    return origins.map(origin => {
      if (typeof origin.source !== 'string' || typeof origin.filter !== 'string' || Object.keys(origin).some(k => !['source','filter','host'].includes(k))) return [2, origin];
      const source = intern(origin.source, sources, sourceIds);
      if (!('host' in origin)) return [1, source, origin.filter];
      const prefix = '||' + origin.host;
      if (hosts.has(origin.host) && origin.filter.startsWith(prefix + '^')) return [0, source, hosts.get(origin.host), intern(origin.filter.slice(prefix.length), suffixes, suffixIds)];
      return [2, origin];
    });
  });
  return {...compiled, provenance, provenanceEncoding:{version:1,sources,suffixes}};
}
export function originsForRule(compiled, id) {
  const row = compiled.provenance[id - 1];
  if (!row || !compiled.provenanceEncoding) return row;
  const encoding = compiled.provenanceEncoding;
  if (encoding.version !== 1) throw new Error('Formato de proveniência não suportado.');
  return row.map(item => {
    if (item[0] === 2) return item[1];
    const source = encoding.sources[item[1]];
    if (typeof source !== 'string') throw new Error('Origem de regra inválida.');
    if (item[0] === 1 && typeof item[2] === 'string') return {source,filter:item[2]};
    const host = compiled.rules[id - 1]?.condition.requestDomains?.[item[2]], suffix = encoding.suffixes[item[3]];
    if (item[0] !== 0 || typeof host !== 'string' || typeof suffix !== 'string') throw new Error('Origem de regra inválida.');
    return {source,filter:'||' + host + suffix,host};
  });
}
