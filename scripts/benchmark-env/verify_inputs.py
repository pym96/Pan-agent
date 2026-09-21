"""Read-only pinned source/installed upstream/input identity verification."""
import hashlib,json,pathlib,sysconfig,tarfile

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def verify(manifest,work,evidence):
    work=pathlib.Path(work);evidence=pathlib.Path(evidence);site=pathlib.Path(sysconfig.get_paths()['purelib'])
    expected=manifest['source_and_preparation_files']['source-manifest.json']
    if sha(evidence/'source-manifest.json')!=expected:raise RuntimeError('source manifest drift')
    rows=json.loads((evidence/'source-manifest.json').read_text());checked=[]
    for row in rows:
        key={'SWE-agent/SWE-ReX':'SWE-ReX','yiyihum/da-code':'da-code'}[row['repo']]
        relative=pathlib.PurePosixPath(row['path'])
        if relative.is_absolute() or '..' in relative.parts:raise RuntimeError('unsafe source path')
        source=work/'sources'/key/relative
        if source.is_symlink() or sha(source)!=row['sha256']:raise RuntimeError('source/input drift: '+row['path'])
        if key=='SWE-ReX' and row['path'].startswith('src/') and source.suffix=='.py':
            if sha(site/pathlib.Path(row['path']).relative_to('src'))!=row['sha256']:raise RuntimeError('installed SWE-ReX drift')
        checked.append({'path':key+'/'+row['path'],'sha256':row['sha256']})
    archive=evidence/'swebench-source.tar.gz'
    if sha(archive)!='69c1b63d3b901ea69a69d40c01f3b9ac1dbe1f8fadbe05885be9ef85542a82f6':raise RuntimeError('SWE archive drift')
    with tarfile.open(archive) as tar:
        for member in tar:
            if not member.isfile():continue
            parts=pathlib.PurePosixPath(member.name).parts
            if '..' in parts or member.name.startswith('/'):raise RuntimeError('unsafe SWE source path')
            data=tar.extractfile(member).read();digest=hashlib.sha256(data).hexdigest()
            source=work/'sources'/member.name
            if source.is_symlink() or sha(source)!=digest:raise RuntimeError('SWE source drift')
            if len(parts)>1 and parts[1]=='swebench' and member.name.endswith('.py'):
                installed=site/pathlib.Path(*parts[1:])
                if installed.exists() and sha(installed)!=digest:raise RuntimeError('installed SWE scorer drift')
            checked.append({'path':member.name,'sha256':digest})
    # The official wheel excludes standalone collection scripts. Verify every
    # installed Python module against source, rather than requiring excluded files.
    for installed in (site/'swebench').rglob('*.py'):
        source=work/'sources/SWE-bench-7a21e05772954cc81471ae19d56f436cecf43c54'/installed.relative_to(site)
        if not source.is_file() or sha(source)!=sha(installed):raise RuntimeError('unexpected installed scorer module')
    if sha(evidence/'dev.parquet')!='b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f':raise RuntimeError('dataset drift')
    return checked
