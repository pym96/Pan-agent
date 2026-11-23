/** The sandbox can ask for a bounded read. Only this task-owned broker opens IP sockets. */
import * as http from "node:http";
import * as tls from "node:tls";
import { BlockList, connect, isIP, type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const fetchClient = fileURLToPath(new URL("../../../bin/native-network/pan-fetch", import.meta.url));
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export async function checkGateway(executable: string, prefix: string[], cwd: string, env: NodeJS.ProcessEnv) {
  try {
    const {stdout} = await run(executable, [...prefix, "/bin/sh", "-c",
      '/usr/bin/curl -q -fsS --noproxy "*" --unix-socket "$PAN_NETWORK_SOCKET" http://localhost/ready'], {
      cwd, env, timeout: 8000, maxBuffer: 4096, encoding: "utf8",
    });
    if (stdout !== "pan-get-ready") throw Error("unexpected gateway");
  } catch {
    throw Error("native_network_setup_failed: the system curl must support the task Unix socket; check the installed native sandbox prerequisites");
  }
}

export class Denied extends Error {}
export class UpstreamHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super("upstream HTTP " + status); this.status = status; }
}
export type ResolveAddresses = (name: string) => Promise<readonly string[]>;
const systemResolve: ResolveAddresses = async (name) =>
  (await lookup(name.endsWith(".") ? name : name + ".", { all: true, verbatim: true })).map((record) => record.address);
const limit = 8 * 1024 * 1024;
const family = (ip: string) => isIP(ip) === 4 ? "ipv4" : "ipv6";

function ranges(v4: string[], v6: string[]): BlockList {
  const block = new BlockList();
  for (const cidr of [...v4, ...v6]) {
    const [ip, prefix] = cidr.split("/");
    block.addSubnet(ip!, Number(prefix), family(ip!));
  }
  return block;
}
const privateService = ranges(["10.0.0.0/8", "127.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"], ["::1/128", "fc00::/7"]);
const excluded = ranges([
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.31.196.0/24", "192.52.193.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "192.175.48.0/24", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
], ["2001::/23", "2001:db8::/32", "2002::/16", "2620:4f:8000::/48", "3fff::/20"]);
const globalV6 = ranges([], ["2000::/3"]);

function addressLiteral(host: string): string {
  return host.startsWith("[") ? host.slice(1, -1) : host;
}
function isPrivateService(ip: string): boolean {
  // IPv4-mapped literals and scoped IPv6 must never introduce an alternative identity.
  return !!isIP(ip) && !ip.includes("%") && !ip.toLowerCase().startsWith("::ffff:") &&
    privateService.check(ip, family(ip));
}
export function privateOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw Error("invalid native grant: expected an HTTP(S) private IP origin"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.href !== url.origin + "/" || !isPrivateService(addressLiteral(url.hostname)) || url.port === "0")
    throw Error("invalid native grant: use an exact HTTP(S) loopback, RFC1918 or ULA IP origin and service port");
  return url.origin;
}
export function publicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (!version || ip.includes("%") || (version === 6 && !globalV6.check(ip, "ipv6")) ||
      excluded.check(ip, family(ip))) return false;
  // A public-numbered interface or directly attached subnet can still be a host-private destination.
  const attached = new BlockList();
  for (const rows of Object.values(networkInterfaces())) {
    for (const row of rows ?? []) {
      const address = row.address.split("%")[0]!;
      if (!row.cidr || !isIP(address)) throw Error("native network: unavailable interface prefix");
      attached.addSubnet(address, Number(row.cidr.split("/")[1]), family(address));
    }
  }
  return !attached.check(ip, family(ip));
}

export async function destination(url: URL, grant: string | undefined, resolve: ResolveAddresses) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4096)
    throw new Denied("unsupported URL");
  const name = addressLiteral(url.hostname);
  const granted = grant === url.origin && isPrivateService(name);
  const domain = name.toLowerCase().replace(/\.$/, "");
  if ((!granted && url.port) || (!isIP(name) &&
      (!domain.includes(".") || /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/.test(domain))))
    throw new Denied("destination denied");
  const addresses = isIP(name) ? [name] : await resolve(name);
  if (!granted && (!addresses.length || !addresses.every(publicAddress)))
    throw new Denied("destination denied");
  const ip = addresses.find(a => isIP(a) === 4) ?? addresses[0];
  if (!ip) throw Error("destination unavailable");
  return { ip, name, granted, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)) };
}

type Decision = (record: Record<string, unknown>) => void;
async function directSocket(url: URL, grant: string | undefined, resolve: ResolveAddresses,
                            signal: AbortSignal, record: Decision): Promise<Socket> {
  const target = await destination(url, grant, resolve);
  signal.throwIfAborted();
  const tcp = connect({host: target.ip, port: target.port, family: isIP(target.ip), signal});
  try {
    await once(tcp, "connect", {signal});
    const pinned = new BlockList();
    pinned.addAddress(target.ip, family(target.ip));
    if (!tcp.remoteAddress || !pinned.check(tcp.remoteAddress, family(tcp.remoteAddress)) ||
        (!target.granted && !publicAddress(tcp.remoteAddress))) throw Error("unexpected connection peer");
    record({decision: target.granted ? "private-grant" : "public", origin: url.origin, peer: tcp.remoteAddress, port: tcp.remotePort});
    return tcp;
  } catch (error) { tcp.destroy(); throw error; }
}

