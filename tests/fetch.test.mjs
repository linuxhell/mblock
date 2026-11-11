import {test} from 'node:test';import assert from 'node:assert/strict';
import {fetchList} from '../src/shared/fetch-lists.js';
const source={id:'test',name:'Test',url:'https://lists.example/filters/main.txt'};
test('recursive includes preserve content and hashes',async()=>{
 const files={'https://lists.example/filters/main.txt':'! list\n!#include child.txt\n||last.example^','https://lists.example/filters/child.txt':'||child.example^'};
 const r=await fetchList(source,async u=>new Response(files[u]));assert.ok(r.text.includes('||child.example^'));assert.equal(r.status.files,2);assert.match(r.status.sha256,/^[a-f0-9]{64}$/);
});
test('include traversal is rejected and never fetched',async()=>{
 let calls=0;await assert.rejects(()=>fetchList(source,async()=>{calls++;return new Response('!#include ../outside.txt')}),/origem permitida/);assert.equal(calls,1);
});
test('include cycles, HTML and HTTP errors reject the update',async()=>{
 await assert.rejects(()=>fetchList(source,async()=>new Response('!#include main.txt')),/cíclico/);
 await assert.rejects(()=>fetchList(source,async()=>new Response('<!doctype html><h1>Error</h1>')),/HTML/);
 await assert.rejects(()=>fetchList(source,async()=>new Response('bad',{status:503})),/503/);
});
