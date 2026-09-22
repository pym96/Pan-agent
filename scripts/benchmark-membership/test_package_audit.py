import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import package_audit
from overlay import load_frozen,derive
class DiagnosticTests(unittest.TestCase):
 def test_parser_freeze_refuses_before_payload(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'package_schema.py').write_text('changed')
   (root/'package-schema-lock.json').write_text(json.dumps({'parser_sha256':'invalid'}))
   with patch.object(package_audit,'ROOT',root),patch.object(package_audit,'digest',side_effect=AssertionError('must not read payload')):
    with self.assertRaises(ValueError):package_audit.audit(root,root/'no-tree')
 def test_tree_mismatch_refuses_before_payload(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'tree').write_text('{}')
   with patch.object(package_audit,'digest',side_effect=AssertionError('must not read payload')):
    with self.assertRaises(ValueError):package_audit.audit(root,root/'tree')
 def test_eight_path_authority_is_exact(self):
  self.assertEqual(len(package_audit.PATHS),8)
  self.assertEqual(sum('/gold/' in p for p in package_audit.PATHS),3)
  self.assertTrue(all('/plot-scatter-002/' in p for p in package_audit.PATHS))
 def test_unclear_receipt_never_becomes_exclusion(self):
  pool,decisions=load_frozen('1.3');row=next(d for d in decisions if d['id']=='plot-scatter-002')
  self.assertEqual(row['decision'],'unresolved')
  with self.assertRaises(ValueError):derive(pool,decisions)
