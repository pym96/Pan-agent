/** Pan request policy. This filters tool requests; it is not shell analysis or containment. */
export interface PanPermissions { readonly deny: readonly string[] }
export const sessionTaskCommands = Object.freeze({
 build: 'npm run build',
 test: 'npm test',
 report: 'npm run report',
});
export type SessionTask = keyof typeof sessionTaskCommands;

export function parseSessionTasks(value: string | undefined): readonly SessionTask[] {
 const names = value?.split(',') ?? [];
 if (names.length === 0 || names.some(name => !Object.hasOwn(sessionTaskCommands, name)) ||
     new Set(names).size !== names.length) {
  throw Error('--session-tasks expects a comma-separated selection of build,test,report, each at most once');
 }
 return Object.freeze((Object.keys(sessionTaskCommands) as SessionTask[]).filter(task => names.includes(task)));
}

export const MAX_DENY_RULES = 256;
export const MAX_DENY_RULE_LENGTH = 4096;
const TOOLS = new Set(['read', 'write', 'edit', 'bash', 'retrieve', 'mcp_report', 'web_fetch']);

/** Only a whole native tool name or bash(nonempty literal/* glob) is supported. */
export function parsePanPermissions(value: unknown): PanPermissions {
 if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('settings_invalid: permissions');
 const record = value as Record<string, unknown>;
 if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'deny') || !Array.isArray(record.deny)
     || record.deny.length > MAX_DENY_RULES) throw Error('settings_invalid: permissions.deny');
 for (const rule of record.deny) {
  if (typeof rule !== 'string' || rule.length > MAX_DENY_RULE_LENGTH
      || !(TOOLS.has(rule) || (rule.startsWith('bash(') && rule.endsWith(')') && rule.length > 6))) {
   throw Error('settings_invalid: permissions.deny rule');
  }
 }
 return Object.freeze({deny: Object.freeze([...record.deny]) as readonly string[]});
}

/** Full-string, case-sensitive match. Only * is special, including across newlines. */
export function matchesCommandPattern(pattern: string, command: string): boolean {
 const parts = pattern.split('*');
 if (parts.length === 1) return command === pattern;
 const first = parts[0]!;
 if (!command.startsWith(first)) return false;
 let cursor = first.length;
 for (const part of parts.slice(1, -1)) {
  const at = command.indexOf(part, cursor);
  if (at < 0) return false;
  cursor = at + part.length;
 }
 const last = parts.at(-1)!;
 return command.endsWith(last) && command.length - last.length >= cursor;
}

export function matchingDenyRule(permissions: PanPermissions, tool: string, args: {readonly command?: unknown}): string | undefined {
 return permissions.deny.find(rule => rule === tool || (tool === 'bash' && rule.startsWith('bash(')
  && typeof args.command === 'string' && matchesCommandPattern(rule.slice(5, -1), args.command)));
}
