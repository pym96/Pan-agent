import json, os, signal, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from prepare import stop_owned

class PreparationCleanup(unittest.TestCase):
    def test_outer_termination_does_not_interrupt_cleanup(self):
        previous=signal.getsignal(signal.SIGTERM)
        def stop(*args,**kwargs):
            os.kill(os.getpid(),signal.SIGTERM)
        with tempfile.TemporaryDirectory() as d,patch('prepare.subprocess.run',side_effect=stop) as run,patch('prepare.subprocess.check_output',return_value='{"Running":false,"Pid":0}'):
            stop_owned('owned-id',Path(d))
            self.assertEqual(run.call_args.args[0][-1],'owned-id')
            self.assertFalse(json.loads((Path(d)/'final-state.json').read_text())['Running'])
        self.assertEqual(signal.getsignal(signal.SIGTERM),previous)
    def test_live_state_is_not_success(self):
        with tempfile.TemporaryDirectory() as d,patch('prepare.subprocess.run'),patch('prepare.subprocess.check_output',return_value='{"Running":true,"Pid":99}'):
            with self.assertRaisesRegex(RuntimeError,'remains running'):stop_owned('owned-id',Path(d))

if __name__=='__main__':unittest.main()
