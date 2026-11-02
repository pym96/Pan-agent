"""Independent demonstration: cancelling only a worker does not stop detached shells."""
import json,os,pathlib,signal,subprocess,sys,time
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=False)
script="const{spawn}=require('child_process');const fs=require('fs');const c=spawn('/bin/bash',['-c',\"trap '' TERM; while :; do echo beat >> heartbeat; sleep .05; done\"],{cwd:process.argv[1],detached:true,stdio:'ignore'});fs.writeFileSync(process.argv[1]+'/shell.pid',String(c.pid));setInterval(()=>{},1000)"
worker=subprocess.Popen(['node','-e',script,str(root)],start_new_session=True)
shell=None
try:
    for _ in range(100):
        if (root/'shell.pid').exists() and (root/'heartbeat').exists():break
        time.sleep(.02)
    shell=int((root/'shell.pid').read_text());os.killpg(worker.pid,signal.SIGKILL);worker.wait()
    before=(root/'heartbeat').stat().st_size;time.sleep(.2);after=(root/'heartbeat').stat().st_size
    assert after>before
    (root/'receipt.json').write_text(json.dumps({'worker_pid':worker.pid,'shell_pid':shell,'worker_exited':True,'heartbeat_before':before,'heartbeat_after':after,'worker_only_stop_failed':True}))
finally:
    if worker.poll() is None:os.killpg(worker.pid,signal.SIGKILL);worker.wait()
    if shell:
        try:os.killpg(shell,signal.SIGKILL)
        except ProcessLookupError:pass
