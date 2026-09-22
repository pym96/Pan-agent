import unittest
from scoring import classify

class VerifierEvidence(unittest.TestCase):
    def result(self,status):
        return {'results':{'summary':{'tests':2,'passed':2 if status=='passed' else 0,'failed':2 if status=='failed' else 0,'skipped':0,'pending':0,'other':0},'tests':[{'name':n,'status':status} for n in ['test_hello_file_exists','test_hello_file_contents']]}}
    def test_zero_without_pytest_is_infrastructure_error(self):
        with self.assertRaisesRegex(RuntimeError,'infrastructure'):
            classify('negative',0,None,'apt HTTP 502\nuvx: command not found')
    def test_valid_pair(self):
        classify('positive',1,self.result('passed'),'2 passed')
        classify('negative',0,self.result('failed'),'AssertionError: File /app/hello.txt does not exist\nFileNotFoundError: /app/hello.txt\n2 failed')
    def test_collection_dependency_and_unrelated_failures(self):
        for report,log in [(self.result('failed'),'2 failed: unrelated'),(self.result('passed'),'curl: (22) HTTP 502\n2 passed'),({'results':{'summary':{'tests':0},'tests':[]}},'no tests ran')]:
            with self.subTest(log=log),self.assertRaises(RuntimeError):classify('negative',0,report,log)
    def test_inconsistent_summary_is_invalid(self):
        report=self.result('passed');report['results']['summary']['failed']=2
        with self.assertRaises(RuntimeError):classify('positive',1,report,'2 passed')
    def test_reward_does_not_override_failures(self):
        with self.assertRaises(RuntimeError):classify('positive',1,self.result('failed'),'2 failed')

if __name__=='__main__':unittest.main()
