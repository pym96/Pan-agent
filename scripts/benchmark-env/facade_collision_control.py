"""Owned synthetic foreign-collision fixture, never an unrelated real container."""
import argparse,hashlib,json,logging,pathlib,secrets,types
import docker
from evaluator_facade import restricted_client

def run(manifest,evidence):
    from swebench.harness.run_evaluation import create_container
    raw=docker.DockerClient(base_url=manifest['docker_endpoint'],timeout=30)
    run_id='wo71-collision-'+secrets.token_hex(4);image='sha256:91e8d1bd92fe29da1112e613c0753037fb874da7b99fb03719b182ff7cd2651d'
    name='sweb.eval.pydicom__pydicom-901.'+run_id
    labels={'pan.workorder':'71','pan.run':'fixture-owner-'+run_id}
    foreign=raw.containers.create(image,name=name,command=['tail','-f','/dev/null'],network_mode='none',nano_cpus=2_000_000_000,mem_limit=4*2**30,pids_limit=512,cap_drop=['ALL'],security_opt=['no-new-privileges'],labels=labels)
    receipts=[];client,dispatch,cleanup=restricted_client(raw,image_id=image,image_refs={'fixed-ref'},run_id=run_id,receipt=receipts.append)
    before=raw.api.inspect_container(foreign.id);created=None
    try:
        created=create_container(types.SimpleNamespace(image='fixed-ref',instance_id='pydicom__pydicom-901'),client,run_id,logging.getLogger('wo71'))
        after=raw.api.inspect_container(foreign.id)
        assert before==after and created.id!=foreign.id
        assert len([r for r in receipts if r['kind']=='create-request'])==2
        try:dispatch(['rm','--force',foreign.id])
        except Exception:pass
        else:raise AssertionError('foreign removal allowed')
        assert raw.api.inspect_container(foreign.id)==before
    finally:
        cleanup()
        # Only the controller that created this controlled fixture removes it,
        # using the separately recorded exact ID + its original ownership labels.
        obj=raw.containers.get(foreign.id)
        assert obj.id==foreign.id and all(obj.labels.get(k)==v for k,v in labels.items())
        obj.remove(force=True)
        pathlib.Path(evidence,'real-facade-collision.json').write_text(json.dumps({'fixture_container_id':foreign.id,'foreign_fixture_unchanged':before==after,'facade_created_id':created.id if created else None,'receipts':receipts,'fixture_never_started':True},indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--evidence',required=True);a=p.parse_args();run(json.loads(pathlib.Path(a.manifest).read_text()),a.evidence)
