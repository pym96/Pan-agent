import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { AuthorizedFile } from "../tools/authorized-file.ts";
import { digest } from "../runtime/authorization.ts";

const limit = 16 * 1024;
const stat = (path: string) => lstatSync(path, {throwIfNoEntry: false, bigint: true});
const inside = (root: string, path: string) => path === root || path.startsWith(root + sep) || root === sep;
function reject(reason: string): never { throw Error("workspace_trust_" + reason); }

function checkedFile(path: string): {identity: string; value: string} {
  const file = new AuthorizedFile(path, new AbortController().signal);
  try {
    const value = file.readBounded(limit);
    const node = stat(path);
    if (!node?.isFile()) reject("file_changed");
    return {identity: digest(JSON.stringify([file.resourceIdentity, String(node.ctimeNs), String(node.birthtimeNs)])), value};
  }
  finally { file.close(); }
}

function parseFlatDocument(body: string) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { reject("invalid_document"); }
  // Both schemas are flat and contain only scalar fields and arrays of strings.
  // JSON.parse alone silently resolves duplicate property names, including escaped spellings.
  const keys = new Set<string>();
  for (const match of body.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    if (!body.slice(match.index! + match[0].length).trimStart().startsWith(":")) continue;
    const key = JSON.parse(match[0]);
    if (keys.has(key)) reject("duplicate_property");
    keys.add(key);
  }
  return parsed;
}

function parseResources(body: string): string[] {
  const parsed = parseFlatDocument(body);
  if (!parsed || Object.keys(parsed).sort().join(",") !== "resources,version" ||
      parsed.version !== 1 || !Array.isArray(parsed.resources) || parsed.resources.length > 32)
    reject("invalid_document");
  const resources: string[] = parsed.resources;
  for (const id of resources) {
    if (typeof id !== "string" || id.length > 256) reject("invalid_resource");
    if (/^env:[A-Z_][A-Z0-9_]*$/.test(id)) continue;
    if (!id.startsWith("file:") || !id.slice(5).split("/").every(part =>
      /^[a-zA-Z0-9_.-]+$/.test(part) && ![".", "..", ".git", ".ssh", ".pan-agent"].includes(part.toLowerCase())))
      reject("invalid_resource");
  }
  if (new Set(resources).size !== resources.length) reject("duplicate_resource");
  return resources.sort();
}

function rootIdentity(root: string): string {
  const info = stat(root);
  if (!info?.isDirectory() || realpathSync(root) !== root) reject("workspace_changed");
  return digest(JSON.stringify([root, String(info.dev), String(info.ino), String(info.birthtimeNs)]));
}

function privateDirectory(path: string): void {
  const info = stat(path);
  if (!info?.isDirectory() || realpathSync(path) !== path ||
      Number(info.uid) !== process.getuid?.() || (Number(info.mode) & 0o022)) reject("unsafe_policy_directory");
}

