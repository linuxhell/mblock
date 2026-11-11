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
test('FC Portables fix matches the observed rotating loader and fallback but not normal scripts',()=>{
 const r=builtInRules({})[0];const re=new RegExp(r.condition.regexFilter);
 assert.ok(re.test('https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=3.7.1'));
 assert.ok(re.test('https://www.fcportables.com/a1bc2d/app.fb71facc6f58dac3.js?ver=1.2.3'));
 assert.ok(!re.test('https://www.fcportables.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1'));
 assert.ok(!re.test('https://evilfcportables.com/a1bc2d/fb71facc6f58dac3.js?ver=1.2.3'));
 assert.equal(builtInRules({fixes:false}).length,0);
});
