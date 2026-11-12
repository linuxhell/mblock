import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UI version labels come from the runtime manifest', async () => {
  const [pkgText, sources, popup, dashboard, common] = await Promise.all([
    readFile('package.json', 'utf8'),
    readFile('src/shared/sources.js', 'utf8'),
    readFile('src/ui/popup.html', 'utf8'),
    readFile('src/ui/dashboard.html', 'utf8'),
    readFile('src/ui/common.js', 'utf8')
  ]);

  const version = JSON.parse(pkgText).version;
  assert.match(sources, new RegExp(`VERSION = ['"]${version.replaceAll('.', '\\.') }['"]`));
  assert.match(popup, /data-extension-version/);
  assert.match(dashboard, /data-extension-version/);
  assert.doesNotMatch(popup, /<span class="tag">\d+\.\d+\.\d+<\/span>/);
  assert.doesNotMatch(dashboard, /<span class="tag">\d+\.\d+\.\d+<\/span>/);
  assert.match(common, /runtime\.getManifest\(\)\.version/);
  assert.match(common, /querySelectorAll\?\.\('\[data-extension-version\]'\)/);
});
