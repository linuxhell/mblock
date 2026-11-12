import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/package.py'

class PackagingPolicy(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'scripts').mkdir()
        shutil.copyfile(SCRIPT, self.root / 'scripts/package.py')
        (self.root / 'package.json').write_text(json.dumps({'version': '0.3.0'}))
        for target in ['chrome', 'edge']:
            folder = self.root / 'dist' / target
            folder.mkdir(parents=True)
            (folder / 'manifest.json').write_text(json.dumps({'version': '0.3.0'}))
            (folder / '_metadata').mkdir()
            (folder / '_metadata/cache').write_text('browser generated')
        (self.root / 'artifacts').mkdir()
        (self.root / 'artifacts/mblock-fontes-0.2.1.zip').write_text('stale')

    def tearDown(self):
        self.tmp.cleanup()

    def run_package(self, *args):
        return subprocess.run(['python3', str(self.root / 'scripts/package.py'), *map(str, args)], capture_output=True, text=True)

    def xpi(self, version='0.3.0', records=True):
        path = self.root / 'artifacts/input.xpi'
        with zipfile.ZipFile(path, 'w') as z:
            z.writestr('manifest.json', json.dumps({'version': version, 'browser_specific_settings': {'gecko': {'id': 'mblock@linuxhell.github.io'}}}))
            if records:
                # Synthetic records only exercise packaging, not cryptographic trust.
                z.writestr('META-INF/mozilla.rsa', 'test record')
                z.writestr('META-INF/mozilla.sf', 'test record')
        return path

    def test_only_chrome_edge_and_checksums_by_default(self):
        result = self.run_package()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({p.name for p in (self.root / 'artifacts').iterdir()}, {'mblock-chrome-0.3.0.zip', 'mblock-edge-0.3.0.zip', 'SHA256SUMS.txt'})
        with zipfile.ZipFile(self.root / 'artifacts/mblock-chrome-0.3.0.zip') as z:
            self.assertEqual(z.namelist(), ['manifest.json'])

    def test_release_rejects_missing_unsigned_or_wrong_version_xpi(self):
        self.assertNotEqual(self.run_package('--require-firefox').returncode, 0)
        self.assertNotEqual(self.run_package('--signed-firefox', self.xpi(records=False)).returncode, 0)
        self.assertNotEqual(self.run_package('--signed-firefox', self.xpi(version='0.2.1')).returncode, 0)

    def test_xpi_is_preserved_byte_for_byte_even_inside_output_directory(self):
        source = self.xpi()
        data = source.read_bytes()
        result = self.run_package('--require-firefox', '--signed-firefox', source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'artifacts/mblock-firefox-0.3.0.xpi').read_bytes(), data)
        sums = (self.root / 'artifacts/SHA256SUMS.txt').read_text()
        self.assertEqual(len(sums.splitlines()), 3)
        self.assertNotIn('fontes', sums)

if __name__ == '__main__':
    unittest.main()
