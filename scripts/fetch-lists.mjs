import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCES } from '../src/shared/sources.js';
import { fetchList } from '../src/shared/fetch-lists.js';
await mkdir('data/cache', { recursive: true });
const statuses = [];
// Deliberately two at a time; no unbounded request fan-out.
for (let i = 0; i < SOURCES.length; i += 2) {
  const results = await Promise.all(SOURCES.slice(i, i + 2).filter(s => s.enabled).map(s => fetchList(s)));
  for (const r of results) { await writeFile(`data/cache/${r.id}.txt`, r.text); statuses.push(r.status); console.log(`${r.id}: ${r.status.bytes} bytes, ${r.status.files} arquivo(s)`); }
}
await writeFile('data/cache/status.json', JSON.stringify(statuses, null, 2) + '\n');
