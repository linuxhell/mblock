import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot, boundedWrites } from '../src/shared/snapshot-storage.js';
test('immutable lists share one stored payload across settings and rollback', () => {
 const compiled={rules:[{id:1,action:{type:'block'},condition:{urlFilter:'ads'}}],provenance:[],cosmetics:[]};
 const original={at:'first',compiled,texts:[{id:'list',text:'ads'}],settings:{enabled:true},sources:[],rules:[...compiled.rules,{id:2,action:{type:'allow'}}]};
 const next={...original,at:'next',settings:{enabled:false}};
 const a=encodeSnapshot(original), b=encodeSnapshot(next);
 assert.equal(a.record.dataKey,b.record.dataKey);
 assert.equal(a.record.compiled,undefined);assert.equal(a.record.texts,undefined);assert.equal(a.record.rules,undefined);
 assert.deepEqual(decodeSnapshot(a.record,structuredClone(a.data)),original);
 assert.deepEqual(decodeSnapshot(b.record,structuredClone(b.data)),next);
 assert.notEqual(encodeSnapshot({...original,compiled:structuredClone(compiled)}).record.dataKey,a.record.dataKey);
});
test('an unavailable shared payload fails explicitly instead of losing filters', () => {
 assert.throws(()=>decodeSnapshot({storageFormat:'shared-v1'},null),/indisponíveis/);
});
test('bulk writes keep at most 32 cloned requests pending and finish all records', () => {
 const queue=[];let pending=0,peak=0,written=0,aborted=false;
 function* operations(){for(let i=0;i<10000;i++)yield ()=>{const request={};queue.push(request);pending++;written++;peak=Math.max(peak,pending);return request;};}
 boundedWrites({abort(){aborted=true;}},operations());
 while(queue.length){const request=queue.shift();pending--;request.onsuccess();}
 assert.equal(written,10000);assert.equal(peak,32);assert.equal(pending,0);assert.equal(aborted,false);
});
