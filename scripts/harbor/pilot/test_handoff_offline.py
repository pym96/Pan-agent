import unittest,asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from test_handoff_control import history
from broker import Bound,ManagedCommand
class Budget(unittest.TestCase):
 def test_fixed_history_rejects_open_repeated_invalid_and_exhausted_intervals(self):
  self.assertEqual(history([]),0)
  pair=[{'event':'start','attempt':'a','start_monotonic':10},{'event':'end','attempt':'a','end_monotonic':12,'elapsed':2}]
  self.assertEqual(history(pair),2)
  for bad in [pair[:1],pair*2,[pair[0],{**pair[1],'elapsed':0}],[pair[0],{**pair[1],'end_monotonic':1810,'elapsed':1800}]]:
   with self.assertRaises(RuntimeError):history(bad)
class Handoff(unittest.IsolatedAsyncioTestCase):
 async def test_admission_closes_before_inflight_finishes(self):
  entered=asyncio.Event();finish=asyncio.Event();interrupt=asyncio.Event()
  async def run(*_):entered.set();await interrupt.wait();await finish.wait();return {'status':'interrupted','wait':{'settled':True}}
  c=SimpleNamespace(run=run,interrupt=interrupt,confirm_quiescent=AsyncMock(return_value={'confirmed':True}))
  verifier=AsyncMock();b=Bound(None,AsyncMock(),verifier,c);op=asyncio.create_task(b.exec('writer',2));await entered.wait();q=asyncio.create_task(b.quiesce());await interrupt.wait()
  with self.assertRaises(RuntimeError):await b.exec('late',2)
  with self.assertRaises(RuntimeError):await b.verify()
  finish.set();await op;self.assertTrue((await q)['confirmed']);await b.verify();verifier.assert_awaited_once()
  with self.assertRaises(RuntimeError):await b.verify()
 async def test_handoff_checks_container_not_initial_process_membership(self):
  from unittest.mock import patch
  c=ManagedCommand('synthetic')
  with patch('broker.docker',AsyncMock(return_value='[{"State":{"Running":true}}]')):
   self.assertTrue((await c.confirm_quiescent())['confirmed'])
  with patch('broker.docker',AsyncMock(return_value='[{"State":{"Running":false}}]')):
   self.assertFalse((await c.confirm_quiescent())['confirmed'])
 async def test_unconfirmed_quiescence_stops_environment_and_never_grades(self):
  c=SimpleNamespace(interrupt=asyncio.Event(),confirm_quiescent=AsyncMock(return_value={'confirmed':False}))
  stop=AsyncMock();verify=AsyncMock();b=Bound(None,stop,verify,c);self.assertFalse((await b.quiesce())['confirmed']);stop.assert_awaited_once()
  with self.assertRaises(RuntimeError):await b.verify()
  verify.assert_not_awaited()

class ClientWait(unittest.IsolatedAsyncioTestCase):
 async def test_normal_nonzero_timeout_interrupt_and_output_bounds(self):
  from unittest.mock import patch
  for mode in ['normal','nonzero','timeout','interrupt','launch_failure']:
   runner=ManagedCommand('synthetic','/tmp');released=asyncio.Event();calls=[]
   class Stream:
    sent=False
    async def read(self,n):
     if not self.sent:self.sent=True;return b'x'*70000
     if mode in ['timeout','interrupt']:await released.wait()
     return b''
   class Process:
    def __init__(self):self.stdout=Stream();self.stderr=Stream();self.returncode=None
    def terminate(self):calls.append('terminate');self.returncode=-15;released.set()
    def kill(self):calls.append('kill');self.returncode=-9;released.set()
    async def wait(self):
     if mode in ['timeout','interrupt']:await released.wait()
     if self.returncode is None:self.returncode=7 if mode=='nonzero' else 0
     return self.returncode
   proc=Process()
   async def launch(*args,**kwargs):
    calls.append(args)
    if mode=='launch_failure':raise OSError('private-error-must-not-leak')
    if mode=='interrupt':asyncio.get_running_loop().call_soon(runner.interrupt.set)
    return proc
   with patch('broker.asyncio.create_subprocess_exec',side_effect=launch):result=await runner.run('background service &',.01)
   self.assertNotIn('private-error',str(result));self.assertEqual(len([x for x in calls if isinstance(x,tuple)]),1)
   self.assertEqual(result['wait']['settled'],mode!='launch_failure')
   self.assertEqual(result['status'],{'normal':'completed','nonzero':'completed','timeout':'timeout','interrupt':'interrupted','launch_failure':'stop_unconfirmed'}[mode])
   if mode in ['normal','nonzero']:self.assertNotIn('terminate',calls);self.assertNotIn('kill',calls)
   if mode in ['timeout','interrupt']:self.assertEqual(calls.count('terminate'),1)
   if mode!='launch_failure':self.assertEqual(len(result['stdout']),65536);self.assertTrue(result['output_bounds']['stdout']['truncated'])
   self.assertEqual(calls[0][-3:],('bash','-c','background service &'))
 async def test_inspect_failure_is_concrete_handoff_failure(self):
  from unittest.mock import patch
  stop=AsyncMock();verify=AsyncMock();b=Bound(None,stop,verify,ManagedCommand('synthetic'))
  with patch('broker.docker',AsyncMock(side_effect=RuntimeError('docker_operation_failed'))):
   self.assertFalse((await b.quiesce())['confirmed'])
  stop.assert_awaited_once();verify.assert_not_awaited()
