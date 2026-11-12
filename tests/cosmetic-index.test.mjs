import {test} from 'node:test';import assert from 'node:assert/strict';
import {cosmeticIndex,cosmeticKeys} from '../src/shared/cosmetic-index.js';
import {compileLists,cosmeticSelectors} from '../src/shared/compiler.js';
test('domain buckets preserve generic, scoped and excluded selectors and exceptions',()=>{
 const compiled=compileLists([{id:'fixture',text:'##.generic\na.example,b.example##.ad\na.example,~sub.a.example##.except-sub\na.example,b.example#@#.generic\n~b.example##.all-but-b\n@@||disabled.example^$elemhide\n@@||specific.example^$generichide'}]);
 const original=structuredClone(compiled.cosmetics),index=cosmeticIndex(compiled.cosmetics);
 for(const host of ['a.example','sub.a.example','b.example','sub.b.example','unknown.example','disabled.example','specific.example'])for(const generic of [false,true]){
  const cosmetics=cosmeticKeys(host,generic).flatMap(key=>index.get(key)||[]);
  assert.deepEqual(cosmeticSelectors({...compiled,cosmetics},host,generic).sort(),cosmeticSelectors(compiled,host,generic).sort(),host+':'+generic);
 }
 assert.deepEqual(compiled.cosmetics,original);assert.ok(index.get('a.example').every(item=>item.include.length<=1));
});
