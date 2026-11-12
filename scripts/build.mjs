import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { SOURCES, VERSION } from '../src/shared/sources.js';
import { compileLists } from '../src/shared/compiler.js';
import { builtInRules } from '../src/shared/fixes.js';
import { STRINGS } from '../src/ui/translations.js';
import { buildYouTube } from './build-youtube.mjs';
execFileSync('python3', ['scripts/icons.py']);
const texts = [];
for (const s of SOURCES.filter(s => s.enabled)) {
  try { texts.push({ id: s.id, text: await readFile(`data/cache/${s.id}.txt`, 'utf8') }); }
  catch { throw new Error('Faltam listas. Execute npm run fetch:lists antes de compilar.'); }
}
const sources = JSON.parse(await readFile('data/cache/status.json', 'utf8'));
const common = { manifest_version: 3, name: '__MSG_extensionName__', version: VERSION, default_locale: 'pt_BR', description: '__MSG_extensionDescription__', permissions: ['declarativeNetRequest', 'declarativeNetRequestFeedback', 'storage', 'alarms', 'scripting', 'webRequest', 'tabs'], host_permissions: ['http://*/*', 'https://*/*'], action: { default_popup: 'ui/popup.html', default_title: '__MSG_extensionName__' }, icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' }, options_ui: { page: 'ui/dashboard.html', open_in_tab: true }, content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'], run_at: 'document_start', all_frames: true }], declarative_net_request: { rule_resources: [{ id: 'bootstrap', enabled: true, path: 'data/bootstrap.json' }] }, web_accessible_resources: [{ resources: ['resources/fcportables-core.js'], matches: ['*://*.fcportables.com/*'] }], content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';" } };
await mkdir('dist', { recursive: true });
const summaries = {};
for (const target of ['chrome', 'edge', 'firefox']) {
  const dir = 'dist/' + target; await rm(dir, { recursive: true, force: true }); await cp('src', dir, { recursive: true }); await mkdir(dir + '/data', { recursive: true });
  await writeFile(dir + '/shared/platform.js', '// SPDX-License-Identifier: GPL-3.0-only\nexport const BUILD_TARGET = ' + JSON.stringify(target) + ';\n');
  for (const [language, index, description] of [['pt_BR',0,'Bloqueio de anúncios e rastreadores, com diagnóstico local e controle por site.'],['en',1,'Ad and tracker blocking, with local diagnostics and per-site control.'],['zh_CN',2,'广告和跟踪器拦截，提供本地诊断与按网站控制。']]) {
    const messages = { extensionName: { message: 'mBlock' }, extensionDescription: { message: description } };
    STRINGS.forEach((row, i) => { messages['ui_' + i] = { message: row[index].replaceAll('$','$$') }; });
    await mkdir(`${dir}/_locales/${language}`,{recursive:true});await writeFile(`${dir}/_locales/${language}/messages.json`,JSON.stringify(messages,null,2)+'\n');
  }
  const profile = await buildYouTube(texts, target, dir);
  const compiled = compileLists(texts, { target, maxRules: 29800, packagedFilters: profile.rules });
  // Full native protection is available before the worker finishes first-install
  // initialization. Disable this static snapshot only after dynamic activation.
  const bootstrap = [...compiled.rules, ...builtInRules({})].map((rule, i) => ({ ...rule, id:i + 1 }));
  const manifest = { ...common, background: target === 'firefox' ? { scripts: ['background.js'], type: 'module' } : { service_worker: 'background.js', type: 'module' } };
  if (target === 'firefox') manifest.browser_specific_settings = { gecko: { id: 'mblock@linuxhell.github.io', strict_min_version: '142.0', data_collection_permissions: { required: ['none'] } } };
  else manifest.minimum_chrome_version = '121';
  await writeFile(dir + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  const parts = {}, textIndex = [];
  for (const key of ['rules', 'provenance', 'cosmetics']) {
    parts[key] = [];
    let chunk = [], bytes = 2;
    async function flush() { if (!chunk.length) return; const file = `data/${key}-${parts[key].length}.json`; parts[key].push(file); await writeFile(dir + '/' + file, '[' + chunk.join(',') + ']'); chunk = []; bytes = 2; }
    for (const value of compiled[key]) { const encoded = JSON.stringify(value), size = Buffer.byteLength(encoded) + 1; if (size > 4500000) throw new Error('Registro grande demais para distribuição: ' + key); if (bytes + size > 3500000) await flush(); chunk.push(encoded); bytes += size; }
    await flush();
  }
  for (const { id, text } of texts) {
    const files = [];
    for (let i = 0; i < text.length; i += 750000) { const file = `data/text-${id}-${i / 750000}.json`; files.push(file); await writeFile(dir + '/' + file, JSON.stringify(text.slice(i, i + 750000))); }
    textIndex.push({ id, parts: files });
  }
  const { rules, provenance, cosmetics, ...smallCompiled } = compiled;
  await writeFile(dir + '/data/default.json', JSON.stringify({ compiled: smallCompiled, parts, texts: textIndex, sources }));
  await writeFile(dir + '/data/bootstrap.json', JSON.stringify(bootstrap));
  await cp('LICENSE', dir + '/LICENSE'); await cp('THIRD_PARTY_NOTICES.md', dir + '/THIRD_PARTY_NOTICES.md');
  summaries[target] = { ...compiled.stats, bundledRules: bootstrap.length, youtubeScriptlets: profile.count, youtubeProfileHash: profile.hash };
  console.log(target + ': ' + JSON.stringify(summaries[target]));
}
await writeFile('dist/build-report.json', JSON.stringify({ version: VERSION, at: new Date().toISOString(), sources, targets: summaries }, null, 2) + '\n');
