# Native sandbox networking

The interactive native workspace keeps macOS Seatbelt or Linux Bubblewrap/FUSE for Shell and its descendants. A task gets one private Unix socket connected to a host-side GET gateway. Each read requests a URL. The task cannot open an IP socket, supply an alternate resolver, change the gateway capability, pass a host descriptor or choose an upstream proxy. Pan’s provider connection remains separate. Select `--native-offline` alongside `--native-sandbox` to omit the gateway and retain the original offline controls. Docker keeps its offline contract. This interface ships in packages built from the candidate source.

## Run a local development service

Use a Unix stream listener inside `$PAN_LOCAL_SOCKETS` on both backends. The example runs a real server and launches a child client in the same Shell. Both processes remain under the task's OS restrictions.

```sh
node - <<'JS'
const net = require('node:net');
const {spawn} = require('node:child_process');
const socket = process.env.PAN_LOCAL_SOCKETS + '/demo.sock';
const server = net.createServer(client => client.end('hello from the test server'));
server.listen(socket, () => {
  const child = spawn(process.execPath, ['-e',
    'require("node:net").connect(process.argv[1]).pipe(process.stdout)', socket],
    {stdio: 'inherit'});
  child.on('exit', code => { process.exitCode = code ?? 1; server.close(); });
});
JS
```

## Coverage and limits

| Capability | Behavior |
| --- | --- |
| Public reads | `pan-fetch URL` or curl directed at the Unix gateway. One HTTP/1.1 GET with fixed headers per hop. Public HTTP port 80 or HTTPS port 443. Output is the successful response body, up to 8 MiB, within 15 seconds for the entire request. Up to eight concurrent reads. |
| Private read | `--native-grant ORIGIN` selects one literal loopback, RFC1918 or IPv6 ULA HTTP(S) origin, including scheme and port, for the first admitted task. Paths on the service are in scope. A new task receives no grant. Restarting Pan with the flag is a new explicit grant. |
| DNS and redirects | The gateway resolves a fully qualified name afresh at each hop. All answers must satisfy the address policy. It selects one numeric peer, prefers IPv4, connects without a second lookup, checks the connected address and then issues the GET. It follows up to five redirects and rejects HTTPS downgrades. Mixed public/private answers deny. No client-specified DNS, SOCKS, HTTP CONNECT or proxy environment. |
| Addresses | Public IPv4 and global-unicast IPv6. Exclusions include private, loopback, link-local, multicast, documentation, benchmark, carrier-grade NAT, mapped/transition IPv6 and directly attached interface networks. Short names and local naming suffixes deny. On VPNs that map a public name into a reserved range, the read fails closed. Host routing, DNS and the host kernel remain trusted, including routing beyond the numeric peer. Public servers can run applications of their choosing. |
| TLS | Checks the original name or IP against a valid certificate using Node’s bundled roots with TLS 1.2 or later. No insecure TLS flag, private CA, client certificate, cookie jar or forwarded authorization. |
| Other protocols | Direct IPv4/IPv6 TCP, UDP, arbitrary proxies, WebSocket upgrade, CONNECT, non-GET methods, raw DNS and arbitrary request headers have no gateway support. A GET can carry a URL query and has the semantics implemented by the remote service. Transparent curl HTTPS, npm and arbitrary dependency managers require another transport. |
| Sandbox-local IPC | Unix sockets under `$PAN_LOCAL_SOCKETS` support ordinary parent/child tests. Direct TCP loopback listeners or clients are unsupported. Linux restricts newly created sockets to AF_UNIX in its isolated network namespace and mounts the gateway as one socket. macOS Seatbelt allows outbound access to the exact gateway path and local sockets under one private task directory. Same-user host processes remain trusted, as with the native filesystem scope. |
| Runtime | macOS uses stock `/usr/bin/curl` with Unix-socket support and reads the single system LibreSSL config file. Supported x86-64 Linux also requires `/usr/bin/curl` and its system dependencies. Both run a real gateway readiness request through the OS boundary before accepting work. Setup failures terminate the task. |
| Lifetime and audit | The gateway removes its private socket directory and closes client/upstream operations on settlement or cancellation. `native-sandbox/RUN_ID/network.jsonl` records opening and closure, grant origin and decisions with actual numeric peers. It omits URL paths, query values, response bodies and headers. A successful TCP decision alone does not prove delivery of a successful HTTP response. The Shell result records command success or failure. |

The installed fixture uses only a public operator-owned file and owned IPv4/IPv6 services. It stores raw Shell results, run archives, host receipts and gateway decisions. The optional `--pages-address-fixture` on **the fixture script** checks the local synthetic DNS refusal, then supplies a known public Pages address to the trusted test composition. TLS still validates the hostname and the test compares actual response bytes against the license digest. Production CLI settings expose no resolver override. The ordinary hosted Linux fixture uses the system resolver.
