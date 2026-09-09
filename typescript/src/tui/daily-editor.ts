import { terminalText } from './presentation.ts';
const segmenter = new Intl.Segmenter('en', {granularity:'grapheme'});
export const graphemes = (s:string):string[] => [...segmenter.segment(s)].map(x=>x.segment);
export function width(s:string):number {
 if (!s || /^\p{Mark}+$/u.test(s)) return 0;
 return /\p{Extended_Pictographic}|[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60]/u.test(s)?2:1;
}
export function clip(s:string,cells:number):string {
 let value='',used=0;for(const g of graphemes(s)){if(used+width(g)>cells)break;value+=g;used+=width(g);}return value;
}
export function wrap(s:string,columns:number):string[] {
 const lines:string[]=[''];let used=0;
 for(const g of graphemes(s)) {if(g==='\n'){lines.push('');used=0;continue;}if(used+width(g)>columns){lines.push('');used=0;}lines[lines.length-1]+=g;used+=width(g);}return lines;
}
/** UTF-16 caret always lies at an extended grapheme boundary; content is never screen-truncated. */
export class DailyEditor {
 text=''; caret=0;
 insert(value:string):void {const n=this.caret+value.length;this.text=this.text.slice(0,this.caret)+value+this.text.slice(this.caret);this.caret=this.stops().find(x=>x>=n)??this.text.length;}
 stops():number[]{let n=0;return [0,...graphemes(this.text).map(g=>n+=g.length)];}
 move(delta:number):void {const s=this.stops();this.caret=s[Math.max(0,Math.min(s.length-1,s.indexOf(this.caret)+delta))]!;}
 backspace():void {const old=this.caret;this.move(-1);this.text=this.text.slice(0,this.caret)+this.text.slice(old);}
 vertical(delta:number,columns=Number.MAX_SAFE_INTEGER):boolean {
  const positions:{caret:number;row:number;col:number}[]=[{caret:0,row:0,col:0}];let row=0,col=0,caret=0;
  for(const g of graphemes(this.text)){
   if(g.endsWith('\n')){row++;col=0;}else for(const v of graphemes(terminalText(g))){if(col+width(v)>columns){row++;col=0;}col+=width(v);}
   caret+=g.length;positions.push({caret,row:row+(col===columns?1:0),col:col===columns?0:col});
  }
  const current=positions.find(p=>p.caret===this.caret)!;const next=positions.filter(p=>p.row===current.row+delta);if(!next.length)return false;
  this.caret=next.reduce((best,p)=>Math.abs(p.col-current.col)<Math.abs(best.col-current.col)?p:best).caret;return true;
 }
 clear():void {this.text='';this.caret=0;}
 visual(columns:number):{lines:string[];row:number;col:number} {
 const safe=(s:string)=>s.split('\n').map(terminalText).join('\n');const lines=wrap(safe(this.text),columns),prefix=wrap(safe(this.text.slice(0,this.caret)),columns);let row=prefix.length-1,col=graphemes(prefix.at(-1)!).reduce((n,g)=>n+width(g),0);
 if(col===columns){row++;col=0;if(row===lines.length)lines.push('');}return {lines,row,col};
 }
}

/** Reversible display rows retain source grapheme coordinates, including escaped controls. */
export function sourceRows(text:string,columns:number):{text:string;start:number;end:number}[] {
 const rows=[{text:'',start:0,end:0}];let cells=0;
 graphemes(text).forEach((g,offset)=>{
  if(g==='\n'){rows[rows.length-1]!.end=offset+1;rows.push({text:'',start:offset+1,end:offset+1});cells=0;return;}
  for(const visible of graphemes(terminalText(g==='\r\n'?'\r':g))){if(cells+width(visible)>columns){rows.push({text:'',start:offset,end:offset});cells=0;}const row=rows[rows.length-1]!;row.text+=visible;row.end=offset+1;cells+=width(visible);}
  if(g==='\r\n'){rows.push({text:'',start:offset+1,end:offset+1});cells=0;}
 });return rows;
}
