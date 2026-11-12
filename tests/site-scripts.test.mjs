import { test } from 'node:test';import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/shared/core.js';import { desiredSiteScripts } from '../src/shared/site-scripts.js';
const profile={files:[{world:'MAIN',path:'site/youtube-main.js'},{world:'ISOLATED',path:'site/youtube-isolated.js'}]};
const config={...DEFAULT_SETTINGS,sites:{}};
test('YouTube profile is registered at document start only on supported origins',()=>{
 const scripts=desiredSiteScripts(config,profile);assert.equal(scripts.length,6);for(const s of scripts){assert.equal(s.runAt,'document_start');assert.equal(s.allFrames,false);assert.ok(s.matches.every(p=>p.includes('youtube')));}
 assert.equal(desiredSiteScripts({...config,enabled:false},profile).length,0);assert.equal(desiredSiteScripts({...config,youtube:false},profile).length,0);
});
test('a paused parent and an explicitly reenabled child receive disjoint registrations',()=>{
 const scripts=desiredSiteScripts({...config,sites:{'youtube.com':{paused:true},'m.youtube.com':{paused:false},'other.m.youtube.com':{youtube:false}}},profile);
 const main=scripts.filter(s=>s.world==='MAIN');assert.ok(!main.some(s=>s.matches.includes('*://*.youtube.com/*')));
 const mobile=main.find(s=>s.matches.includes('*://*.m.youtube.com/*'));assert.ok(mobile);assert.deepEqual(mobile.excludeMatches,['*://*.other.m.youtube.com/*']);
});
test('cosmetic setting does not disable player protection, while YouTube site setting does',()=>{
 const cssOff=desiredSiteScripts({...config,sites:{'youtube.com':{cosmetic:false}}},profile);assert.ok(cssOff.some(s=>s.matches.includes('*://*.youtube.com/*')));
 const tubeOff=desiredSiteScripts({...config,sites:{'youtube.com':{youtube:false}}},profile);assert.ok(!tubeOff.some(s=>s.matches.includes('*://*.youtube.com/*')));
});
