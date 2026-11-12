// SPDX-License-Identifier: GPL-3.0-only
import { encodeSnapshot, decodeSnapshot, boundedWrites, updatePreferencesOnly } from './snapshot-storage.js';
import { originsForRule, expandOrigins } from './provenance.js';
import { nextConfigurationTime } from './control-state.js';
import { cosmeticIndex, cosmeticKeys } from './cosmetic-index.js';
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
  if (store === 'rules') return getRule(key);
  const record = await rawGet(store, key);
  if (record?.storageFormat !== 'shared-v1') return record; // Existing installs need no destructive migration.
  return decodeSnapshot(record, await rawGet('snapshots', record.dataKey));
}
async function getRule(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    // Read the rule and its dictionary from one consistent generation, even
    // when a filter update commits while the diagnostic is being requested.
    const tx = db.transaction(['rules','meta']);
    const rule = tx.objectStore('rules').get(key), encoding = tx.objectStore('meta').get('ruleProvenanceEncoding');
    let remaining = 2;
    function ready() {
      if (--remaining) return;
      const record = rule.result;
      try {
        if (!record?.originRow) { resolve(record); return; }
        if (!encoding.result) throw new Error('Origem de regra inválida.');
        resolve({rule:record.rule,origins:expandOrigins(record.originRow,record.rule,encoding.result)});
      } catch (error) { reject(error); }
    }
    rule.onsuccess = encoding.onsuccess = ready;
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
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
export async function commitPreferences(patch) {
  if (!updatePreferencesOnly(patch)) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta','snapshots'], 'readwrite');
    const active = tx.objectStore('snapshots').get('active'), metadata = tx.objectStore('meta').get('active');
    let remaining = 2, result = null;
    function ready() {
      if (--remaining || active.result?.storageFormat !== 'shared-v1' || !metadata.result) return;
      // Updating a download preference needs neither filter data nor native rules.
      // Both the new configuration and its rollback are committed atomically.
      const at = nextConfigurationTime(active.result.at), settings = {...active.result.settings,...patch};
      tx.objectStore('snapshots').put(active.result, 'previous');
      tx.objectStore('snapshots').put({...active.result,at,settings}, 'active');
      result = {...metadata.result,at,settings,hasPrevious:true};
      tx.objectStore('meta').put(result, 'active'); pruneData(tx);
    }
    active.onsuccess = metadata.onsuccess = ready;
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function configurationState() {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta','snapshots']),snapshot=tx.objectStore('snapshots').get('active'),metadata=tx.objectStore('meta').get('active');
    tx.oncomplete=()=>resolve({snapshot:snapshot.result,metadata:metadata.result});
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function putControlIntent(record) {
  if(record.storageFormat!=='shared-v1')throw Error('Configuração persistida inválida.');
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(record,'pending');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function commitControls(plan) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta','snapshots','rules'],'readwrite'),snapshots=tx.objectStore('snapshots'),rules=tx.objectStore('rules');
    snapshots.put(plan.previous,'previous');snapshots.put(plan.next,'active');tx.objectStore('meta').put(plan.metadata,'active');
    for(const rule of plan.previous.extraRules)rules.delete(rule.id);
    for(const rule of plan.next.extraRules)rules.put({rule,origins:[{source:'mblock',filter:'Controle local / correção específica'}]},rule.id);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function commitSnapshot(snapshot, previous, { cosmeticsChanged = true, rulesChanged = true } = {}) {
  const metadata={at:snapshot.at,engineVersion:snapshot.engineVersion,settings:snapshot.settings,sources:snapshot.sources,stats:{...snapshot.compiled.stats,nativeRules:snapshot.rules.length},report:snapshot.compiled.report,target:snapshot.target,hasPrevious:!!previous};
  const index = cosmeticsChanged ? cosmeticIndex(snapshot.compiled.cosmetics) : new Map();
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
      if (rulesChanged) for (const rule of snapshot.rules) yield () => {
        const row = snapshot.compiled.provenance[rule.id - 1];
        // Network rules retain compact tuples. Local controls and legacy
        // snapshots still accept the existing plain diagnostic records.
        const record = snapshot.compiled.provenanceEncoding && row ? {rule,originRow:row} : {rule,origins:originsForRule(snapshot.compiled,rule.id) || [{source:'mblock',filter:'Controle local / correção específica'}]};
        return rules.put(record, rule.id);
      };
    }
    if (rulesChanged) tx.objectStore('meta').put(snapshot.compiled.provenanceEncoding || null, 'ruleProvenanceEncoding');
    boundedWrites(tx, operations());
    tx.objectStore('meta').put(metadata, 'active');
    tx.objectStore('meta').put(snapshot.compiled.hideExceptions, 'hideExceptions');
    tx.oncomplete = () => resolve(metadata); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function getCosmeticData(host, generic = true) {
  const keys=cosmeticKeys(host,generic);
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['cosmetics','meta']),store=tx.objectStore('cosmetics');
    const requests=keys.map(key=>store.get(key)),exceptions=tx.objectStore('meta').get('hideExceptions');
    tx.oncomplete=()=>resolve({cosmetics:requests.flatMap(r=>r.result||[]),hideExceptions:exceptions.result||[]});
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function getCosmetics(host,generic=true){return (await getCosmeticData(host,generic)).cosmetics;}
