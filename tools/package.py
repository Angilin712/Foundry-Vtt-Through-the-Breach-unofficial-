"""Build a reproducible installation ZIP. Run from any directory: python tools/package.py."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
system = root / 'through-the-breach'
manifest = json.loads((system / 'system.json').read_text(encoding='utf-8'))
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f"through-the-breach-{manifest['version']}.zip"
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for p in sorted(system.rglob('*')):
        if not p.is_file():
            continue
        relative = p.relative_to(system).as_posix()
        native_pack = any(relative.startswith(pack['path'] + '/') for pack in manifest.get('packs', []))
        if native_pack and p.name in {'LOCK', 'LOG', 'LOG.old'}:
            continue
        if not native_pack and p.suffix not in {'.mjs', '.json', '.hbs', '.css', '.svg', '.md', '.webp', '.jpg', '.png'}:
            raise ValueError(f'Unexpected package file: {p.name}')
        info = ZipInfo(p.relative_to(root).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, p.read_bytes(), compresslevel=9)
with ZipFile(archive) as z:
    assert z.testzip() is None
    for name in manifest['esmodules'] + manifest['styles'] + [x['path'] for x in manifest['languages']]:
        assert f'through-the-breach/{name}' in z.namelist()
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
if archive.stat().st_size >= 100 * 1024 * 1024:
    raise ValueError('Installation ZIP exceeds the GitHub single-file limit; use release assets or reduce package size.')
(out / f'{archive.name}.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
print(f'{archive.name}: {archive.stat().st_size} bytes, SHA256 {checksum}')
