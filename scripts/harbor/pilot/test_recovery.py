import json,tempfile,unittest
from pathlib import Path
from unittest.mock import AsyncMock
from diagnostics import failure,release_network
class Recovery(unittest.IsolatedAsyncioTestCase):
 def test_exception_chain_is_bounded_and_sanitized(self):
  for stage in ['source_validation','daemon_connection','compose_create','inspect_audit']:
   try:
    try:raise ValueError('synthetic-SECRET Authorization: Bearer CANARY')
    except ValueError as cause:raise RuntimeError('Return code: 1. all predefined address pools have been fully subnetted synthetic-SECRET') from cause
   except RuntimeError as exc:r=failure(exc,stage,'task','wo78-project',None)
   self.assertEqual(r['stage'],stage);self.assertEqual(r['causes'][0]['exit_code'],1);self.assertEqual(r['causes'][0]['reason'],'docker_address_pool_exhausted');self.assertEqual(len(r['causes']),2);self.assertNotIn('SECRET',json.dumps(r));self.assertNotIn('Authorization',json.dumps(r))
 async def test_only_owned_empty_network_released_after_evidence(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);info={'Id':'owned-id','Name':'owned_default','Labels':{'com.docker.compose.project':'owned'},'Containers':{},'IPAM':{}}
   async def docker(*args):
    if args[:2]==('network','ls'):return 'owned-id\n'
    if args[:2]==('network','inspect'):return json.dumps([info])
    self.assertEqual(args,('network','rm','owned-id'));self.assertEqual(json.loads((p/'network-release.json').read_text())[0]['status'],'removal_pending');return 'owned-id'
   await release_network(docker,'owned',p);self.assertEqual(json.loads((p/'network-release.json').read_text())[0]['status'],'removed')
   for change in [{'Labels':{'com.docker.compose.project':'other'}},{'Containers':{'active':{}}}]:
    bad={**info,**change};mock=AsyncMock(side_effect=['owned-id',json.dumps([bad])])
    with self.assertRaises(RuntimeError):await release_network(mock,'owned',p)
    self.assertEqual(mock.await_count,2)
