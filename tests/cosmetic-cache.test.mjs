import {test} from 'node:test';import assert from 'node:assert/strict';
import {CosmeticCache} from '../src/shared/cosmetic-cache.js';
test('cosmetic cache coalesces frames and bounds retained CSS by bytes and count',async()=>{
 const cache=new CosmeticCache({maxEntries:2,maxBytes:512});let calls=0;
 const loader=async()=>{calls++;return {css:'h1{}',selectors:1};};
 const values=await Promise.all([cache.load('a',loader),cache.load('a',loader)]);assert.equal(calls,1);assert.equal(values[0],values[1]);
 await cache.load('b',loader);await cache.load('a',loader);await cache.load('c',loader);
 assert.equal(cache.entries.has('b'),false);assert.equal(cache.entries.size,2);assert.ok(cache.bytes<=512);
 await cache.load('oversized',async()=>({css:'x'.repeat(1000),selectors:1}));assert.equal(cache.entries.has('oversized'),false);
});
test('an invalidated or failed lookup cannot populate a later generation',async()=>{
 const cache=new CosmeticCache();let finish;
 const first=cache.load('a',()=>new Promise(resolve=>{finish=resolve;}));await Promise.resolve();cache.clear();
 await cache.load('a',async()=>({css:'new',selectors:1}));finish({css:'old',selectors:1});await first;
 assert.equal((await cache.load('a',()=>{throw Error('should be cached');})).css,'new');
 await assert.rejects(()=>cache.load('failure',async()=>{throw Error('offline');}),/offline/);assert.equal(cache.pending.size,0);
 assert.equal((await cache.load('failure',async()=>({css:'',selectors:0}))).selectors,0);
});
