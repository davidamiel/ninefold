"""Package a static release while retaining editable source JSON in dist."""
from pathlib import Path
import gzip,json,shutil
repo=Path(__file__).resolve().parents[1]; source=repo/'dist'; output=repo/'out';output.mkdir(exist_ok=True)
hosted_path=source/'data/recorded-assets.json'
hosted=json.loads(hosted_path.read_text()) if hosted_path.exists() else {}
hosted_audio={digest[:24]+'.mp3' for digest in hosted}
inventory=json.loads((source/'data/prepared-documents.json').read_text())
local_audio={recording['url'] for document in inventory.values() for recording in document['recordings'].values() if recording['url'].startswith('audio/')}
expected=set()
for file in source.rglob('*'):
    if not file.is_file():continue
    relative=file.relative_to(source);dest=output/relative
    if relative.parts[0]=='audio' and file.name in hosted_audio and relative.as_posix() not in local_audio:continue
    # Full-resolution illustration masters stay in source; all public portraits
    # use the consistently cropped bench-centered assets.
    if relative.parts[:2]==('images','justice-art'):continue
    if relative.parts[:2]==('images','advocate-art') and file.suffix=='.png':continue
    packed=(relative.parts[:2] in [('data','docs'),('data','current-docs'),('data','statutes'),('data','reader-assets'),('data','prepared-text')]
            or relative.as_posix() in {'data/reading-layout.json','data/catalog.json','data/current-term.json','data/argument-alignment.json','data/reader-structure.json','data/brief-precedent-summaries.json','data/precedent-index.json','data/statute-index.json','data/cited-opinions.json','data/rules-index.json'}) and file.suffix=='.json'
    if packed:dest=dest.with_suffix('.json.gz')
    expected.add(dest.resolve());dest.parent.mkdir(parents=True,exist_ok=True)
    if packed:dest.write_bytes(gzip.compress(file.read_bytes(),compresslevel=6,mtime=0))
    elif relative.as_posix()=='index.html':dest.write_text(file.read_text(encoding='utf-8').replace('<html lang="en">','<html lang="en" data-packed-text="true">'),encoding='utf-8')
    else:shutil.copy2(file,dest)
# Remove only stale generated files inside this project's verified output directory.
for old in output.rglob('*'):
    if old.is_file() and old.resolve().is_relative_to(output.resolve()) and old.resolve() not in expected:old.unlink()
print(f'Packaged {len(expected)} files, {sum(p.stat().st_size for p in expected)/1024/1024:.1f} MiB expanded.')

(output/'.nojekyll').touch()
