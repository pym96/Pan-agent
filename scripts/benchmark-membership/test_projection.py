import hashlib
import json
import unittest
from projection import TARGETS,task_projection,readme_projection

CANARY='SYNTHETIC_ANSWER_c72e19'
class ProjectionTests(unittest.TestCase):
    def assert_absent(self,value):
        text=json.dumps(value)
        self.assertNotIn(CANARY,text)
        self.assertNotIn(hashlib.sha256(CANARY.encode()).hexdigest(),text)
    def test_task_fields_and_ids(self):
        rows=[{'id':x,'instruction':'Use supplied input.csv.','post_process':[],'result':{'number':CANARY},'gold':CANARY} for x in TARGETS]
        rows.append({'id':'reserve','instruction':CANARY})
        result=task_projection(('\n'.join(map(json.dumps,rows))).encode());self.assert_absent(result)
        self.assertEqual(len(result['tasks']),16)
    def test_bad_json_does_not_echo(self):
        with self.assertRaises(ValueError) as ctx:task_projection(CANARY.encode())
        self.assert_absent(str(ctx.exception))
    def test_missing_or_duplicate_target_refuses(self):
        rows=[{'id':x,'instruction':'Task','post_process':[]} for x in TARGETS]
        for rs in [rows[:-1],rows+[rows[0]]]:
            with self.assertRaises(ValueError):task_projection('\n'.join(map(json.dumps,rs)).encode())
    def test_nested_solution_section_withholds_code(self):
        raw=f'# Dataset\n```python\ndata = sns.load_dataset("tips")\n```\n# Solution\n## Loading\n```python\nsecret = pd.read_csv("{CANARY}")\n```\n'
        p=readme_projection(raw.encode());self.assert_absent(p);self.assertEqual(len(p['emitted']),1)
    def test_inline_answer_and_tables_withheld(self):
        p=readme_projection(f'Answer: {CANARY}\n| Expected | {CANARY} |\nPlain prose {CANARY}'.encode());self.assert_absent(p);self.assertEqual(p['emitted'],[])
    def test_recipe_literals_only(self):
        p=readme_projection(f'```python\nnp.random.seed(42)\nx = np.random.normal(0, 1, 100)\ny = np.mean(x)\nz = [{CANARY!r}]\n```'.encode())
        self.assert_absent(p);self.assertEqual(len(p['emitted']),2)
    def test_answer_variable_is_withheld(self):
        p=readme_projection(f'```python\nanswer = pd.read_csv("{CANARY}")\n```'.encode());self.assert_absent(p)
    def test_untrusted_exception_no_payload(self):
        with self.assertRaises(ValueError) as ctx:readme_projection(b'\xff'+CANARY.encode())
        self.assert_absent(str(ctx.exception))


class ConceptTests(unittest.TestCase):
    def test_closed_vocabulary_never_echoes_prose_or_values(self):
        from projection import readme_concepts
        raw=('Football betting odds dataset. Solution: '+CANARY+'\nOrders answer '+CANARY).encode()
        projected=readme_concepts(raw)
        self.assertNotIn(CANARY,json.dumps(projected))
        self.assertNotIn(hashlib.sha256(CANARY.encode()).hexdigest(),json.dumps(projected))
        self.assertEqual(projected['observations'][0]['concepts'],['football_domain','betting_domain'])

if __name__=='__main__':unittest.main()
