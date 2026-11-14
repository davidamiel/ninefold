"""Recording jobs cannot read or write outside their designated directories."""
import hashlib,json,tempfile,unittest
from pathlib import Path
from generate import load_job,local_path,reusable_recording,read_report,save_report

class RecordingPaths(unittest.TestCase):
    def test_source_map_revisions_reuse_audio_only_for_the_identical_verified_script(self):
        with tempfile.TemporaryDirectory() as folder:
            audio=Path(folder)/'female.mp3';audio.write_bytes(b'verified recording')
            report={'version':'older-source-maps','generator':'same-model','scriptSha256':'complete-script',
                    'voice':'af_sky','audioSha256':hashlib.sha256(audio.read_bytes()).hexdigest()}
            self.assertTrue(reusable_recording(report,'same-model','complete-script','af_sky',audio))
            self.assertFalse(reusable_recording(report,'same-model','changed-script','af_sky',audio))
            self.assertFalse(reusable_recording(report,'same-model','complete-script','am_michael',audio))
            audio.write_bytes(b'interrupted recording')
            self.assertFalse(reusable_recording(report,'same-model','complete-script','af_sky',audio))

    def test_interrupted_reports_are_cache_misses_and_complete_report_survives_partial_temp(self):
        with tempfile.TemporaryDirectory() as folder:
            report=Path(folder)/'female.json'
            for partial in ['', '{"voice":', 'null', '[]']:
                report.write_text(partial)
                self.assertEqual(read_report(report),{})
            complete={'voice':'af_sky','audioSha256':'verified'}
            save_report(report,complete)
            report.with_suffix('.tmp').write_text('{"voice":')
            self.assertEqual(read_report(report),complete)

    def test_reviewed_job_and_output_are_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);job=root/'opinion.json'
            job.write_text(json.dumps({'documentId':'26A560-e0601b5a934c'}))
            self.assertEqual(load_job(job,root)[1],'26A560-e0601b5a934c')
            self.assertEqual(local_path(root/'clips/female.mp3',root),(root/'clips/female.mp3').resolve())

    def test_parent_and_sibling_prefix_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'allowed';root.mkdir()
            for path in [root/'../outside.json',root.parent/'allowed-extra/opinion.json']:
                with self.subTest(path=path),self.assertRaises(ValueError):local_path(path,root)

    def test_job_identifiers_cannot_redirect_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);job=root/'opinion.json'
            for identifier in ['../outside','/tmp/outside','nested/opinion','..','a\\b',None]:
                job.write_text(json.dumps({'documentId':identifier}))
                with self.subTest(identifier=identifier),self.assertRaises(ValueError):load_job(job,root)

    def test_symlinks_cannot_escape_the_output_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'allowed';root.mkdir()
            outside=Path(folder)/'outside';outside.mkdir()
            (root/'linked').symlink_to(outside,target_is_directory=True)
            (root/'female.json').symlink_to(outside/'report.json')
            for path in [root/'linked/clip.wav',root/'female.json']:
                with self.subTest(path=path),self.assertRaises(ValueError):local_path(path,root)

if __name__=='__main__':unittest.main()
