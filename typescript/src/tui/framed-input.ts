import type { InputKey } from './terminal-input.ts';

export type FramedEvent =
 | {type:'key';text?:string;key:InputKey}
 | {type:'wheel';delta:number;x:number;y:number}
 | {type:'paste-start'}
 | {type:'paste';text:string};
type Mode='ground'|'esc'|'csi'|'mouse'|'ss3'|'string'|'paste';
const END_PASTE='\x1b[201~';
const NAV:Record<string,string>={A:'up',B:'down',C:'right',D:'left',H:'home',F:'end',Z:'tab','1~':'home','2~':'insert','3~':'delete','4~':'end','5~':'pageup','6~':'pagedown'};
/** Compatibility input: reserved ESC prefix, explicit BEL Back, no clock or readline decoding. */
export class FramedInput {
 private mode:Mode='ground';private frame='';private retained=0;private drop=false;private overflow=false;private pastePrefix=0;
 private osc=false;private stringEsc=false;private pasteTail='';private pasteText='';
 private readonly counts={key:0,wheel:0,'paste-start':0,paste:0};
 private readonly emit:(event:FramedEvent)=>void;
 constructor(emit:(event:FramedEvent)=>void){this.emit=event=>{this.counts[event.type]++;emit(event);};}
 get state(){return {mode:this.mode,pending:this.mode!=='ground',retainedBytes:this.retained,quarantined:this.drop,events:{...this.counts}};}
 private reset():void{this.mode='ground';this.frame='';this.retained=0;this.drop=false;this.overflow=false;this.pastePrefix=0;this.stringEsc=false;this.osc=false;}
 private keep(c:string):void{
  if(this.overflow)return;
  if(this.retained+Buffer.byteLength(c)>4096){this.overflow=true;this.frame='';this.retained=0;this.drop=true;}
  if(!this.overflow){this.frame+=c;this.retained+=Buffer.byteLength(c);}
 }
 private key(name:string,extra:InputKey={},text?:string):void{this.emit({type:'key',text,key:{name,...extra}});}
 feed(text:string):void{for(const c of text)this.point(c);}
 private point(c:string):void{
  if(this.mode==='paste'){
   this.pasteTail+=c;
   while(this.pasteTail&&!END_PASTE.startsWith(this.pasteTail)){if(!this.drop)this.pasteText+=this.pasteTail[0];this.pasteTail=this.pasteTail.slice(1);}
   if(this.pasteTail===END_PASTE){const text=this.pasteText,drop=this.drop;this.pasteTail='';this.pasteText='';this.reset();if(!drop)this.emit({type:'paste',text});}
   return;
  }
  // These physical commands remain effective even while draining any non-paste frame.
  if(c==='\x07'||c==='\x03'||c==='\x04'){
   if(this.mode!=='ground'){this.drop=true;if(this.mode==='string'&&this.osc&&c==='\x07')this.reset();}
   this.key(c==='\x07'?'g':c==='\x03'?'c':'d',{ctrl:true});return;
  }
  if(this.mode==='ground'){
   if(c==='\x1b'){this.mode='esc';this.keep(c);return;}
   if(c==='\r'||c==='\n'){this.key('return');return;}
   if(c==='\t'){this.key('tab');return;}
   if(c==='\b'||c==='\x7f'){this.key('backspace');return;}
   const n=c.charCodeAt(0);if(n>0&&n<27){this.key(String.fromCharCode(n+96),{ctrl:true});return;}
   if(!/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(c))this.emit({type:'key',text:c,key:{}});
   return;
  }
  this.keep(c);
  if(c==='\x1b'&&this.mode!=='string'){this.mode='esc';this.drop=true;return;}
  if(this.mode==='esc'){
   if(c==='['){this.mode='csi';this.pastePrefix=0;}else if(c==='O')this.mode='ss3';
   else if(']PX^_'.includes(c)){this.mode='string';this.osc=c===']';}
   else {const altEnter=(c==='\r'||c==='\n')&&!this.drop;this.reset();if(altEnter)this.key('return',{meta:true});}
   return;
  }
  if(this.mode==='string'){
   if(this.stringEsc&&c==='\\'){this.reset();return;}
   this.stringEsc=c==='\x1b';return;
  }
  if(this.mode==='csi')this.pastePrefix=this.pastePrefix>=0&&'200~'[this.pastePrefix]===c?this.pastePrefix+1:-1;
  if(this.mode==='csi'&&c==='<'){this.mode='mouse';return;}
  if(this.mode==='mouse'){
   if(c!=='M'&&c!=='m')return;
   const m=!this.drop&&/^\x1b\[<(64|65);([0-9]{1,6});([0-9]{1,6})M$/.exec(this.frame);
   this.reset();if(m)this.emit({type:'wheel',delta:m[1]==='64'?-3:3,x:Number(m[2]),y:Number(m[3])});return;
  }
  if(!/[@-~]/.test(c))return;
  const sequence=this.frame,mode=this.mode,drop=this.drop,pasteStart=this.pastePrefix===4;this.reset();
  if(mode!=='csi')return; // SS3 is framed but unsupported in this compatibility grammar.
  if(pasteStart){
   this.mode='paste';this.drop=drop;this.pasteText='';this.pasteTail='';if(!drop)this.emit({type:'paste-start'});return;
  }
  if(drop)return;
  const value=sequence.slice(2),name=NAV[value];if(name){this.key(name,{shift:value==='Z'});return;}
  const modified=/^1;([25])([ABCDHF])$/.exec(value);
  if(modified)this.key(NAV[modified[2]!]!,{ctrl:modified[1]==='5',shift:modified[1]==='2'});
 }
}
