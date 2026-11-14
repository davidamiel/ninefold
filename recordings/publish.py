"""Upload staged MP3s to an existing media release without deploying the website."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from generate import ROOT, local_path

REPOSITORY = 'davidamiel/ninefold'
DATA = ROOT/'dist/data'
ASSETS = DATA/'recorded-assets.json'
INVENTORY = DATA/'prepared-documents.json'


def github(*arguments):
    return subprocess.check_output(['gh', *arguments], text=True)


def release_assets(release):
    pages = json.loads(github('api', '--paginate', '--slurp',
                             f'repos/{REPOSITORY}/releases/{release}/assets?per_page=100'))
    return {asset['name']: asset for page in pages for asset in page}


def verify_asset(asset, digest, size, tag):
    expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/{digest[:24]}.mp3'
    if (asset.get('digest') != 'sha256:'+digest or asset.get('size') != size
            or asset.get('state') != 'uploaded' or asset.get('browser_download_url') != expected):
        raise ValueError('Published audio does not match the staged recording')
    return {'url': expected, 'bytes': size, 'releaseAssetId': asset['id']}


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')
    temporary.replace(path)


def staged_audio(term):
    candidates = {}
    for document in json.loads(INVENTORY.read_text()).values():
        if str(document.get('term')) != term and '/opinions/'+term[-2:]+'pdf/' not in document.get('sourceUrl', ''):
            continue
        for recording in document['recordings'].values():
            if not recording['url'].startswith('audio/'):
                continue
            audio = local_path(ROOT/'dist'/recording['url'], ROOT/'dist/audio')
            digest = hashlib.sha256(audio.read_bytes()).hexdigest()
            cues = json.loads(local_path(ROOT/'dist'/recording['cuesPath'], DATA).read_text())
            if cues.get('audioSha256') != digest:
                raise ValueError('Audio and sentence cues differ')
            candidates[digest] = audio

    return candidates


def upload_assets(candidates, release, tag):
    existing = release_assets(release)
    def upload(item):
        digest, audio = item
        name = digest[:24]+'.mp3'
        if name not in existing:
            # Existing bytes are never overwritten; revisions get a new hash.
            with tempfile.TemporaryDirectory(prefix='upload-', dir=ROOT/'work/recordings') as folder:
                staged = Path(folder)/name
                shutil.copyfile(audio, staged)
                github('release', 'upload', tag, str(staged), '--repo', REPOSITORY)
        return digest, audio.stat().st_size

    with ThreadPoolExecutor(max_workers=2) as workers:
        uploaded = dict(workers.map(upload, candidates.items()))
    actual = release_assets(release)
    confirmed = {digest: verify_asset(actual[digest[:24]+'.mp3'], digest, size, tag)
                 for digest, size in uploaded.items()}
    return confirmed


def update_inventory(confirmed):
    lock_path = local_path(ROOT/'work/recordings/staging.lock', ROOT/'work')
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assets = json.loads(ASSETS.read_text()) if ASSETS.exists() else {}
        assets.update(confirmed)
        documents = json.loads(INVENTORY.read_text())
        for document in documents.values():
            for recording in document['recordings'].values():
                if recording['url'].startswith('audio/'):
                    cues = json.loads((ROOT/'dist'/recording['cuesPath']).read_text())
                    hosted = assets.get(cues.get('audioSha256'))
                    if hosted:
                        recording['url'] = hosted['url']
        # Publish proofs before references, while sharing the staging lock.
        write_json(ASSETS, assets)
        write_json(INVENTORY, documents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'recorded-audio-ot\d{2}', args.tag):
        raise ValueError('Use a term-specific recorded-audio release')
    release = json.loads(github('api', f'repos/{REPOSITORY}/releases/tags/{args.tag}'))
    if release['draft']:
        raise ValueError('Anonymous streaming requires a public media release')
    confirmed = upload_assets(staged_audio('20'+args.tag[-2:]), release['id'], args.tag)
    update_inventory(confirmed)
    print('Verified release assets and updated recording URLs. Website deployment is unchanged.')


if __name__ == '__main__':
    main()
