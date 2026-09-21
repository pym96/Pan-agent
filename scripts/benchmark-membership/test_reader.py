import hashlib,json,unittest
from reader import read_input
C='SYNTHETIC_PRIVATE_TOKEN_73'
def read(s,path='da_code/source/data-sa-039/README.md'):
 b=s.encode();return read_input(b,path,{'mode':'100644','type':'blob','sha':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest(),'size':len(b)})
class ReaderTests(unittest.TestCase):
 def test_sections(self):
  p=read('Dataset describes frog measurements.\n\n# Solution\n'+C+'\n\n# Inputs\nColumns: force, group.')
  self.assertNotIn(C,json.dumps(p));self.assertEqual(len(p['excerpts'][0]),3)
 def test_inline_mixed(self):
  p=read('Dataset is supplied. Expected result: '+C);self.assertEqual(p['excerpts'],[])
 def test_unknown_yaml(self):
  p=read('xlabel: Force\nanswer: '+C+'\nunknown: '+C,'da_code/source/data-sa-039/plot.yaml');self.assertNotIn(C,json.dumps(p))
 def test_exception(self):
  with self.assertRaises(ValueError) as e:read(C,'gold/'+C)
  self.assertNotIn(C,str(e.exception))
 def test_payload(self):
  self.assertEqual(read('A'*150)['excerpts'],[])
 def test_limits(self):
  for ex in read('\n\n'.join('Input description '+str(i) for i in range(100)))['excerpts']:
   self.assertLessEqual(len(ex),40);self.assertLessEqual(len(json.dumps(ex).encode()),8192)
 def test_symlink(self):
  with self.assertRaises(ValueError):read_input(b'x','da_code/source/data-sa-039/README.md',{'mode':'120000','type':'blob','sha':'x','size':1})

 def test_nested_solution_stays_withheld(self):
  self.assertNotIn(C,json.dumps(read("# Solution\n## Data\n"+C)))

 def test_mixed_section_withholds_provision_paragraph_too(self):
  result=read('# Data\nDataset provisioning description.\n\nAnswer: '+C+'\n# Other\nSchema description.')
  self.assertNotIn('Dataset provisioning',json.dumps(result))
  self.assertNotIn(C,json.dumps(result))

 def test_only_one_new_tips_path_allowed(self):
  self.assertTrue(read('Input configuration metadata.','da_code/source/plot-line-006/tips.txt')['excerpts'])
  with self.assertRaises(ValueError):read('Input metadata.','da_code/source/plot-bar-004/tips.txt')
