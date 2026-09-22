"""Create a fresh bounded preparation workspace; never reset an existing ledger."""
import argparse,json,os,shutil,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--limit-seconds',type=int,choices=[1800,7200],required=True);p.add_argument('--reuse',type=Path);a=p.parse_args();a.work.mkdir(exist_ok=False,parents=True)
if a.work.stat().st_dev!=Path('/private/tmp').stat().st_dev:raise RuntimeError('active_storage_must_be_internal')
raw=Path.home()/'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw';st=os.statvfs(a.work)
if st.f_bavail*st.f_frsize<60*2**30:raise RuntimeError('free_disk_floor')
(a.work/'baseline.json').write_text(json.dumps({'utc':time.time(),'free_bytes':st.f_bavail*st.f_frsize,'docker_raw':str(raw),'docker_allocated':raw.stat().st_blocks*512,'owned_allocated':0,'limit_seconds':a.limit_seconds},indent=2)+'\n')
(a.work/'home').mkdir();(a.work/'docker-config').mkdir();(a.work/'docker-config/config.json').write_text(json.dumps({'cliPluginsExtraDirs':['/Applications/Docker.app/Contents/Resources/cli-plugins']}))
if a.reuse:
 # Fixed task sources are small; copy rather than mount the source workspace.
 shutil.copytree(a.reuse/'tasks',a.work/'tasks')
 for name in ['images.json','sources.json']:shutil.copyfile(a.reuse/name,a.work/name)
print(json.dumps({'work':str(a.work),'limit_seconds':a.limit_seconds,'authorized_live':False}))
