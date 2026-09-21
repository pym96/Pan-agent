import contextlib,io,json,tempfile,unittest
from pathlib import Path
from source_view import emit,CARRY,CAP
from excerpt_budget import reserve
class SourceViewTests(unittest.TestCase):
 def test_durable_charge_covers_all_stdout_and_repeats(self):
  with tempfile.TemporaryDirectory() as d:
   out=io.StringIO()
   with contextlib.redirect_stdout(out):
    emit(Path(d),'synthetic',[(i,'输入 schema') for i in range(85)])
    emit(Path(d),'synthetic',[(0,'repeat')])
   records=[json.loads(s) for s in (Path(d)/'display-v12.jsonl').read_text().splitlines()]
   self.assertEqual(sum(r['charged_bytes'] for r in records),len(out.getvalue().encode()))
   saved=''.join(p.read_text() for p in sorted((Path(d)/'display-v12').glob('*.txt')))
   self.assertEqual(saved,out.getvalue())
   for p in (Path(d)/'display-v12').glob('*.txt'):
    self.assertLessEqual(len(p.read_text().splitlines()),40);self.assertLessEqual(p.stat().st_size,8192)
 def test_exhaustion_has_no_stdout(self):
  with tempfile.TemporaryDirectory() as d:
   ledger=Path(d)/'display-v12.jsonl';reserve(ledger,'x'*(CAP-CARRY),initial_bytes=CARRY,cap_bytes=CAP,source_path='synthetic')
   out=io.StringIO()
   with contextlib.redirect_stdout(out),self.assertRaises(ValueError):emit(Path(d),'synthetic',[(0,'CANARY')])
   self.assertEqual(out.getvalue(),'');self.assertNotIn('CANARY',ledger.read_text())
 def test_carry_reset_refused(self):
  with tempfile.TemporaryDirectory() as d:
   ledger=Path(d)/'ledger';reserve(ledger,'x',initial_bytes=10,cap_bytes=20,source_path='synthetic')
   with self.assertRaises(ValueError):reserve(ledger,'x',initial_bytes=0,cap_bytes=20,source_path='synthetic')
 def test_negative_ledger_charge_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'ledger';p.write_text(json.dumps({'cap_bytes':20,'prior_bytes':10,'charged_bytes':-10,'attempted_bytes':0,'allowed':True})+'\n')
   with self.assertRaises(ValueError):reserve(p,'x',initial_bytes=10,cap_bytes=20,source_path='synthetic')
 def test_actual_versions_remain_separate(self):
  from overlay import load_frozen
  _,old=load_frozen('1.1');_,new=load_frozen('1.2')
  self.assertEqual(sum(d['decision']=='unresolved' for d in old),2)
  self.assertEqual(sum(d['decision']=='unresolved' for d in new),1)
 def test_wrong_role_does_not_open_source(self):
  from source_view import view
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'da-full-tree.json').write_text(json.dumps({'sha':'b211daf51fdc9b52d5087c9df28ac50191bcabed','truncated':False,'tree':[{'path':'da_code/gold/task/answer','mode':'100644','type':'blob'}]}))
   with patch.object(Path,'read_bytes',side_effect=AssertionError('must not open source')):
    with self.assertRaises(ValueError):view(root,'da_code/gold/task/answer')
