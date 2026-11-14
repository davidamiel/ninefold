"""Parallel recognition must never stage an incomplete pair of recordings."""
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from batch import main, process, run_command


class VoicePair(unittest.TestCase):
    def test_parallel_generation_finishes_before_alignment_begins(self):
        barrier=threading.Barrier(2)
        complete=set();aligned=set();staged=[]
        lock=threading.Lock()
        def command(script,path,options,log):
            if script=='generate.py':
                voice=options[options.index('--voice')+1]
                barrier.wait(timeout=5)
                with lock:complete.add(voice)
            elif script=='align.py':
                self.assertEqual(complete,{'female','male'})
                with lock:aligned.add(options[options.index('--voice')+1])
            elif script=='stage.py':
                self.assertEqual(aligned,{'female','male'})
                staged.append(True)
        with patch('batch.run_command',side_effect=command):
            process(Path('reviewed.json'),'mlx','mps',io.StringIO(),parallel_align=True,parallel_generate=True)
        self.assertEqual(staged,[True])

    def test_failed_generation_waits_for_other_voice_and_never_aligns_or_stages(self):
        from concurrent.futures import ThreadPoolExecutor
        male_started=threading.Event();release_male=threading.Event();male_finished=threading.Event()
        later=[]
        def command(script,path,options,log):
            if script=='generate.py':
                if 'male' in options:
                    male_started.set()
                    if not release_male.wait(timeout=5):raise TimeoutError('test did not release male voice')
                    male_finished.set()
                else:
                    if not male_started.wait(timeout=5):raise TimeoutError('male voice did not start')
                    raise subprocess.CalledProcessError(1,['generate.py'])
            elif script in ('align.py','stage.py'):later.append(script)
        with patch('batch.run_command',side_effect=command),ThreadPoolExecutor(max_workers=1) as driver:
            result=driver.submit(process,Path('reviewed.json'),'mlx','mps',io.StringIO(),False,True)
            try:
                self.assertTrue(male_started.wait(timeout=5))
                self.assertFalse(result.done())
            finally:
                release_male.set()
            with self.assertRaises(subprocess.CalledProcessError):result.result(timeout=5)
        self.assertTrue(male_finished.is_set())
        self.assertEqual(later,[])

    def test_default_generation_and_alignment_remain_sequential(self):
        calls=[]
        with patch('batch.run_command',side_effect=lambda script,path,options,log:calls.append((script,options))):
            process(Path('reviewed.json'),'mlx','mps',io.StringIO())
        self.assertEqual(calls,[('prepare.py',[]),
            ('generate.py',['--voice','female','--resume','--engine','mlx']),
            ('generate.py',['--voice','male','--resume','--engine','mlx']),
            ('align.py',['--voice','female','--device','mps']),
            ('align.py',['--voice','male','--device','mps']),('stage.py',[])])

    def test_both_voices_finish_before_staging(self):
        barrier=threading.Barrier(2)
        complete=set()
        lock=threading.Lock()
        staged=[]
        def command(script,path,options,log):
            if script=='align.py':
                voice=options[options.index('--voice')+1]
                barrier.wait(timeout=2)
                with lock:complete.add(voice)
            elif script=='stage.py':
                self.assertEqual(complete,{'female','male'})
                staged.append(True)
        with patch('batch.run_command',side_effect=command):
            process(Path('reviewed.json'),'mlx','mps',io.StringIO(),True)
        self.assertEqual(staged,[True])

    def test_one_voice_failure_holds_the_pair(self):
        staged=[]
        def command(script,path,options,log):
            if script=='align.py' and 'male' in options:
                raise subprocess.CalledProcessError(1,['align.py'])
            if script=='stage.py':staged.append(True)
        with patch('batch.run_command',side_effect=command),self.assertRaises(subprocess.CalledProcessError):
            process(Path('reviewed.json'),'mlx','mps',io.StringIO(),True)
        self.assertEqual(staged,[])


class CommandBoundary(unittest.TestCase):
    def test_interpreter_override_flags_are_rejected_before_any_stage_runs(self):
        with patch('batch.subprocess.run') as launch,patch('sys.stderr',io.StringIO()):
            for option in ('--generation-python','--alignment-python'):
                with patch('sys.argv',['batch.py','recordings/jobs',option,'/bin/sh']), \
                     self.assertRaises(SystemExit) as failure:
                    main()
                self.assertEqual(failure.exception.code,2)
            launch.assert_not_called()

    def test_fixed_stages_use_the_current_virtual_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            jobs=root/'recordings';jobs.mkdir()
            job=jobs/'reviewed.json';job.write_text(json.dumps({'reviewed':True,'documentId':'example'}))
            with patch('batch.ROOT',root),patch('batch.subprocess.run') as launch:
                run_command('generate.py',job,['--voice','female','--resume','--engine','mlx'],io.StringIO())
            self.assertEqual(launch.call_args.args[0],
                             [sys.executable,str(Path(__file__).resolve().parent/'generate.py'),str(job.resolve()),
                              '--voice','female','--resume','--engine','mlx'])

    def test_invalid_stages_options_and_jobs_never_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            jobs=root/'recordings';jobs.mkdir()
            job=jobs/'reviewed.json';job.write_text(json.dumps({'reviewed':True,'documentId':'example'}))
            malformed=jobs/'malformed.json';malformed.write_text('{')
            unreviewed=jobs/'draft.json';unreviewed.write_text(json.dumps({'reviewed':False,'documentId':'draft'}))
            outside=root/'outside.json';outside.write_text(job.read_text())
            linked=jobs/'linked.json';linked.symlink_to(outside)
            cases=[('../other.py',job,[]),('prepare.py',job,['--help']),
                   ('generate.py',job,['--voice','female','--resume','--engine','mlx','-c','print(1)']),
                   ('generate.py',job,['--voice','other','--resume','--engine','mlx']),
                   ('align.py',job,['--voice','female','--device','cuda']),
                   ('align.py',job,'--voice female --device cpu'),
                   ('prepare.py',outside,[]),('prepare.py',linked,[]),
                   ('prepare.py',jobs,[]),('prepare.py',malformed,[]),('prepare.py',unreviewed,[])]
            with patch('batch.ROOT',root),patch('batch.subprocess.run') as launch:
                for script,path,options in cases:
                    with self.subTest(script=script,path=path,options=options),self.assertRaises(ValueError):
                        run_command(script,path,options,io.StringIO())
                for engine,device in [('other','cpu'),('mlx','other')]:
                    with self.assertRaises(ValueError):
                        process(job,engine,device,io.StringIO())
                launch.assert_not_called()


if __name__=='__main__':
    unittest.main()
