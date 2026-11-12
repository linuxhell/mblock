import { test } from 'node:test';import assert from 'node:assert/strict';
import { analyzeEvidence } from '../src/shared/assistant.js';
test('YouTube analysis separates ad playback from anti-adblock warnings and reports the packaged profile',()=>{
 const result=analyzeEvidence({url:'https://www.youtube.com/',markers:[],scripts:[],warningPresent:false},{enabled:true,youtube:true,sites:{}},{youtubeProfile:{id:'youtube-v1',count:42,hash:'fixture'},youtubeRegistered:true,youtubePlayer:{playerPresent:true,adPlaying:true}});
 assert.equal(result.unknownMechanism,false);assert.equal(result.warningPresent,false);assert.equal(result.youtube.player.adPlaying,true);assert.equal(result.youtube.packagedFilters,42);assert.equal(result.generativeAI,false);assert.equal(result.canAutomaticallyRepair,false);
});
test('YouTube registration does not imply the current document received the profile',()=>{
 const evidence={url:'https://www.youtube.com/',markers:[],scripts:[]},settings={enabled:true,youtube:true,sites:{}},runtime={youtubeProfile:{id:'youtube-v1',count:42,hash:'current'},youtubeRegistered:true};
 const old=analyzeEvidence(evidence,settings,runtime);assert.equal(old.youtube.applied,false);assert.equal(old.proposals[0].enabled,false);assert.equal(old.canApplyKnownFix,true);
 const active=analyzeEvidence(evidence,settings,{...runtime,youtubePlayback:{active:true,profileHash:'current',skipClicks:1}});assert.equal(active.youtube.applied,true);assert.equal(active.proposals[0].enabled,true);assert.equal(active.canApplyKnownFix,false);
 const stale=analyzeEvidence(evidence,settings,{...runtime,youtubePlayback:{active:true,profileHash:'old'}});assert.equal(stale.youtube.applied,false);
 const paused=analyzeEvidence(evidence,{...settings,enabled:false},runtime);assert.equal(paused.proposals[0].available,false);assert.equal(paused.canApplyKnownFix,false);
});
test('known engine classification requires evidence and does not claim a model or version',()=>{
 const result=analyzeEvidence({url:'https://www.fcportables.com/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=redacted']},{});
 assert.equal(result.generativeAI,false);assert.equal(result.engines[0].confidence,'high');assert.equal(result.engines[0].version,'not verified');assert.equal(result.proposals.length,1);
});
test('a warning alone never generates a rule or confidently names an engine',()=>{
 const result=analyzeEvidence({url:'https://unknown.example/',markers:[],scripts:[],warningPresent:true},{});
 assert.equal(result.engines.length,0);assert.equal(result.proposals.length,0);assert.equal(result.canAutomaticallyRepair,false);
});
test('known packaged AntiAdblockCore redirect is global once the reviewed family signature is observed',()=>{
 const result=analyzeEvidence({url:'https://other.example/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=redacted']},{});
 assert.equal(result.engines.length,1);assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].id,'antiadblock-core-v4');
});

test('FileCatchers AntiAdblockCore fix depends on engine markers, not loader URL shape',()=>{
 const result=analyzeEvidence({url:'https://www.filecatchers.com/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://cdn.filecatchers.com/static/site.js']},{fixes:false,sites:{}});
 assert.equal(result.engines[0].confidence,'high');assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].id,'antiadblock-core-v4');assert.equal(result.canApplyKnownFix,true);
 const partial=analyzeEvidence({url:'https://www.filecatchers.com/',markers:['antiadblock-core loader'],scripts:[]},{fixes:false,sites:{}});
 assert.equal(partial.proposals.length,0);assert.equal(partial.canApplyKnownFix,false);
});

test('AntiAdblockCore known fix is global and does not depend on a domain allowlist',()=>{
 const sites=['https://www.filecatchers.com/','https://mirror.example/','https://downloads.example.net/'];
 for (const url of sites) {
  const result=analyzeEvidence({url,markers:['antiadblock-core loader','antiadblock-core meta'],scripts:['https://cdn.example/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=redacted']},{fixes:false,sites:{}});
  assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].id,'antiadblock-core-v4');assert.equal(result.canApplyKnownFix,true);
 }
});

test('AntiAdblockCore repair verifies redirect, overlay suppression or learned recovery without a warning',()=>{
 const base={url:'https://www.filecatchers.com/',markers:['antiadblock-core loader','antiadblock-core meta'],scripts:[],warningPresent:false,antiAdblockCore:{loaderUrl:'https://qbp5y.filecatchers.com/a/b/core.js',loaderHost:'qbp5y.filecatchers.com',fixState:'marker-active',overlayRemovals:0}};
 const unlearned=analyzeEvidence(base,{fixes:true,sites:{},antiAdblockCoreRules:[]});
 assert.equal(unlearned.proposals[0].enabled,false);assert.equal(unlearned.canApplyKnownFix,true);
 const recovered=analyzeEvidence(base,{fixes:true,sites:{},antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderHost:'qbp5y.filecatchers.com'}]});
 assert.equal(recovered.proposals[0].configured,true);assert.equal(recovered.proposals[0].learned,true);assert.equal(recovered.proposals[0].enabled,true);assert.equal(recovered.proposals[0].fixState,'recovery-active');assert.equal(recovered.proposals[0].verification,'document-start-recovery');assert.equal(recovered.canApplyKnownFix,false);
 const warned=analyzeEvidence({...base,warningPresent:true},{fixes:true,sites:{},antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderHost:'qbp5y.filecatchers.com'}]});
 assert.equal(warned.proposals[0].enabled,false);assert.equal(warned.proposals[0].verification,'pending');
 const redirected=analyzeEvidence({...base,antiAdblockCore:{...base.antiAdblockCore,fixState:'redirected'}},{fixes:true,sites:{},antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderHost:'qbp5y.filecatchers.com'}]});
 assert.equal(redirected.proposals[0].enabled,true);assert.equal(redirected.proposals[0].verification,'native-redirect');assert.match(redirected.nextStep,/verified/);
});
