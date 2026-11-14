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
