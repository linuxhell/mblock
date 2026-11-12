// SPDX-License-Identifier: GPL-3.0-only
// Share immutable filter data across active, previous and pending configurations.
// Weak keys do not keep a compiled ruleset alive after an operation completes.
const keys = new WeakMap();
export function encodeSnapshot(snapshot) {
  let dataKey = keys.get(snapshot.compiled);
  if (!dataKey) { dataKey = 'data:' + crypto.randomUUID(); keys.set(snapshot.compiled, dataKey); }
  const { compiled, texts, rules, ...configuration } = snapshot;
  return {
    record: { ...configuration, storageFormat:'shared-v1', dataKey, extraRules:rules.slice(compiled.rules.length) },
    data: { compiled, texts }
  };
}
export function decodeSnapshot(record, data) {
  if (!data?.compiled || !Array.isArray(data.texts)) throw new Error('Dados do snapshot indisponíveis.');
  const { storageFormat, dataKey, extraRules, ...configuration } = record;
  keys.set(data.compiled, dataKey);
  return { ...configuration, ...data, rules:[...data.compiled.rules, ...extraRules] };
}
// A transaction stays live while requests are pending or their success handlers
// run. Refill inside those handlers, rather than enqueueing every cloned record.
export function boundedWrites(transaction, operations, limit = 32) {
  const iterator = operations[Symbol.iterator]();
  function next() {
    try {
      const item = iterator.next(); if (item.done) return;
      item.value().onsuccess = next;
    } catch { transaction.abort(); }
  }
  for (let i = 0; i < limit; i++) next();
}

export function updatePreferencesOnly(patch) {
  const fields = Object.keys(patch);
  return fields.length > 0 && fields.every(key => ['autoUpdate','intervalHours'].includes(key));
}
