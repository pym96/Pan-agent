"""Reject spent, unresolved and identical preparation attempts before Docker."""
import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import prepare_prefetched as prep
class PreparationBudget(unittest.TestCase):
 def test_rejected_ledger_never_starts_docker(self):
  for kind in ('spent','unresolved','identical'):
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);inputs=root/'input';inputs.mkdir();(inputs/'SHA256SUMS').write_text('fixture')
    fingerprint=hashlib.sha256(b''.join((prep.HERE/f).read_bytes() for f in ['prepare_prefetched.py','prepare-prefetched.sh','check-local-apt-uris.sh'])+b'fixture').hexdigest()
    previous={'fingerprint':fingerprint if kind=='identical' else 'old'}
    if kind!='unresolved':previous['elapsed_work_seconds']=1800 if kind=='spent' else 1
    ledger=root/'ledger.json';ledger.write_text(json.dumps({'criteria':'1.3','limit_seconds':1800,'attempts':[previous]}))
    argv=['prepare_prefetched.py','--input',str(inputs),'--output',str(root/'output'),'--budget-ledger',str(ledger)]
    with patch('sys.argv',argv),patch.object(prep.subprocess,'run') as run,patch.object(prep.subprocess,'check_output') as output:
     with self.assertRaises(AssertionError):prep.main()
     run.assert_not_called();output.assert_not_called()
if __name__=='__main__':unittest.main()
