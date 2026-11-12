import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactProvenance, originsForRule } from '../src/shared/provenance.js';
import { compileLists } from '../src/shared/compiler.js';
test('provenance compaction reconstructs exact sources, filters and hosts, including legacy/fallback forms', () => {
 const original={rules:[{id:1,condition:{requestDomains:['a.example','b.example','c.example']}}],provenance:[[
  {source:'easylist',filter:'||a.example^$script,third-party',host:'a.example'},
  {source:'easylist',filter:'||b.example^$script,third-party',host:'b.example'},
  {source:'hosts',filter:'0.0.0.0 c.example',host:'c.example'},
  {source:'custom',filter:'||path.example/ad.js$script'},
  {source:'future',filter:'ads',host:'future.example',extra:'preserve'}
 ]]};
 const compact=compactProvenance(original);
 assert.deepEqual(originsForRule(compact,1),original.provenance[0]);
 assert.equal(compact.provenanceEncoding.suffixes.length,1);
 assert.equal(compact.provenanceEncoding.sources.filter(x=>x==='easylist').length,1);
 assert.equal(compactProvenance(compact),compact);
 assert.deepEqual(originsForRule(original,1),original.provenance[0]);
 assert.equal(originsForRule(compact,2),undefined);
});
test('grouped compilation preserves diagnostic evidence for every original filter', () => {
 const lines=Array.from({length:1200},(_,i)=>`||host${i}.example^$script,third-party`);
 const compiled=compileLists([{id:'test',text:lines.join('\n')}]);
 const origins=compiled.rules.flatMap(rule=>originsForRule(compiled,rule.id));
 assert.deepEqual(origins.map(o=>o.filter).sort(),[...lines].sort());
 assert.ok(origins.every(o=>o.source==='test' && o.host));
 assert.ok(JSON.stringify(compiled.provenance).length < JSON.stringify(origins).length/2);
});
