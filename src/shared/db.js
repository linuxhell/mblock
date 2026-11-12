// SPDX-License-Identifier: GPL-3.0-only
import { encodeSnapshot, decodeSnapshot, boundedWrites } from './snapshot-storage.js';
let opening;
export function openDB() {
  return opening ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('mblock-v1', 1);
    r.onupgradeneeded = () => { for (const name of ['meta', 'snapshots', 'cosmetics', 'rules']) r.result.createObjectStore(name); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => { opening = null; reject(r.error); };
  });
}
async function rawGet(store, key) { const db = await openDB(); return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export async function get(store, key) {
  const record = await rawGet(store, key);
  if (record?.storageFormat !== 'shared-v1') return record; // Existing installs need no destructive migration.
  return decodeSnapshot(record, await rawGet('snapshots', record.dataKey));
}
function ensureData(store, encoded) {
  const request = store.getKey(encoded.record.dataKey);
  request.onsuccess = () => { if (request.result === undefined) store.put(encoded.data, encoded.record.dataKey); };
}
function pruneData(transaction) {
  const snapshots = transaction.objectStore('snapshots'), keep = new Set(); let remaining = 3;
  for (const [store, key] of [['snapshots','active'],['snapshots','previous'],['meta','pending']]) {
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => {
      if (request.result?.dataKey) keep.add(request.result.dataKey);
      if (--remaining) return;
      const cursor = snapshots.openKeyCursor(IDBKeyRange.bound('data:', 'data:\uffff'));
      cursor.onsuccess = () => { const current = cursor.result; if (!current) return; if (!keep.has(current.key)) snapshots.delete(current.key); current.continue(); };
    };
  }
}
export async function put(store, key, value) {
  const db = await openDB(), pending = store === 'meta' && key === 'pending';
  const encoded = pending && value ? encodeSnapshot(value) : null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(pending ? ['meta','snapshots'] : [store], 'readwrite');
    if (encoded) ensureData(tx.objectStore('snapshots'), encoded);
    tx.objectStore(store).put(encoded ? encoded.record : value, key);
    if (pending && !value) pruneData(tx);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function remove(store, key) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function prunePickerSessions(now = Date.now()) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('meta', 'readwrite');
    const request = tx.objectStore('meta').openCursor(IDBKeyRange.bound('picker:', 'picker:\uffff'));
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (!cursor.value || cursor.value.until <= now) cursor.delete(); cursor.continue(); };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function commitSnapshot(snapshot, previous, { cosmeticsChanged = true, rulesChanged = true } = {}) {
  const index = new Map();
  if (cosmeticsChanged) for (const item of snapshot.compiled.cosmetics) {
    for (const domain of (item.include.length ? item.include : [item.exception ? '!global' : '*'])) { if (!index.has(domain)) index.set(domain, []); index.get(domain).push(item); }
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'snapshots', 'cosmetics', 'rules'], 'readwrite');
    const snapshots = tx.objectStore('snapshots'), active = encodeSnapshot(snapshot);
    ensureData(snapshots, active); snapshots.put(active.record, 'active');
    if (previous) { const prior = encodeSnapshot(previous); ensureData(snapshots, prior); snapshots.put(prior.record, 'previous'); }
    const cos = tx.objectStore('cosmetics'); if (cosmeticsChanged) cos.clear();
    const rules = tx.objectStore('rules'); if (rulesChanged) rules.clear();
    function* operations() {
      for (const [domain, items] of index) yield () => cos.put(items, domain);
      if (rulesChanged) for (const rule of snapshot.rules) yield () => rules.put({ rule, origins:snapshot.compiled.provenance[rule.id - 1] || [{ source:'mblock', filter:'Controle local / correção específica' }] }, rule.id);
    }
    boundedWrites(tx, operations());
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
