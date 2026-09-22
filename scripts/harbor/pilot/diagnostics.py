"""Allowlisted diagnostic projection. Never persist arbitrary exception/stderr text."""
import json
from pathlib import Path
STAGES={'source_validation','daemon_connection','compose_create','inspect_audit','ready','runtime','cleanup'}
def classify(text):
    for fragment,code in [('all predefined address pools have been fully subnetted','docker_address_pool_exhausted'),('Cannot connect to the Docker daemon','docker_daemon_unavailable'),('docker_operation_failed','docker_daemon_unavailable'),('No such image','docker_image_unavailable'),('task_source_','task_source_invalid'),('No such file or directory','required_path_missing')]:
        if fragment in text:return code
    return 'unclassified_child_error'
def failure(exc,stage,task,project,container):
    chain=[];seen=set()
    while exc is not None and id(exc) not in seen and len(chain)<8:
        seen.add(id(exc));text=str(exc)[:65536]
        # Types and return code are projected; command/output bodies are never persisted.
        import re
        match=re.search(r'Return code: (-?\d+)\.',text)
        kind=type(exc).__name__ if type(exc).__name__ in {'RuntimeError','ValueError','AssertionError','FileNotFoundError','TimeoutError','CancelledError','ConnectionError','BrokenPipeError'} else 'Exception'
        chain.append({'type':kind,'reason':classify(text),'exit_code':int(match[1]) if match else None});exc=exc.__cause__ or exc.__context__
    return {'task':task,'stage':stage if stage in STAGES else 'unknown','project':project,'container_id':container,'causes':chain,'details_policy':'allowlisted categories only; arbitrary exception text suppressed','cause_chain_truncated':exc is not None}
async def release_network(docker,project,trial):
    """Release only the new broker project's empty network, after stopped-state evidence."""
    ids=(await docker('network','ls','-q','--filter','label=com.docker.compose.project='+project)).split()
    records=[]
    for ident in ids:
        info=json.loads(await docker('network','inspect',ident))[0]
        if info.get('Labels',{}).get('com.docker.compose.project')!=project:raise RuntimeError('network_owner_mismatch')
        if info.get('Containers'):raise RuntimeError('network_still_active')
        records.append({'id':info['Id'],'name':info['Name'],'project':project,'containers':info.get('Containers'), 'ipam':info['IPAM'],'status':'removal_pending'})
        (trial/'network-release.json').write_text(json.dumps(records,indent=2)+'\n')
        await docker('network','rm',info['Id']);records[-1]['status']='removed'
        (trial/'network-release.json').write_text(json.dumps(records,indent=2)+'\n')
