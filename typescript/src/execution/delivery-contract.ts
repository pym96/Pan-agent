import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

export type CheckKind = 'equals' | 'includes' | 'excludes' | 'json-equals';
export interface DeliveryCheck {
  id: string;
  file: string;
  kind: CheckKind;
  value: string;
}
export interface DeliveryCriteria {
  version: string;
  files: string[];
  checks: DeliveryCheck[];
}
export const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

export async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw Error('delivery_input_limit');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = (await file.read(buffer, length, buffer.length - length, null)).bytesRead;
      if (!count) break;
      length += count;
    }
    if (length !== stat.size) throw Error('delivery_input_changed');
    return buffer.subarray(0, length);
  } finally {
    await file.close();
  }
}
function keys(value: unknown, expected: string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}
// JSON.parse's numeric value is already binary64, even inside its reviver. Node 22.19+
// also supplies the original token. Normalize that token without expanding powers of ten.
class JsonDecimal {
  readonly coefficient: string;
  readonly exponent: bigint;
  constructor(token: string) {
    const parts = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    if (!parts) throw Error('invalid_json_number');
    const fraction = parts[3] ?? '';
    const digits = (parts[2]! + fraction).replace(/^0+/, '');
    let end = digits.length;
    while (end > 0 && digits[end - 1] === '0') end--;
    this.coefficient = end ? parts[1]! + digits.slice(0, end) : '0';
    this.exponent = end ? BigInt(parts[4] ?? '0') + BigInt(digits.length - end - fraction.length) : 0n;
  }
}

// The native parser has already validated syntax. Scan the original member names because
// the parsed object itself no longer reveals duplicate keys, including differently escaped spellings.
function checkUniqueNames(text: string): void {
  const stack: Set<string>[] = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}]/g)) {
    const token = match[0];
    if (token === '{') stack.push(new Set());
    else if (token === '}') stack.pop();
    else {
      let pos = match.index + token.length;
      while (' \n\t\r'.includes(text[pos] ?? '\0')) pos++;
      if (text[pos] !== ':') continue;
      const key: string = JSON.parse(token);
      const names = stack[stack.length - 1]!;
      if (names.has(key)) throw Error('duplicate_json_member');
      names.add(key);
    }
  }
}
export function parseExactJson(text: string): unknown {
  const value = JSON.parse(text, (_key: string, parsed: unknown, context?: { source?: string }) => {
    if (typeof parsed !== 'number') return parsed;
    if (typeof context?.source !== 'string') throw Error('json_number_source_unavailable');
    return new JsonDecimal(context.source);
  });
  checkUniqueNames(text);
  return value;
}
export function parseCriteria(bytes: Buffer): DeliveryCriteria {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value = JSON.parse(text);
  checkUniqueNames(text);
  if (
    !keys(value, ['version', 'files', 'checks']) ||
    typeof value.version !== 'string' ||
    !/^[\w.-]{1,64}$/.test(value.version)
  )
    throw Error('invalid_delivery_criteria');
  const files: unknown = value.files;
  if (
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > 16 ||
    new Set(files.map((name) => (typeof name === 'string' ? name.toLowerCase() : name))).size !==
      files.length
  )
    throw Error('invalid_delivery_files');
  for (const name of files) {
    if (
      typeof name !== 'string' ||
      name.length > 200 ||
      !name.split('/').every((part) => /^[A-Za-z0-9][\w.-]*$/.test(part)) ||
      !/[.](?:md|txt|rst|csv|tsv|json|ya?ml)$/i.test(name)
    )
      throw Error('invalid_delivery_path');
  }
  if (!Array.isArray(value.checks) || !value.checks.length || value.checks.length > 32)
    throw Error('invalid_delivery_checks');
  const ids = new Set<string>();
  for (const check of value.checks) {
    if (
      !keys(check, ['id', 'file', 'kind', 'value']) ||
      typeof check.id !== 'string' ||
      !/^[\w.-]{1,64}$/.test(check.id) ||
      ids.has(check.id) ||
      !files.includes(check.file) ||
      !['equals', 'includes', 'excludes', 'json-equals'].includes(check.kind) ||
      typeof check.value !== 'string' ||
      Buffer.byteLength(check.value) > 65536 ||
      (!check.value && ['includes', 'excludes'].includes(check.kind))
    )
      throw Error('invalid_delivery_check');
    if (check.kind === 'json-equals') parseExactJson(check.value);
    ids.add(check.id);
  }
  return value;
}
