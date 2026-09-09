"""Independent VT cell/attribute oracle for emitted CUP/EL/SGR/private modes.
No Product formatter or internal UI state imported. Unknown escape operations fail.
"""
import codecs,re,unicodedata,copy,json
class Screen:
 def __init__(self,columns,rows):
  self.columns=columns;self.rows=rows;self.cells=[[' ']*columns for _ in range(rows)];self.attrs=[[()]*columns for _ in range(rows)];self.row=0;self.col=0;self.attr=();self.escape='';self.decoder=codecs.getincrementaldecoder('utf-8')();self.last=None;self.join=False;self.modes={};self.pending=False
 def feed(self,data):
  for c in self.decoder.decode(data):
   if self.escape:
    self.escape+=c
    if re.fullmatch(r'\x1b\[\??[0-9;]*[A-Za-z]',self.escape):
     seq=self.escape;self.escape='';arg=seq[2:-1];op=seq[-1]
     if arg.startswith('?'):
      assert op in 'hl',seq;self.modes[arg[1:]]=op=='h';continue
     nums=[int(n or 0) for n in arg.split(';')]
     if op=='H':self.row=max(0,min(self.rows-1,(nums[0] or 1)-1));self.col=max(0,min(self.columns-1,(nums[1] if len(nums)>1 else 1)-1));self.pending=False;self.last=None;self.join=False
     elif op=='K':assert nums==[2],seq;self.cells[self.row]=[' ']*self.columns;self.attrs[self.row]=[self.attr]*self.columns
     elif op=='m':
      if nums==[0]:self.attr=()
      else:self.attr=self.attr+tuple(nums)
     else:raise AssertionError('unrecognized renderer sequence '+repr(seq))
    else:assert len(self.escape)<70,repr(self.escape)
    continue
   if c=='\x1b':self.escape=c;continue
   if c=='\r':self.col=0;self.pending=False;continue
   if c=='\n':self.row=min(self.rows-1,self.row+1);continue
   assert ord(c)>=32 and not 127<=ord(c)<=159,repr(c)
   if c=='\u200d' or unicodedata.combining(c) or c in ['\ufe0f','\ufe0e']:
    if self.last:self.cells[self.last[0]][self.last[1]]+=c
    if c=='\u200d':self.join=True
    continue
   if self.join and self.last:self.cells[self.last[0]][self.last[1]]+=c;self.join=False;continue
   size=2 if unicodedata.east_asian_width(c) in 'WF' or 0x1f300<=ord(c)<=0x1faff else 1
   if self.pending or self.col+size>self.columns:self.col=0;self.row=min(self.rows-1,self.row+1);self.pending=False
   self.cells[self.row][self.col]=c;self.attrs[self.row][self.col]=self.attr;self.last=(self.row,self.col)
   if size==2 and self.col+1<self.columns:self.cells[self.row][self.col+1]='';self.attrs[self.row][self.col+1]=self.attr
   self.col+=size
   if self.col>=self.columns:self.col=self.columns-1;self.pending=True
 def lines(self):return [''.join(row).rstrip() for row in self.cells]
 def snapshot(self,raw_bytes=None,event_index=None):return copy.deepcopy({'columns':self.columns,'rows':self.rows,'cells':self.cells,'attributes':self.attrs,'cursor':[self.row,self.col],'modes':self.modes,'rawBytes':raw_bytes,'terminalEventIndex':event_index})
 def confirmed(self,busy=False):
  text='\n'.join(self.lines());assert ('Busy' if busy else 'Not submitted') in text,text
  assert ('draft retained' if busy else 'Enter Send') in text,text
 def selection(self,name):assert any(line.startswith('> '+name) for line in self.lines()),self.lines()

# Independent source-coordinate oracle; groups marks/ZWJ for the declared Unicode fixtures.
def clusters(text):
 result=[]
 for c in text:
  if result and (unicodedata.combining(c) or c in ['\u200d','\ufe0f','\ufe0e'] or result[-1].endswith('\u200d')):result[-1]+=c
  else:result.append(c)
 return result

def content_rows(entries,columns):
 result=[]
 for item,entry in enumerate(entries):
  result.append({'item':item,'part':'header','start':0,'end':1,'text':entry['role']+' · '+entry['status']})
  line={'item':item,'part':'text','start':0,'end':0,'text':'│ '};used=0
  for offset,g in enumerate(clusters(entry['text'])):
   if g=='\n':line['end']=offset+1;result.append(line);line={'item':item,'part':'text','start':offset+1,'end':offset+1,'text':'│ '};used=0;continue
   safe=''
   for c in g:
    n=ord(c)
    safe+=('\\\\' if c=='\\' else ('\\u%04x'%n) if n<32 or 127<=n<=159 or 0x202a<=n<=0x202e or 0x2066<=n<=0x2069 or n in [0x2028,0x2029] else c)
   for v in clusters(safe):
    size=2 if unicodedata.east_asian_width(v[0]) in 'WF' or 0x1f300<=ord(v[0])<=0x1faff else 1
    if used+size>columns-2:result.append(line);line={'item':item,'part':'text','start':offset,'end':offset,'text':'│ '};used=0
    line['text']+=v;line['end']=offset+1;used+=size
  result.append(line)
 return result

def anchored(screen,state,anchor):
 rows=content_rows(state['entries'],screen.columns)
 indices=[i for i,r in enumerate(rows) if r['item']==anchor['item'] and r['part']==anchor['part'] and r['start']<=anchor['offset'] and (anchor['offset']<r['end'] or r['start']==r['end']==anchor['offset'])]
 assert indices,anchor
 first=indices[0];body=next(i for i,l in enumerate(screen.lines()) if l.startswith('─'))-1
 top=min(first,max(0,len(rows)-body));assert state['top']==top,(state['top'],top,anchor)
 assert screen.lines()[1]==rows[top]['text'].rstrip(),(screen.lines()[1],rows[top])
 assert top<=first<top+body

def replay_checkpoints(raw,events,captures):
 """One ordered replay visits every declared prefix; resize is metadata, never inferred from bytes."""
 initial=events[0];assert initial['offset']==0 and initial['kind']=='initial'
 screen=Screen(initial['columns'],initial['rows']);offset=0;applied=0
 for capture in captures:
  while applied<capture['terminalEventIndex']:
   event=events[applied+1];assert offset<=event['offset']<=capture['rawBytes'];screen.feed(raw[offset:event['offset']]);offset=event['offset'];modes=screen.modes.copy();screen=Screen(event['columns'],event['rows']);screen.modes=modes;applied+=1
  end=capture['rawBytes'];assert offset<=end<=len(raw);screen.feed(raw[offset:end]);offset=end
  expected=screen.snapshot(end,applied)
  assert json.dumps(expected,sort_keys=True)==json.dumps(capture['screen'],sort_keys=True),('raw prefix mismatch',capture['label'],end)
 return len(captures)
