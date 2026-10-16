"""Verifier-only dependency proxy relay, bound to owned bridge and one container peer."""
import asyncio
class VerifierRelay:
 def __init__(self,bind,peer,upstream_port):
  self.bind=bind;self.peer=peer;self.upstream_port=upstream_port;self.writers=set();self.server=None
 async def start(self):
  self.server=await asyncio.start_server(self.handle,self.bind,0)
  self.port=self.server.sockets[0].getsockname()[1]
  return f'http://{self.bind}:{self.port}'
 async def handle(self,reader,writer):
  if writer.get_extra_info('peername')[0]!=self.peer:
   writer.close();await writer.wait_closed();return
  self.writers.add(writer);up=None
  try:
   source,up=await asyncio.open_connection('127.0.0.1',self.upstream_port);self.writers.add(up)
   async def copy(src,dst):
    while data:=await src.read(65536):dst.write(data);await dst.drain()
   tasks=[asyncio.create_task(copy(reader,up)),asyncio.create_task(copy(source,writer))]
   await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
   for t in tasks:t.cancel()
   await asyncio.gather(*tasks,return_exceptions=True)
  except (OSError,asyncio.CancelledError):pass
  finally:
   for w in [writer,up]:
    if w:w.close();self.writers.discard(w)
 async def close(self):
  if self.server:self.server.close();await self.server.wait_closed()
  for w in list(self.writers):w.close()
  self.writers.clear()
