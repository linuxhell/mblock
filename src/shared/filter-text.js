// SPDX-License-Identifier: GPL-3.0-only
import { LIMITS } from './sources.js';
export async function packFilterText(source) {
  const stream = new Blob([source.text]).stream().pipeThrough(new CompressionStream('gzip'));
  return {id:source.id,encoding:'gzip',data:new Uint8Array(await new Response(stream).arrayBuffer())};
}
export async function unpackFilterTexts(sources) {
  if (!sources.some(source => source.encoding === 'gzip')) return sources;
  const result = [];
  // Sequential decoding bounds temporary allocations when recompiling later.
  for (const source of sources) {
    if (source.encoding !== 'gzip') { result.push(source); continue; }
    const reader = new Blob([source.data]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = []; let bytes = 0;
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMITS.inputBytes) { await reader.cancel(); throw new Error('Lista muito grande: ' + source.id); }
      chunks.push(value);
    }
    const data = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.length; }
    result.push({id:source.id,text:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data)});
  }
  return result;
}
