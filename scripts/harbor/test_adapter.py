"""Bounded negative contracts; no Docker/model calls."""
import copy
import tempfile
import unittest
from pathlib import Path
from runner import audit, reward

class Boundaries(unittest.TestCase):
    def test_reward_errors(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'reward.txt'
            with self.assertRaisesRegex(RuntimeError,'evaluation_error'):reward(p)
            for text in ('', 'no', 'NaN', 'inf', '-inf', '{"reward":1}'):
                p.write_text(text)
                with self.subTest(text=text),self.assertRaisesRegex(RuntimeError,'evaluation_error'):reward(p)
            for text in ('0','1','0.5'):
                p.write_text(text);self.assertEqual(reward(p),float(text))
    def fixture(self):
        return {'HostConfig':{'Privileged':False,'CapAdd':None,'NetworkMode':'wo74-network','NanoCpus':10**9,'Memory':2048*2**20,'Devices':None,'DeviceRequests':None},'Config':{'Env':['PATH=/bin','WO74_CANARY=fake']},'Id':'bound-id','Image':'sha256:fixture','Mounts':[{'Type':'bind','Source':'/tmp/wo74-verifier','Destination':'/logs/verifier'}]}
    def test_configuration_rejections(self):
        valid=self.fixture();audit(valid,Path('/tmp/wo74-verifier'))
        for key,val in [('Privileged',True),('CapAdd',['SYS_ADMIN']),('NetworkMode','host'),('NanoCpus',2*10**9),('Memory',3*2**30),('Devices',[{}]),('DeviceRequests',[{}])]:
            x=copy.deepcopy(valid);x['HostConfig'][key]=val
            with self.subTest(key=key),self.assertRaises(AssertionError):audit(x,Path('/tmp/wo74-verifier'))
        for source in ('/Users','/var/run/docker.sock','/tmp/other'):
            x=copy.deepcopy(valid);x['Mounts'][0]['Source']=source
            with self.subTest(source=source),self.assertRaises(AssertionError):audit(x,Path('/tmp/wo74-verifier'))
        x=copy.deepcopy(valid);x['Config']['Env'].append('FAKE_API_KEY=canary')
        with self.assertRaises(AssertionError):audit(x,Path('/tmp/wo74-verifier'))

if __name__=='__main__':unittest.main()
