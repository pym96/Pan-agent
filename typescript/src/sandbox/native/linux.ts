/** Opt-in offline Linux execution. Only the trusted supervisor sees the backing project. */
import { NativeNetwork, fetchClient, checkGateway } from "./network.ts";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "../../protocol/agent-tool.ts";
import type { JsonObject } from "../../protocol/canonical-protocol.ts";
import {
  AuthorizationFailure,
  digest,
  PathAssessment,
} from "../../runtime/authorization.ts";
import {
  createPanTrustedLocalTools,
  executeBash,
} from "../../tools/pan-trusted-local-tools.ts";
import type { NativeSandboxOptions } from "./macos.ts";

const BWRAP = "/usr/bin/bwrap";
const HELPER = fileURLToPath(
  new URL("../../../bin/native-linux/", import.meta.url),
);
const LIBRARIES = "/usr/lib/x86_64-linux-gnu";
const PROGRAMS = [
  "bash",
  "sh",
  "cat",
  "chmod",
  "cp",
  "date",
  "dirname",
  "echo",
  "env",
  "false",
  "grep",
  "head",
  "ls",
  "mkdir",
  "mv",
  "printf",
  "pwd",
  "rm",
  "rmdir",
  "sleep",
  "sort",
  "tail",
  "touch",
  "tr",
  "true",
  "wc",
];
const ENVIRONMENT = {
  PATH: "/runtime:/usr/bin:/bin",
  HOME: "/tmp",
  TMPDIR: "/tmp",
  LANG: "C",
  LC_ALL: "C",
  OPENSSL_CONF: "/dev/null",
};
const DIAGNOSTIC =
  "native_sandbox_linux_unavailable: requires x86-64 Linux, Bubblewrap, working unprivileged user/PID/mount/network namespaces, /dev/fuse, fusermount, Python 3, libfuse2 and libseccomp2; see Linux sandbox setup";
const inside = (root: string, path: string) => {
  const rest = relative(root, path);
  return (
    !rest ||
    (!isAbsolute(rest) && rest !== ".." && !rest.startsWith(".." + sep))
  );
};
const overlaps = (left: string, right: string) =>
  inside(left, right) || inside(right, left);
const deniedNames = new Set([
  ".git",
  ".ssh",
  ".pan-agent",
  ".npmrc",
  ".env",
  "id_rsa",
  "id_ed25519",
]);
function reserved(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    deniedNames.has(lower) ||
    lower.startsWith(".env.") ||
    lower.endsWith(".pem") ||
    lower.endsWith(".key")
  );
}
function deny(reason: string): never {
  throw new AuthorizationFailure("native_sandbox_" + reason);
}

function mountpoints(): string[] {
  return readFileSync("/proc/self/mountinfo", "utf8")
    .trimEnd()
    .split("\n")
    .map((line) =>
      line
        .split(" ")[4]!
        .replace(/\\([0-7]{3})/g, (_, octal: string) =>
          String.fromCharCode(parseInt(octal, 8)),
        ),
    );
}

// Existing components must have their literal spelling on disk, with no alias traversal.
function exactComponents(root: string, target: string): void {
  let parent = root;
  for (const component of relative(root, target).split(sep).filter(Boolean)) {
    const next = join(parent, component);
    const stat = lstatSync(next, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink() || !readdirSync(parent).includes(component))
      deny("workspace_alias");
    parent = next;
  }
}

/** Compile one child deny rule for each accepted host root, including future paths. */
export function compileLinuxProtectedPaths(
  workspace: string,
  configured: readonly string[],
  mounts: readonly string[],
): { host: readonly string[]; child: readonly string[] } {
  const child = configured.map((input) => {
    const hostPath = resolve(workspace, input);
    if (
      !input.trim() ||
      input.includes("\0") ||
      input.split(sep).includes("..") ||
      hostPath === workspace ||
      !inside(workspace, hostPath)
    ) {
      throw Error(
        "native_sandbox_protected_path_scope: Linux protectedPaths must name literal descendants of the selected project without parent traversal; external protected roots prevent startup",
      );
    }
    if (
      mounts.some(
        (mount) =>
          mount !== workspace &&
          inside(workspace, mount) &&
          inside(mount, hostPath),
      )
    )
      throw Error(
        "native_sandbox_protected_path_alias: a protected root crosses a nested mount",
      );
    let parent = workspace;
    const components = relative(workspace, hostPath).split(sep);
    for (const [index, component] of components.entries()) {
      const next = join(parent, component);
      const st = lstatSync(next, { throwIfNoEntry: false });
      if (!st) break; // The unavailable suffix remains in the rule verbatim.
      if (
        !readdirSync(parent).includes(component) ||
        st.isSymbolicLink() ||
        !(
          st.isDirectory() ||
          (index === components.length - 1 && st.isFile() && st.nlink === 1)
        )
      )
        throw Error(
          "native_sandbox_protected_path_alias: use literal project paths without links or special files",
        );
      parent = next;
    }
    return relative(workspace, hostPath);
  });
  return {
    host: Object.freeze(child.map((path) => join(workspace, path))),
    child: Object.freeze(child),
  };
}

