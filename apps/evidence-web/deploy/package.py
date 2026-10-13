#!/usr/bin/env python3
"""Build a self-contained program directory from source and a pinned Pan tarball."""
import argparse,hashlib,json,pathlib,shutil,subprocess,tarfile,sys,importlib.util,platform,os
sys.dont_write_bytecode=True
P=pathlib.Path
spec=importlib.util.spec_from_file_location('operator',P(__file__).with_name('pan-web.py'));op=importlib.util.module_from_spec(spec);spec.loader.exec_module(op)
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--pan-tar',required=True);p.add_argument('--redis',required=True);p.add_argument('--platform-lock');a=p.parse_args()
src=P(__file__).resolve().parents[1];out=P(a.out).resolve();op.require(not out.exists(),'output exists; retain previous builds')
identity=None
if sys.platform=='linux':
 op.require(a.platform_lock,'Linux requires explicit platform lock')
 identity=json.loads(P(a.platform_lock).read_text())
 op.require(identity['os']==sys.platform and identity['architecture']==platform.machine(),'platform lock mismatch')
 op.require(len(identity['sourceSHA'])==40 and all(c in '0123456789abcdef' for c in identity['sourceSHA']),'invalid source SHA')
 op.require(op.digest(a.pan_tar)==identity['panTarSHA256'],'Pan package mismatch')
 op.require(op.digest(a.redis)==identity['redisSHA256'],'Redis binary mismatch')
 image=identity['image'];op.require(image.startswith('sha256:') and len(image)==71,'invalid image identity')
 observed=json.loads(op.call(['docker','image','inspect',image]))[0]
 op.require(observed['Id']==image and observed['Os']=='linux' and observed['Architecture']=={'x86_64':'amd64','aarch64':'arm64'}.get(platform.machine()),'image platform mismatch')
else:
 op.require(not a.platform_lock,'platform lock supported only on Linux')
 op.require(op.digest(a.pan_tar)=='70b6c7680f07f936343737f064e94cb9838aefb6264448c3639a935accce9d0e','Pan package mismatch')
 op.require(op.digest(a.redis)=='99d12efe55a74b56b93c3910011833b51f9691580a6d8158946026249e22650c','Redis binary mismatch')
 image=op.IMAGE
out.mkdir(parents=True);(out/'bin').mkdir();(out/'deploy').mkdir();(out/'inputs').mkdir()
subprocess.run(['go','build','-mod=readonly','-p','2','-trimpath','-o',str(out/'bin/evidence-web'),'./cmd/pan-web'],cwd=src,check=True)
subprocess.run(['npm','ci','--ignore-scripts'],cwd=src/'web',check=True);subprocess.run(['npm','run','build'],cwd=src/'web',check=True)
shutil.copytree(src/'web/dist',out/'web');shutil.copytree(src/'executor',out/'executor');shutil.copytree(src/'internal/database/migrations',out/'migrations')
shutil.copy2(P(__file__).with_name('README.md'),out/'deploy/README.md');shutil.copy2(a.redis,out/'bin/redis-server');shutil.copy2(P(__file__).with_name('pan-web.py'),out/'deploy/pan-web.py')
with tarfile.open(a.pan_tar) as tar:
 for member in tar.getmembers():
  parts=P(member.name).parts
  op.require(parts and parts[0]=='package' and '..' not in parts and not P(member.name).is_absolute() and (member.isfile() or member.isdir()),'unsafe Pan tar member')
 tar.extractall(out)

(out/'package').rename(out/'pan')
report=src.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json';op.require(op.digest(report)=='f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab','report mismatch');shutil.copy2(report,out/'inputs/summary.json')
op.write(out/'inputs/manifest.json',{'version':1,'title':'授权报告 · 私有分析','summary':'summary.json','files':{'summary.json':op.digest(report)}})
op.write(out/'manifest.json',{'version':2 if identity else 1,**({'architecture':identity['architecture'],'sourceSHA':identity['sourceSHA'],'platformLock':identity} if identity else {}),'modes':['offline-faux','kimi'],'os':sys.platform,'image':image,'panTarSHA256':op.digest(a.pan_tar),'files':op.tree(out),'note':'PG/Node/Docker/Python are declared host dependencies; init pins executable hashes. Provider credential injected at startup only; live recovery unsupported.'})
print('built '+str(out))