// Only the repository reader can open this tunnel. Neither the origin nor its port is an input.
async function githubTunnel(port: number, signal: AbortSignal): Promise<Socket> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("invalid GitHub proxy port");
  signal.throwIfAborted();
  const agent = new http.Agent({keepAlive: false});
  const req = http.request({hostname: "127.0.0.1", port, method: "CONNECT", path: "api.github.com:443",
    headers: {Host: "api.github.com:443"}, agent, maxHeaderSize: 8192, signal});
  try {
    const connected = once(req, "connect", {signal});
    req.end();
    const [response, socket, head] = await connected as [http.IncomingMessage, Socket, Buffer];
    if (response.statusCode !== 200 || head.length || socket.remoteAddress !== "127.0.0.1") {
      socket.destroy();
      throw Error("GitHub proxy refused the tunnel");
    }
    return socket;
  } finally { agent.destroy(); }
}

interface ResponseOptions {
  accept?: string;
  maxBytes?: number;
  prefixOnly?: boolean;
  documentOnly?: boolean;
}
async function getOne(url: URL, tcp: Socket, signal: AbortSignal, options: ResponseOptions = {}) {
  const name = addressLiteral(url.hostname);
  let stream: Socket = tcp;
  try {
    signal.throwIfAborted();
    if (url.protocol === "https:") {
      stream = tls.connect({socket: tcp, minVersion: "TLSv1.2", rejectUnauthorized: true,
        ca: tls.rootCertificates as string[], servername: isIP(name) ? undefined : name,
        checkServerIdentity: (_host, cert) => tls.checkServerIdentity(name, cert)});
      await once(stream, "secureConnect", {signal});
    }
    const agent = new http.Agent({keepAlive: false});
    agent.createConnection = () => stream;
    try {
      const req = http.get({hostname: name, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), path: url.pathname + url.search, signal, agent,
        maxHeaderSize: 16384, headers: {Host: url.host, Connection: "close", "Accept-Encoding": "identity",
          ...(options.accept ? {Accept: options.accept, "User-Agent": "pan-agent-repository-overview"} : {})}});
      const [response] = await once(req, "response", {signal}) as [http.IncomingMessage];
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        const next = new URL(response.headers.location, url);
        if (url.protocol === "https:" && next.protocol !== "https:") throw new Denied("insecure redirect");
        return {redirect: next};
      }
      if (status < 200 || status >= 300) throw new UpstreamHttpError(status);
      if (options.documentOnly) {
        const type = (response.headers["content-type"] ?? "").split(";")[0]!.toLowerCase().trim();
        if (!(/^text\//.test(type) || /^(?:application\/(?:json|xml|xhtml\+xml)|application\/[a-z0-9.+-]+\+(?:json|xml))$/.test(type))
            || (response.headers["content-encoding"] ?? "identity").toLowerCase() !== "identity")
          throw new Denied("unsupported document type or encoding");
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        const data = Buffer.from(chunk);
        const maxBytes = options.maxBytes ?? limit;
        if (data.length > maxBytes - bytes) {
          if (!options.prefixOnly) throw (options.documentOnly ? new Denied("response exceeds size limit") : Error("response exceeds size limit"));
          chunks.push(data.subarray(0, maxBytes - bytes));
          break;
        }
        bytes += data.length;
        chunks.push(data);
      }
      return {body: Buffer.concat(chunks)};
    } finally { agent.destroy(); }
  } finally { stream.destroy(); tcp.destroy(); }
}

/** A document URL carries no credentials, query or fragment, including after redirects. */
export function documentUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 4096 || !/^https?:\/\//i.test(raw) || /[\s\p{C}\\?#]/u.test(raw))
    throw new Denied("expected a public HTTP(S) document URL without credentials, query or fragment");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Denied("invalid document URL"); }
  if (url.username || url.password || url.port || url.href.length > 4096) throw new Denied("unsupported document URL");
  return url;
}

/** Shares DNS validation, pinned connections, TLS, and bounded streaming with pan-fetch.
 * Model document reads never receive the shell's optional private-origin grant. */
export async function fetchPublicDocument(url: URL, signal: AbortSignal, resolve: ResolveAddresses = systemResolve) {
  let target = url;
  for (let hop = 0; hop <= 5; hop++) {
    target = documentUrl(target.href);
    signal.throwIfAborted();
    const socket = await directSocket(target, undefined, resolve, signal, () => {});
    const reply = await getOne(target, socket, signal, {documentOnly: true, maxBytes: 128 * 1024});
    if (reply.body) return {body: reply.body, finalUrl: target.href};
    target = reply.redirect!;
  }
  throw new Denied("redirect limit exceeded");
}

