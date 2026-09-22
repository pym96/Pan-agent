"""Anonymous official Docker Hub metadata; anonymous bearer stays only in memory."""
import hashlib,json,sys,ssl,urllib.request,urllib.parse,urllib.error
from pathlib import Path
ACCEPT=', '.join(['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json','application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'])
def choose(manifests):
 candidates=[m for m in manifests if m.get('platform',{}).get('os')=='linux' and m.get('platform',{}).get('architecture') in ['arm64','amd64']]
 if not candidates:raise ValueError('no_supported_linux_platform')
 return min(candidates,key=lambda m:0 if m['platform']['architecture']=='arm64' else 1)
def main():
 reference=sys.argv[1];out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);repo,tag=reference.rsplit(':',1)
 query=urllib.parse.urlencode({'service':'registry.docker.io','scope':'repository:'+repo+':pull'})
 with urllib.request.urlopen('https://auth.docker.io/token?'+query,timeout=30) as response:token=json.load(response)['token']
 def get(path,name,expected=None):
  request=urllib.request.Request('https://registry-1.docker.io/v2/'+repo+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':ACCEPT})
  with urllib.request.urlopen(request,timeout=30) as response:raw=response.read(16*1024*1024+1);claimed=response.headers.get('Docker-Content-Digest')
  if len(raw)>16*1024*1024:raise ValueError('metadata_too_large')
  actual='sha256:'+hashlib.sha256(raw).hexdigest()
  if expected and actual!=expected:raise ValueError('registry_digest_mismatch')
  if claimed and claimed!=actual:raise ValueError('registry_header_digest_mismatch')
  (out/name).write_bytes(raw);return json.loads(raw),actual
 manifest,tag_digest=get('manifests/'+tag,'tag.json')
 selected=None
 if 'manifests' in manifest:
  selected=choose(manifest['manifests']);manifest,platform_digest=get('manifests/'+selected['digest'],'platform.json',selected['digest'])
 else:platform_digest=tag_digest;(out/'platform.json').write_bytes((out/'tag.json').read_bytes())
 config,config_digest=get('blobs/'+manifest['config']['digest'],'config.json',manifest['config']['digest'])
 if selected and any(config.get(k)!=selected['platform'].get(k) for k in ['os','architecture']):raise ValueError('platform_config_mismatch')
 if config.get('os')!='linux' or config.get('architecture') not in ['arm64','amd64']:raise ValueError('unsupported_actual_platform')
 result={'reference':reference,'repository':repo,'registry_digest':tag_digest,'platform_digest':platform_digest,'config_digest':config_digest,'architecture':config['architecture'],'os':config['os'],'platform':'linux/'+config['architecture'],'compressed_layer_bytes':sum(l['size'] for l in manifest['layers']),'layers':[{'digest':l['digest'],'bytes':l['size']} for l in manifest['layers']],'metadata_only':True,'local_image_id':None}
 (out/'identity.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='layers'}))
if __name__=='__main__':
 try:main()
 except urllib.error.HTTPError as e:print(json.dumps({'error':'registry_http','status':e.code}));sys.exit(75 if e.code==429 or e.code>=500 else 1)
 except (urllib.error.URLError,TimeoutError) as e:
  permanent=isinstance(getattr(e,'reason',None),ssl.SSLCertVerificationError)
  print(json.dumps({'error':'tls_certificate_verification' if permanent else 'registry_transient','type':type(e).__name__}));sys.exit(1 if permanent else 75)
 except Exception as e:print(json.dumps({'error':str(e),'type':type(e).__name__}));sys.exit(1)
