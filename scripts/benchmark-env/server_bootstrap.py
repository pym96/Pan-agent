"""Public SWE-ReX ASGI app behind a token gate; token arrives only on stdin.

The outer gate covers upstream request-ID caching as well as normal endpoints.
No upstream implementation is edited. This module runs only inside the task.
"""
import hmac
import sys
import uvicorn
from swerex import server

token=sys.stdin.readline().strip()
if len(token)<32:raise SystemExit('missing control token')
server.AUTH_TOKEN=token
async def authenticated(scope,receive,send):
    if scope['type']=='http':
        supplied=dict(scope['headers']).get(b'x-api-key',b'').decode('ascii',errors='replace')
        if not hmac.compare_digest(supplied,token):
            await send({'type':'http.response.start','status':401,'headers':[(b'content-type',b'application/json')]})
            await send({'type':'http.response.body','body':b'{"detail":"Unauthorized"}'})
            return
    await server.app(scope,receive,send)
uvicorn.run(authenticated,host='0.0.0.0',port=8000,log_level='error',access_log=False)
