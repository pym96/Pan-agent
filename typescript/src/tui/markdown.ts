import { terminalText } from './presentation.ts';
import { graphemes, width } from './daily-editor.ts';

export type MarkdownStyle = 'heading' | 'bold' | 'code' | 'fence';
export type StyledCell = { text: string; style?: MarkdownStyle };
export type MarkdownRow = { text: string; start: number; end: number; cells: StyledCell[] };
type Glyph = StyledCell & { offset: number };

/** A deliberately small, display-only Markdown subset. No HTML, links or model ANSI is executed. */
export function markdownRows(source: string, columns: number): MarkdownRow[] {
 const result: MarkdownRow[]=[]; let offset=0; let fence: {char:string;length:number}|undefined;
 for(const raw of source.split('\n')) {
  const gs=graphemes(raw), base=offset; offset+=gs.length+1;
  let content:Glyph[]=gs.map((text,i)=>({text,offset:base+i}));
  const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
  if(fence) {
   if(marker&&marker[1]![0]===fence.char&&marker[1]!.length>=fence.length&&!marker[2]!.trim()) {
    content=synthetic('└',base,'fence');fence=undefined;
   } else content=content.map(g=>({...g,style:'code'}));
  } else if(marker && !(marker[1]![0]==='`'&&marker[2]!.includes('`'))) {
   fence={char:marker[1]![0]!,length:marker[1]!.length};
   content=synthetic('┌ code'+(marker[2]!.trim()?' · '+marker[2]!.trim():''),base,'fence');
  } else {
   const heading=/^ {0,3}(#{1,6})\s+/.exec(raw);
   const bullet=/^(\s*)[-+*]\s+/.exec(raw);
   if(heading) {
    const n=graphemes(heading[0]).length;
    content=[...synthetic('▌ ',base,'heading'),...inline(content.slice(n),'heading')];
   } else if(bullet) {
    const n=graphemes(bullet[0]).length;
    content=[...synthetic(bullet[1]+'• ',base),...inline(content.slice(n))];
   } else content=inline(content);
  }
  let row:MarkdownRow={text:'',start:base,end:base,cells:[]}, used=0;
  for(const glyph of content) {
   for(const text of graphemes(terminalText(glyph.text))) {
    const size=width(text);
    if(used+size>Math.max(1,columns)&&row.cells.length) {result.push(row);row={text:'',start:glyph.offset,end:glyph.offset,cells:[]};used=0;}
    row.text+=text;row.cells.push({text,style:glyph.style});row.end=Math.max(row.end,glyph.offset+1);used+=size;
   }
  }
  row.end=offset;result.push(row);
 }
 return result;
}
function synthetic(text:string,offset:number,style?:MarkdownStyle):Glyph[] {return graphemes(text).map(text=>({text,offset,style}));}
function inline(input:Glyph[],baseStyle?:MarkdownStyle):Glyph[] {
 const result:Glyph[]=[];
 for(let i=0;i<input.length;) {
  const c=input[i]!;
  if(c.text==='`'&&input[i+1]?.text!=='`'&&input[i-1]?.text!=='`') {
   const end=input.findIndex((g,j)=>j>i&&g.text==='`');
   if(end>i+1) {result.push(...synthetic('‹',c.offset,'code'),...input.slice(i+1,end).map(g=>({...g,style:'code' as const})),...synthetic('›',input[end]!.offset,'code'));i=end+1;continue;}
  }
  if((c.text==='*'||c.text==='_')&&input[i+1]?.text===c.text) {
   let end=i+2;while(end<input.length&&!(input[end]?.text===c.text&&input[end+1]?.text===c.text))end++;
   if(end>i+2&&end<input.length) {result.push(...input.slice(i+2,end).map(g=>({...g,style:baseStyle??'bold' as const})));i=end+2;continue;}
  }
  result.push({...c,style:baseStyle});i++;
 }
 return result;
}
/** Only fixed renderer-owned SGR codes can reach the terminal; text was sanitized before styling. */
export function paintMarkdown(cells:readonly StyledCell[],columns:number,color:boolean):{text:string;used:number} {
 let text='',used=0;let previous:MarkdownStyle|undefined;
 const styles:Record<MarkdownStyle,string>={heading:'\x1b[1;36m',bold:'\x1b[1m',code:'\x1b[36m',fence:'\x1b[2m'};
 for(const cell of cells) {
  if(used+width(cell.text)>columns)break;
  if(color&&cell.style!==previous){text+='\x1b[22;39m';if(cell.style)text+=styles[cell.style];previous=cell.style;}
  text+=cell.text;used+=width(cell.text);
 }
 if(color&&previous)text+='\x1b[22;39m';
 return {text,used};
}
