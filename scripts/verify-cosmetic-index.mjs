// Verify the storage optimization against every domain in the real list corpus.
import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{resolve,join}from'node:path';
import {readBundle}from'../src/shared/bundle.js';import{cosmeticIndex,cosmeticKeys}from'../src/shared/cosmetic-index.js';import{cosmeticSelectors}from'../src/shared/compiler.js';
const {compiled}=await readBundle(async file=>JSON.parse(await readFile(join(resolve(process.argv[2]||'dist/chrome'),file),'utf8')));
const before=new Map(),hosts=new Set(['unknown.mblock.test']);
for(const item of compiled.cosmetics){for(const domain of(item.include.length?item.include:[item.exception?'!global':'*'])){if(!before.has(domain))before.set(domain,[]);before.get(domain).push(item);}for(const domain of [...item.include,...item.exclude]){hosts.add(domain);hosts.add('mblock-test.'+domain);}}
const after=cosmeticIndex(compiled.cosmetics);let checked=0;
// Global buckets and hide exceptions do not change. Compare every scoped bucket
// without re-evaluating thousands of identical global filters for every host.
for(const key of ['*','!global'])assert.deepEqual(after.get(key),before.get(key));
for(const host of hosts)for(const generic of[false,true]){
 const keys=cosmeticKeys(host,generic).filter(k=>k!=='*'&&k!=='!global'),select=index=>cosmeticSelectors({hideExceptions:[],cosmetics:keys.flatMap(k=>index.get(k)||[])},host,generic);
 assert.deepEqual(select(after),select(before),host+':'+generic);checked++;
}
const size=index=>[...index.values()].reduce((n,items)=>n+Buffer.byteLength(JSON.stringify(items)),0);
console.log(JSON.stringify({equivalent:true,hosts:hosts.size,selectorComparisons:checked,beforeBytes:size(before),afterBytes:size(after)}));
