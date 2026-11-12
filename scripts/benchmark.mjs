import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir, cpus, platform } from 'node:os';
const runs = Math.max(3, Math.min(20, Number(process.env.MBLOCK_BENCH_RUNS) || 5));
const ads = 60; let adHits = 0;
const html = port => `<!doctype html><title>Controlled blocking benchmark</title><h1>Essential content</h1><div class="adsbox" style="height:10px">Ad bait</div><script src="/essential.js"></script>` + Array.from({length:ads},(_,i)=>`<script async src="http://ads.doubleclick.net:${port}/mblock-benchmark-${i}.js"></script>`).join('');
const server = createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');
 if(req.headers.host.startsWith('ads.doubleclick.net')){adHits++;res.setHeader('Content-Type','text/javascript');res.end('window.adLoads=(window.adLoads||0)+1;'+ '/* controlled payload */'.repeat(100));}
 else if(req.url==='/essential.js'){res.setHeader('Content-Type','text/javascript');res.end('window.essentialLoaded=true');}
 else{res.setHeader('Content-Type','text/html');res.end(html(server.address().port));}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://site.mblock.test:'+server.address().port;
function rss(processes){if(platform()!=='linux')return null;try{return Number(execFileSync('ps',['-p',processes.map(p=>p.id).join(','),'-o','rss='],{encoding:'utf8'}).trim().split(/\s+/).reduce((a,b)=>a+Number(b||0),0));}catch{return null;}}
async function measure(label, extensionPath){
 const profile=await mkdtemp(tmpdir()+'/mblock-bench-');let context;
 try{
  const extension=extensionPath?resolve(extensionPath):null;
  const manifest=extension?JSON.parse(await readFile(extension+'/manifest.json','utf8')):null;
  context=await chromium.launchPersistentContext(profile,{channel:process.env.MBLOCK_BROWSER_PATH?undefined:'chromium',executablePath:process.env.MBLOCK_BROWSER_PATH||undefined,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP site.mblock.test 127.0.0.1, MAP ads.doubleclick.net 127.0.0.1',...(extension?['--disable-extensions-except='+extension,'--load-extension='+extension]:[])]});
  const page=await context.newPage(), root=await context.browser().newBrowserCDPSession(), cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if(label==='mblock'){
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   const ui=await context.newPage();await ui.goto('chrome-extension://'+new URL(worker.url()).host+'/ui/dashboard.html');
   await ui.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'state'});if(!r.ok)throw Error(r.error);await chrome.runtime.sendMessage({type:'settings',patch:{autoUpdate:false}})});await ui.close();
  }
  // Never benchmark an extension which failed to load (notably MV2 in new Chrome).
  if (extension && manifest.manifest_version === 2 && !context.backgroundPages().length) await context.waitForEvent('backgroundpage', {timeout:15000});
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
   adHits = 0; await page.goto(origin + '/?warmup=' + attempt, {waitUntil:'networkidle'});
   const essential = await page.evaluate(()=>window.essentialLoaded===true);
   if (essential && adHits === (extension ? 0 : ads)) { ready = true; break; }
  }
  if (!ready) throw new Error(label + ': blocking readiness check failed; refuse misleading timings.');
  const samples=[];
  for(let i=0;i<runs;i++){
   adHits=0;
   const before=(await root.send('SystemInfo.getProcessInfo')).processInfo;
   const start=performance.now();await page.goto(origin+'/?sample='+i,{waitUntil:'networkidle'});const elapsed=performance.now()-start;
   const after=(await root.send('SystemInfo.getProcessInfo')).processInfo;
   const oldCPU=new Map(before.map(x=>[x.id,x.cpuTime]));
   const cpuMs=after.reduce((a,p)=>a+Math.max(0,p.cpuTime-(oldCPU.get(p.id)||0))*1000,0);
   const stats=await page.evaluate(()=>({essential:window.essentialLoaded===true,adScriptsExecuted:window.adLoads||0,baitHidden:getComputedStyle(document.querySelector('.adsbox')).display==='none',domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,loadMs:performance.getEntriesByType('navigation')[0].loadEventEnd}));
   if (!stats.essential || adHits !== (extension ? 0 : ads)) throw new Error(label + ': blocking regression during sample');
   samples.push({navigationAndIdleMs:Math.round(elapsed*100)/100,cpuMs:Math.round(cpuMs*100)/100,rssKiB:rss(after),adRequestsReachedServer:adHits,...stats});
  }
  const median=key=>{const values=samples.map(x=>x[key]).filter(x=>typeof x==='number').sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:null;};
  return {label,extension:manifest?{name:manifest.name,version:manifest.version,manifestVersion:manifest.manifest_version}:null,browser:context.browser().version(),samples,median:Object.fromEntries(['navigationAndIdleMs','cpuMs','rssKiB','loadMs','adRequestsReachedServer'].map(k=>[k,median(k)]))};
 }finally{if(context)await context.close();await rm(profile,{recursive:true,force:true});}
}
try{
 const scenarios=[await measure('no-extension'),await measure('mblock','dist/chrome')];
 if(process.env.MBLOCK_BASELINE)scenarios.push(await measure('external-baseline',process.env.MBLOCK_BASELINE));
 const baseline = scenarios.find(s => s.label === 'external-baseline');
 const originCompared = baseline?.extension?.name === 'uBlock Origin' && baseline.extension.manifestVersion === 2;
 const report={at:new Date().toISOString(),machine:{platform:platform(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length},fixture:{runs,adsPerPage:ads,cache:'no-store; one warm-up',note:'Synthetic local fixture; no live-site claim. Fresh default profiles; mBlock auto-updates disabled after initialization; uBO default bundled lists; subscriptions are not identical. Sequential scenarios can have order and background update bias.'},comparisonToUBlockOriginComplete:originCompared,scope:'Single synthetic fixture only; not a general superiority test',baselineProvided:!!process.env.MBLOCK_BASELINE,scenarios};
 await mkdir('test-results',{recursive:true});await writeFile(process.env.MBLOCK_BENCH_OUTPUT || 'test-results/benchmark.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(scenarios.map(x=>({label:x.label,extension:x.extension,median:x.median})),null,2));
}finally{await new Promise(r=>server.close(r));}
