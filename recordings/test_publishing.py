"""Only verified immutable release bytes may replace a local recording URL."""
import unittest

from publish import verify_asset


class PublishedAudio(unittest.TestCase):
    def test_remote_hash_size_state_and_url_must_match(self):
        digest = 'a'*64
        asset = {'id': 123, 'digest': 'sha256:'+digest, 'size': 2048,
                 'state': 'uploaded', 'browser_download_url':
                 'https://github.com/davidamiel/ninefold/releases/download/recorded-audio-ot25/'+digest[:24]+'.mp3'}
        self.assertEqual(verify_asset(asset, digest, 2048, 'recorded-audio-ot25')['releaseAssetId'], 123)
        for key, value in [('digest', 'sha256:other'), ('size', 1024),
                           ('state', 'new'), ('browser_download_url', 'https://example.org/audio.mp3')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_asset({**asset, key: value}, digest, 2048, 'recorded-audio-ot25')


if __name__ == '__main__':
    unittest.main()
