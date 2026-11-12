import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, compileLists, cosmeticSelectors, safeSelector } from '../src/shared/compiler.js';
const compile = (text, options) => compileLists([{ id: 'test', text }], options);
test('preserves domain, party and resource restrictions together', () => {
  const r = parseLine('||ads.example.com^$script,third-party,domain=news.example|~safe.news.example');
  assert.equal(r.kind, 'network'); assert.equal(r.condition.domainType, 'thirdParty');
  assert.deepEqual(r.condition.initiatorDomains, ['news.example']); assert.deepEqual(r.condition.excludedInitiatorDomains, ['safe.news.example']); assert.deepEqual(r.condition.resourceTypes, ['script']);
});
test('unknown options reject the whole rule instead of widening it', () => {
  for (const op of ['redirect=unknown.js', 'denyallow=foo.test', 'removeparam=secret', 'csp=script-src none', 'popup', 'not-a-modifier']) assert.equal(parseLine('||example.com^$script,' + op).kind, 'unsupported');
});
test('ordinary rules do not block main-frame navigation; explicit document/all do', () => {
  assert.ok(!parseLine('||ads.example^').condition.resourceTypes.includes('main_frame'));
  assert.deepEqual(parseLine('||malware.example^$doc').condition.resourceTypes, ['main_frame']);
  assert.ok(parseLine('||malware.example^$all').condition.resourceTypes.includes('main_frame'));
});
test('host grouping preserves options and does not group path filters', () => {
  const c = compile('||a.example^\n||b.example^\n||c.example^$script\n||d.example/path\n||a.example^');
  assert.equal(c.rules.length, 3); assert.equal(c.stats.duplicates, 1);
  assert.ok(c.rules.some(r => r.condition.requestDomains?.join() === 'a.example,b.example'));
  assert.ok(c.rules.some(r => r.condition.urlFilter === '||d.example/path'));
});
test('allow and important precedence is explicit; custom rules win subscribed rules', () => {
  const c = compileLists([{ id: 'list', text: '||ads.example^\n@@||ads.example/safe\n||ads.example/evil$important' }, { id: 'custom', text: '@@||ads.example^' }]);
  const priorities = c.rules.map(r => r.priority).sort((a,b) => a-b); assert.deepEqual(priorities, [10,20,30,100020]);
});
test('badfilter removes only its exact target including when it is the first modifier', () => {
  const c = compile('||x.example^$script\n||x.example^$badfilter,script\n||other.example^');
  assert.equal(c.stats.badfilters, 1); assert.equal(c.stats.networkFilters, 1);
});
test('known conditional environments and unknown branches are handled conservatively', () => {
  const text = '!#if env_firefox\n||firefox.example^\n!#else\n||chrome.example^\n!#endif\n!#if unknown_future_feature\n||one.example^\n!#else\n||two.example^\n!#endif';
  const a=compile(text,{target:'chrome'}), b=compile(text,{target:'firefox'});
  assert.deepEqual(a.rules[0].condition.requestDomains,['chrome.example']); assert.deepEqual(b.rules[0].condition.requestDomains,['firefox.example']); assert.equal(a.report.test.conditional,3);
  assert.throws(()=>compile('!#if env_firefox\n||x.example^'),/incompleto/);
});
test('cosmetic exceptions, scoped exclusions and generic setting are respected', () => {
  const c=compile('##.generic\nnews.example##.banner\nnews.example#@#.banner\nnews.example,~safe.news.example##.scoped');
  assert.deepEqual(cosmeticSelectors(c,'news.example',false),['.scoped']);
  assert.deepEqual(cosmeticSelectors(c,'safe.news.example',true),['.generic']);
});
test('selector parser prevents data from turning into declarations or code', () => {
  for(const s of ['.x{background:url(https://exfil.example)}','a;body','+js(set, x, 1)',':style(display:block)',':xpath(//div)',':has-text(advert)','a\\7b color:red']) assert.equal(safeSelector(s),false,s);
  assert.equal(safeSelector('div:has(> .sponsor)'),true);
});
test('quota overflow throws instead of silently dropping filters', () => {
  assert.throws(()=>compile('/path-one\n/path-two',{maxRules:1}),/limite disponível/);
});

test('denyallow retains initiator, type and destination constraints and rejects unsafe forms', () => {
 const r = parseLine('*$3p,script,denyallow=x.com|y.com,domain=a.com|b.com,to=~z.com');
 assert.equal(r.kind,'network');
 assert.deepEqual(r.condition.initiatorDomains,['a.com','b.com']);
 assert.deepEqual(r.condition.excludedRequestDomains,['x.com','y.com','z.com']);
 assert.deepEqual(r.condition.resourceTypes,['script']);
 assert.equal(r.condition.domainType,'thirdParty');
 for (const line of ['*$denyallow=x.com','*$denyallow=~x.com,domain=a.com','@@*$denyallow=x.com,domain=a.com','*$denyallow=x.com,domain=~a.com']) assert.equal(parseLine(line).kind,'unsupported');
});
test('bare hosts use domain anchors and underscore placeholders do not change filtering', () => {
 assert.equal(parseLine('example.com').condition.urlFilter,'||example.com^');
 assert.equal(parseLine('example.com*').condition.urlFilter,'example.com*');
 assert.deepEqual(parseLine('||example.com^$script,___').condition,parseLine('||example.com^$script').condition);
});
