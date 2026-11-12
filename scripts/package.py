import hashlib,json,zipfile,subprocess
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
            relative=p.relative_to(source)
            # Chromium creates compiled ruleset caches when CI loads dist/chrome.
            # They are browser-owned files, not distributable extension sources.
            if p.is_file() and '_metadata' not in relative.parts: z.write(p,relative)
    checks.append(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name)
    print(output.name,output.stat().st_size)
source_output=artifacts/f'mblock-fontes-{version}.zip'
tracked=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
with zipfile.ZipFile(source_output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in sorted(tracked):
        p=root/name
        if p.is_file(): z.write(p,name)
    for p in sorted((root/'data/cache').glob('*')):
        if p.is_file() and p.suffix in ['.txt','.json']:z.write(p,p.relative_to(root))
checks.append(hashlib.sha256(source_output.read_bytes()).hexdigest()+'  '+source_output.name)
print(source_output.name,source_output.stat().st_size)
checks_file=artifacts/'SHA256SUMS.txt';checks_file.write_text('\n'.join(checks)+'\n')