/** Resolve only the running Node and fixed OS utilities, never a project executable. */
function libraryMounts(commands: string[]): Map<string, string> {
  const proc = spawnSync("/usr/bin/ldd", commands, {
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 256 * 1024,
  });
  if (proc.error || proc.status !== 0)
    throw Error(DIAGNOSTIC + " (ldd could not resolve the system toolchain)");
  const mounts = new Map<string, string>();
  for (const line of proc.stdout.trimEnd().split("\n")) {
    const entry = line.trim();
    if (entry.endsWith(":") || entry.startsWith("linux-vdso.") || !entry)
      continue;
    const match = /^(?:[^\s]+ => )?(\/[^\s]+) \(0x[0-9a-f]+\)$/.exec(entry);
    if (!match) throw Error(DIAGNOSTIC + " (unresolved system library)");
    const destination = match[1]!,
      source = realpathSync(destination);
    if (!inside(LIBRARIES, source) || !lstatSync(source).isFile())
      throw Error(DIAGNOSTIC + " (unsupported library location)");
    mounts.set(destination, source);
  }
  if (!mounts.size) throw Error(DIAGNOSTIC + " (empty library list)");
  return mounts;
}

export class NativeLinuxSandbox {
  get executionMode() {
    return this.options.network === "public" ? "native-linux-public" as const : "native-linux-offline" as const;
  }
  private broker?: NativeNetwork;
  private pendingGrant?: string;
  readonly workspace: string;
  readonly stateRoot: string;
  readonly tools: readonly AgentTool[];
  private readonly configuredRoots: readonly string[];
  private admittedRoots: readonly string[] = Object.freeze([]);
  get protectedRoots(): readonly string[] {
    return this.admittedRoots;
  }
  private readonly options: NativeSandboxOptions;
  private readonly controllers = new Map<AbortController, Promise<unknown>>();
  private temporary?: string;
  private runtimeFiles: string[] = [];
  private policyHash?: string;
  private runId?: string;
  private prefix?: string[];
  private cancelled = false;

