"""Criteria1.1 finite source-role reader. Heuristics are not semantic certification."""
import hashlib,json,re
from pathlib import PurePosixPath
from projection import TARGETS
DENIED=re.compile(r'\b(?:solution|solutions|answer|answers|gold|expected\s+(?:output|result|value)|correct\s+(?:output|result|value))\b',re.I)
PAYLOAD=re.compile(r'[A-Za-z0-9+/=]{100,}|\[[\s\d.,eE+\-]{16,}\]')
YAML_KEYS={'title','xlabel','ylabel','x_label','y_label','figsize','dpi','fontsize','font_size','style','palette','color','width','height','legend','xlim','ylim','xticks','yticks','rotation','grid','task','input','schema','configuration','config'}

def read_input(data,path,entry):
    try:
        p=PurePosixPath(path)
        if len(p.parts)!=4 or p.parts[:2]!=('da_code','source') or p.parts[2] not in TARGETS or (p.name not in {'README.md','guidance.txt','plot.yaml'} and path!='da_code/source/plot-line-006/tips.txt'):raise ValueError()
        blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if entry['mode']!='100644' or entry['type']!='blob' or entry['sha']!=blob or entry['size']!=len(data):raise ValueError()
        lines=data.decode('utf8').splitlines()
    except Exception:raise ValueError('source role or integrity refused') from None
    # Explicit mixed prose sections are withheld as a unit, not just answer lines.
    mixed_lines=set()
    if p.suffix!='.yaml':
        headings=[(i,len(line)-len(line.lstrip('#'))) for i,line in enumerate(lines,1) if re.match(r'^#{1,6}\s',line)]
        for i,line in enumerate(lines,1):
            if not DENIED.search(line):continue
            previous=[h for h in headings if h[0]<=i]
            start,level=previous[-1] if previous else (1,0)
            end=next((n for n,l in headings if n>i and l<=level),len(lines)+1)
            mixed_lines.update(range(start,end))
    accepted=[];withheld=[];section=[];blocked=False;blocked_level=7;fence=False
    def flush():
        nonlocal section
        if section:
            dest=withheld if any(DENIED.search(t) or PAYLOAD.search(t) for _,t in section) else accepted
            dest.extend(section);section=[]
    for n,line in enumerate(lines,1):
        if n in mixed_lines:
            flush();withheld.append((n,line));continue
        if re.match(r'^#{1,6}\s',line):
            flush()
            level=len(line)-len(line.lstrip('#'))
            if level<=blocked_level:blocked=False
            if DENIED.search(line):blocked=True;blocked_level=level
        if line.strip().startswith('```'):
            flush();fence=not fence;withheld.append((n,line));continue
        if blocked or fence:withheld.append((n,line));continue
        if p.suffix=='.yaml':
            match=re.match(r'^([a-zA-Z_]+):\s*(.*)$',line)
            if not match or match[1] not in YAML_KEYS or DENIED.search(line) or PAYLOAD.search(line):withheld.append((n,line))
            else:accepted.append((n,line))
        elif not line.strip():flush()
        else:section.append((n,line))
    flush()
    excerpts=[];chunk=[]
    for n,line in accepted:
        if len(line.encode())>8000:withheld.append((n,line));continue
        trial=chunk+[{'line':n,'text':line}]
        if len(trial)>40 or len(json.dumps(trial,ensure_ascii=False).encode())>8000:
            excerpts.append(chunk);chunk=[]
        chunk.append({'line':n,'text':line})
    if chunk:excerpts.append(chunk)
    return {'path':path,'git_blob':blob,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'excerpts':excerpts,
        'withheld_lines':sorted(n for n,_ in withheld),'limitation':'Bounded task-input reading; no universal semantic-redaction guarantee. Withheld mixed sections require interpretation.'}
