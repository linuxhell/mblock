import { execFileSync } from 'node:child_process';
let output;
try { output=execFileSync(process.platform==='win32'?'npx.cmd':'npx',['web-ext','lint','--source-dir','dist/firefox','--output','json'],{encoding:'utf8',maxBuffer:10*1024*1024}); }
catch(e){output=e.stdout||'';}
const result=JSON.parse(output);
// Filter-list entries mention domains of coin miners because they BLOCK them.
// Keep those known data-only false positives visible, and reject every other warning.
const unexpected=(result.warnings||[]).filter(w=>!(w.code==='COINMINER_USAGE_DETECTED'&&w.file.startsWith('data/')&&w.file.endsWith('.json')));
console.log(JSON.stringify(result,null,2));
if(result.summary.errors||unexpected.length)process.exitCode=1;
