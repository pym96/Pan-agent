"""No execution: join raw receipts into a five-row inventory and unauthorized draft."""
import argparse,hashlib,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
BASE='a74c0675d0a3eefea282a62585925617a89a7da3'
def assemble(manifest,sources,images,preflights):
 rows=[]
 for task in manifest['tasks']:
  source=next((s for s in sources if s['task']==task['id']),{});image=next((i for i in images if i['task']==task['id']),{});probe=next((r for r in preflights if r['task']==task['id']),{})
  state=probe.get('status','not_started');reason=probe.get('reason')
  if not probe and (source.get('status')=='blocked' or image.get('status')=='blocked'):state='blocked';reason=source.get('reason') or image.get('reason')
  if state=='prepared' and (not probe.get('ready') or not probe.get('stop_confirmed') or not image.get('local_image_id')):raise ValueError('invalid_prepared_evidence')
  rows.append({'task':task['id'],'status':state,'reason':reason,'source':{k:source.get(k) for k in ['source_root','status','validation_log']},'image':{k:image.get(k) for k in ['reference','registry_digest','platform_digest','config_digest','local_image_id','architecture','platform','compressed_layer_bytes','local_size_bytes','emulation','inspect_log','pull_reference']},'official_configuration':task['config'],'container_id':probe.get('container_id'),'stop_confirmed':probe.get('stop_confirmed',False),'preflight_report':probe.get('report'),'official_visible_test':task.get('official_visible_test'),'verifier_execution':'not performed; command availability is not verifier validation','formal_attempt':'must start a new clean environment'})
 return {'accepted_runner_sha':BASE,'denominator':5,'model_calls':0,'real_credential_reads':0,'official_verifier_calls':0,'rows':rows}
def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--preflights',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();raw=(HERE.parent/'manifest.json').read_bytes();m=json.loads(raw)
 report=assemble(m,json.loads((a.work/'sources.json').read_text()),json.loads((a.work/'images.json').read_text()),json.loads((a.work/a.preflights).read_text()));a.output.mkdir(parents=True,exist_ok=True)
 (a.output/'environments.json').write_text(json.dumps(report,indent=2)+'\n')
 draft=json.loads((HERE.parent/'activation-template.json').read_text());lock=json.loads((HERE.parent/'package-identity.json').read_text());draft['binding'].update(runnerSha=BASE,panHash=lock['package_sha256'],manifestHash=hashlib.sha256(raw).hexdigest(),images={r['task']:r['image']['local_image_id'] for r in report['rows']});assert draft['authorized'] is False and draft['signature'] is None
 (a.output/'live-draft.json').write_text(json.dumps(draft,indent=2)+'\n');print(json.dumps({'rows':[{k:r[k] for k in ['task','status','reason']} for r in report['rows']]}))
if __name__=='__main__':main()
