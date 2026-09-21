import hashlib,json,pathlib,sys,tarfile,urllib.request
E=pathlib.Path(sys.argv[1]);W=pathlib.Path(sys.argv[2]);rev='7a21e05772954cc81471ae19d56f436cecf43c54';url=f'https://codeload.github.com/SWE-bench/SWE-bench/tar.gz/{rev}';rows=[]
for name,url,cap in [('swebench-source.tar.gz',url,64*1024**2),('dev.parquet','https://huggingface.co/datasets/SWE-bench/SWE-bench_Lite/resolve/b0dde1093fe417d83b7184254edf8199c1f0dff5/data/dev-00000-of-00001.parquet',16*1024**2)]:
 with urllib.request.urlopen(url,timeout=60) as r:
  data=r.read(cap+1);assert len(data)<=cap
 (E/name).write_bytes(data);rows.append({'url':url,'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert rows[1]['sha256']=='b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f'
with tarfile.open(E/'swebench-source.tar.gz') as t:
 for m in t.getmembers():
  p=pathlib.PurePosixPath(m.name);assert not p.is_absolute() and '..' not in p.parts and not m.issym() and not m.islnk();assert m.isdir() or m.isfile()
 assert sum(m.size for m in t.getmembers())<256*1024**2
 t.extractall(W/'sources',filter='data')
(E/'swe-source-manifest.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows))
