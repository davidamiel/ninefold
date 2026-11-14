"""Parallel recognition must never stage an incomplete pair of recordings."""
import io
from pathlib import Path
import subprocess
import threading
import unittest
from unittest.mock import patch

from batch import process


class VoicePair(unittest.TestCase):
    def test_both_voices_finish_before_staging(self):
        barrier=threading.Barrier(2)
        complete=set()
        lock=threading.Lock()
        staged=[]
        def command(python,script,path,options,log):
            if script=='align.py':
                voice=options[options.index('--voice')+1]
                barrier.wait(timeout=2)
                with lock:complete.add(voice)
            elif script=='stage.py':
                self.assertEqual(complete,{'female','male'})
                staged.append(True)
        with patch('batch.run_command',side_effect=command):
            process(Path('reviewed.json'),'python','python','mlx','mps',io.StringIO(),True)
        self.assertEqual(staged,[True])

    def test_one_voice_failure_holds_the_pair(self):
        staged=[]
        def command(python,script,path,options,log):
            if script=='align.py' and 'male' in options:
                raise subprocess.CalledProcessError(1,['align.py'])
            if script=='stage.py':staged.append(True)
        with patch('batch.run_command',side_effect=command),self.assertRaises(subprocess.CalledProcessError):
            process(Path('reviewed.json'),'python','python','mlx','mps',io.StringIO(),True)
        self.assertEqual(staged,[])


if __name__=='__main__':
    unittest.main()
