"""Validate evidence around the official reward; never rewrite its value."""
import re

NAMES={'test_hello_file_exists','test_hello_file_contents'}

def classify(mode,value,ctrf,log):
    def error(message):raise RuntimeError('infrastructure_or_invalid_control: '+message)
    if re.search(r'(?m)^E:|^W: Failed to fetch|curl: \(\d+\)|command not found|error: Failed to|\b502 Bad Gateway\b',log):
        error('dependency/network failure in official verifier log')
    if not isinstance(ctrf,dict):error('pytest execution report absent')
    results=ctrf.get('results',{});tests=results.get('tests',[]);summary=results.get('summary',{})
    names={t.get('name','').split('::')[-1] for t in tests}
    if len(tests)!=2 or names!=NAMES or summary.get('tests')!=2:error('official tests not both collected/executed')
    expected='passed' if mode=='positive' else 'failed'
    if any(t.get('status')!=expected for t in tests):error('unexpected official test outcomes')
    if summary.get(expected)!=2 or any(summary.get(k,0)!=0 for k in ('skipped','pending','other', 'failed' if expected=='passed' else 'passed')):error('incomplete pytest execution')
    if mode=='negative' and not ('File /app/hello.txt does not exist' in log and 'FileNotFoundError' in log and '/app/hello.txt' in log):
        error('negative failure is not the missing target file')
    if value!=(1 if mode=='positive' else 0):error('official reward differs from expected control')
    return {'classification':'valid_control','executed_tests':sorted(names),'expected_status':expected,'official_reward':value}
