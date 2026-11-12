import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packFilterText, unpackFilterTexts } from '../src/shared/filter-text.js';
import { readBundle } from '../src/shared/bundle.js';
test('compressed filter texts preserve every byte and accept existing plain snapshots', async () => {
 const sources=[{id:'a',text:'\uFEFF! Português 中文\n||ads.example^$script\n'.repeat(10000)},{id:'b',text:'! legacy\r\n@@||example.com^'}];
 const packed=await packFilterText(sources[0]);assert.ok(packed.data.byteLength < Buffer.byteLength(sources[0].text)/10);
 assert.deepEqual(await unpackFilterTexts([structuredClone(packed),sources[1]]),sources);
 assert.equal(await unpackFilterTexts(sources),sources);
 await assert.rejects(()=>unpackFilterTexts([{...packed,data:new Uint8Array([0,1,2])}]));
});
test('packaged source text chunks may be persisted without expanding all lists together', async () => {
 const files={'data/default.json':{compiled:{},parts:{rules:[],provenance:[],cosmetics:[]},texts:[{id:'a',parts:['one','two']}],sources:[]},one:'first\n',two:'second\n'};
 const packed=await readBundle(async p=>files[p],{packText:packFilterText});
 assert.equal(packed.texts[0].text,undefined);
 assert.deepEqual(await unpackFilterTexts(packed.texts),[{id:'a',text:'first\nsecond\n'}]);
});