  constructor(options: NativeSandboxOptions) {
    this.options = options;
    this.pendingGrant = options.privateGrant;
    this.workspace = realpathSync(options.workspace);
    this.stateRoot = resolve(options.stateRoot);
    if (overlaps(this.workspace, this.stateRoot))
      throw Error("native_sandbox_state_overlap");
    this.configuredRoots = Object.freeze([...(options.protectedPaths ?? [])]);
    this.tools = createPanTrustedLocalTools(
      this.workspace,
      {},
      async (workspace, value, signal) => {
        const prefix = this.prefix;
        if (!prefix || this.cancelled) deny("unavailable");
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        const task = executeBash(
          workspace,
          {},
          value,
          controller.signal,
          undefined,
          {
            executable: BWRAP,
            prefix,
            evidence: this.identity,
            environment: { PATH: "/usr/bin:/bin", LANG: "C" },
            settleGroup: true,
            credentialInput: this.options.credentialGrant?.take(value.command),
          },
        );
        this.controllers.set(controller, task);
        try {
          return await task;
        } finally {
          signal.removeEventListener("abort", abort);
          this.controllers.delete(controller);
        }
      },
      (path) => this.assertFile(path),
      () => {
        if (!this.policyHash || !this.prefix || this.cancelled)
          deny("unavailable");
        return this.policyHash;
      },
    ).tools;
  }
  get identity(): JsonObject {
    return {
      executionMode: this.executionMode,
      backend: "bubblewrap-fuse",
      profileVersion: 1,
      policyHash: this.policyHash ?? null,
      runId: this.runId ?? null,
      workspace: this.workspace,
      workspaceInShell: "/work",
      temporary: this.temporary ?? null,
      readRoots: [],
      runtimeFiles: [...this.runtimeFiles],
      protectedRoots: [...this.protectedRoots],
      network: this.broker ? "bounded-http-get" : "denied",
      privateGrant: this.broker?.grant ?? null,
      resourceQuotas: "not_enforced",
    };
  }
  private assertFile(path: string): void {
    if (!this.prefix || this.cancelled) deny("unavailable");
    if (!inside(this.workspace, path)) deny("outside_workspace");
    if (relative(this.workspace, path).split(sep).some(reserved))
      deny("protected_path");
    if (
      mountpoints().some(
        (mount) =>
          mount !== this.workspace &&
          inside(this.workspace, mount) &&
          inside(mount, path),
      )
    )
      deny("nested_mount");
    exactComponents(this.workspace, path);
    const reason = new PathAssessment(this.workspace, path, this.protectedRoots)
      .reason;
    if (reason && reason !== "resource_equivalence_uncertain")
      deny("protected_path");
  }
  async start(runId: string): Promise<void> {
    if (this.prefix) throw Error("native_sandbox_already_active");
    if (process.platform !== "linux" || process.arch !== "x64")
      throw Error(DIAGNOSTIC);
    if (!/^[a-zA-Z0-9_-]+$/.test(runId))
      throw Error("native_sandbox_invalid_run");
    const roots = compileLinuxProtectedPaths(
      this.workspace,
      this.configuredRoots,
      mountpoints(),
    );
    this.options.credentialGrant?.start(this.workspace);
    this.admittedRoots = roots.host;
    this.cancelled = false;
    this.runId = runId;
    let ancestor = this.stateRoot;
    while (!lstatSync(ancestor, { throwIfNoEntry: false }))
      ancestor = dirname(ancestor);
    if (realpathSync(ancestor) !== ancestor)
      throw Error("native_sandbox_state_overlap_or_alias");
    mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
    if (realpathSync(this.stateRoot) !== this.stateRoot)
      throw Error("native_sandbox_state_overlap_or_alias");
    const state = lstatSync(this.stateRoot);
    if (state.uid !== process.getuid?.() || (state.mode & 0o077) !== 0)
      throw Error("native_sandbox_state_requires_private_owned_directory");
    if (this.workspace.split(sep).some(reserved))
      throw Error("native_sandbox_protected_workspace");
    const node = realpathSync(process.execPath);
    let helper: string;
    try {
      helper = realpathSync(HELPER);
    } catch {
      throw Error(
        DIAGNOSTIC + " (reinstall the package with its native-linux helper)",
      );
    }
    const commands = this.options.network === "public" ? [...PROGRAMS, "curl"] : PROGRAMS;
    const programs = commands.map((name) => "/usr/bin/" + name);
    const libraries = libraryMounts([node, ...programs]);
    this.runtimeFiles = [
      ...new Set([
        node,
        ...programs,
        ...programs.map((path) => realpathSync(path)),
        ...libraries.keys(),
        ...libraries.values(),
      ]),
    ].sort();
    const runtime = [...this.runtimeFiles, helper];
    if (this.options.network === "public") runtime.push(realpathSync(fetchClient));
    if (runtime.some((path) => overlaps(this.workspace, path)))
      throw Error("native_sandbox_mutable_toolchain");
    const run = join(this.stateRoot, runId);
    mkdirSync(run, { mode: 0o700 });
    this.temporary = join(run, "temporary");
    mkdirSync(this.temporary, { mode: 0o700 });
    try {
      const shellMounts = [
        "--symlink",
        "usr/bin",
        "/bin",
        "--ro-bind",
        "/pan-node",
        "/runtime/node",
      ];
      for (const [destination, source] of libraries)
        shellMounts.push("--ro-bind", source, destination);
      for (const name of commands)
        shellMounts.push("--ro-bind", "/usr/bin/" + name, "/usr/bin/" + name);
      for (const name of ["null", "zero", "random", "urandom"])
        shellMounts.push("--dev-bind", "/dev/" + name, "/dev/" + name);
      shellMounts.push(
        "--bind",
        "/view",
        "/work",
        "--bind",
        "/temporary",
        "/tmp",
        "--remount-ro",
        "/",
      );
      const gatewayMounts: string[] = [];
      const environment = {...ENVIRONMENT};
      if (this.options.network === "public") {
        const grant = this.pendingGrant;
        this.pendingGrant = undefined;
        this.broker = await NativeNetwork.open(run, grant, this.options.resolveNetworkName);
        if (inside(this.workspace, this.broker.directory)) throw Error("native_sandbox_network_state_overlap");
        gatewayMounts.push("--ro-bind", this.broker.socket, "/pan-get.sock", "--ro-bind", fetchClient, "/pan-fetch");
        shellMounts.splice(0, 0, "--ro-bind", "/pan-get.sock", "/run/pan-get.sock",
          "--ro-bind", "/pan-fetch", "/runtime/pan-fetch");
        Object.assign(environment, {PAN_NETWORK_SOCKET: "/run/pan-get.sock", PAN_LOCAL_SOCKETS: "/tmp"});
      }
      const policy = {
        protected: roots.child,
        environment,
        localSockets: !!this.broker,
        privateGrant: this.broker?.grant ?? null,
        shellMounts,
      };
      const policyPath = join(run, "policy.json");
      writeFileSync(policyPath, JSON.stringify(policy, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      const prefix = [
        "--unshare-user",
        "--unshare-pid",
        "--unshare-net",
        "--unshare-uts",
        "--unshare-ipc",
        "--die-with-parent",
        "--new-session",
        "--uid",
        "0",
        "--gid",
        "0",
        "--cap-add",
        "CAP_SYS_ADMIN",
        "--clearenv",
        "--setenv",
        "PATH",
        "/usr/bin:/bin",
        "--setenv",
        "LANG",
        "C",
        "--setenv",
        "FUSE_LIBRARY_PATH",
        "libfuse.so.2",
        ...gatewayMounts,
        "--ro-bind",
        "/usr",
        "/usr",
        "--symlink",
        "usr/bin",
        "/bin",
        "--symlink",
        "usr/lib",
        "/lib",
        "--symlink",
        "usr/lib64",
        "/lib64",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--dev-bind",
        "/dev/fuse",
        "/dev/fuse",
        "--tmpfs",
        "/tmp",
        "--dir",
        "/view",
        "--bind",
        this.workspace,
        "/source",
        "--bind",
        this.temporary,
        "/temporary",
        "--ro-bind",
        node,
        "/pan-node",
        "--ro-bind",
        helper,
        "/pan-helper",
        "--ro-bind",
        policyPath,
        "/pan-policy.json",
        "--chdir",
        "/",
        "--",
        "/usr/bin/python3",
        "-I",
        "-B",
        "/pan-helper/workspace.py",
      ];
      const helperHash = digest(
        readFileSync(join(helper, "workspace.py"), "utf8"),
      );
      const bindingHash = digest(readFileSync(join(helper, "fuse.py"), "utf8"));
      this.policyHash = digest(
        JSON.stringify([policy, prefix, helperHash, bindingHash]),
      );
      const probe = spawnSync(
        BWRAP,
        [
          ...prefix,
          "/bin/bash",
          "-c",
          'test -d /work && test -w /tmp && node -e "process.stdout.write(String(6*7))"',
        ],
        {
          cwd: this.workspace,
          env: { PATH: "/usr/bin:/bin", LANG: "C" },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 8000,
          maxBuffer: 8192,
        },
      );
      if (probe.error || probe.status !== 0 || probe.stdout !== "42") {
        const cause =
          probe.error?.message ??
          probe.stderr?.trim().split("\n").at(-1) ??
          "startup computation failed";
        throw Error(DIAGNOSTIC + " (" + cause + ")");
      }
      if (this.broker) await checkGateway(BWRAP, prefix, this.workspace, {PATH: "/usr/bin:/bin", LANG: "C"});
      if (this.cancelled) throw Error("native_sandbox_cancelled");
      writeFileSync(
        join(run, "identity.json"),
        JSON.stringify(this.identity, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      this.prefix = prefix;
      this.options.notify?.(
        "NATIVE LINUX SANDBOX " + (this.broker ? "bounded GET" : "offline") + " policy=" + this.policyHash,
      );
    } catch (error) {
      this.broker?.close();
      this.broker = undefined;
      this.policyHash = undefined;
      rmSync(this.temporary, { recursive: true, force: true });
      throw error;
    }
  }
  cancel(): void {
    this.options.credentialGrant?.expire();
    this.cancelled = true;
    this.broker?.close();
    for (const controller of this.controllers.keys()) controller.abort();
  }
  async stop(_reason: string): Promise<void> {
    this.cancel();
    this.prefix = undefined;
    this.broker = undefined;
    const temporary = this.temporary;
    await Promise.allSettled([...this.controllers.values()]);
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}
