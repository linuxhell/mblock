import hashlib,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
artifacts=root/'artifacts';artifacts.mkdir(exist_ok=True)
checks=[]
for target in ['chrome','edge','firefox']:
    source=root/'dist'/target
    if not (source/'manifest.json').exists(): raise SystemExit('Execute npm run build primeiro.')
    output=artifacts/f'mblock-{target}-{version}.zip'
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(source.rglob('*')):
            if p.is_file(): z.write(p,p.relative_to(source))
    checks.append(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name)
    print(output.name,output.stat().st_size)
checks_file=artifacts/'SHA256SUMS.txt';checks_file.write_text('\n'.join(checks)+'\n')
