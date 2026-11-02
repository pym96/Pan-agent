/** Trusted verifier process owner. Its deadline and disconnect handler outlive the CLI. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
let child:ChildProcess|undefined,timer:NodeJS.Timeout|undefined,guard:NodeJS.Timeout|undefined;
let problem:string|undefined,stdout='',stderr='',started=false,done=false;
function kill(){if(child?.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}}
function finish(code:number|null){
 if(done)return;done=true;clearTimeout(timer);clearTimeout(guard);kill();
 const result={type:'result',...(problem?{error:problem}:{result:{code,stdout,stderr}})};
 if(process.connected)process.send?.(result,()=>process.exit(problem?1:0));else process.exit(problem?1:0);
}
function stop(reason:string){problem??=reason;kill();if(!child){finish(null);return;}guard??=setTimeout(()=>{problem='verifier_stop_unconfirmed';finish(null);},1000);}
process.on('disconnect',()=>stop('verifier_controller_disconnected'));
process.on('SIGTERM',()=>stop('verifier_cancelled'));
process.on('SIGINT',()=>stop('verifier_cancelled'));
process.on('message',(m:any)=>{
 if(m?.type==='stop'){stop('verifier_cancelled');return;}
 if(m?.type==='ownership_ack'){if(child&&!problem)child.stdin?.end('pan-verifier-owned\n');return;}
 if(m?.type!=='start'||started)return;started=true;
 if(problem){finish(null);return;}
 if(!Number.isInteger(m.seconds)||m.seconds<1||m.seconds>25){stop('invalid_verifier_timeout');return;}
 child=spawn('/bin/sh',['-c','IFS= read -r gate; [ "$gate" = pan-verifier-owned ] || exit 125; exec /bin/sh -c "$1"','pan-verifier',m.command],{cwd:m.cwd,detached:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:m.cwd}});
 timer=setTimeout(()=>stop('verifier_timeout'),m.seconds*1000);
 child.stdin!.on('error',()=>{});
 try{const birth=execFileSync('ps',['-p',String(child.pid),'-o','lstart='],{encoding:'utf8',timeout:200}).trim();if(!birth)throw Error('missing identity');process.send?.({type:'owned',pid:child.pid,birth});}catch{stop('verifier_identity_unknown');}
 child.stdout!.on('data',b=>{stdout+=b.toString();if(Buffer.byteLength(stdout)>1048576)stop('verifier_output_limit');});
 child.stderr!.on('data',b=>{stderr+=b.toString();if(Buffer.byteLength(stderr)>1048576)stop('verifier_output_limit');});
 child.on('error',error=>{problem=String(error);finish(null);});
 child.on('close',code=>finish(code));
});
