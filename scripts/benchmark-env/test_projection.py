import unittest
from projection import classify_output,project
class ProjectionTests(unittest.TestCase):
    def test_missing_corrupt_and_valid_zero_candidate_are_distinct(self):
        self.assertEqual(classify_output(None,['result']),'missing_artifact')
        for data in (b'\xff',b'wrong\nanswer\n',b'result\n',b'result\n"unterminated'):
            self.assertEqual(classify_output(data,['result']),'corrupt_artifact')
        self.assertEqual(classify_output(b'result\nWRONG\n',['result']),'valid_artifact')
    def test_projection_uses_actual_previous_observations(self):
        effects=[{'arguments':{'command':'read'},'result':{'stdout':'observed','stderr':'','exit_code':0}}, {'arguments':{'command':'write then cat'},'result':{'stdout':'result\nfixture\n','stderr':'','exit_code':0}}]
        trace={'task':'da','realProviderCalls':0,'effects':effects,'result':{'status':'completed'}}
        payload,mapping,artifact=project(trace)
        self.assertEqual(payload['trajectory'][1]['observation'],'observed')
        self.assertEqual(payload['trajectory'][2]['observation'],artifact)
        self.assertEqual(payload['trajectory'][1]['code'],'write then cat')
        self.assertTrue(payload['finished'])
        self.assertEqual(project(trace),(payload,mapping,artifact))
        trace['result']['status']='cancelled'
        self.assertFalse(project(trace)[0]['finished'])
if __name__=='__main__':unittest.main()