/** A reviewed resource list conveys eligibility only. Resource use is separately selected by the operator. */
export function workspaceTrust(workspace: string, home = homedir(), approve?: string) {
  const root = realpathSync(workspace), identity = rootIdentity(root);
  const config = join(root, ".pan-agent", "workspace.json");
  const requested = () => stat(config) ? parseResources(checkedFile(config).value) : [];
  const declared = requested();
  const revision = digest(JSON.stringify([identity, declared]));
  const policyBase = join(realpathSync(home), ".pan-agent");
  const directory = join(policyBase, "workspace-trust");
  // A stable pathname slot also remembers that a replaced workspace was previously enrolled.
  const receipt = join(directory, digest(root) + ".json");
  const existing = stat(receipt);
  const enrolled = !!stat(config) || !!existing;
  if (!enrolled && approve === undefined) return {root, identity, revision, declared, eligible: [], enrolled};
  if (inside(root, policyBase) || inside(policyBase, root)) reject("overlapping_policy_root");
  for (const path of [policyBase, directory]) {
    if (stat(path)) privateDirectory(path);
    else { mkdirSync(path, {mode: 0o700, recursive:true}); privateDirectory(path); }
  }
  const settings = stat(join(policyBase, "settings.json"));
  if (settings && (!settings.isFile() || settings.nlink !== 1n || Number(settings.uid) !== process.getuid?.() ||
      (Number(settings.mode) & 0o022))) reject("unsafe_parent_settings");
  if (approve !== undefined && (!stat(config) || approve !== revision)) reject("review_changed");
  // Serialize review, replacement, and observed narrowing for this workspace. Stale lock fails closed.
  const lock = receipt + ".lock";
  mkdirSync(lock, {mode: 0o700});
  try {
    if (rootIdentity(root) !== identity || JSON.stringify(requested()) !== JSON.stringify(declared)) reject("review_changed");
    let previous: string[] = [];
    let sameOwner = false;
    const info = stat(receipt);
    if (info) {
      if (!info.isFile() || info.nlink !== 1n || (Number(info.mode) & 0o077) ||
          Number(info.uid) !== process.getuid?.()) reject("unsafe_policy_file");
      let record;
      try { record = parseFlatDocument(checkedFile(receipt).value); } catch { reject("invalid_receipt"); }
      if (!record || Object.keys(record).sort().join(",") !== "identity,resources,version" ||
          typeof record.identity !== "string" || !/^[a-f0-9]{64}$/.test(record.identity)) reject("invalid_receipt");
      const resources = parseResources(JSON.stringify({version: record.version, resources: record.resources}));
      sameOwner = record.identity === identity;
      if (sameOwner) previous = resources;
    }
    const eligible = approve !== undefined ? declared : declared.filter(id => previous.includes(id));
    if (!sameOwner || approve !== undefined || previous.length !== eligible.length) {
      const tmp = receipt + "." + randomUUID();
      try {
        writeFileSync(tmp, JSON.stringify({version: 1, identity, resources: eligible}) + "\n", {mode: 0o600, flag: "wx"});
        renameSync(tmp, receipt);
      } finally { rmSync(tmp, {force: true}); }
    }
    return {root, identity, revision, declared, eligible, enrolled};
  } finally { rmSync(lock, {recursive: true}); }
}

export interface GrantSelection {
  resource: string;
  command?: string;
  task?: boolean;
}

/** One operator-selected read-only value. No secret is serialized in policy, CLI arguments or evidence. */
export class WorkspaceGrant {
  private state: "pending" | "active" | "expired" = "pending";
  private readonly source: () => {identity: string; value: string};
  private readonly fingerprint: string;
  private readonly selection: GrantSelection;
  private readonly verify: () => void;
  private readonly notify: (message: string) => void;
  constructor(workspace: string, home: string, selection: GrantSelection, protectedPaths: readonly string[], notify: (message: string) => void) {
    const trust = workspaceTrust(workspace, home);
    if (!trust.eligible.includes(selection.resource)) reject("unapproved_resource");
    if (selection.task ? selection.command !== undefined : !selection.command) reject("select_exact_command_or_task");
    this.rootForGrant = trust.identity;
    this.selection = Object.freeze({...selection});
    this.notify = notify;
    this.verify = () => {
      const current = workspaceTrust(workspace, home);
      if (current.identity !== trust.identity || !current.eligible.includes(this.selection.resource)) reject("approval_expired");
    };
    const key = selection.resource.slice(selection.resource.indexOf(":") + 1);
    if (selection.resource.startsWith("env:")) {
      this.source = () => {
        const value = process.env[key];
        if (!value || Buffer.byteLength(value) > limit) reject("unavailable_value");
        return {identity: key, value};
      };
    } else {
      const path = join(trust.root, key);
      const builtIn = /^(?:\.env(?:\..*)?|\.npmrc|id_rsa|id_ed25519)$|\.(?:pem|key)$/i.test(key.split("/").at(-1)!);
      if (!builtIn && !protectedPaths.some(p => inside(resolve(trust.root, p), path))) reject("file_requires_parent_protection");
      this.source = () => checkedFile(path);
    }
    const source = this.source();
    if (!source.value) reject("unavailable_value");
    this.fingerprint = digest(JSON.stringify(source));
  }
  start(workspace: string): void {
    if (this.state === "active") reject("already_active");
    if (this.state === "expired") return;
    if (rootIdentity(workspace) !== this.rootForGrant) reject("workspace_changed");
    this.state = "active";
  }
  private readonly rootForGrant: string;
  take(command: string): string | undefined {
    if (this.state !== "active" || (!this.selection.task && command !== this.selection.command)) return;
    try {
      this.verify();
      const source = this.source();
      if (digest(JSON.stringify(source)) !== this.fingerprint) reject("resource_changed");
      if (!this.selection.task) this.expire();
      return source.value;
    } catch { this.expire(); return reject("approval_expired"); }
  }
  expire(): void {
    if (this.state === "expired") return;
    this.state = "expired";
    this.notify("Native credential grant expired: " + this.selection.resource);
  }
}
