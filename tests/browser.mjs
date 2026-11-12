// Real Chromium integration tests. Runs in CI or on a host allowing browser IPC.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const profile = await mkdtemp(tmpdir() + '/mblock-test-');
await mkdir('test-results', { recursive: true });
const passed = [], errors = [];
const fixture = `<!doctype html><title>mBlock test</title><h1>Content must remain visible</h1><div class="mblock-sponsored">Advertisement fixture</div><script src="/mblock-resource.js"></script><script src="/essential.js"></script>`;
const server = createServer((req, res) => { res.setHeader('Cache-Control','no-store'); if (req.url.startsWith('/mblock-resource.js')) { res.setHeader('Content-Type','text/javascript'); res.end('window.adResourceLoaded=true'); } else if (req.url.startsWith('/essential.js')) { res.setHeader('Content-Type','text/javascript'); res.end('window.essentialLoaded=true'); } else { res.setHeader('Content-Type','text/html'); res.end(fixture); } });
await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
const origin = 'http://127.0.0.1:' + server.address().port;
const extension = resolve('dist/chrome');
let context;
const launchOptions = { channel: process.env.MBLOCK_BROWSER_PATH ? undefined : 'chromium', executablePath: process.env.MBLOCK_BROWSER_PATH || undefined, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--no-sandbox','--disable-extensions-except=' + extension,'--load-extension=' + extension] };
try {
 context = await chromium.launchPersistentContext(profile, launchOptions);
 context.on('serviceworker', w => w.on('console', m => { if (m.type()==='error') errors.push(m.text()); }));
 let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', {timeout:60000});
 const id = new URL(worker.url()).host;
 let dashboard = await context.newPage(); await dashboard.goto('chrome-extension://' + id + '/ui/dashboard.html');
 const call = async (type,data={}) => {
   const r=await dashboard.evaluate(async m=>chrome.runtime.sendMessage(m),{type,...data}); if(!r?.ok)throw new Error(r?.error||'No response');return r.data;
 };
 const state = await call('state'); assert.ok(state.metadata.stats.nativeRules>15000); passed.push('full bundled rules installed and bootstrap disabled');
 assert.deepEqual(await worker.evaluate(()=>chrome.declarativeNetRequest.getEnabledRulesets()),[]);
 const compactIndex=await worker.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mblock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const read=(store,key)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const record=await read('rules',1),encoding=await read('meta','ruleProvenanceEncoding');db.close();
  return {compact:Array.isArray(record.originRow),expanded:record.origins!==undefined,version:encoding?.version};
 });
 assert.deepEqual(compactIndex,{compact:true,expanded:false,version:1});
 const decodedRule=await call('explain_rule',{id:1});assert.ok(decodedRule.origins.length);assert.ok(decodedRule.origins.every(o=>typeof o.source==='string'&&typeof o.filter==='string'));
 passed.push('compact diagnostic index expands original filter evidence on demand');

 // Re-open a legacy-shaped persisted snapshot to exercise the upgrade path.
 await call('settings',{patch:{autoUpdate:false,customRules:'||migration-preserved.example^\n'}});
 await call('site_policy',{host:'migration.example',policy:{paused:true}});
 await worker.evaluate(async()=>{
   const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('mblock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   await new Promise((resolve,reject)=>{const tx=database.transaction(['meta','snapshots'],'readwrite');for(const name of ['meta','snapshots']){const store=tx.objectStore(name),r=store.get('active');r.onsuccess=()=>{const value=r.result;delete value.engineVersion;delete value.settings.youtube;store.put(value,'active');if(name==='snapshots')tx.objectStore('meta').put(value,'pending')}}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});database.close();
 });
 await context.close();context=await chromium.launchPersistentContext(profile,launchOptions);
 context.on('serviceworker',w=>w.on('console',m=>{if(m.type()==='error')errors.push(m.text());}));
 dashboard=await context.newPage();await dashboard.goto('chrome-extension://'+id+'/ui/dashboard.html');worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:60000});
 const migrated=await call('state');assert.equal(migrated.metadata.engineVersion,'0.3.0');assert.equal(migrated.settings.customRules,'||migration-preserved.example^\n');assert.equal(migrated.settings.sites['migration.example'].paused,true);assert.equal(migrated.settings.youtube,true);assert.ok((await call('logs')).entries.some(e=>e.type==='engine_upgraded'));assert.ok((await call('logs')).entries.some(e=>e.type==='transaction_recovered'));passed.push('legacy snapshot and pending transaction recover without losing personal filters or site policies');
 for(const [language,tag,label,placeholder] of [['pt_BR','pt-BR','Doar via PayPal','Nenhuma análise ainda.'],['zh_CN','zh-CN','通过 PayPal 捐赠','尚未进行分析。'],['en','en-US','Donate with PayPal','No analysis yet.']]){
   await dashboard.locator('[data-language]').selectOption(language);
   await dashboard.waitForFunction(({tag,label})=>document.documentElement.lang===tag&&document.querySelector('[data-donate]')?.textContent===label,{tag,label});
   assert.equal(await dashboard.locator('#assistant-result').textContent(),placeholder);
   const donation=new URL(await dashboard.locator('[data-donate]').getAttribute('href'));
   assert.equal(donation.hostname,'www.paypal.com');assert.equal(donation.searchParams.get('business'),'jv12802@gmail.com');
 }
 passed.push('three interface languages and correct PayPal recipient');
 await call('settings',{patch:{autoUpdate:false,customRules:`||127.0.0.1:${server.address().port}/mblock-resource.js$script\n127.0.0.1##.mblock-sponsored`}});
 const site=await context.newPage();await site.goto(origin+'/fixture');
 await site.waitForFunction(()=>window.essentialLoaded===true);
 await site.waitForFunction(()=>getComputedStyle(document.querySelector('.mblock-sponsored')).display==='none');
 assert.equal(await site.evaluate(()=>!!window.adResourceLoaded),false); passed.push('native blocking + scoped cosmetics, essential script preserved');
 const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,site.url());
 await worker.evaluate(()=>{globalThis.__cosmeticReads=0;globalThis.__transactionOriginal=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,...args){if((Array.isArray(stores)?stores:[stores]).includes('cosmetics'))globalThis.__cosmeticReads++;return globalThis.__transactionOriginal.call(this,stores,...args)}});
 await site.reload();await site.waitForFunction(()=>getComputedStyle(document.querySelector('.mblock-sponsored')).display==='none');
 const cosmeticReads=await worker.evaluate(()=>globalThis.__cosmeticReads);
 await site.reload();await site.waitForFunction(()=>getComputedStyle(document.querySelector('.mblock-sponsored')).display==='none');
 assert.equal(await worker.evaluate(()=>globalThis.__cosmeticReads),cosmeticReads);
 await worker.evaluate(()=>{IDBDatabase.prototype.transaction=globalThis.__transactionOriginal;delete globalThis.__transactionOriginal;delete globalThis.__cosmeticReads});
 passed.push('warm host CSS cache avoids repeated cosmetic transactions and still hides ads');


 // Alarm changes and two concurrent site edits must both survive serialization.
 await call('settings',{patch:{autoUpdate:true,intervalHours:6}});
 assert.equal((await worker.evaluate(()=>chrome.alarms.get('update'))).periodInMinutes,360);
 await assert.rejects(()=>call('settings',{patch:{intervalHours:0}}),/Intervalo/);
 await Promise.all([call('site_policy',{host:'a.mblock.test',policy:{paused:true}}),call('site_policy',{host:'b.mblock.test',policy:{generic:true}})]);
 const concurrent=(await call('state')).settings.sites;assert.equal(concurrent['a.mblock.test'].paused,true);assert.equal(concurrent['b.mblock.test'].generic,true);
 await call('settings',{patch:{autoUpdate:false}});assert.equal(await worker.evaluate(()=>chrome.alarms.get('update')),undefined);
 passed.push('configurable update alarm and concurrent site policies preserve both edits');
 const labels={title:'Block element',instruction:'Choose an element',preview:'Preview',save:'Save filter',again:'Pick another',cancel:'Cancel',failed:'Could not save'};
 const pickerCDP=await context.newCDPSession(site);
 async function pickerButton(text) {
  const {root}=await pickerCDP.send('DOM.getDocument',{depth:-1,pierce:true});
  function find(n){if(n.nodeName==='BUTTON' && n.children?.some(c=>c.nodeValue===text))return n;for(const child of [...(n.children||[]),...(n.shadowRoots||[])]){const match=find(child);if(match)return match;}}
  const n=find(root);assert.ok(n,'picker button '+text);const {model}=await pickerCDP.send('DOM.getBoxModel',{backendNodeId:n.backendNodeId});
  const q=model.border;await site.mouse.click((q[0]+q[4])/2,(q[1]+q[5])/2);
 }
 await call('picker_start',{tabId,labels});
 await site.locator('h1').click();await site.screenshot({path:'test-results/element-picker.png'});await pickerButton('Preview');await site.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).display==='none');assert.equal(await site.locator('h1').isVisible(),false);
 await pickerButton('Cancel');await site.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).display!=='none');assert.equal(await site.locator('h1').isVisible(),true);
 assert.ok(!(await call('state')).settings.customRules.includes('##h1'));
 await call('picker_start',{tabId,labels});await site.locator('h1').click();await pickerButton('Save filter');
 await site.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).display==='none');
 assert.ok((await call('state')).settings.customRules.includes('127.0.0.1##h1'));
 await site.reload();await site.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).display==='none');
 // A forged save without a UI-created capability must not change filters.
 const forged=await worker.evaluate(async tabId=>{const r=await chrome.scripting.executeScript({target:{tabId},func:async()=>chrome.runtime.sendMessage({type:'picker_save',token:'forged',selector:'body'})});return r[0].result;},tabId);
 assert.equal(forged.ok,false);
 const afterPicker=(await call('state')).settings.customRules;
 await call('settings',{patch:{customRules:afterPicker.replace('127.0.0.1##h1\n','')}});await site.reload();await site.waitForFunction(()=>getComputedStyle(document.querySelector('h1')).display!=='none');
 await site.evaluate(()=>{
  window.__dynamicReplacements=0;
  const modal=document.createElement('div');modal.id='cwvfivhk';modal.dataset.dynamicModal='1';modal.style.cssText='position:fixed;z-index:5000;left:20px;top:20px;width:320px;height:180px;background:white';
  const button=document.createElement('button');button.textContent='Dynamic modal target';modal.append(button);document.body.append(modal);
  window.__dynamicModalTimer=setInterval(()=>{const current=document.querySelector('[data-dynamic-modal]');if(window.__dynamicReplacements===0&&current&&getComputedStyle(current).display==='none'){const next=current.cloneNode(true);next.id='cj2v4gkk';current.replaceWith(next);window.__dynamicReplacements=1;}},20);
 });
 await call('picker_start',{tabId,labels});await site.locator('[data-dynamic-modal] button').click();await pickerButton('Preview');
 await site.waitForFunction(()=>window.__dynamicReplacements===1);
 assert.equal(await site.locator('[data-dynamic-modal]').evaluate(e=>getComputedStyle(e).display),'none');
 await pickerButton('Cancel');await site.waitForFunction(()=>getComputedStyle(document.querySelector('[data-dynamic-modal]')).display!=='none');
 await site.evaluate(()=>{clearInterval(window.__dynamicModalTimer);delete window.__dynamicModalTimer;document.querySelector('[data-dynamic-modal]')?.remove();});
 passed.push('element picker previews, cancels, persists, survives dynamic modal replacement and rejects forged saves');
 await dashboard.locator('#refresh-tabs').click();await dashboard.locator('#tab').selectOption(String(tabId));await dashboard.locator('#analyze').click();await dashboard.waitForFunction(()=>document.querySelector('#assistant-result').textContent.includes('mblock-site-analysis-v2'));
 assert.equal(await dashboard.locator('#apply-known-fix').isDisabled(),true);assert.equal(await dashboard.locator('#apply-known-fix').evaluate(e=>getComputedStyle(e).cursor),'default');assert.equal(await dashboard.locator('#apply-known-fix').getAttribute('aria-busy'),null);assert.match(await dashboard.locator('#known-fix-status').textContent(),/No known fix/);passed.push('unavailable known fix explains why and uses a normal cursor after analysis');
 await worker.evaluate(()=>{globalThis.__executeOriginal=chrome.scripting.executeScript;chrome.scripting.executeScript=options=>options.func?.name==='probeSite'?new Promise(()=>{}):globalThis.__executeOriginal(options);});
 const timeoutStarted=Date.now();await dashboard.locator('#analyze').click();await dashboard.waitForFunction(()=>document.querySelector('#status').classList.contains('error')&&document.querySelector('#analyze').getAttribute('aria-busy')===null);assert.ok(Date.now()-timeoutStarted<10000);assert.equal(await dashboard.locator('#analyze').isEnabled(),true);await worker.evaluate(()=>{chrome.scripting.executeScript=globalThis.__executeOriginal;delete globalThis.__executeOriginal;});passed.push('an unresponsive site times out and releases the assistant button');
 await call('diagnostic_start',{tabId,details:false,durationSeconds:300}); await site.reload(); await site.waitForTimeout(2500);
 let logs=await call('logs'); assert.ok(logs.entries.some(e=>e.type==='native_rule_match')); assert.ok(logs.entries.some(e=>e.type==='cosmetics_applied')); passed.push('on-demand rule and cosmetic logging');
 await call('site_policy',{host:'127.0.0.1',policy:{paused:true}});await site.reload();await site.waitForFunction(()=>window.adResourceLoaded===true);
 assert.notEqual(await site.locator('.mblock-sponsored').evaluate(e=>getComputedStyle(e).display),'none');passed.push('site pause disables network and cosmetics');
 await call('site_policy',{host:'127.0.0.1',policy:{paused:false}});await site.reload();await site.waitForFunction(()=>window.essentialLoaded===true);assert.equal(await site.evaluate(()=>!!window.adResourceLoaded),false);
 await call('settings',{patch:{enabled:false}});await site.reload();await site.waitForFunction(()=>window.adResourceLoaded===true);passed.push('global pause works');
 await call('settings',{patch:{enabled:true}});

 const controlProbe=await worker.evaluate(async()=>{
  const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('mblock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const tx=database.transaction(['snapshots','meta']),active=tx.objectStore('snapshots').get('active'),meta=tx.objectStore('meta').get('active');
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});database.close();
  globalThis.__controlChanges=[];globalThis.__controlOriginal=chrome.declarativeNetRequest.updateDynamicRules;
  chrome.declarativeNetRequest.updateDynamicRules=async change=>{globalThis.__controlChanges.push(change);return globalThis.__controlOriginal(change)};
  return {base:meta.result.stats.nativeRules-active.result.extraRules.length,dataKey:active.result.dataKey};
 });
 await call('settings',{patch:{enabled:false}});await call('settings',{patch:{enabled:true}});
 const controlChanges=await worker.evaluate(()=>{chrome.declarativeNetRequest.updateDynamicRules=globalThis.__controlOriginal;delete globalThis.__controlOriginal;const changes=globalThis.__controlChanges;delete globalThis.__controlChanges;return changes});
 assert.equal(controlChanges.length,2);assert.ok(controlChanges.every(c=>c.removeRuleIds.every(id=>id>controlProbe.base)&&c.addRules.every(r=>r.id>controlProbe.base)));
 passed.push('control changes replace only local tail rules and preserve the compiled network index');
 await worker.evaluate(()=>{globalThis.__storageOriginal=chrome.storage.local.set;chrome.storage.local.set=data=>data.settings?Promise.reject(Error('Simulated settings mirror failure')):globalThis.__storageOriginal(data)});
 await call('settings',{patch:{enabled:false}});assert.equal((await call('state')).settings.enabled,false);
 await site.reload();await site.waitForFunction(()=>window.adResourceLoaded===true);
 await worker.evaluate(()=>{chrome.storage.local.set=globalThis.__storageOriginal;delete globalThis.__storageOriginal});
 await call('settings',{patch:{enabled:true}});await site.reload();await site.waitForFunction(()=>window.essentialLoaded===true);assert.equal(await site.evaluate(()=>!!window.adResourceLoaded),false);
 passed.push('settings mirror failure keeps committed native and persistent configuration consistent');
 const rulesBefore=await worker.evaluate(async()=>JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules()));
 await worker.evaluate(()=>{globalThis.__originalFetch=fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://raw.githubusercontent.com/')?Promise.reject(new Error('Simulated offline update')):globalThis.__originalFetch(url,options);});
 await assert.rejects(()=>call('update'),/Simulated offline/);
 assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules())),rulesBefore);
 await worker.evaluate(()=>{globalThis.fetch=globalThis.__originalFetch;delete globalThis.__originalFetch;});passed.push('failed update retains previous native rules');
 await worker.evaluate(()=>{globalThis.__updateOriginal=chrome.declarativeNetRequest.updateDynamicRules;chrome.declarativeNetRequest.updateDynamicRules=async()=>{throw Error('Simulated native validation failure')};});
 await call('settings',{patch:{genericCosmetic:true}});
 assert.equal((await call('state')).settings.genericCosmetic,true);
 passed.push('CSS preference changes skip native rule replacement');
 await assert.rejects(()=>call('settings',{patch:{enabled:false}}),/Simulated native validation/);
 await worker.evaluate(()=>{chrome.declarativeNetRequest.updateDynamicRules=globalThis.__updateOriginal;delete globalThis.__updateOriginal;});
 assert.equal((await call('state')).settings.enabled,true);
 await call('settings',{patch:{genericCosmetic:false}});
 assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules())),rulesBefore);passed.push('atomic native rejection leaves settings and rules unchanged');
 await call('settings',{patch:{genericCosmetic:true}});await call('rollback');assert.equal((await call('state')).settings.genericCosmetic,false);passed.push('rollback restores previous settings and rules');

 const storageLayout=await worker.evaluate(async()=>{
  const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('mblock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const read=(store,key)=>new Promise((resolve,reject)=>{const r=database.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const active=await read('snapshots','active'),previous=await read('snapshots','previous');
  const keys=await new Promise((resolve,reject)=>{const r=database.transaction('snapshots').objectStore('snapshots').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const dataKeys=keys.filter(k=>String(k).startsWith('data:'));
  const shared=active.dataKey===previous.dataKey;
  // Recreate a real legacy full snapshot, as produced by 0.2.x/early 0.3.0.
  const data=await read('snapshots',active.dataKey),{storageFormat,dataKey,extraRules,...configuration}=active;
  await new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({...configuration,...data,rules:[...data.compiled.rules,...extraRules]},'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  database.close();return{format:active.storageFormat,shared,dataKeys:dataKeys.length};
 });
 assert.deepEqual(storageLayout,{format:'shared-v1',shared:true,dataKeys:1});
 // The next preference write must read legacy data, normalize it and preserve rollback.
 await call('settings',{patch:{genericCosmetic:true}});await call('rollback');assert.equal((await call('state')).settings.genericCosmetic,false);
 passed.push('shared snapshots avoid duplicate payloads, collect unused data and accept legacy snapshots');
 await site.reload();await site.waitForFunction(()=>window.essentialLoaded===true);await site.waitForTimeout(200);
 const report=await call('export');assert.equal(report.schema,'mblock-diagnostic-v1');assert.ok(report.matchedRules.some(r=>r.origins?.length));assert.ok(report.matchedRules.some(r=>r.available===false));assert.equal(report.metadata.settings,undefined);assert.equal(report.privacy.queryValues,false);passed.push('diagnostic provenance is tied to the matching ruleset generation');
 await call('diagnostic_stop');assert.equal((await call('state')).activeDiagnostic,null);
 const fc=await context.newPage();
 await context.route('https://www.fcportables.com/__mblock_fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>FC loader fixture</title><h1>Test content</h1><meta name="antiadblockcore-verification" content="fixture"><script id="antiadblock-core-js" crossorigin="anonymous" onerror="window.fallbackRan=true" onload="if(!window.__tlm&&!window.__tlx)window.fallbackRan=true" src="https://z9snqc.fcportables.com/4245c2/4b7ea0/main.fb71facc6f58dac3.min.js?ver=3.7.1"></script>`}));
 await context.route('https://z9snqc.fcportables.com/**',route=>route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'window.originalAntiCoreRan=true;'}));
 await fc.goto('https://www.fcportables.com/__mblock_fixture');await fc.waitForFunction(()=>window.__tlm===true&&window.__tlx===true);
 assert.equal(await fc.evaluate(()=>!!window.originalAntiCoreRan),false);assert.equal(await fc.evaluate(()=>!!window.fallbackRan),false);passed.push('observed FC Portables loader redirected; fallback loop not started (fixture)');
 const fcTabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,fc.url());
 const analysis=await call('assistant_analyze',{tabId:fcTabId});assert.equal(analysis.generativeAI,false);assert.equal(analysis.engines[0].confidence,'high');assert.equal(analysis.proposals.length,1);passed.push('local evidence classifier identifies known loader without claiming generative AI');
 // Import/export round trip, including the actual UI file chooser and download.
 const backup=await call('rules_export',{format:'json'});const beforeImport=(await call('state')).settings.customRules;
 const downloadEvent=dashboard.waitForEvent('download');await dashboard.locator('#export-rules-txt').click();const download=await downloadEvent;await download.saveAs('test-results/exported-rules.txt');assert.ok((await readFile('test-results/exported-rules.txt','utf8')).includes('mblock-resource.js'));
 const file='test-results/import-rules.txt';await writeFile(file,'||imported.example^\n');await dashboard.locator('#import-file').setInputFiles(file);await dashboard.locator('#preview-import').click();await dashboard.waitForFunction(()=>!document.querySelector('#apply-import').disabled);assert.equal((await call('state')).settings.customRules,beforeImport);await dashboard.locator('#apply-import').click();await dashboard.waitForFunction(()=>document.querySelector('#custom').value.includes('||imported.example^'));
 let preview=await call('rules_import_preview',{content:backup.content,mode:'replace',includeSettings:true});await call('rules_import_apply',{token:preview.token,allowUnsupported:false});assert.equal((await call('state')).settings.customRules,beforeImport.trimEnd()+'\n');
 const stableRules=await worker.evaluate(async()=>JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules()));await assert.rejects(()=>call('rules_import_preview',{content:'{"broken":',mode:'replace',includeSettings:true}),/JSON inválido/);assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules())),stableRules);
 preview=await call('rules_import_preview',{content:'||another.example^',mode:'merge',includeSettings:false});await call('settings',{patch:{genericCosmetic:true}});await assert.rejects(()=>call('rules_import_apply',{token:preview.token}),/configuração mudou/);await call('settings',{patch:{genericCosmetic:false}});
 preview=await call('rules_import_preview',{content:'youtube.com##+js(unknown, x)',mode:'merge',includeSettings:false});assert.equal(preview.unsupported,1);await assert.rejects(()=>call('rules_import_apply',{token:preview.token}),/não suportadas/);passed.push('TXT/JSON export, UI import preview, merge/replace, invalid/stale/unsupported import rejection');
 // YouTube uses the real generated scriptlets before the first page script.
 const tube=await context.newPage();
 const payload={adPlacements:[{slot:'advertisement'}],adSlots:[{slot:'advertisement'}],playerAds:[{ad:'advertisement'}],videoDetails:{videoId:'content-id',title:'Essential content',lengthSeconds:'120'},streamingData:{formats:[{url:'https://media.example/video'}]},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'pt'}]}}};
 const tubeFixture='<!doctype html><title>YouTube player fixture</title><div id="movie_player"><video></video></div><script>window.ytcfg={data_:{INNERTUBE_CONTEXT:{client:{userAgent:"Mozilla/5.0 (X11; Linux x86_64)",clientName:"WEB"}}}};window.ytInitialPlayerResponse='+JSON.stringify(payload)+';window.initialAdPresent=!!(window.ytInitialPlayerResponse.adPlacements?.length||window.ytInitialPlayerResponse.adSlots?.length||window.ytInitialPlayerResponse.playerAds?.length);window.initialEssential=window.ytInitialPlayerResponse.videoDetails.videoId;</script>';
 await context.route('https://www.youtube.com/watch?*',r=>r.fulfill({contentType:'text/html',body:tubeFixture}));
 await context.route('https://www.youtube.com/youtubei/v1/**',r=>r.fulfill({contentType:'application/json',headers:{'x-mblock-control':'preserved'},body:JSON.stringify(payload)}));
 await tube.goto('https://www.youtube.com/watch?v=mblock-fixture');assert.equal(await tube.evaluate(()=>window.initialEssential),'content-id');assert.equal(await tube.evaluate(()=>window.initialAdPresent),false);passed.push('YouTube initial ad metadata removed at document_start, content metadata preserved');
 const fetchResult=await tube.evaluate(async()=>{const response=await fetch('/youtubei/v1/player?key=fixture',{method:'POST'});const cloned=response.clone();const data=await response.json();const second=await cloned.json();return{data,second,status:response.status,header:response.headers.get('x-mblock-control')};});
 assert.equal(fetchResult.status,200);assert.equal(fetchResult.header,'preserved');assert.equal(fetchResult.data.adPlacements,undefined);assert.equal(fetchResult.data.adSlots,undefined);assert.equal(fetchResult.second.adPlacements,undefined);assert.equal(fetchResult.data.videoDetails.videoId,'content-id');assert.ok(fetchResult.data.streamingData.formats.length);assert.ok(fetchResult.data.captions);passed.push('YouTube fetch/player and cloned response cleaned with media, captions and headers preserved');
 const xhr=await tube.evaluate(()=>new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','/youtubei/v1/player?fixture=xhr');x.responseType='json';x.onload=()=>resolve({data:x.response,status:x.status,header:x.getResponseHeader('x-mblock-control')});x.onerror=()=>reject(Error('XHR fixture failed'));x.send('{}');}));
 assert.equal(xhr.status,200);assert.equal(xhr.header,'preserved');assert.equal(xhr.data.adPlacements,undefined);assert.equal(xhr.data.adSlots,undefined);assert.equal(xhr.data.videoDetails.videoId,'content-id');passed.push('YouTube XHR player responses cleaned without blocking the player request');
 const spa=await tube.evaluate(async()=>{history.pushState({},'', '/watch?v=second-fixture');window.ytInitialPlayerResponse={adPlacements:[{ad:1}],adSlots:[{ad:1}],videoDetails:{videoId:'next-video'}};const response=await fetch('/youtubei/v1/player?key=second',{method:'POST'});return{initial:window.ytInitialPlayerResponse,body:await response.json()};});assert.equal(spa.initial.videoDetails.videoId,'next-video');assert.equal(spa.initial.adPlacements,undefined);assert.equal(spa.body.adSlots,undefined);passed.push('YouTube protection survives in-page navigation and player data reassignment');
 const tubeTab=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,tube.url());await tube.evaluate(()=>document.getElementById('movie_player').classList.add('ad-showing'));const tubeAnalysis=await call('assistant_analyze',{tabId:tubeTab});assert.equal(tubeAnalysis.unknownMechanism,false);assert.equal(tubeAnalysis.youtube.player.adPlaying,true);assert.equal(tubeAnalysis.youtube.registered,true);assert.equal(tubeAnalysis.generativeAI,false);passed.push('YouTube assistant reports player ad state separately from anti-adblock warnings');
 await dashboard.locator('#refresh-tabs').click();await dashboard.locator('#tab').selectOption(String(tubeTab));await dashboard.locator('#analyze').click();await dashboard.waitForFunction(()=>document.querySelector('#assistant-result').textContent.includes('YouTube player / Innertube'));assert.equal(await dashboard.locator('#apply-known-fix').isDisabled(),true);assert.match(await dashboard.locator('#known-fix-status').textContent(),/(verified|verificada|já está ativa)/i);assert.equal(await dashboard.locator('#apply-known-fix').evaluate(e=>getComputedStyle(e).cursor),'default');passed.push('YouTube already-active fix is explained without a waiting cursor');
 await call('settings',{patch:{youtube:false}});await tube.reload();assert.equal(await tube.evaluate(()=>window.initialAdPresent),true);
 await call('settings',{patch:{youtube:true}});await tube.reload();assert.equal(await tube.evaluate(()=>window.initialAdPresent),false);
 await call('site_policy',{host:'youtube.com',policy:{paused:true}});await tube.reload();assert.equal(await tube.evaluate(()=>window.initialAdPresent),true);const pausedTube=await call('assistant_analyze',{tabId:tubeTab});assert.equal(pausedTube.youtube.registered,false);
 await call('site_policy',{host:'youtube.com',policy:{paused:false}});await tube.reload();assert.equal(await tube.evaluate(()=>window.initialAdPresent),false);passed.push('YouTube global option and site pause remove and restore the registered scripts');
 // The actual report showed ad-showing + ad-interrupting with a visible skip
 // button. Use a real seekable media stream, not mocked duration properties.
 function silence(seconds) {
   const samples=8000*seconds,body=Buffer.alloc(44+samples*2);body.write('RIFF');body.writeUInt32LE(body.length-8,4);body.write('WAVEfmt ',8);body.writeUInt32LE(16,16);body.writeUInt16LE(1,20);body.writeUInt16LE(1,22);body.writeUInt32LE(8000,24);body.writeUInt32LE(16000,28);body.writeUInt16LE(2,32);body.writeUInt16LE(16,34);body.write('data',36);body.writeUInt32LE(samples*2,40);return body;
 }
 const shortMedia=silence(15),contentMedia=silence(120);
 await context.route('https://www.youtube.com/__mblock_sample*',route=>{const body=route.request().url().includes('120')?contentMedia:shortMedia;const range=route.request().headers()['range'];if(!range)return route.fulfill({contentType:'audio/wav',headers:{'accept-ranges':'bytes'},body});const match=/bytes=(\d+)-(\d*)/.exec(range),start=Number(match?.[1]||0),end=match?.[2]?Math.min(Number(match[2]),body.length-1):body.length-1;return route.fulfill({status:206,contentType:'audio/wav',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${body.length}`},body:body.subarray(start,end+1)});});
 const recoveryFixture=kind=>`<!doctype html><title>Playback recovery fixture</title><div id="movie_player"><video muted></video><span class="ytp-ad-simple-ad-badge" style="display:inline-block">Sponsored</span>${kind==='skip'?'<button class="ytp-ad-skip-button-modern">Skip ad</button>':''}</div><script>
 const player=document.getElementById('movie_player'),video=player.querySelector('video');window.skipCount=0;window.completedAd=false;
 function content(){window.completedAd=true;player.className='';player.querySelector('button')?.remove();player.querySelector('span')?.remove();video.src='/__mblock_sample120.wav';video.play().catch(()=>{});}
 player.querySelector('button')?.addEventListener('click',()=>{window.skipCount++;content()});video.addEventListener('timeupdate',()=>{if(player.classList.contains('ad-showing')&&video.currentTime>14.8)content()});
 window.beginAd=async function(){video.src='/__mblock_sample15.wav';video.muted=true;await new Promise(resolve=>video.addEventListener('loadedmetadata',resolve,{once:true}));player.className='html5-video-player ad-showing ad-interrupting';${kind==='paused'?'':"await video.play().catch(()=>{})"}};
 </script>`;
 await context.route('https://www.youtube.com/__mblock_recovery*',r=>r.fulfill({contentType:'text/html',body:recoveryFixture(new URL(r.request().url()).searchParams.get('kind'))}));
 const recovery=await context.newPage();await recovery.goto('https://www.youtube.com/__mblock_recovery?kind=skip');await recovery.evaluate(()=>window.beginAd());await recovery.waitForFunction(()=>window.skipCount===1);assert.equal(await recovery.evaluate(()=>window.completedAd),true);passed.push('reported 15-second ad with visible skip button is dismissed automatically');
 await recovery.goto('https://www.youtube.com/__mblock_recovery?kind=seek');await recovery.evaluate(()=>window.beginAd());await recovery.waitForFunction(()=>window.completedAd);const recoveryTab=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,recovery.url());const recovered=await call('assistant_analyze',{tabId:recoveryTab});assert.equal(recovered.youtube.applied,true);assert.equal(recovered.youtube.playback.seeks,1,JSON.stringify({youtube:recovered.youtube,media:await recovery.evaluate(()=>{const v=document.querySelector('video'),b=document.querySelector('.ytp-ad-simple-ad-badge');return{duration:v.duration,paused:v.paused,ready:v.readyState,seekable:Array.from({length:v.seekable.length},(_,i)=>[v.seekable.start(i),v.seekable.end(i)]),badge:b?{rect:[b.getBoundingClientRect().width,b.getBoundingClientRect().height],display:getComputedStyle(b).display,visibility:getComputedStyle(b).visibility,opacity:getComputedStyle(b).opacity}:null}})}));assert.equal(recovered.youtube.playback.skipClicks,0);await recovery.waitForTimeout(700);assert.ok(await recovery.evaluate(()=>document.querySelector('video').currentTime)<3);assert.equal(await recovery.evaluate(()=>document.querySelector('video').playbackRate),1);passed.push('confirmed unskippable ad is advanced and the following content keeps its position and speed');
 const idleBefore=(await call('assistant_analyze',{tabId:recoveryTab})).youtube.playback.checks;await recovery.waitForTimeout(800);const idleAfter=(await call('assistant_analyze',{tabId:recoveryTab})).youtube.playback.checks;assert.equal(idleAfter,idleBefore);passed.push('playback recovery does not poll during ordinary content');
 await recovery.goto('https://www.youtube.com/__mblock_recovery?kind=paused');await recovery.evaluate(()=>window.beginAd());await recovery.waitForTimeout(800);const pausedRecovery=await call('assistant_analyze',{tabId:recoveryTab});assert.equal(pausedRecovery.youtube.playback.seeks,0);assert.equal(await recovery.evaluate(()=>document.querySelector('video').currentTime),0);passed.push('paused media is preserved even when ad indicators are present');
 await recovery.evaluate(async()=>{const player=document.getElementById('movie_player'),video=player.querySelector('video');player.className='html5-video-player ad-showing';player.querySelector('span').hidden=true;await video.play()});await recovery.waitForTimeout(800);const uncertain=await call('assistant_analyze',{tabId:recoveryTab});assert.equal(uncertain.youtube.playback.seeks,0);assert.ok(await recovery.evaluate(()=>document.querySelector('video').currentTime)<3);passed.push('an ad class without visible corroborating ad UI never seeks the content');
 // A registered future-navigation profile is not proof an older open tab got it.
 await call('settings',{patch:{youtube:false}});await recovery.goto('https://www.youtube.com/__mblock_recovery?kind=skip');await call('settings',{patch:{youtube:true}});const olderTab=await call('assistant_analyze',{tabId:recoveryTab});assert.equal(olderTab.youtube.registered,true);assert.equal(olderTab.youtube.applied,false);assert.equal(olderTab.canApplyKnownFix,true);await call('assistant_enable_known_fix',{tabId:recoveryTab});assert.equal((await call('assistant_analyze',{tabId:recoveryTab})).youtube.applied,true);await recovery.evaluate(()=>window.beginAd());await recovery.waitForFunction(()=>window.skipCount===1);await call('assistant_enable_known_fix',{tabId:recoveryTab});assert.equal((await call('assistant_analyze',{tabId:recoveryTab})).youtube.playback.skipClicks,1);passed.push('known fix attaches to an already-open tab and repeated activation does not duplicate recovery');
 // Simulate the missing receiver from the supplied diagnostic. On-demand
 // assistant inspection uses executeScript, and collection reconnects content.
 await worker.evaluate(()=>{globalThis.__tabMessageOriginal=chrome.tabs.sendMessage;chrome.tabs.sendMessage=()=>Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));});assert.equal((await call('assistant_analyze',{tabId:recoveryTab})).unknownMechanism,false);await worker.evaluate(()=>{chrome.tabs.sendMessage=globalThis.__tabMessageOriginal;delete globalThis.__tabMessageOriginal});passed.push('assistant works without a content-script message receiver');
 await assert.rejects(()=>call('diagnostic_start',{tabId:tubeTab,durationSeconds:900}),/Duração/);await call('diagnostic_start',{tabId:tubeTab});const shortDiagnostic=(await call('state')).activeDiagnostic;assert.equal(shortDiagnostic.durationSeconds,30);assert.equal(shortDiagnostic.until-shortDiagnostic.startedAt,30000);await call('diagnostic_stop');assert.equal((await call('state')).activeDiagnostic,null);passed.push('diagnostic defaults to 30 seconds, rejects excessive durations and can stop immediately');
 await dashboard.reload();await dashboard.locator('#native').waitFor();await dashboard.screenshot({path:'test-results/dashboard.png',fullPage:true});
 await writeFile('test-results/browser.json',JSON.stringify({browser:context.browser()?.version(),passed,errors,note:'FC Portables verified with the observed loader URL in an isolated fixture. Live site not certified.'},null,2));
 console.log(JSON.stringify({passed:passed.length,checks:passed,errors},null,2));
} catch(error) { console.error(JSON.stringify({checksPassed:passed,errors},null,2));throw error; }
finally {if(context)await context.close();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});}
