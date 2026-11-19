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
export function parseCriteria(bytes: Buffer): DeliveryCriteria {
  const value = JSON.parse(bytes.toString('utf8'));
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
    if (check.kind === 'json-equals') JSON.parse(check.value);
    ids.add(check.id);
  }
  return value;
}
