import { test } from 'node:test';import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/shared/core.js';
import { exportRules, parseRuleFile, planImport, normalizeRules } from '../src/shared/rule-transfer.js';
const settings={...DEFAULT_SETTINGS,sourceIds:['easylist'],sites:{'site.example':{paused:true}},customRules:'||old.example^\n'};
test('JSON backup round trip preserves personal rules, sites and known preferences',()=>{
 const file=exportRules({...settings,youtube:false,fixes:false},'json');const parsed=parseRuleFile(file.content);
 assert.equal(parsed.format,'json');assert.equal(parsed.customRules,settings.customRules);assert.equal(parsed.configuration.youtube,false);assert.equal(parsed.configuration.fixes,false);assert.deepEqual(parsed.configuration.sites,settings.sites);
 assert.ok(!file.content.includes('journal'));assert.ok(!file.content.includes('userAgent'));
});
test('TXT export imports as plain filter data with ABP headers and BOM/CRLF support',()=>{
 assert.equal(parseRuleFile(exportRules(settings,'txt').content).format,'txt');assert.equal(parseRuleFile('\uFEFF[Adblock Plus 2.0]\r\n||ads.example^\r\n').customRules,'[Adblock Plus 2.0]\n||ads.example^\n');
});
test('merge deduplicates, while replacement removes previous personal rules',()=>{
 const content='||old.example^\n||new.example^\n';const merged=planImport(content,settings);assert.equal(merged.summary.duplicates,1);assert.ok(merged.patch.customRules.includes('||old.example^'));assert.ok(merged.patch.customRules.includes('||new.example^'));
 const replaced=planImport('||new.example^',settings,{mode:'replace'});assert.ok(!replaced.patch.customRules.includes('||old.example^'));
});
test('preferences can be omitted; merged backups retain unrelated site profiles',()=>{
 const file=exportRules({...settings,sites:{'new.example':{youtube:false}},sourceIds:['quick'],enabled:false},'json');
 const onlyRules=planImport(file.content,settings,{includeSettings:false});assert.equal(onlyRules.patch.enabled,undefined);assert.equal(onlyRules.patch.sites,undefined);
 const full=planImport(file.content,settings);assert.equal(full.patch.enabled,false);assert.deepEqual(full.patch.sourceIds,['easylist','quick']);assert.ok(full.patch.sites['site.example']);assert.ok(full.patch.sites['new.example']);
});
test('unsupported rule samples are visible before applying an import',()=>{
 const result=planImport('||ads.example^\nyoutube.com##+js(unknown, x)',settings);assert.equal(result.summary.incomingNetwork,1);assert.equal(result.summary.unsupported,1);assert.equal(result.summary.unsupportedSamples.length,1);
});
test('malformed JSON, foreign JSON and unknown source URLs cannot become settings',()=>{
 for(const raw of ['{broken','{"schema":"mblock-diagnostic-v1"}',JSON.stringify({schema:'mblock-rules-v1',schemaVersion:1,configuration:{customRules:'',sourceIds:['https://evil.example/list']}})])assert.throws(()=>parseRuleFile(raw));
 assert.throws(()=>parseRuleFile('{"schema":"mblock-rules-v1","schemaVersion":1,"configuration":{"customRules":"","sites":{"__proto__":{"polluted":true}}}}'));
 assert.equal(Object.prototype.polluted,undefined);
});
test('invalid profile options, excessive file sizes and control characters reject safely',()=>{
 assert.throws(()=>parseRuleFile(JSON.stringify({schema:'mblock-rules-v1',schemaVersion:1,configuration:{customRules:'',sites:{'safe.example':{paused:'false'}}}})));
 assert.throws(()=>normalizeRules('a\0b'),/controle/);assert.throws(()=>normalizeRules('x'.repeat(2*1024*1024+1)),/2 MiB/);assert.throws(()=>parseRuleFile('x'.repeat(6*1024*1024+1)),/6 MiB/);
});
