"""Small bounded VT screen oracle for this Product's emitted CR/LF/CSI A,C,J subset.
Tracks visible cells, cursor, autowrap and scrollback separately. Unicode fixtures
include combining marks and ZWJ emoji; no Product formatter/state is imported.
"""
import codecs,re,unicodedata
class Screen:
 def __init__(self,columns,rows=24):
  self.columns=columns;self.rows=rows;self.cells=[['']*columns for _ in range(rows)];self.row=0;self.col=0;self.pending=False;self.escape='';self.history=[];self.decoder=codecs.getincrementaldecoder('utf-8')();self.last=None;self.join=False
 def newline(self):
  self.row+=1
  if self.row==self.rows:self.history.append(self.cells.pop(0));self.cells.append(['']*self.columns);self.row-=1
  self.pending=False;self.last=None;self.join=False
 def feed(self,body):
  for c in self.decoder.decode(body):
   if self.escape:
    self.escape+=c
    if re.fullmatch(r'\x1b\[[0-9;]*[A-Za-z]',self.escape):
     seq=self.escape;self.escape='';n=int(seq[2:-1] or '0');op=seq[-1];self.pending=False;self.last=None;self.join=False
     if op=='A':self.row=max(0,self.row-(n or 1))
     elif op=='C':self.col=min(self.columns-1,self.col+(n or 1))
     elif op=='J':
      assert n==0,seq
      self.cells[self.row][self.col:]=['']*(self.columns-self.col)
      for r in range(self.row+1,self.rows):self.cells[r]=['']*self.columns
     else:raise AssertionError('unsupported control '+repr(seq))
    else:assert len(self.escape)<30
    continue
   if c=='\x1b':self.escape=c;continue
   if c=='\r':self.col=0;self.pending=False;self.last=None;self.join=False;continue
   if c=='\n':self.newline();continue
   assert ord(c)>=32 and not 127<=ord(c)<=159,repr(c)
   if c=='\u200d' or unicodedata.combining(c) or c in ['\ufe0f','\ufe0e']:
    if self.last:self.cells[self.last[0]][self.last[1]]+=c
    if c=='\u200d':self.join=True
    continue
   if self.join and self.last:self.cells[self.last[0]][self.last[1]]+=c;self.join=False;continue
   width=2 if unicodedata.east_asian_width(c) in 'WF' else 1
   if self.pending or self.col+width>self.columns:self.newline();self.col=0
   self.cells[self.row][self.col]=c;self.last=(self.row,self.col)
   if width==2:self.cells[self.row][self.col+1]=None
   self.col+=width
   if self.col==self.columns:self.col-=1;self.pending=True
 def lines(self):return [''.join('' if c is None else c or ' ' for c in row).rstrip() for row in self.cells]
 def snapshot(self):return {'columns':self.columns,'rows':self.rows,'cursor':[self.row,self.col],'cells':[row[:] for row in self.cells],'lines':self.lines(),'scrollback_rows':len(self.history)}
 def current_query_lines(self):
  lines=self.lines();starts=[i for i,l in enumerate(lines) if l=='File search (literal)'];assert starts,('query editor not visible',lines);return lines[starts[-1]:]
 def selection(self,path):
  assert any(line=='│ > '+path for line in self.current_query_lines()),('wrong visible selection',path,self.lines())
 def query(self,text,cursor,total):
  # These fixed synthetic queries fit one row; all values are independent expected fixture values.
  assert any(line=='│ '+text or (not text and line=='│') for line in self.current_query_lines()),('query',text,self.lines())
  visible='\n'.join(self.current_query_lines());assert f'Query cursor: {cursor}/{total}' in visible,('query cursor',cursor,total,self.lines())
 def hint(self,expected,draft=''):
  lines=self.lines();positions=[i for i,l in enumerate(lines) if l.startswith(('You >','Draft >'))];assert positions,lines
  at=positions[-1];assert at>0 and lines[at-1]==expected,('prompt hint',expected,lines)
  assert lines[at].endswith(draft.rstrip()),('draft',draft,lines[at])
