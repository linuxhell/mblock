// SPDX-License-Identifier: GPL-3.0-only
export async function readBundle(load) {
  const index = await load('data/default.json');
  const compiled = { ...index.compiled };
  for (const field of ['rules', 'provenance', 'cosmetics']) {
    compiled[field] = [];
    for (const file of index.parts[field]) compiled[field].push(...await load(file));
  }
  const texts = [];
  for (const source of index.texts) { const parts = []; for (const file of source.parts) parts.push(await load(file)); texts.push({ id: source.id, text: parts.join('') }); }
  return { compiled, sources: index.sources, texts };
}
