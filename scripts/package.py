"""Build public installation assets. Never publish sources or unsigned Firefox ZIPs."""
import argparse
import hashlib
import json
import shutil
import io
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
parser = argparse.ArgumentParser()
parser.add_argument('--signed-firefox', type=Path, help='XPI returned by Mozilla for this exact version')
parser.add_argument('--require-firefox', action='store_true', help='Fail before packaging if the signed XPI is absent')
args = parser.parse_args()
if args.require_firefox and not args.signed_firefox:
    raise SystemExit('A release exige o XPI assinado pela Mozilla.')
# Validate all inputs before modifying output. This is a structural check, not a
# cryptographic signature verifier; the release workflow obtains the XPI from AMO.
signed_bytes = args.signed_firefox.read_bytes() if args.signed_firefox else None
if signed_bytes:
    with zipfile.ZipFile(io.BytesIO(signed_bytes)) as z:
        manifest = json.loads(z.read('manifest.json'))
        if manifest['version'] != version or manifest.get('browser_specific_settings', {}).get('gecko', {}).get('id') != 'mblock@linuxhell.github.io':
            raise SystemExit('XPI de outra versão ou complemento.')
        if not {'META-INF/mozilla.rsa', 'META-INF/mozilla.sf'}.issubset(z.namelist()):
            raise SystemExit('XPI sem os registros de assinatura Mozilla.')
for target in ['chrome', 'edge']:
    source = root / 'dist' / target
    manifest = json.loads((source / 'manifest.json').read_text())
    if manifest['version'] != version:
        raise SystemExit('Execute npm run build primeiro: versão do pacote divergente.')
artifacts = root / 'artifacts'
# Dedicated generated directory: remove stale source/unsigned packages too.
if artifacts.exists():
    shutil.rmtree(artifacts)
artifacts.mkdir()
checks = []
for target in ['chrome', 'edge']:
    source = root / 'dist' / target
    output = artifacts / f'mblock-{target}-{version}.zip'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(source.rglob('*')):
            relative = p.relative_to(source)
            if p.is_file() and '_metadata' not in relative.parts:
                z.write(p, relative)
    checks.append(output)
if args.signed_firefox:
    output = artifacts / f'mblock-firefox-{version}.xpi'
    output.write_bytes(signed_bytes)
    checks.append(output)
(root / 'artifacts' / 'SHA256SUMS.txt').write_text(''.join(
    hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in checks))
for p in checks:
    print(p.name, p.stat().st_size)
