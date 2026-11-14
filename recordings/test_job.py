"""Recording jobs cannot read or write outside their designated directories."""
import json,tempfile,unittest
from pathlib import Path
from generate import load_job,local_path

class RecordingPaths(unittest.TestCase):
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
