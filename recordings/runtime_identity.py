"""Identify the local English speech runtime, including pronunciation assets."""
import hashlib
from importlib import import_module
from importlib.metadata import PackageNotFoundError, packages_distributions, version
import json
from pathlib import Path
import platform
import unicodedata


DEPENDENCIES = ('mlx', 'mlx_audio', 'misaki', 'spacy', 'en_core_web_sm',
                'num2words', 'phonemizer', 'espeakng_loader', 'numpy', 'av', 'soundfile')


def file_digest(path):
    identity = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            identity.update(chunk)
    return identity.hexdigest()


def asset_digest(path):
    path = Path(path)
    if not path.is_dir():
        return file_digest(path)
    files = [(str(child.relative_to(path)), file_digest(child))
             for child in sorted(path.rglob('*')) if child.is_file()
             and '__pycache__' not in child.relative_to(path).parts
             and child.suffix not in ('.pyc', '.pyo') and not child.name.startswith('.')]
    if not files:
        raise ValueError(f'Speech runtime assets are empty: {path.name}')
    return hashlib.sha256(json.dumps(files, ensure_ascii=False).encode()).hexdigest()


def runtime_assets():
    # This is the same fallback used by the American-English Kokoro pipeline.
    # Fail closed if it cannot load, rather than identifying a runtime that
    # silently drops words missing from the primary pronunciation lexicon.
    fallback = import_module('misaki.espeak').EspeakFallback(british=False)
    wrapper = fallback.backend._espeak
    data = Path(import_module('misaki.data').__file__).parent
    model = Path(import_module('en_core_web_sm').__file__).parent
    scripts = Path(__file__).parent
    assets = {'american-gold-lexicon': data/'us_gold.json',
              'american-silver-lexicon': data/'us_silver.json',
              'english-language-model': model,
              'espeak-library': wrapper.library_path,
              'espeak-data': wrapper.data_path,
              'synthesis-adapter': scripts/'mlx_backend.py',
              'audio-assembly': scripts/'generate.py'}
    return assets, {'espeakVersion': list(wrapper.version)}


def runtime_manifest():
    assets, backend = runtime_assets()
    owners = packages_distributions()
    packages = {}
    for module in DEPENDENCIES:
        if not owners.get(module):
            raise PackageNotFoundError(module)
        # Imports can belong to a fork or several backend distributions:
        # phonemizer-fork and mlx-metal are used by the current native runtime.
        packages.update((name, version(name)) for name in owners[module])
    return {'packages': packages,
            'assets': {name: asset_digest(path) for name, path in sorted(assets.items())},
            'python': platform.python_version(), 'unicode': unicodedata.unidata_version,
            **backend}


def runtime_fingerprint():
    return hashlib.sha256(json.dumps(runtime_manifest(), sort_keys=True,
                                    ensure_ascii=False).encode()).hexdigest()
