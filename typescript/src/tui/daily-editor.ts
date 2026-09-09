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
 vertical(delta:number):void {const before=this.text.slice(0,this.caret),line=before.split('\n').length-1,col=graphemes(before.split('\n').at(-1)!).length,lines=this.text.split('\n'),next=line+delta;if(next<0||next>=lines.length)return;this.caret=lines.slice(0,next).reduce((n,s)=>n+s.length+1,0)+graphemes(lines[next]!).slice(0,col).join('').length;}
 clear():void {this.text='';this.caret=0;}
 visual(columns:number):{lines:string[];row:number;col:number} {
 const safe=(s:string)=>s.split('\n').map(terminalText).join('\n');const lines=wrap(safe(this.text),columns),prefix=wrap(safe(this.text.slice(0,this.caret)),columns);let row=prefix.length-1,col=graphemes(prefix.at(-1)!).reduce((n,g)=>n+width(g),0);
 if(col===columns){row++;col=0;if(row===lines.length)lines.push('');}return {lines,row,col};
 }
}
