// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readBundle } from '../src/shared/bundle.js';
import { originsForRule } from '../src/shared/provenance.js';
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw Error('Use: node scripts/verify-equivalence.mjs BEFORE AFTER');
async function bundle(path) { return readBundle(async file => JSON.parse(await readFile(join(resolve(path), file), 'utf8'))); }
const before = await bundle(beforePath), after = await bundle(afterPath);
for (const key of ['rules','cosmetics','hideExceptions','stats','report']) assert.deepEqual(after.compiled[key], before.compiled[key], key + ' changed');
assert.deepEqual(after.texts,before.texts,'Filter inputs changed');
let origins = 0;
for (const rule of before.compiled.rules) {
  const expected = originsForRule(before.compiled,rule.id);
  assert.deepEqual(originsForRule(after.compiled,rule.id),expected,'Provenance changed for rule ' + rule.id);
  origins += expected.length;
}
console.log(JSON.stringify({equivalent:true,nativeRules:before.compiled.rules.length,cosmeticFilters:before.compiled.cosmetics.length,originsVerified:origins}));
