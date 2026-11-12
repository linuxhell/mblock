import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateAlarm, unchangedLists, validUpdateInterval } from '../src/shared/update-policy.js';
import { DEFAULT_SETTINGS } from '../src/shared/core.js';
import { exportRules, parseRuleFile } from '../src/shared/rule-transfer.js';
test('update scheduling preserves filter age across restarts and repairs stale bundles', () => {
 const now = Date.parse('2026-11-12T12:00:00Z'), settings = {...DEFAULT_SETTINGS, sourceIds:['a'], intervalHours:6};
 assert.equal(updateAlarm(settings,[{id:'a',fetchedAt:'2026-11-12T10:00:00Z'}],now).when,Date.parse('2026-11-12T16:00:00Z'));
 assert.equal(updateAlarm(settings,[{id:'a',fetchedAt:'2026-11-10T10:00:00Z'}],now).when,now+120000);
 assert.equal(updateAlarm(settings,[],now).when,now+120000);
 assert.equal(updateAlarm({...settings,autoUpdate:false},[],now),null);
});
test('configurable update intervals survive backup round trips and reject bad input', () => {
 for (const intervalHours of [1,6,12,24,48]) {
  const result = parseRuleFile(exportRules({...DEFAULT_SETTINGS,sourceIds:[],intervalHours},'json').content);
  assert.equal(result.configuration.intervalHours,intervalHours);
 }
 for (const value of [0,-1,0.5,3,'12',NaN,Infinity]) assert.equal(validUpdateInterval(value),false);
});
test('unchanged updates require matching identities and hashes for all sources', () => {
 const sources = [{id:'a',sha256:'a'},{id:'b',sha256:'b'}];
 assert.equal(unchangedLists(sources,[...sources].reverse()),true);
 assert.equal(unchangedLists(sources,[sources[0]]),false);
 assert.equal(unchangedLists(sources,[sources[0],{id:'b',sha256:'changed'}]),false);
});