export type RepositoryPart = "metadata" | "readme";
export function validRepository(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9_.-]{1,100}$/i.test(slug)
    && ![".", ".."].includes(slug.split("/")[1]!);
}

/** The public repository capability accepts a validated slug and two fixed GitHub endpoints. */
export async function fetchRepositoryPart(slug: string, part: RepositoryPart, signal: AbortSignal,
    proxyPort?: number, resolve: ResolveAddresses = systemResolve): Promise<Buffer> {
  if (!validRepository(slug) || (part !== "metadata" && part !== "readme")) throw new Denied("invalid repository");
  const url = new URL("https://api.github.com/repos/" + slug + (part === "readme" ? "/readme" : ""));
  const tcp = proxyPort === undefined
    ? await directSocket(url, undefined, resolve, signal, () => {})
    : await githubTunnel(proxyPort, signal);
  const reply = await getOne(url, tcp, signal, {
    accept: part === "readme" ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    maxBytes: part === "readme" ? 32768 : 98304, prefixOnly: part === "readme",
  });
  if (reply.redirect) throw new Denied("GitHub redirect refused");
  return reply.body!;
}

export class NativeNetwork {
  readonly socket: string;
  readonly local: string;
  readonly directory: string;
  readonly grant?: string;
  private readonly server: http.Server;
  private readonly sockets = new Set<Socket>();
  private readonly lifetime = new AbortController();
  private readonly record: Decision;
  private active = 0;

  private constructor(directory: string, run: string, grant: string | undefined, resolve: ResolveAddresses) {
    this.directory = directory;
    this.local = join(directory, "local");
    this.socket = join(directory, "get.sock");
    this.grant = grant;
    mkdirSync(this.local, {mode: 0o700});
    this.record = row => appendFileSync(join(run, "network.jsonl"), JSON.stringify(row) + "\n", {mode: 0o600});
    this.server = http.createServer({maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000},
      (req, res) => {
        res.setHeader("Connection", "close");
        if (this.active >= 8) { res.writeHead(429).end(); return; }
        this.active++;
        const closed = new AbortController();
        res.once("close", () => closed.abort());
        const signal = AbortSignal.any([closed.signal, this.lifetime.signal, AbortSignal.timeout(15000)]);
        void this.serve(req, res, resolve, signal).catch((error) => {
          if (!res.destroyed) res.writeHead(error instanceof Denied ? 403 : error instanceof UpstreamHttpError ? 424 : 502).end();
        }).finally(() => { this.active--; });
      });
    this.server.maxConnections = 12;
    this.server.setTimeout(15000, socket => socket.destroy());
    this.server.on("connection", socket => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    for (const name of ["connect", "upgrade"] as const)
      this.server.on(name, (_req, socket) => socket.destroy());
  }

  private async serve(req: http.IncomingMessage, res: http.ServerResponse, resolve: ResolveAddresses, signal: AbortSignal) {
    if (req.method === "GET" && req.url === "/ready") { res.end("pan-get-ready"); return; }
    if (req.method !== "GET" || !req.url?.startsWith("/fetch?") || req.headers["transfer-encoding"] ||
        (req.headers["content-length"] && req.headers["content-length"] !== "0")) throw new Denied("unsupported request");
    const query = new URLSearchParams(req.url.slice(7));
    if (query.size !== 1 || !query.has("url")) throw Error("one URL required");
    let url = new URL(query.get("url")!);
    for (let hop = 0; hop <= 5; hop++) {
      try {
        const tcp = await directSocket(url, this.grant, resolve, signal, this.record);
        const reply = await getOne(url, tcp, signal);
        signal.throwIfAborted();
        if (reply.body) { res.writeHead(200, {"Content-Length": reply.body.length}).end(reply.body); return; }
        url = reply.redirect!;
      } catch (error) {
        if (!this.lifetime.signal.aborted)
          this.record({decision: "failed", origin: url.origin, reason: error instanceof Error ? error.message.slice(0,160) : "request failed"});
        throw error;
      }
    }
    throw Error("redirect limit exceeded");
  }

  static async open(run: string, grant?: string, resolve: ResolveAddresses = systemResolve): Promise<NativeNetwork> {
    // macOS sockaddr_un has a short path limit. Never put the listener in workspace-controlled paths.
    const directory = mkdtempSync(join(realpathSync("/tmp"), "pan-net-"));
    let broker: NativeNetwork | undefined;
    try {
      broker = new NativeNetwork(directory, run, grant, resolve);
      broker.server.listen(directory + "/get.sock");
      await once(broker.server, "listening");
      chmodSync(broker.socket, 0o600);
      broker.record({event: "opened", grant: grant ?? null});
      return broker;
    } catch (error) {
      if (broker) broker.close(); else rmSync(directory, {recursive: true, force: true});
      throw error;
    }
  }
  close() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.server.close();
    for (const socket of this.sockets) socket.destroy();
    rmSync(this.directory, {recursive: true, force: true});
    this.record({event: "closed", grant: this.grant ?? null});
  }
}
