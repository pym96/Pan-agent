import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttachmentPicker } from "../src/tui/attachment-picker.ts";
import type { InputKey,TerminalInput } from "../src/tui/terminal-input.ts";
const wait = async (fn:()=>boolean) => {for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail("fixture deadline");};
test("C-FILE-R01 Tab aliases navigation without query text and grapheme edits preserve selection and cursor",async()=>{
 const root=await mkdtemp(join(tmpdir(),"wo43-repair-"));const lines:string[]=[];
 try{
  for(const name of ["e-one","e-three","e-two"])await writeFile(join(root,name),"synthetic");
  const picker=new AttachmentPicker(root,{beforeCursor:()=>"review ",insert:()=>{}} as unknown as TerminalInput,line=>lines.push(line));
  const state=()=> (picker as unknown as {picker:{query:string;cursor:number;index:number}}).picker;
  const key=(text:string|undefined,key:InputKey={})=>picker.handleKey(text,key);
  picker.open();await wait(()=>lines.some(l=>l.startsWith("Matches 3")));key("e",{name:"e"});
  key("\t",{name:"tab"});assert.equal(state().query,"e");assert.equal(state().index,1);
  key("\t",{name:"tab"});key("\t",{name:"tab"});assert.equal(state().index,2);
  key(undefined,{name:"tab",shift:true} as InputKey);assert.equal(state().index,1);
  key(undefined,{name:"left"});assert.equal(state().index,1);assert.equal(state().cursor,0);
  key("中",{});assert.equal(state().query,"中e");assert.equal(state().index,0);key(undefined,{name:"backspace"});assert.equal(state().query,"e");
  key(undefined,{name:"end"});key(undefined,{name:"backspace"});
  for(const text of ["中","e","\u0301","👩","\u200d","💻"])key(text,{});
  assert.equal(state().query,"中e\u0301👩‍💻");key(undefined,{name:"left"});key(undefined,{name:"backspace"});assert.equal(state().query,"中👩‍💻");assert.equal(state().cursor,1);
  key("宽",{});assert.equal(state().query,"中宽👩‍💻");key(undefined,{name:"right"});key(undefined,{name:"backspace"});assert.equal(state().query,"中宽");
  const before={...state()};for(const [text,k] of [["\x1b[3~",{name:"delete"}],["\t",{name:"f1"}],[undefined,{name:"pagedown"}]] as const)key(text,k);assert.equal(state().query,before.query);assert.equal(state().cursor,before.cursor);
  assert.ok(lines.some(l=>l.includes("Query cursor:")));assert.equal(picker.count,0);picker.cancel();
 }finally{await rm(root,{recursive:true,force:true});}
});
