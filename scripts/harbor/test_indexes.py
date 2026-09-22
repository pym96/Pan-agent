"""Regression for the actual Criteria1.2 missing Packages.gz acquisition."""
import subprocess,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
class IndexLayout(unittest.TestCase):
 def test_old_compressed_request_is_rejected_but_authenticated_path_is_present(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);p=root/'dists/noble/universe/binary-arm64/Packages';p.parent.mkdir(parents=True);p.write_text('authenticated index fixture\n');(root/'dists/noble/InRelease').write_text('fixture 24 universe/binary-arm64/Packages\nfixture 16 universe/binary-arm64/Packages.gz\n')
   for suffix,expected in [('.gz',1),('',0)]:
    uri="'file:/opt/wo74/repo/dists/noble/universe/binary-arm64/Packages"+suffix+"' index 24 SHA256:fixture\n"
    result=subprocess.run(['bash',str(HERE/'check-local-apt-uris.sh'),folder],input=uri,text=True,capture_output=True)
    self.assertEqual(result.returncode,expected,result.stderr)
    if suffix:self.assertIn('missing planned apt index',result.stderr)
 def test_remote_source_is_not_silently_allowed(self):
  result=subprocess.run(['bash',str(HERE/'check-local-apt-uris.sh')],input="'https://unapproved.invalid/Packages' index 1\n",text=True,capture_output=True)
  self.assertNotEqual(result.returncode,0)
if __name__=='__main__':unittest.main()
