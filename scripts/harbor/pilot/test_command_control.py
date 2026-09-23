"""Historical WO81 ledger admission oracle only; runtime replaced by WO83 Criteria1.1.
Old executable fixture is preserved in commit 5552200379c3f4d45288b6942966d3ac755e3314.
"""
SCOPE_AUTH='H-TREC81-SCOPE-20260923-001'
NORMAL3_AUTH='H-TREC81-NORMAL3-20260923-001'
def authorize_control(rows,scenario,authorization=None):
 if any(r['event']=='start' and not any(e['event']=='end' and e['attempt']==r['attempt'] for e in rows) for r in rows):raise RuntimeError('unfinished_control_attempt')
 count=sum(r['event']=='start' and r['scenario']==scenario for r in rows)
 if sum(r.get('elapsed',0) for r in rows)>=1800:raise RuntimeError('control_budget_exhausted')
 if authorization==SCOPE_AUTH:
  if scenario not in ['normal','nonzero','timeout','cancel','deadline','uncertain']:raise RuntimeError('diagnostic_authorization_refused')
 elif authorization is not None:
  if authorization!=NORMAL3_AUTH or scenario!='normal' or count!=2 or any(r.get('authorization')==NORMAL3_AUTH for r in rows):raise RuntimeError('diagnostic_authorization_refused')
 elif count>=2:raise RuntimeError('control_budget_exhausted')
 return len(rows)+1

if __name__=='__main__':raise SystemExit('WO81 controls superseded; use authorized WO83 fixture')
