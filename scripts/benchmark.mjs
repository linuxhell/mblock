import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir, cpus, platform } from 'node:os';
const runs = Math.max(3, Math.min(20, Number(process.env.MBLOCK_BENCH_RUNS) || 5));
const frames = Math.max(0,Math.min(50,Number(process.env.MBLOCK_BENCH_FRAMES)||0));
const maintenanceRuns=Math.max(0,Math.min(5,Number(process.env.MBLOCK_MAINTENANCE_RUNS)||0));
const ads = 60; let adHits = 0;
const html = port => `<!doctype html><title>Controlled blocking benchmark</title><h1>Essential content</h1><div class="adsbox" style="height:10px">Ad bait</div><script src="/essential.js"></script>` + Array.from({length:ads},(_,i)=>`<script async src="http://ads.doubleclick.net:${port}/mblock-benchmark-${i}.js"></script>`).join('') + Array.from({length:frames},(_,i)=>`<iframe src="/frame?i=${i}"></iframe>`).join('');
const server = createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');
 if(req.headers.host.startsWith('ads.doubleclick.net')){adHits++;res.setHeader('Content-Type','text/javascript');res.end('window.adLoads=(window.adLoads||0)+1;'+ '/* controlled payload */'.repeat(100));}
 else if(req.url==='/essential.js'){res.setHeader('Content-Type','text/javascript');res.end('window.essentialLoaded=true');}
 else if(req.url.startsWith('/frame?')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Frame</title><div class="adsbox">Frame bait</div><script src="/essential.js"></script>');}
 else{res.setHeader('Content-Type','text/html');res.end(html(server.address().port));}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://site.mblock.test:'+server.address().port;
function rss(processes){if(platform()!=='linux')return null;try{return Number(execFileSync('ps',['-p',processes.map(p=>p.id).join(','),'-o','rss='],{encoding:'utf8'}).trim().split(/\s+/).reduce((a,b)=>a+Number(b||0),0));}catch{return null;}}
function processMemory(processes) {
 if(platform()!=='linux')return [];
 const lines=execFileSync('ps',['-p',[...new Set(processes.map(p=>p.id))].join(','),'-o','pid=,rss='],{encoding:'utf8'}).trim().split('\n');
 const values=new Map(lines.map(line=>line.trim().split(/\s+/).map(Number)));
 return processes.map(p=>({id:p.id,type:p.type,rssKiB:values.get(p.id)||0}));
}
let targetCommandId=0;
async function targetCommand(root,sessionId,method) {
 const id=++targetCommandId;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{root.off('Target.receivedMessageFromTarget',receive);reject(Error('heap probe timeout: '+method));},5000);
  function receive(event){if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);if(message.id!==id)return;clearTimeout(timer);root.off('Target.receivedMessageFromTarget',receive);message.error?reject(Error(message.error.message)):resolve(message.result||{});}
  root.on('Target.receivedMessageFromTarget',receive);
  root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method})}).catch(error=>{clearTimeout(timer);root.off('Target.receivedMessageFromTarget',receive);reject(error);});
 });
}
async function targetHeap(root,targetId) {
 const {sessionId}=await root.send('Target.attachToTarget',{targetId,flatten:false});
 try{
  const beforeGc=await targetCommand(root,sessionId,'Runtime.getHeapUsage');
  await targetCommand(root,sessionId,'HeapProfiler.collectGarbage');
  const afterGc=await targetCommand(root,sessionId,'Runtime.getHeapUsage');
  return {beforeGc,afterGc,reclaimedBytes:Math.max(0,(beforeGc.usedSize||0)-(afterGc.usedSize||0))};
 }finally{await root.send('Target.detachFromTarget',{sessionId});}
}
async function measure(label, extensionPath){
 const setupStarted=performance.now();
 const profile=await mkdtemp(tmpdir()+'/mblock-bench-');let context,configuration;
 try{
  const extension=extensionPath?resolve(extensionPath):null;
  const manifest=extension?JSON.parse(await readFile(extension+'/manifest.json','utf8')):null;
  context=await chromium.launchPersistentContext(profile,{channel:process.env.MBLOCK_BROWSER_PATH?undefined:'chromium',executablePath:process.env.MBLOCK_BROWSER_PATH||undefined,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP site.mblock.test 127.0.0.1, MAP ads.doubleclick.net 127.0.0.1',...(extension?['--disable-extensions-except='+extension,'--load-extension='+extension]:[])]});
  const page=await context.newPage(), root=await context.browser().newBrowserCDPSession(), cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if(label.startsWith('mblock')){
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   // Do not open the dashboard before RSS sampling: a closed extension page can
   // leave a renderer process resident and unfairly charge that UI to mBlock.
   configuration=await worker.evaluate(async()=>{
    await chrome.alarms.clear('update');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mblock-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const metadata=await new Promise((resolve,reject)=>{const r=db.transaction('meta').objectStore('meta').get('active');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    db.close();
    if(!metadata)throw Error('mBlock metadata unavailable');
    return {stats:metadata.stats,sourceHashes:(metadata.sources||[]).map(s=>({id:s.id,sha256:s.sha256}))};
   });
  }
  // Never benchmark an extension which failed to load (notably MV2 in new Chrome).
  // Modern Playwright intentionally returns [] from backgroundPages(), even
  // when attached to historical Chromium. Inspect actual CDP targets instead.
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
   adHits = 0; await page.goto(origin + '/?warmup=' + attempt, {waitUntil:'networkidle'});
   const essential = await page.evaluate(()=>window.essentialLoaded===true && [...document.querySelectorAll('iframe')].every(f=>f.contentWindow.essentialLoaded===true));
   if (essential && adHits === (extension ? 0 : ads)) { ready = true; break; }
  }
  if (!ready) throw new Error(label + ': blocking readiness check failed; refuse misleading timings.');
  const targets = (await root.send('Target.getTargets')).targetInfos;
  const extensionTargets=targets.filter(t=>t.url.startsWith('chrome-extension://'));
  const loadedTargets = extensionTargets.map(t => ({type:t.type,url:t.url}));
  if (extension && !loadedTargets.length) throw new Error(label + ': no extension target loaded');
  // Measure steady-state RSS after dead bootstrap objects are collectible. Apply
  // the exact same V8 GC step to every extension baseline, including uBO.
  for(const t of extensionTargets)try{
   const {sessionId}=await root.send('Target.attachToTarget',{targetId:t.targetId,flatten:false});
   try{await targetCommand(root,sessionId,'HeapProfiler.collectGarbage');}finally{await root.send('Target.detachFromTarget',{sessionId});}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
  const initializationAndWarmupMs=Math.round((performance.now()-setupStarted)*100)/100;
  const samples=[];
  for(let i=0;i<runs;i++){
   adHits=0;
   const before=(await root.send('SystemInfo.getProcessInfo')).processInfo;
   const start=performance.now();await page.goto(origin+'/?sample='+i,{waitUntil:'networkidle'});const elapsed=performance.now()-start;
   const after=(await root.send('SystemInfo.getProcessInfo')).processInfo;
   const oldCPU=new Map(before.map(x=>[x.id,x.cpuTime]));
   const cpuMs=after.reduce((a,p)=>a+Math.max(0,p.cpuTime-(oldCPU.get(p.id)||0))*1000,0);
   const stats=await page.evaluate(()=>({essential:window.essentialLoaded===true,essentialFrames:[...document.querySelectorAll('iframe')].filter(f=>f.contentWindow.essentialLoaded===true).length,adScriptsExecuted:window.adLoads||0,baitHidden:getComputedStyle(document.querySelector('.adsbox')).display==='none',domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,loadMs:performance.getEntriesByType('navigation')[0].loadEventEnd}));
   if (!stats.essential || stats.essentialFrames!==frames || adHits !== (extension ? 0 : ads)) throw new Error(label + ': blocking regression during sample');
   samples.push({navigationAndIdleMs:Math.round(elapsed*100)/100,cpuMs:Math.round(cpuMs*100)/100,rssKiB:rss(after),adRequestsReachedServer:adHits,...stats});
  }
  const median=key=>{const values=samples.map(x=>x[key]).filter(x=>typeof x==='number').sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:null;};
  const processes=processMemory((await root.send('SystemInfo.getProcessInfo')).processInfo);
  const heaps=[];for(const t of targets.filter(t=>t.url.startsWith('chrome-extension://')))try{heaps.push({type:t.type,heap:await targetHeap(root,t.targetId)});}catch(error){heaps.push({type:t.type,error:String(error.message)});}
  const extensionMemory={
    targetCount:heaps.length,
    beforeGcUsedBytes:heaps.reduce((n,h)=>n+(h.heap?.beforeGc?.usedSize||0),0),
    afterGcUsedBytes:heaps.reduce((n,h)=>n+(h.heap?.afterGc?.usedSize||0),0),
    reclaimedBytes:heaps.reduce((n,h)=>n+(h.heap?.reclaimedBytes||0),0)
  };
  let maintenance;
  if(label.startsWith('mblock')&&maintenanceRuns){
   const worker=context.serviceWorkers()[0],ui=await context.newPage();await ui.goto('chrome-extension://'+new URL(worker.url()).host+'/ui/dashboard.html');
   await ui.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'state'});if(!r.ok)throw Error(r.error)});
   const changes=[];
   for(let i=0;i<maintenanceRuns;i++){
    const before=(await root.send('SystemInfo.getProcessInfo')).processInfo,start=performance.now();
    await ui.evaluate(async()=>{for(const enabled of [false,true]){const r=await chrome.runtime.sendMessage({type:'settings',patch:{enabled}});if(!r.ok)throw Error(r.error)}const r=await chrome.runtime.sendMessage({type:'state'});if(!r.ok||!r.data.settings.enabled)throw Error('Protection not restored');});
    const elapsedMs=performance.now()-start,after=(await root.send('SystemInfo.getProcessInfo')).processInfo,oldCPU=new Map(before.map(p=>[p.id,p.cpuTime]));
    changes.push({elapsedMs,cpuMs:after.reduce((n,p)=>n+Math.max(0,p.cpuTime-(oldCPU.get(p.id)||0))*1000,0),rssKiB:rss(after)});
   }
   await ui.close();adHits=0;await page.goto(origin+'/?restored=1',{waitUntil:'networkidle'});
   if(adHits!==0||!await page.evaluate(()=>window.essentialLoaded===true))throw Error('Maintenance changed blocking');
   maintenance={operation:'global pause and resume pair; same existing dashboard; mBlock before/after only',samples:changes,median:Object.fromEntries(['elapsedMs','cpuMs','rssKiB'].map(key=>[key,changes.map(s=>s[key]).sort((a,b)=>a-b)[Math.floor(changes.length/2)]]))};
  }
  return {label,initializationAndWarmupMs,configuration,maintenance,processes,heaps,extensionMemory,loadedTargets,extension:manifest?{name:manifest.name,version:manifest.version,manifestVersion:manifest.manifest_version}:null,browser:context.browser().version(),samples,median:Object.fromEntries(['navigationAndIdleMs','cpuMs','rssKiB','loadMs','adRequestsReachedServer'].map(k=>[k,median(k)]))};
 }finally{if(context)await context.close();await rm(profile,{recursive:true,force:true});}
}
try{
 const configurations = [['no-extension',null]];
 if(process.env.MBLOCK_PREVIOUS) configurations.push(['mblock-before',process.env.MBLOCK_PREVIOUS]);
 configurations.push(['mblock','dist/chrome']);
 if(process.env.MBLOCK_BASELINE) configurations.push(['external-baseline',process.env.MBLOCK_BASELINE]);
 if(process.env.MBLOCK_BENCH_REVERSE === '1') configurations.reverse();
 const scenarios=[];for(const [label,path] of configurations) scenarios.push(await measure(label,path));
 const previous=scenarios.find(s=>s.label==='mblock-before'),current=scenarios.find(s=>s.label==='mblock');
 if(previous && JSON.stringify(previous.configuration)!==JSON.stringify(current.configuration)) throw new Error('Before/after filter configuration differs; refuse comparison.');
 const baseline = scenarios.find(s => s.label === 'external-baseline');
 const originCompared = baseline?.extension?.name === 'uBlock Origin' && baseline.extension.manifestVersion === 2;
 const report={at:new Date().toISOString(),order:scenarios.map(s=>s.label),machine:{platform:platform(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length},fixture:{runs,frames,maintenanceRuns,adsPerPage:ads,cache:'no-store; one warm-up',heapMeasurement:'extension target heap is recorded before and after explicit V8 garbage collection',note:'Synthetic local fixture; no live-site claim. Fresh default profiles; mBlock scheduled update alarm is cleared for the run; no dashboard is opened before RSS samples; dead extension bootstrap objects are garbage-collected before steady-state sampling for every extension. uBO default bundled lists; subscriptions are not identical. Sequential scenarios can have order and background update bias.'},comparisonToUBlockOriginComplete:originCompared,scope:'Single synthetic fixture only; not a general superiority test',baselineProvided:!!process.env.MBLOCK_BASELINE,scenarios};
 await mkdir('test-results',{recursive:true});await writeFile(process.env.MBLOCK_BENCH_OUTPUT || 'test-results/benchmark.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(scenarios.map(x=>({label:x.label,initializationAndWarmupMs:x.initializationAndWarmupMs,extension:x.extension,median:x.median,extensionMemory:x.extensionMemory,maintenance:x.maintenance,processes:x.processes,heaps:x.heaps})),null,2));
}finally{await new Promise(r=>server.close(r));}
