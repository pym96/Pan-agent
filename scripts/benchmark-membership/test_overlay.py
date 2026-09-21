import copy,json,unittest
from pathlib import Path
from overlay import apply,derive
from projection import TARGETS
class OverlayTests(unittest.TestCase):
 def setUp(self):
  self.pool=json.loads((Path(__file__).parent.parent/'benchmark-subset/generated/pool.json').read_text())
  by={r['instance_id']:r for r in self.pool if r['domain']=='da'}
  self.decisions=[{'id':i,'decision':'excluded','reason':'required_input_unprovided_in_pinned_distribution','original_reasons':by[i]['unresolved'],'evidence':['synthetic only'],'requirements':['synthetic missing requirement'],'runtime_gaps':['not run']} for i in TARGETS]
 def test_shuffled_invariant_and_exact_count(self):
  a,s=derive(self.pool,self.decisions);b,t=derive(self.pool,list(reversed(self.decisions)))
  self.assertEqual(a,b);self.assertEqual(s,t);self.assertEqual(len(s['selected']),30);self.assertFalse(s['execution_authorized'])
  for before,after in zip(self.pool,a):
   if before['instance_id'] not in TARGETS:self.assertEqual(before,after)
   else:
    for k in before.keys()-{'decision','unresolved','structural_missing'}:self.assertEqual(before[k],after[k])
 def test_missing_extra_duplicate(self):
  for ds in [self.decisions[:-1],self.decisions+[self.decisions[0]],self.decisions[:-1]+[self.decisions[0]]]:
   with self.assertRaises(ValueError):apply(self.pool,ds)
 def test_unresolved_refuses(self):
  self.decisions[0]['decision']='unresolved'
  with self.assertRaises(ValueError):derive(self.pool,self.decisions)
 def test_exclusion_policy_tampering(self):
  self.decisions[0]['reason']='too_expensive'
  with self.assertRaises(ValueError):apply(self.pool,self.decisions)
 def test_original_reason_tampering(self):
  self.decisions[0]['original_reasons']=[]
  with self.assertRaises(ValueError):apply(self.pool,self.decisions)
 def test_missing_evidence(self):
  self.decisions[0]['evidence']=[]
  with self.assertRaises(ValueError):apply(self.pool,self.decisions)
 def test_does_not_mutate_inputs(self):
  old=copy.deepcopy(self.pool);apply(self.pool,self.decisions);self.assertEqual(old,self.pool)

 def test_protected_scoring_change_refused(self):
  self.pool[0]['official_scoring']['tampered']=True
  with self.assertRaises(ValueError):apply(self.pool,self.decisions)
 def test_protected_exposure_change_refused(self):
  self.pool[0]['exposure_reasons']=[]
  self.pool[0]['license']='tampered'
  with self.assertRaises(ValueError):apply(self.pool,self.decisions)
