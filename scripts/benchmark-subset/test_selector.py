import copy
import hashlib
import random
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from selector import allocate, canonical, rank, select, validate
from inventory import da_inventory, unique, verify_inputs


def row(domain,id_,stratum='a',decision='eligible',exposure=()):
    return dict(domain=domain,instance_id=id_,stratum=stratum,decision=decision,exposure_reasons=list(exposure))


def pool():
    return [row(d,str(i),str(i%3)) for d in ['swe','da'] for i in range(40)]


class SelectionTests(unittest.TestCase):
    def test_largest_remainders_utf8_tie(self):
        self.assertEqual([x['allocated'] for x in allocate({'é':1,'z':1,'a':1},2)],[1,1,0])
        self.assertEqual([x['allocated'] for x in allocate({'a':7,'b':14,'c':19})],[3,5,7])

    def test_exact_stratum_capacity(self):
        a=allocate({'a':1,'b':1,'c':13})
        self.assertEqual([x['allocated'] for x in a],[1,1,13])

    def test_zero_allocation_is_retained(self):
        self.assertEqual(allocate({'a':1,'b':299})[0]['allocated'],0)

    def test_shuffled_inputs_identical(self):
        rows=pool();expected=canonical(select(rows))
        for seed in range(20):
            random.Random(seed).shuffle(rows);self.assertEqual(canonical(select(rows)),expected)

    def test_hash_definition(self):
        expected=hashlib.sha256(b'pan-public-baseline-v1\0swe\0abc').hexdigest()
        self.assertEqual(rank('swe','abc'),expected)

    def test_hash_tie_uses_id_bytes(self):
        rows=[row(d,x) for d in ['da','swe'] for x in [str(i).zfill(2) for i in range(16)]]
        with patch('selector.rank',return_value='same'):
            self.assertEqual([x['instance_id'] for x in select(rows)['selected'][:15]],[str(i).zfill(2) for i in range(15)])

    def test_duplicate_rejected_before_exclusion(self):
        rows=pool();rows.append(dict(rows[0],decision='excluded'))
        with self.assertRaises(ValueError):select(rows)

    def test_cross_domain_same_id_is_allowed(self):
        result=select(pool());self.assertEqual(len(result['selected']),30)
        self.assertEqual(len({(x['domain'],x['instance_id']) for x in result['selected']}),30)

    def test_exposure_cannot_be_eligible(self):
        rows=pool();rows[0]['exposure_reasons']=['gold read']
        with self.assertRaises(ValueError):select(rows)
        rows[0]['decision']='excluded'
        self.assertNotIn(('swe','0'),[(x['domain'],x['instance_id']) for x in select(rows)['selected']])

    def test_shortfall_not_padded(self):
        result=select([r for r in pool() if r['domain']=='swe' or int(r['instance_id'])<14])
        self.assertEqual(result['status'],'blocked_proposal');self.assertFalse(result['selected'])
        self.assertIn('da: fewer than 15 eligible tasks',result['blockers'])

    def test_unknown_membership_blocks_and_changes_selection(self):
        rows=pool();rows[0]['decision']='unresolved';r=select(rows)
        self.assertEqual(r['status'],'blocked_proposal');self.assertEqual(r['selected'],[])
        self.assertFalse(r['execution_authorized']);self.assertIsNone(r['runtime_sha'])

    def test_external_block_even_when_population_sufficient(self):
        r=select(pool(),['pending adjudication']);self.assertEqual(r['selected'],[])

    def test_tampering_ids_or_activation_rejected(self):
        for key,value in [('execution_authorized',True),('selected',[]),('seed','tuned')]:
            r=select(pool());r[key]=value
            with self.assertRaises(ValueError):validate(pool(),r)

    def test_invalid_eligibility_fails(self):
        rows=pool();rows[0]['decision']='cheap'
        with self.assertRaises(ValueError):select(rows)

    def test_empty_stratum_fails(self):
        rows=pool();rows[0]['stratum']=''
        with self.assertRaises(ValueError):select(rows)


class ProjectionTests(unittest.TestCase):
    def fixture(self):
        task={'id':'fake','instruction':'Use input.csv and save result.csv.','post_process':[]}
        ev={'id':'fake','func':['compare_csv'],'result':[{'file':['result.csv']}],'options':[{'ignore_order':True}],'config':{'type':'csv'}}
        tree={}
        for kind,file in [('source','input.csv'),('gold','result.csv')]:
            root='da_code/'+kind+'/fake';tree[root]={'path':root,'type':'tree','sha':'tree'}
            tree[root+'/'+file]={'path':root+'/'+file,'type':'blob','sha':'blob','size':100,'mode':'100644'}
        return task,ev,tree

    def test_exact_options_no_gold_copy(self):
        t,e,tr=self.fixture();r=da_inventory([t],[e],tr,{})[0]
        self.assertEqual(r['decision'],'eligible');self.assertEqual(r['official_scoring']['options'],e['options'])

    def test_missing_source_directory(self):
        t,e,tr=self.fixture();del tr['da_code/source/fake']
        self.assertEqual(da_inventory([t],[e],tr,{})[0]['decision'],'excluded')

    def test_missing_referenced_gold(self):
        t,e,tr=self.fixture();e['result']=[{'file':'missing.csv'}]
        self.assertEqual(da_inventory([t],[e],tr,{})[0]['decision'],'excluded')

    def test_missing_eval_row(self):
        t,e,tr=self.fixture();self.assertEqual(da_inventory([t],[],tr,{})[0]['decision'],'excluded')

    def test_duplicate_mapping_rejected(self):
        t,e,tr=self.fixture()
        with self.assertRaises(ValueError):da_inventory([t,t],[e],tr,{})

    def test_unquoted_reference_is_not_silently_ignored(self):
        t,e,tr=self.fixture();t['instruction']='Use absent.csv and save result.csv.'
        self.assertEqual(da_inventory([t],[e],tr,{})[0]['decision'],'unresolved')

    def test_inline_answer_is_excluded_not_published_or_hashed(self):
        t,e,tr=self.fixture();canary='SYNTHETIC_INLINE_ANSWER_8123';e['result']=[{'number':[canary]}]
        r=da_inventory([t],[e],tr,{})[0];text=canonical(r).decode()
        self.assertEqual(r['decision'],'excluded');self.assertNotIn(canary,text)
        self.assertNotIn(hashlib.sha256(canary.encode()).hexdigest(),text)

    def test_gold_basename_matches_official_behavior(self):
        t,e,tr=self.fixture();e['result']=[{'file':['dabench/result.csv'],'multi':True}]
        self.assertEqual(da_inventory([t],[e],tr,{})[0]['decision'],'eligible')

    def test_postprocessing_unknown_not_excluded(self):
        t,e,tr=self.fixture();t['post_process']=['plot_process']
        self.assertEqual(da_inventory([t],[e],tr,{})[0]['decision'],'unresolved')

    def test_input_hash_drift_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'input';p.write_bytes(b'drift')
            with self.assertRaises(ValueError):verify_inputs(Path(d),{'files':[{'path':'input','bytes':5,'sha256':'0'*64}]})

    def test_path_escape_refuses(self):
        with self.assertRaises(ValueError):verify_inputs(Path('/tmp'),{'files':[{'path':'../outside','bytes':0,'sha256':'0'*64}]})

if __name__=='__main__':unittest.main()
