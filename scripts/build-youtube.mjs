// SPDX-License-Identifier: GPL-3.0-only
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AstFilterParser, utils } from '../vendor/ublock/src/js/static-filtering-parser.js';
import { builtinScriptlets } from '../vendor/ublock/src/js/resources/scriptlets.js';
import * as generator from '../vendor/ublock/src/js/make-scriptlets.js';
import { installYouTubePlayback } from '../src/shared/youtube-playback.js';
const ROOTS = ['youtube.com', 'youtube-nocookie.com', 'youtubekids.com'];
const inScope = host => ROOTS.some(root => host === root || host.endsWith('.' + root));
export async function buildYouTube(texts, target, dir) {
  const upstream = JSON.parse(await readFile('vendor/ublock/UPSTREAM.json', 'utf8'));
  const env = ['mv3', 'ubol', target === 'firefox' ? 'firefox' : 'chromium', ...(target === 'edge' ? ['edge'] : [])];
  const parser = new AstFilterParser({ trustedSource: true });
  const known = new Set(builtinScriptlets.flatMap(s => [s.name, ...(s.aliases || [])]).map(s => s.replace(/\.js$/, '')));
  const entries = new Map(), accepted = [], rejected = [];
  for (const source of texts.filter(s => ['quick', 'ublock', 'privacy', 'unbreak'].includes(s.id))) {
    const active = utils.preparser.prune(source.text, env);
    for (const raw of active.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('!') || !line.includes('+js(')) continue;
      parser.parse(line); if (!parser.isScriptletFilter()) continue;
      const matches = [], excluded = [];
      // This iterator reuses its entry object; copy values during iteration.
      for (const { hn, not, bad } of parser.getExtFilterDomainIterator()) { if (bad || !inScope(hn)) continue; (not ? excluded : matches).push(hn); }
      if (!matches.length && !excluded.length) continue;
      const args = parser.getScriptletArgs();
      if (parser.hasError() || (args.length && !known.has(args[0].replace(/\.js$/, '')))) { rejected.push({ source: source.id, line, reason: 'upstream parser or scriptlet unavailable' }); continue; }
      const key = JSON.stringify(args), entry = entries.get(key) || { args, matches: new Set(), excludeMatches: new Set(), trustedSource: true };
      for (const host of matches) (parser.isException() ? entry.excludeMatches : entry.matches).add(host);
      for (const host of excluded) (parser.isException() ? entry.matches : entry.excludeMatches).add(host);
      entries.set(key, entry); accepted.push([source.id, line]);
    }
  }
  generator.resetAll(); generator.init(builtinScriptlets);
  for (const entry of entries.values()) {
    if (entry.matches.size === 0 && entry.args.length) continue;
    generator.compile('mblock-youtube', { ...entry, args: [...entry.args], matches: [...entry.matches], excludeMatches: [...entry.excludeMatches] });
  }
  const hash = createHash('sha256').update(upstream.commit + target + JSON.stringify(accepted) + installYouTubePlayback.toString()).digest('hex');
  const secret = 'mblock-' + hash.slice(0, 32);
  const template = await readFile('vendor/ublock/src/js/scriptlet.template.js', 'utf8');
  const core = generator.commit('mblock-youtube', template, secret);
  const framework = generator.commitFramework(await readFile('vendor/ublock/src/js/scriptlet-begin.template.js', 'utf8'), await readFile('vendor/ublock/src/js/scriptlet-end.template.js', 'utf8'), secret);
  if (!core.MAIN) throw new Error('YouTube profile generated no MAIN script.');
  const guard = `(() => {\n'use strict';\nif (!${JSON.stringify(ROOTS)}.some(root => location.hostname === root || location.hostname.endsWith('.' + root))) return;\n`;
  const files = [];
  await mkdir(dir + '/site', { recursive: true });
  for (const world of ['MAIN', 'ISOLATED']) if (core[world] || world === 'ISOLATED') {
    const path = 'site/youtube-' + world.toLowerCase() + '-' + hash.slice(0, 12) + '.js'; files.push({ world, path });
    const pieces = core[world] ? [framework[world].beginCode, core[world].code, framework[world].endCode] : [];
    if (world === 'ISOLATED') pieces.push('(' + installYouTubePlayback.toString() + ')(' + JSON.stringify(hash) + ');');
    const code = guard + pieces.join('\n') + '\n})();\n';
    await writeFile(dir + '/' + path, code);
  }
  const profile = { id: 'youtube-v1', rules: accepted, count: accepted.length, uniqueScriptletCalls: entries.size, hash, playbackRecovery: true, upstream: { repository: upstream.repository, commit: upstream.commit }, sources: texts.filter(s => ['quick', 'ublock', 'privacy', 'unbreak'].includes(s.id)).map(s => ({ id: s.id, sha256: createHash('sha256').update(s.text).digest('hex') })), files, allFrames: false, rejected };
  await writeFile(dir + '/shared/youtube-profile.js', '// SPDX-License-Identifier: GPL-3.0-only\nexport const YOUTUBE_PROFILE = ' + JSON.stringify(profile) + ';\n');
  await writeFile(dir + '/data/youtube-profile.json', JSON.stringify(profile, null, 2) + '\n');
  return profile;
}
