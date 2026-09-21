"""Criteria1.2 sole upstream source display path: role/integrity -> projection -> durable charge -> display."""
import argparse,ast,hashlib,json,sys,os,time
from pathlib import Path
from excerpt_budget import reserve
from reader import read_input
CARRY=72488
CAP=98304
IMPLEMENTATIONS={'da_agent/envs/da_agent.py','da_agent/controllers/setup.py','da_agent/controllers/python.py','da_agent/configs/post_process.py','da_agent/configs/scripts/image.py','da_agent/configs/__init__.py','da_agent/evaluators/evaluation.py','da_agent/evaluators/metrics/image.py','da_agent/images/da_agent-image/Dockerfile','run.py','evaluate.py'}

def emit(receipts,path,lines):
    receipts.mkdir(parents=True,exist_ok=True)
    timing=receipts/'start-v12.json'
    if timing.exists():
        t=json.loads(timing.read_text())
        if t['prior_seconds']+time.time()-t['start_epoch']>=t['time_limit']:raise ValueError('cumulative role time exhausted')
    chunks=[];chunk=[]
    for number,text in lines:
        line=f'{path}:{number}: {text}'
        if len((line+'\n').encode())>8192:raise ValueError('source line exceeds excerpt limit')
        if len(chunk)==40 or len(('\n'.join(chunk+[line])+'\n').encode())>8192:
            chunks.append(chunk);chunk=[]
        chunk.append(line)
    if chunk:chunks.append(chunk)
    if not chunks:chunks=[['Source view withheld or empty; no source text displayed.']]
    for chunk in chunks:
        payload='\n'.join(chunk)+'\n'
        reserve(receipts/'display-v12.jsonl',payload,initial_bytes=CARRY,cap_bytes=CAP,source_path=path)
        count=sum(1 for _ in (receipts/'display-v12.jsonl').open())
        target=receipts/'display-v12';target.mkdir(exist_ok=True)
        with (target/f'{count:04d}.txt').open('x') as f:
            f.write(payload);f.flush();os.fsync(f.fileno())
        print(payload,end='')

def view(inputs,path,functions=()):
    tree_text=(inputs/'da-full-tree.json').read_text()
    lock=json.loads((Path(__file__).resolve().parent.parent/'benchmark-subset/input-lock.json').read_text())
    expected=next(r['sha256'] for r in lock['files'] if r['path']=='da-full-tree.json')
    if hashlib.sha256(tree_text.encode()).hexdigest()!=expected:raise ValueError('locked tree integrity refused')
    tree=json.loads(tree_text)
    if tree['truncated'] or tree['sha']!='b211daf51fdc9b52d5087c9df28ac50191bcabed':raise ValueError('source pin refused')
    entries={r['path']:r for r in tree['tree']};entry=entries.get(path)
    if not entry or entry['type']!='blob' or entry['mode']!='100644':raise ValueError('source role refused')
    if not path.startswith('da_code/source/') and path not in IMPLEMENTATIONS:raise ValueError('source scope refused before read')
    if path.startswith('da_code/source/'):
        from projection import TARGETS
        parts=Path(path).parts
        if len(parts)!=4 or parts[2] not in TARGETS or (parts[3] not in {'README.md','guidance.txt','plot.yaml'} and path!='da_code/source/plot-line-006/tips.txt'):raise ValueError('task scope refused before read')
    target=inputs/'upstream'/path
    if any(p.is_symlink() for p in [target,*target.parents] if p!=inputs.parent) or not target.resolve().is_relative_to((inputs/'upstream').resolve()):raise ValueError('source redirection refused')
    data=target.read_bytes();blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if blob!=entry['sha'] or len(data)!=entry['size']:raise ValueError('source integrity refused')
    if path.startswith('da_code/source/'):
        report=read_input(data,path,entry)
        return [(r['line'],r['text']) for ex in report['excerpts'] for r in ex]
    if path not in IMPLEMENTATIONS:raise ValueError('implementation scope refused')
    lines=data.decode().splitlines()
    if path.endswith('.py'):
        tree=ast.parse(data.decode());nodes=[n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in functions]
        if set(n.name for n in nodes)!=set(functions) or not functions:raise ValueError('explicit implementation functions required')
        selected=sorted(set(i for n in nodes for i in range(n.lineno,n.end_lineno+1)))
        return [(i,lines[i-1]) for i in selected]
    raise ValueError('explicit source projection required')

def main():
    p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,required=True);p.add_argument('--receipts',type=Path,required=True);p.add_argument('--path',required=True);p.add_argument('--functions',nargs='*',default=[]);p.add_argument('--start-line',type=int,default=1);p.add_argument('--end-line',type=int,default=1000000);a=p.parse_args()
    try:lines=view(a.inputs,a.path,a.functions)
    except Exception:
        emit(a.receipts,'source-error',[(0,'Source view refused; no exception payload disclosed.')]);return 1
    emit(a.receipts,a.path,[(n,t) for n,t in lines if a.start_line<=n<=a.end_line]);return 0
if __name__=='__main__':raise SystemExit(main())
