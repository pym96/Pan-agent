import json,tempfile,unittest
from pathlib import Path
from excerpt_budget import reserve
class BudgetTests(unittest.TestCase):
 def test_utf8_and_repeated_displays_count(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'ledger'
   for _ in range(2):reserve(p,'字',initial_bytes=1,cap_bytes=7,source_path='synthetic')
   with self.assertRaises(ValueError):reserve(p,'x',initial_bytes=1,cap_bytes=7,source_path='synthetic')
   self.assertEqual(sum(json.loads(l)['charged_bytes'] for l in p.read_text().splitlines()),6)
 def test_refusal_never_records_payload(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'ledger'
   with self.assertRaises(ValueError) as e:reserve(p,'SYNTHETIC_ANSWER',initial_bytes=10,cap_bytes=10,source_path='synthetic')
   self.assertNotIn('SYNTHETIC_ANSWER',p.read_text()+str(e.exception))
 def test_prior_over_cap_refuses(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):reserve(Path(d)/'ledger','x',initial_bytes=11,cap_bytes=10,source_path='synthetic')
