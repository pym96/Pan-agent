import asyncio
from relay import VerifierRelay
async def main():
 relay=VerifierRelay('127.0.0.1','127.0.0.2',17890);await relay.start()
 r,w=await asyncio.open_connection('127.0.0.1',relay.port);assert await r.read()==b'';w.close();await w.wait_closed();port=relay.port;await relay.close()
 try:await asyncio.open_connection('127.0.0.1',port)
 except OSError:pass
 else:raise AssertionError('listener remained')
 print('{"passed":true,"wrongPeerRejected":true,"listenerClosed":true}')
asyncio.run(main())
