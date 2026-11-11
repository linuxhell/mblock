// SPDX-License-Identifier: GPL-3.0-only
import { LIMITS } from './sources.js';
export async function sha256(text) {
  const bytes = new TextEncoder().encode(text), hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function fetchList(source, fetcher = fetch) {
  const seen = new Set(); let total = 0;
  const base = new URL(source.url), directory = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
  async function load(url, depth = 0) {
    if (depth > 5 || seen.size >= LIMITS.includes) throw new Error('Muitos includes em ' + source.id);
    const u = new URL(url);
    if (u.origin !== base.origin || !u.pathname.startsWith(directory) || u.protocol !== 'https:') throw new Error('Include fora da origem permitida');
    if (seen.has(u.href)) throw new Error('Include repetido/cíclico: ' + u.pathname);
    seen.add(u.href);
    const response = await fetcher(u.href, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`${source.name || source.id}: HTTP ${response.status}`);
    const chunks = []; const reader = response.body.getReader(); let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; total += value.length; if (total > LIMITS.inputBytes) { await reader.cancel(); throw new Error('Lista excede o limite de bytes'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/^\s*(?:<!doctype|<html)/i.test(text) || !text.trim()) throw new Error('Servidor retornou HTML ou lista vazia: ' + source.id);
    const result = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('!#include ')) { const path = line.slice(10).trim(); if (!/^[\w./-]+\.txt$/.test(path)) throw new Error('Include inválido'); result.push(await load(new URL(path, u).href, depth + 1)); }
      else result.push(line);
    }
    return result.join('\n');
  }
  const text = await load(source.url);
  return { id: source.id, text, status: { id: source.id, name: source.name, url: source.url, fetchedAt: new Date().toISOString(), bytes: total, files: seen.size, sha256: await sha256(text) } };
}
