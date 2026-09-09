"""Independent VT cell/attribute oracle for emitted CUP/EL/SGR/private modes.
No Product formatter or internal UI state imported. Unknown escape operations fail.
"""
import codecs,re,unicodedata
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
 def snapshot(self):return {'columns':self.columns,'rows':self.rows,'cells':self.cells,'attributes':self.attrs,'cursor':[self.row,self.col],'modes':self.modes.copy()}
 def confirmed(self,busy=False):
  text='\n'.join(self.lines());assert ('Busy' if busy else 'Not submitted') in text,text
  assert ('draft retained' if busy else 'Enter Send') in text,text
 def selection(self,name):assert any(line.startswith('> '+name) for line in self.lines()),self.lines()
