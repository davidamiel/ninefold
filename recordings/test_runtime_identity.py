"""Pronunciation changes must not reuse old speech clips under the same key."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from runtime_identity import DEPENDENCIES, asset_digest, runtime_fingerprint


class RuntimeIdentity(unittest.TestCase):
    def test_same_version_lexicon_library_and_adapter_changes_invalidate_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            assets = {name: Path(folder)/name for name in ('lexicon', 'library', 'adapter')}
            for path in assets.values():
                path.write_bytes(b'original')
            versions = {'misaki': '1'}
            owners = {name: [name] for name in DEPENDENCIES}
            owners['phonemizer'] = ['phonemizer-fork']
            owners['mlx'] = ['mlx', 'mlx-metal']
            with patch('runtime_identity.runtime_assets', return_value=(assets, {'espeakVersion': [1, 52]})), \
                 patch('runtime_identity.packages_distributions', return_value=owners), \
                 patch('runtime_identity.version', side_effect=lambda name: versions.get(name, 'fixed')):
                original = runtime_fingerprint()
                for path in assets.values():
                    path.write_bytes(b'changed')
                    self.assertNotEqual(runtime_fingerprint(), original)
                    path.write_bytes(b'original')
                    self.assertEqual(runtime_fingerprint(), original)
                for dependency in ('misaki', 'phonemizer-fork', 'mlx-metal'):
                    before = runtime_fingerprint()
                    versions[dependency] = '2'
                    self.assertNotEqual(runtime_fingerprint(), before)

    def test_language_model_contents_are_portable_and_ignore_python_caches(self):
        with tempfile.TemporaryDirectory() as folder:
            left, right = Path(folder)/'left', Path(folder)/'right'
            for model in (left, right):
                (model/'vocab').mkdir(parents=True)
                (model/'vocab/strings.json').write_text('["court"]')
            (left/'__pycache__').mkdir()
            (left/'__pycache__/model.pyc').write_bytes(b'local bytecode')
            self.assertEqual(asset_digest(left), asset_digest(right))
            (right/'vocab/strings.json').write_text('["court","tariff"]')
            self.assertNotEqual(asset_digest(left), asset_digest(right))

    def test_missing_or_empty_assets_do_not_receive_a_reusable_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                asset_digest(Path(folder)/'missing-library')
            with self.assertRaises(ValueError):
                asset_digest(Path(folder))


if __name__ == '__main__':
    unittest.main()
