"""Offline only: fake BaseEnvironment, public manifest reconstruction, no Docker."""
import asyncio,hashlib,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import create_autospec,AsyncMock
from harbor.environments.base import BaseEnvironment
from broker import Bound,audit,validate_source
from acquire import select,visible_test_exception
HERE=Path(__file__).parent
class Inputs(unittest.TestCase):
 def test_selection_and_duplicates(self):
  m=json.loads((HERE/'manifest.json').read_text());ids=[t['name'] for t in select(m['registry_entry'])]
  self.assertEqual(ids,[t['id'] for t in m['tasks']]);self.assertEqual(len(m['registry_entry']['tasks']),89)
  bad={'tasks':m['registry_entry']['tasks']*2}
  with self.assertRaisesRegex(ValueError,'duplicate'):select(bad)
 def test_visible_test_exception_identity(self):
  m=json.loads((HERE/'manifest.json').read_text());target=m['tasks'][-1]
  self.assertEqual(visible_test_exception(target),target['official_visible_test'])
  self.assertTrue(all(visible_test_exception(t) is None for t in m['tasks'][:-1]))
  for field in ['git_url','path','git_commit_id']:
   bad=json.loads(json.dumps(target));bad[field]='changed'
   with self.assertRaises(AssertionError):visible_test_exception(bad)
  for path in ['environment/Dockerfile','environment/tests/test_outputs.py','tests/test_outputs.py']:
   bad=json.loads(json.dumps(target));next(f for f in bad['files'] if f['path']==path)['git_blob_sha1']='changed'
   with self.assertRaises(AssertionError):visible_test_exception(bad)
 def test_source_inventory_bytes_and_escape(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'instruction.md').write_bytes(b'instruction');meta={'files':[{'path':'instruction.md','git_blob_sha1':hashlib.sha1(b'blob 11\0instruction').hexdigest()}]}
   validate_source(root,meta);(root/'docker-compose.yaml').write_text('untrusted override')
   with self.assertRaisesRegex(RuntimeError,'inventory'):validate_source(root,meta)
   (root/'docker-compose.yaml').unlink();(root/'instruction.md').write_text('changed')
   with self.assertRaisesRegex(RuntimeError,'identity'):validate_source(root,meta)
 def test_dangerous_configuration_rejected(self):
  info={'Id':'owned','Image':'fixed','HostConfig':{'Privileged':False,'NanoCpus':10**9,'Memory':2*2**30,'NetworkMode':'bridge'},'Mounts':[{'Type':'bind','Source':'/public/logs','Destination':'/logs/verifier'}],'Config':{'Env':['PATH=/bin']}}
  cfg=SimpleNamespace(cpus=1,memory_mb=2048);audit(info,Path('/public/logs'),cfg)
  for k,v in [('Privileged',True),('CapAdd',['SYS_ADMIN']),('Devices',[{}]),('DeviceRequests',[{}]),('NetworkMode','host')]:
   bad=json.loads(json.dumps(info));bad['HostConfig'][k]=v
   with self.assertRaises(AssertionError):audit(bad,Path('/public/logs'),cfg)
  bad=json.loads(json.dumps(info));bad['Mounts'][0]['Source']='/var/run/docker.sock'
  with self.assertRaises(AssertionError):audit(bad,Path('/public/logs'),cfg)
  bad=json.loads(json.dumps(info));bad['Config']['Env'].append('KIMI_API_KEY=synthetic')
  with self.assertRaises(AssertionError):audit(bad,Path('/public/logs'),cfg)
class Routing(unittest.IsolatedAsyncioTestCase):
 async def test_base_environment_command_nonzero_and_verifier_phase(self):
  env=create_autospec(BaseEnvironment,instance=True);env.exec=AsyncMock(return_value=SimpleNamespace(return_code=7,stdout='task-only',stderr=''))
  stop=AsyncMock();verify=AsyncMock(return_value={'status':'official_scored','rewards':{'reward':0}});bound=Bound(env,stop,verify)
  result=await bound.exec('exit 7');env.exec.assert_awaited_once_with('exit 7');self.assertEqual(result['exit_code'],7);verify.assert_not_awaited()
  await bound.verify();verify.assert_awaited_once()
  with self.assertRaises(RuntimeError):await bound.exec('pwd')
  with self.assertRaises(RuntimeError):await bound.verify()
 async def test_busy_cancel_stops_same_capability_and_forbids_verifier(self):
  env=create_autospec(BaseEnvironment,instance=True);started=asyncio.Event();release=asyncio.Event()
  async def command(cmd):started.set();await release.wait();return SimpleNamespace(return_code=137,stdout='',stderr='stopped')
  env.exec=command
  async def stopper(reason):release.set()
  stop=AsyncMock(side_effect=stopper);verify=AsyncMock();bound=Bound(env,stop,verify);job=asyncio.create_task(bound.exec('sleep 30'));await started.wait()
  with self.assertRaises(RuntimeError):await bound.verify()
  with self.assertRaises(RuntimeError):await bound.exec('other')
  await bound.stop('cancelled');await job;stop.assert_awaited_once_with('cancelled')
  with self.assertRaises(RuntimeError):await bound.verify()
  verify.assert_not_awaited()
if __name__=='__main__':unittest.main()

class CommandBoundary(unittest.IsolatedAsyncioTestCase):
 async def test_confirmed_timeout_preserves_same_bound_capability(self):
  commands=SimpleNamespace(run=AsyncMock(side_effect=[{'status':'timeout','termination':{'confirmed':True}}, {'status':'completed','termination':{'confirmed':True}}]))
  stop=AsyncMock();verify=AsyncMock(return_value={'status':'synthetic_control'});bound=Bound(None,stop,verify,commands)
  self.assertEqual((await bound.exec('first',.1))['status'],'timeout')
  self.assertEqual((await bound.exec('second',1))['status'],'completed')
  stop.assert_not_awaited();await bound.verify();verify.assert_awaited_once()
 async def test_unconfirmed_stop_is_not_recoverable_even_when_environment_stop_fails(self):
  for error in [False,True]:
   commands=SimpleNamespace(run=AsyncMock(return_value={'status':'stop_unconfirmed','termination':{'confirmed':False}}))
   stop=AsyncMock(side_effect=RuntimeError('stop unavailable') if error else None);verify=AsyncMock();bound=Bound(None,stop,verify,commands)
   if error:
    with self.assertRaises(RuntimeError):await bound.exec('first',1)
   else:self.assertEqual((await bound.exec('first',1))['status'],'stop_unconfirmed')
   with self.assertRaises(RuntimeError):await bound.exec('next',1)
   with self.assertRaises(RuntimeError):await bound.verify()
   verify.assert_not_awaited();stop.assert_awaited_once()
 async def test_broker_revalidates_timeout_before_effect(self):
  commands=SimpleNamespace(run=AsyncMock());bound=Bound(None,AsyncMock(),AsyncMock(),commands)
  for timeout in [0,-1,31,float('nan'),float('inf'),True,'1']:
   with self.assertRaisesRegex(RuntimeError,'invalid_command'):await bound.exec('fixture',timeout)
  commands.run.assert_not_awaited()
