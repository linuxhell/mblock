import { test } from 'node:test';import assert from 'node:assert/strict';
import { analyzeEvidence } from '../src/shared/assistant.js';
test('known engine classification requires evidence and does not claim a model or version',()=>{
 const result=analyzeEvidence({url:'https://www.fcportables.com/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=redacted']},{});
 assert.equal(result.generativeAI,false);assert.equal(result.engines[0].confidence,'high');assert.equal(result.engines[0].version,'not verified');assert.equal(result.proposals.length,1);
});
test('a warning alone never generates a rule or confidently names an engine',()=>{
 const result=analyzeEvidence({url:'https://unknown.example/',markers:[],scripts:[],warningPresent:true},{});
 assert.equal(result.engines.length,0);assert.equal(result.proposals.length,0);assert.equal(result.canAutomaticallyRepair,false);
});
test('known packaged redirect is restricted to the verified site',()=>{
 const result=analyzeEvidence({url:'https://other.example/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=redacted']},{});
 assert.equal(result.engines.length,1);assert.equal(result.proposals.length,0);
});
