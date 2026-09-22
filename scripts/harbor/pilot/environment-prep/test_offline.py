import json,tempfile,unittest
from pathlib import Path
from registry import choose
from budget import Budget,GIB
from report import assemble
class Preparation(unittest.TestCase):
 def test_platform_choice(self):
  arm={'digest':'arm','platform':{'os':'linux','architecture':'arm64'}};amd={'digest':'amd','platform':{'os':'linux','architecture':'amd64'}}
  self.assertEqual(choose([amd,arm]),arm);self.assertEqual(choose([amd]),amd)
  with self.assertRaises(ValueError):choose([{'platform':{'os':'unknown','architecture':'unknown'}}])
 def test_budget_limits_and_exclusive_owner(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'baseline.json').write_text('{}');b=Budget(p)
   with self.assertRaises(BlockingIOError):Budget(p)
   b.sample=lambda:{'free_bytes':61*GIB,'increment_bytes':23*GIB}
   b.check()
   with self.assertRaisesRegex(RuntimeError,'resource'):b.check(2*GIB)
   b.data['spent_seconds']=7200
   with self.assertRaisesRegex(RuntimeError,'time'):b.check()
   self.assertFalse(any(k in b.env for k in ['KIMI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY']))
   b.lock.close()
 def test_interrupted_ledger_is_not_reset(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'baseline.json').write_text('{}');state={'limit_seconds':7200,'spent_seconds':10,'commands':[{'status':'running'}]};(p/'budget.json').write_text(json.dumps(state))
   with self.assertRaisesRegex(RuntimeError,'interrupted'):Budget(p)
   self.assertEqual(json.loads((p/'budget.json').read_text()),state)
 def test_report_retains_missing_and_refuses_false_prepared(self):
  manifest={'tasks':[{'id':str(i),'config':{}} for i in range(5)]}
  report=assemble(manifest,[],[{'task':'0','status':'blocked','reason':'registry unavailable'}],[])
  self.assertEqual(report['denominator'],5);self.assertEqual(report['rows'][0]['status'],'blocked');self.assertEqual(report['rows'][1]['status'],'not_started');self.assertIsNone(report['rows'][0]['image']['local_image_id'])
  with self.assertRaisesRegex(ValueError,'prepared'):assemble(manifest,[],[],[{'task':'0','status':'prepared'}])
if __name__=='__main__':unittest.main()
