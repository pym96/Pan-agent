"""Harbor external agent -> installed Pan -> one bound BaseEnvironment.
No provider, host shell tool, or selectable environment in the IPC protocol.
"""
import asyncio
import json
import time
from pathlib import Path
from harbor.agents.base import BaseAgent

class PanAgent(BaseAgent):
    @staticmethod
    def name(): return 'pan-zero-model'
    def version(self): return '74.1.0'
    async def setup(self, environment): pass

    def bind(self, *, installed_entry, mode, commands, container_id):
        self.installed_entry = str(installed_entry)
        self.mode, self.commands, self.container_id = mode, commands, container_id
        self.records = []
        self.cancel_event = asyncio.Event()
        self.stopped = False

    async def stop_target(self, environment, reason):
        started = time.monotonic()
        # Stop the entire bound task environment; descendants cannot outlive it.
        await asyncio.wait_for(environment.stop_service('main'), 25)
        proc = await asyncio.create_subprocess_exec('docker', 'inspect', self.container_id,
            '--format', '{{json .State}}', stdout=asyncio.subprocess.PIPE)
        out, _ = await proc.communicate()
        state = json.loads(out)
        self.records.append({'reason':reason, 'stop_seconds':time.monotonic()-started,
                             'container_id':self.container_id, 'state':state})
        if proc.returncode or state['Running'] or state.get('Pid',0) != 0:
            raise RuntimeError('target_not_stopped')
        self.stopped = True

    async def run(self, instruction, environment, context):
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        proc = await asyncio.create_subprocess_exec('node', str(Path(__file__).with_name('session.mjs')),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=(self.logs_dir/'node.stderr').open('wb'))
        async def send(msg):
            proc.stdin.write((json.dumps(msg)+'\n').encode()); await proc.stdin.drain()
        await send({'config':{'installedEntry':self.installed_entry,'mode':self.mode,
            'commands':self.commands,'output':str(self.logs_dir),'instruction':instruction}})
        active = set()
        async def execute(msg):
            args = msg['arguments']; ident = msg['execute']
            if set(args) != {'command','timeout'} or not isinstance(args['command'],str) or not 0 < args['timeout'] <= 30:
                raise ValueError('invalid IPC command')
            if self.stopped: raise RuntimeError('target already stopped')
            self.cancel_event.clear()
            execution = asyncio.create_task(environment.exec(args['command']))
            cancel = asyncio.create_task(self.cancel_event.wait())
            started = time.monotonic()
            try:
                if self.mode in ('timeout','cancel'):
                    # Observe actual command/child start before asking Pan to cancel.
                    for _ in range(80):
                        marker=await environment.exec('test -s /tmp/wo74-started && cat /tmp/wo74-started')
                        if marker.return_code == 0:
                            self.records.append({'started':marker.stdout,'container_id':self.container_id})
                            await send({'started':ident});break
                        await asyncio.sleep(.02)
                    else: raise RuntimeError('command_start_unobserved')
                done, _ = await asyncio.wait([execution,cancel], timeout=max(0,args['timeout']-(time.monotonic()-started)), return_when=asyncio.FIRST_COMPLETED)
                if cancel in done or execution not in done:
                    reason='cancelled' if cancel in done else 'timeout'
                    await self.stop_target(environment,reason)
                    r=await asyncio.wait_for(execution,3)
                    result={'status':reason,'exit_code':None,'stdout':r.stdout,'stderr':r.stderr or reason}
                else:
                    r=execution.result()
                    result={'status':'completed','exit_code':r.return_code,'stdout':r.stdout,'stderr':r.stderr}
                self.records.append({'id':ident,'arguments':args,'result':result,'seconds':time.monotonic()-started})
                await send({'id':ident,'result':result})
            except Exception as exc:
                await send({'id':ident,'result':{'status':'bridge_error','exit_code':None,'stdout':'','stderr':str(exc)}})
                raise
            finally:
                cancel.cancel()
                if not execution.done():
                    await self.stop_target(environment,'bridge_error')
                    execution.cancel()
        try:
            while line := await proc.stdout.readline():
                msg=json.loads(line)
                if 'execute' in msg:
                    if any(not t.done() for t in active): raise RuntimeError('parallel tool denied')
                    t=asyncio.create_task(execute(msg)); active.add(t)
                elif 'cancel' in msg:self.cancel_event.set()
                elif 'done' in msg:self.pan_status=msg['done']
                else:raise RuntimeError('unknown IPC message')
                for t in active:
                    if t.done() and t.exception():raise t.exception()
            await asyncio.gather(*active)
            if await proc.wait():raise RuntimeError('installed Pan failed')
        finally:
            if proc.returncode is None:
                proc.terminate();await proc.wait()
            for t in active:
                if not t.done():t.cancel()
            await asyncio.gather(*active,return_exceptions=True)
            (self.logs_dir/'bridge.json').write_text(json.dumps(self.records,indent=2)+'\n')
