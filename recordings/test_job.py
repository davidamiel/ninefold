"""Recording jobs cannot read or write outside their designated directories."""
import hashlib,json,tempfile,unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading
from types import ModuleType
from unittest.mock import patch
import weakref
from generate import load_job,local_path,reusable_recording,read_report,save_report,save_preparation,release_model_cache

class RecordingPaths(unittest.TestCase):
    def test_concurrent_preparation_writes_are_complete_utf8_and_leave_no_temporary_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'prepared.json';old={'text':'Old preparation'}
            path.write_text(json.dumps(old),encoding='utf-8')
            values=[{'voice':voice,'text':'Café 𝑥. '*20000}for voice in ('female','male')]
            ready=threading.Condition();release=threading.Event();temporary=[]
            replace=Path.replace
            def publish(source,destination):
                with ready:
                    temporary.append(source);ready.notify_all()
                if not release.wait(timeout=5):raise TimeoutError('test did not release prepared writers')
                return replace(source,destination)
            with patch.object(Path,'replace',publish),ThreadPoolExecutor(max_workers=2) as workers:
                pending=[workers.submit(save_preparation,path,value)for value in values]
                try:
                    with ready:self.assertTrue(ready.wait_for(lambda:len(temporary)==2,timeout=5))
                    self.assertEqual(len(set(temporary)),2)
                    self.assertEqual(json.loads(path.read_text(encoding='utf-8')),old)
                    expected=[(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')for value in values]
                    self.assertCountEqual([item.read_bytes()for item in temporary],expected)
                finally:
                    release.set()
                for result in pending:result.result(timeout=5)
            self.assertIn(json.loads(path.read_text(encoding='utf-8')),values)
            self.assertEqual(list(Path(folder).iterdir()),[path])

    def test_failed_preparation_replace_preserves_old_file_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'narration.json';path.write_bytes(b'old complete preparation')
            with patch.object(Path,'replace',side_effect=OSError('interrupted replace')),self.assertRaises(OSError):
                save_preparation(path,{'text':'new'})
            self.assertEqual(path.read_bytes(),b'old complete preparation')
            self.assertEqual(list(Path(folder).iterdir()),[path])

    def test_mlx_release_collects_model_cycles_before_clearing_unused_gpu_memory(self):
        class Model:pass
        model=Model();model.cycle=model;reference=weakref.ref(model);del model
        events=[];package=ModuleType('mlx');core=ModuleType('mlx.core');package.core=core
        core.synchronize=lambda:events.append('synchronize')
        def clear():
            self.assertIsNone(reference())
            events.append('clear')
        core.clear_cache=clear
        with patch.dict('sys.modules',{'mlx':package,'mlx.core':core}):
            release_model_cache('mlx')
        self.assertEqual(events,['synchronize','clear'])
        with patch.dict('sys.modules',{'mlx':None,'mlx.core':None}):
            release_model_cache('onnx')

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
