"""Local Apple GPU adapter for the same Sky and Michael Kokoro voices."""
import hashlib
from importlib.metadata import version

from generate import local_path


def fingerprint(folder):
    identity = hashlib.sha256()
    for name in ['config.json', 'kokoro-v1_0.safetensors', 'voices/af_sky.safetensors', 'voices/am_michael.safetensors']:
        path = local_path(folder/name, folder)
        identity.update(name.encode())
        identity.update(path.read_bytes())
    identity.update(('mlx:'+version('mlx')+'|mlx-audio:'+version('mlx-audio')+'|speed:1|lang:a|gap:.18').encode())
    return identity.hexdigest()


def load(folder):
    from mlx_audio.tts.utils import load_model
    return load_model(str(folder))


def create(model, text, voice):
    import numpy as np
    pieces = []
    rate = 24000
    for result in model.generate(text, voice=voice, speed=1, lang_code='a'):
        rate = result.sample_rate
        if pieces:
            pieces.append(np.zeros(int(rate*.18), dtype='float32'))
        pieces.append(np.asarray(result.audio, dtype='float32').reshape(-1))
    if not pieces:
        raise ValueError('The local GPU returned no speech')
    return np.concatenate(pieces), rate
