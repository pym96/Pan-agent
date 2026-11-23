import { execFile } from "node:child_process";
import { BlockList, isIP } from "node:net";
import { promisify } from "node:util";

export interface LoopbackProxy { host: "127.0.0.1" | "::1"; port: number; }
export interface SystemProxy {
  endpoint?: LoopbackProxy;
  bypass: (hostname: string) => boolean;
  limitation?: string;
}
const direct: SystemProxy = {bypass: () => false};
const unsupported = (why: string): SystemProxy => ({...direct, limitation: why});

function bypassRule(pattern: string): ((name: string) => boolean) | undefined {
  if (pattern === "<local>") return name => !name.includes(".");
  if (pattern.includes("/")) {
    const [ip, prefix] = pattern.split("/");
    const version = isIP(ip ?? "");
    if (!version || !/^\d{1,3}$/.test(prefix ?? "") || Number(prefix) > (version === 4 ? 32 : 128) || pattern.split("/").length !== 2) return;
    const block = new BlockList();
    const family = version === 4 ? "ipv4" : "ipv6";
    block.addSubnet(ip!, Number(prefix), family);
    return name => isIP(name) === version && block.check(name, family);
  }
  if (!/^[a-z0-9*.:_-]+$/i.test(pattern)) return;
  const glob = pattern.toLowerCase().replace(/\.$/, "").replace(/\./g, "\\.").replace(/\*/g, ".*");
  const regex = new RegExp("^" + glob + "$", "i");
  return name => regex.test(name);
}

export function parseSystemProxy(raw: string): SystemProxy {
  if (!raw.startsWith("<dictionary> {")) return unsupported("unrecognized macOS proxy settings");
  const values = new Map([...raw.matchAll(/^  (\w+) : (.+)$/gm)].map(m => [m[1]!, m[2]!.trim()]));
  if (values.get("ProxyAutoConfigEnable") === "1" || values.get("ProxyAutoDiscoveryEnable") === "1")
    return unsupported("PAC and automatic proxy discovery are unsupported");
  if (values.get("HTTPSEnable") !== "1") return values.get("SOCKSEnable") === "1"
    ? unsupported("SOCKS-only proxy settings are unsupported") : direct;
  const configured = values.get("HTTPSProxy");
  const host = configured === "localhost" ? "127.0.0.1" : configured === "[::1]" ? "::1" : configured;
  const port = values.get("HTTPSPort") ?? "";
  if ((host !== "127.0.0.1" && host !== "::1") || !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)
    return unsupported("only a static loopback HTTPS proxy is supported");
  const exceptions = raw.match(/^  ExceptionsList : <array> \{\n([\s\S]*?)^  \}$/m);
  if (values.has("ExceptionsList") && !exceptions) return unsupported("unrecognized macOS proxy bypass list");
  const rules: ((name: string) => boolean)[] = [];
  for (const line of (exceptions?.[1] ?? "").trimEnd().split("\n").filter(Boolean)) {
    const entry = line.match(/^    \d+ : (.+)$/);
    if (!entry) return unsupported("unrecognized macOS proxy bypass list");
    for (const token of entry[1]!.split(",")) {
      const rule = bypassRule(token.trim());
      if (!rule) return unsupported("unsupported macOS proxy bypass pattern");
      rules.push(rule);
    }
  }
  return {endpoint: {host, port: Number(port)}, bypass: name => {
    const canonical = name.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return rules.some(matches => matches(canonical));
  }};
}

export async function discoverSystemProxy(): Promise<SystemProxy> {
  if (process.platform !== "darwin") return direct;
  try {
    const {stdout} = await promisify(execFile)("/usr/sbin/scutil", ["--proxy"], {
      env: {LC_ALL: "C"}, cwd: "/", timeout: 1500, maxBuffer: 65536, encoding: "utf8",
    });
    return parseSystemProxy(stdout);
  } catch { return unsupported("macOS system proxy settings unavailable"); }
}
