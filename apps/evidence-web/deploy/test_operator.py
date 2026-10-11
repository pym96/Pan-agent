"""Negative invariants for deployment identity/configuration and exact backup inventory."""
import importlib.util, pathlib, tempfile, unittest
from unittest.mock import patch
P=pathlib.Path
s=importlib.util.spec_from_file_location('op',P(__file__).with_name('pan-web.py'));op=importlib.util.module_from_spec(s);s.loader.exec_module(op)
class OperatorTests(unittest.TestCase):
 def test_pid_reuse_and_redis_title(self):
  r={'pid':123,'identity':'Sun Oct 11 08:00:00 2026 /release/redis /data/redis.conf','serviceTitle':'/release/redis 127.0.0.1:63114'}
  with patch.object(op,'process',return_value='Sun Oct 11 08:00:00 2026 /release/redis 127.0.0.1:63114'):self.assertTrue(op.alive(r))
  for identity in ['Sun Oct 11 08:00:01 2026 /release/redis 127.0.0.1:63114','Sun Oct 11 08:00:00 2026 foreign','Sun Oct 11 08:00:00 2026 /release/redis 0.0.0.0:63114']:
   with patch.object(op,'process',return_value=identity):
    with self.assertRaisesRegex(RuntimeError,'identity changed'):op.alive(r)
 def test_inventory_rejects_change_extra_symlink(self):
  with tempfile.TemporaryDirectory() as t:
   p=P(t);(p/'x').write_bytes(b'original');m=op.tree(p);op.verify(p,m)
   (p/'x').write_bytes(b'changed')
   with self.assertRaises(RuntimeError):op.verify(p,m)
   (p/'x').write_bytes(b'original');(p/'extra').write_bytes(b'')
   with self.assertRaises(RuntimeError):op.verify(p,m)
   (p/'extra').unlink();(p/'link').symlink_to(p/'x')
   with self.assertRaisesRegex(RuntimeError,'symlink'):op.tree(p)
 def test_faults_require_test_mode_and_environment_is_filtered(self):
  c={'data':'/data','release':'/release','path':'/bin','dockerHost':'unix:///socket','dbPassword':'synthetic','pgPort':1,'httpPort':2,'redisPort':3,'namespace':'dep-test','testMode':False,'faults':{'WEB_OPERATION_FAULT':'after-receipt'}}
  with self.assertRaisesRegex(RuntimeError,'explicit test mode'):op.environment(c)
  c['faults']={}
  with patch.dict(op.os.environ,{'REAL_PROVIDER_KEY':'do-not-forward'},clear=True):self.assertNotIn('REAL_PROVIDER_KEY',op.environment(c))
  with patch.dict(op.os.environ,{'WEB_FAUX_BARRIER':'1'},clear=True):
   with self.assertRaisesRegex(RuntimeError,'ambient'):op.environment(c)
  c['testMode']=True;c['faults']={'WEB_OPERATION_FAULT':'after-receipt'}
  with patch.dict(op.os.environ,{},clear=True):self.assertEqual(op.environment(c)['WEB_OPERATION_FAULT'],'after-receipt')
 def test_live_environment_excludes_provider_secret(self):
  c={'data':'/data','release':'/release','path':'/bin','dockerHost':'unix:///socket','dbPassword':'synthetic-db','pgPort':1,'httpPort':2,'redisPort':3,'namespace':'dep-test','testMode':False,'faults':{},'provider':'kimi','workers':1}
  with patch.dict(op.os.environ,{'KIMI_API_KEY':'SYNTHETIC-PROVIDER'},clear=True):
   e=op.environment(c);self.assertNotIn('KIMI_API_KEY',e);self.assertEqual(e['WEB_CHECKPOINT_MODE'],'0');self.assertEqual(e['WEB_OPERATION_MODE'],'0')
   self.assertNotIn('SYNTHETIC-PROVIDER',str(c));self.assertNotIn('KIMI_API_KEY',op.baseenv(c))
  c['workers']=2
  with self.assertRaisesRegex(RuntimeError,'one worker'):op.environment(c)
 def test_stop_cannot_claim_live_or_unknown(self):
  for state in [{'processes':{'worker':True},'containers':[],'ownedProcesses':[]},{'processes':{},'containers':['running'],'ownedProcesses':[]},{'processes':{},'containers':[],'ownedProcesses':['orphan']}]:
   with patch.object(op,'state',return_value=state):
    with self.assertRaisesRegex(RuntimeError,'unknown'):op.stopped({})
if __name__=='__main__':unittest.main()
