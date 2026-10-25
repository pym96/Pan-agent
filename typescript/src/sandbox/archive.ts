import {createHash} from 'node:crypto';
export const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export const MAX_EXPORT=64*1024*1024;
export const MAX_FILES=1000;
export function initTar():Buffer {
 const h=Buffer.alloc(512);h.write('task/');
 for(const [offset,value,size] of [[100,0o700,8],[108,65534,8],[116,65534,8],[124,0,12],[136,0,12]] as const)h.write(value.toString(8).padStart(size-1,'0')+'\0',offset);
 h.fill(32,148,156);h.write('5',156);h.write('ustar\0',257);h.write('00',263);
 const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
 return Buffer.concat([h,Buffer.alloc(1024)]);
}
export interface Artifact {path:string;bytes:Buffer;sha256:string}
/** Validate the entire bounded tar BEFORE creating any host output. No links or special/PAX entries. */
export function parseWorkspaceTar(tar:Buffer):Artifact[]{
 if(tar.length>MAX_EXPORT+2*1024*1024)throw Error('export_tar_limit');
 const result:Artifact[]=[];const seen=new Set<string>();let total=0;let end=false;
 const string=(b:Buffer)=>b.subarray(0,b.indexOf(0)<0?b.length:b.indexOf(0)).toString('utf8');
 const octal=(b:Buffer)=>{const s=string(b).trim();if(!/^[0-7]+$/.test(s))throw Error('export_invalid_numeric');return parseInt(s,8);};
 for(let offset=0;offset+512<=tar.length;){
  const h=tar.subarray(offset,offset+512);offset+=512;
  if(h.every(v=>v===0)){end=true;if(tar.subarray(offset).some(v=>v!==0))throw Error('export_trailing_data');break;}
  const expected=octal(h.subarray(148,156));const sum=h.reduce((a,b,i)=>a+(i>=148&&i<156?32:b),0);if(expected!==sum)throw Error('export_checksum');
  const prefix=string(h.subarray(345,500));let name=(prefix?prefix+'/':'')+string(h.subarray(0,100));
  const kind=String.fromCharCode(h[156]!);const size=octal(h.subarray(124,136));
  if(!Number.isSafeInteger(size)||size<0||offset+size>tar.length)throw Error('export_truncated');
  if(name.endsWith('/'))name=name.slice(0,-1);
  if(name!=='task'&&!name.startsWith('task/'))throw Error('export_root');
  const parts=name.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')||/[\x00-\x1f\x7f]/.test(p)))throw Error('export_path');
  if(seen.has(name))throw Error('export_duplicate');seen.add(name);
  if(kind==='5'){if(size!==0)throw Error('export_directory_data');}
  else if(kind==='0'||kind==='\0'){
   if(name==='task')throw Error('export_root_file');
   total+=size;if(total>MAX_EXPORT||result.length>=MAX_FILES)throw Error('export_limit');
   const bytes=Buffer.from(tar.subarray(offset,offset+size));result.push({path:parts.slice(1).join('/'),bytes,sha256:hash(bytes)});
  }else throw Error('export_unsafe_type:'+kind);
  offset+=Math.ceil(size/512)*512;
 }
 if(!end)throw Error('export_missing_end');return result;
}
