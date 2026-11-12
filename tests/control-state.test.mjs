import {test} from 'node:test';import assert from 'node:assert/strict';
import {controlsOnly,planControlChange,nextConfigurationTime,composeRules} from '../src/shared/control-state.js';
import {DEFAULT_SETTINGS,controlRules} from '../src/shared/core.js';import {builtInRules} from '../src/shared/fixes.js';
function state(){const settings={...DEFAULT_SETTINGS,sourceIds:['easylist']},extraRules=builtInRules(settings).map((r,i)=>({...r,id:101+i}));return {snapshot:{storageFormat:'shared-v1',dataKey:'data:test',at:'2026-11-12T00:00:00.000Z',settings,extraRules,sources:[]},metadata:{stats:{nativeRules:100+extraRules.length},settings}};}
test('control changes preserve the native base and match full rule construction',()=>{
 const before=state(),patch={enabled:false,sites:{'example.com':{paused:true}}},plan=planControlChange(before,patch);
 const expected=[...builtInRules(plan.next.settings),...controlRules(plan.next.settings)].map((r,i)=>({...r,id:101+i}));
 assert.equal(plan.base,100);assert.equal(plan.next.dataKey,before.snapshot.dataKey);assert.deepEqual(plan.next.extraRules,expected);
 assert.equal(plan.metadata.stats.nativeRules,100+expected.length);assert.equal(before.snapshot.settings.enabled,true);assert.notEqual(plan.next.transactionId,undefined);
});
test('filter changes and legacy data require the full compiler path',()=>{
 assert.equal(controlsOnly({antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderHost:'qbp5y.filecatchers.com'}]}),true);
 assert.ok(planControlChange(state(),{antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderHost:'qbp5y.filecatchers.com'}]}));
 for(const patch of [{},{customRules:'ads'},{sourceIds:[]},{enabled:false,sourceIds:[]}]){assert.equal(controlsOnly(patch),false);assert.equal(planControlChange(state(),patch),null);}
 assert.equal(planControlChange({snapshot:{},metadata:{}},{enabled:false}),null);
 const bad=state();bad.snapshot.extraRules[0].id=1;assert.throws(()=>planControlChange(bad,{enabled:false}),/inválida/);
});
test('configuration revisions advance even with coarse or reversed system clocks',()=>{
 const previous='2026-11-12T00:00:00.001Z';assert.equal(nextConfigurationTime(previous,Date.parse(previous)),'2026-11-12T00:00:00.002Z');
 assert.equal(nextConfigurationTime(previous,1),'2026-11-12T00:00:00.002Z');
});

test('composed snapshots reuse compiled rule objects instead of cloning the native base',()=>{
 const compiled=[{id:1,priority:10,action:{type:'block'},condition:{urlFilter:'ads'}},{id:2,priority:10,action:{type:'block'},condition:{urlFilter:'track'}}];
 const rules=composeRules(compiled,{...DEFAULT_SETTINGS});
 assert.equal(rules[0],compiled[0]);assert.equal(rules[1],compiled[1]);
 assert.ok(rules.length>compiled.length);assert.equal(rules[compiled.length].id,compiled.length+1);
});
