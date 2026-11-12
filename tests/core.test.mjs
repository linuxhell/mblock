import { test } from 'node:test';import assert from 'node:assert/strict';
import { hostFromURL, domainMatches, sitePolicy, controlRules, redactURL, RingBuffer, DEFAULT_SETTINGS } from '../src/shared/core.js';
import { builtInRules } from '../src/shared/fixes.js';
test('domain matching has a label boundary',()=>{assert.equal(domainMatches('a.example.com','example.com'),true);assert.equal(domainMatches('notexample.com','example.com'),false);assert.equal(hostFromURL('chrome://extensions'),'');});
test('nested site profiles inherit settings and can explicitly re-enable a child',()=>{
 const settings={...DEFAULT_SETTINGS,sites:{'example.com':{paused:true,generic:true},'sub.example.com':{cosmetic:false},'on.example.com':{paused:false}}};
 assert.equal(sitePolicy(settings,'sub.example.com').paused,true);assert.equal(sitePolicy(settings,'sub.example.com').cosmetic,false);assert.equal(sitePolicy(settings,'on.example.com').paused,false);
 const rules=controlRules(settings);assert.deepEqual(rules[0].condition.excludedRequestDomains,['on.example.com']);
});
test('redaction removes credentials, query values, fragments and paths by default',()=>{
 const u='https://user:password@example.com/private/token?access_token=secret&email=private#key';
 assert.equal(redactURL(u),'https://example.com/[caminho]');
 const detail=redactURL(u,true);assert.ok(detail.includes('/private/token'));for(const x of ['password','secret','private#','user:'])assert.ok(!detail.includes(x));assert.ok(detail.includes('access_token=…'));
});
test('ring buffer remains bounded and reports dropped events',()=>{const r=new RingBuffer(2);r.push(1);r.push(2);r.push(3);assert.deepEqual(r.entries,[2,3]);assert.equal(r.dropped,1);r.clear();assert.equal(r.entries.length,0);});
test('global AntiAdblockCore fix matches reviewed rotating loaders but not normal scripts',()=>{
 const matches=url=>builtInRules({}).some(r=>new RegExp(r.condition.regexFilter).test(url));
 assert.ok(matches('https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=3.7.1'));
 assert.ok(matches('https://cdn.filecatchers.com/a1bc2d/app.fb71facc6f58dac3.js?ver=1.2.3'));
 assert.ok(matches('https://cdn.example.net/a1bc2d/app.fb71facc6f58dac3.js?ver=1.2.3'));
 assert.ok(!matches('https://www.fcportables.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1'));
 assert.ok(!matches('https://cdn.example.net/a1bc2d/app.1234.js?ver=1.2.3'));
 assert.equal(builtInRules({fixes:false}).length,0);
});

test('rule equality preserves key-independent semantics and notices every rule change', async () => {
 const {sameRules}=await import('../src/shared/core.js');
 const rules=[{id:1,priority:10,action:{type:'block'},condition:{urlFilter:'ads',resourceTypes:['script']}}];
 assert.equal(sameRules(rules,[{condition:{resourceTypes:['script'],urlFilter:'ads'},action:{type:'block'},priority:10,id:1}]),true);
 assert.equal(sameRules(rules,[]),false);
 for(const modified of [{...rules[0],id:2},{...rules[0],priority:20},{...rules[0],condition:{urlFilter:'different'}}]) assert.equal(sameRules(rules,[modified]),false);
 // A mismatch in length must not even inspect the potentially huge records.
 assert.equal(sameRules([{get id(){throw Error('must not serialize');}}],[]),false);
});

test('site policy exposes known-fix state and learned AntiAdblockCore loader creates a scoped redirect',()=>{
 const settings={...DEFAULT_SETTINGS,sites:{'example.com':{fixes:false}}};
 assert.equal(sitePolicy(settings,'www.example.com').fixes,false);
 const learned=builtInRules({...DEFAULT_SETTINGS,antiAdblockCoreRules:[{siteHost:'www.filecatchers.com',loaderUrl:'https://qbp5y.filecatchers.com/rotating/core.js'}]});
 const rule=learned.find(r=>r.condition.initiatorDomains?.includes('www.filecatchers.com'));
 assert.ok(rule);assert.equal(rule.action.type,'redirect');assert.match(rule.condition.regexFilter,/qbp5y/);
 assert.ok(new RegExp(rule.condition.regexFilter).test('https://qbp5y.filecatchers.com/rotating/core.js?v=1'));
 assert.ok(!new RegExp(rule.condition.regexFilter).test('https://qbp5y.filecatchers.com/rotating/other.js?v=1'));
});
