/** #49 Criteria 1.1: checks are not atomic with pathname syscalls. No rollback or containment claim. */
import * as fs from 'node:fs';
import { dirname, parse, resolve, sep } from 'node:path';
import { AuthorizationFailure, digest, type FileAuthorizationState } from '../runtime/authorization.ts';
type Identity={path:string;dev:number;ino:number;mode:number;nlink:number;missing:boolean};
const missing=(error:unknown)=> (error as NodeJS.ErrnoException).code==='ENOENT';
const identity=(path:string):Identity=>{
 try{const s=fs.lstatSync(path);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile())||(s.isFile()&&s.nlink!==1))throw new AuthorizationFailure('unsupported_target');return {path,dev:s.dev,ino:s.ino,mode:s.mode,nlink:s.isFile()?s.nlink:0,missing:false};}
 catch(error){if(missing(error))return {path,dev:0,ino:0,mode:0,nlink:0,missing:true};throw error;}
};
const equal=(a:Identity,b:Identity)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.nlink===b.nlink&&a.missing===b.missing;
export class AuthorizedFile {
 readonly path:string;readonly resourceIdentity:string;private identities:Identity[]=[];private fd?:number;
 readonly effects:{directories:string[];fileCreated:boolean;contentWritten:boolean}={directories:[],fileCreated:false,contentWritten:false};
 private readonly signal:AbortSignal;
 private readonly created:Identity[]=[];
 private validateAuthorization:(state:FileAuthorizationState)=>void=()=>{};
 bindAuthorization(validate:(state:FileAuthorizationState)=>void):void {this.validateAuthorization=validate;}
 constructor(path:string,signal:AbortSignal){
  this.signal=signal;
  this.path=resolve(path);let cursor=parse(this.path).root;
  this.identities.push(identity(cursor));
  for(const part of this.path.slice(cursor.length).split(sep).filter(Boolean)){cursor=resolve(cursor,part);const item=identity(cursor);if(cursor!==this.path&&!item.missing&&!fs.lstatSync(cursor).isDirectory())throw new AuthorizationFailure('unsupported_target');this.identities.push(item);}
  const target=this.identities.at(-1)!;
  if(!target.missing&&!fs.lstatSync(this.path).isFile())throw new AuthorizationFailure('unsupported_target');
  this.resourceIdentity=digest(JSON.stringify(this.identities));
 }
 /** Named final validation; each synchronous syscall is dispatched immediately after it. */
 private check():void {
  this.validateAuthorization({created:this.created});
  if(this.signal.aborted)throw new AuthorizationFailure('approval_invalidated');
  for(const previous of this.identities){let now:Identity;try{now=identity(previous.path);}catch{throw new AuthorizationFailure('approval_invalidated');}if(!equal(previous,now))throw new AuthorizationFailure('approval_invalidated');}
 }
 private verifyHandle():void {
  const expected=this.identities.at(-1)!;
  this.validateAuthorization({created:this.created,opened:expected});
  const s=fs.fstatSync(this.fd!);
  if(!s.isFile()||s.nlink!==1||s.ino!==expected.ino||s.dev!==expected.dev)throw new AuthorizationFailure('approval_invalidated');
  if(this.signal.aborted)throw new AuthorizationFailure('approval_invalidated');
 }
 private open(write:boolean,create:boolean):void {
  if(this.fd!==undefined)return;
  if(create){for(let i=0;i<this.identities.length-1;i++){const item=this.identities[i]!;if(!item.missing)continue;
   this.check();fs.mkdirSync(item.path,{mode:0o700});this.effects.directories.push(item.path);
   // Record our completed creation, then verify all earlier recorded identities.
   this.identities[i]=identity(item.path);this.created.push(this.identities[i]!);this.check();
  }}
  const expected=this.identities.at(-1)!;
  if(expected.missing&&!create)throw new AuthorizationFailure('unsupported_target');
  const flags=(write?fs.constants.O_RDWR:fs.constants.O_RDONLY)|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK|(expected.missing?fs.constants.O_CREAT|fs.constants.O_EXCL:0);
  this.check();this.fd=fs.openSync(this.path,flags,0o600);
  if(expected.missing){
   this.effects.fileCreated=true;
   // Do not replace the recorded parent identities. Never write a replacement object.
   const opened=fs.fstatSync(this.fd);this.identities[this.identities.length-1]={path:this.path,dev:opened.dev,ino:opened.ino,mode:opened.mode,nlink:opened.nlink,missing:false};
   this.created.push(this.identities.at(-1)!);this.check();
  }
  this.verifyHandle();
 }
 read(forEdit=false):string {this.open(forEdit,false);this.verifyHandle();return fs.readFileSync(this.fd!,{encoding:'utf8'});}
 write(text:string):void {
  this.open(true,true);this.verifyHandle();
  fs.ftruncateSync(this.fd!,0);this.effects.contentWritten=true;
  if(this.signal.aborted)throw new AuthorizationFailure('approval_invalidated');
  // Positional writes keep edits on the validated handle after reads advanced its offset.
  const data=Buffer.from(text);let offset=0;
  while(offset<data.length){if(this.signal.aborted)throw new AuthorizationFailure('approval_invalidated');offset+=fs.writeSync(this.fd!,data,offset,data.length-offset,offset);}
 }
 close():void {if(this.fd!==undefined){fs.closeSync(this.fd);this.fd=undefined;}}
}
export function workspaceAnchor(path:string):string {return fs.realpathSync(path);}
