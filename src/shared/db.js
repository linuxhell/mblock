// SPDX-License-Identifier: GPL-3.0-only
let opening;
export function openDB() {
  return opening ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('mblock-v1', 1);
    r.onupgradeneeded = () => { for (const name of ['meta', 'snapshots', 'cosmetics', 'rules']) r.result.createObjectStore(name); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => { opening = null; reject(r.error); };
  });
}
export async function get(store, key) { const db = await openDB(); return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export async function put(store, key, value) { const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
export async function commitSnapshot(snapshot, previous, { cosmeticsChanged = true, rulesChanged = true } = {}) {
  const index = new Map();
  if (cosmeticsChanged) for (const item of snapshot.compiled.cosmetics) {
    for (const domain of (item.include.length ? item.include : [item.exception ? '!global' : '*'])) { if (!index.has(domain)) index.set(domain, []); index.get(domain).push(item); }
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'snapshots', 'cosmetics', 'rules'], 'readwrite');
    const snapshots = tx.objectStore('snapshots'); snapshots.put(snapshot, 'active'); if (previous) snapshots.put(previous, 'previous');
    const cos = tx.objectStore('cosmetics'); if (cosmeticsChanged) cos.clear(); for (const [domain, items] of index) cos.put(items, domain);
    const rules = tx.objectStore('rules'); if (rulesChanged) { rules.clear(); for (const rule of snapshot.rules) rules.put({ rule, origins: snapshot.compiled.provenance[rule.id - 1] || [{ source: 'mblock', filter: 'Controle local / correção específica' }] }, rule.id); }
    tx.objectStore('meta').put({ at: snapshot.at, engineVersion: snapshot.engineVersion, settings: snapshot.settings, sources: snapshot.sources, stats: { ...snapshot.compiled.stats, nativeRules: snapshot.rules.length }, report: snapshot.compiled.report, target: snapshot.target, hasPrevious: !!previous }, 'active');
    tx.objectStore('meta').put(snapshot.compiled.hideExceptions, 'hideExceptions');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function getCosmetics(host, generic = true) {
  const parts = host.split('.'), keys = generic ? ['*', '!global'] : ['!global'];
  while (parts.length >= 2) { keys.push(parts.join('.')); parts.shift(); }
  const lists = await Promise.all(keys.map(k => get('cosmetics', k)));
  return lists.flatMap(x => x || []);
}
