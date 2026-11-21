import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

// Preserve source whitespace and literal backslashes, but never forward terminal controls.
export function plainOutput(text: string): string {
 return stripVTControlCharacters(text.replaceAll('\r\n', '\n'))
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\p{Cs}]/gu,
   point => '\\u' + point.codePointAt(0)!.toString(16).padStart(4, '0'));
}

export function copyOutput(source: string, write: (control: string) => void): { lines: string[]; file?: string } {
 const text = plainOutput(source);
 if (!text) return { lines: ['No retained output to copy.'] };
 const lines: string[] = [];
 let file: string | undefined;
 let dir: string | undefined;
 try {
  dir = mkdtempSync(join(tmpdir(), 'pan-copy-'));
  const target = join(dir, 'output.txt');
  writeFileSync(target, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  file = target;
 } catch {
  if (dir) { try { rmSync(dir, {recursive:true, force:true}); } catch { /* File creation failed. */ } }
  lines.push('Could not save a private text file. Check temporary directory permissions and disk space.');
 }
 // OSC 52 has implementation-dependent limits and no portable write acknowledgement.
 // Keep the encoded request below 100 KiB and always provide the complete file.
 if (Buffer.byteLength(text) <= 72 * 1024 && process.env.TERM !== 'dumb') {
  write('\x1b]52;c;' + Buffer.from(text).toString('base64') + '\x07');
  lines.push(file?'Clipboard requested. If paste is empty or unchanged, open the text file below.':'Clipboard requested. Paste in your editor to check delivery.');
 } else {
  lines.push('Clipboard request skipped for this terminal or output size.');
 }
 if (file) lines.push('Full UTF-8 text file (remove it when finished)', file);
 return { lines, file };
}
