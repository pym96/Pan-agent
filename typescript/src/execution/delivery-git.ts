import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { identity } from './controller.ts';
import { treeManifest } from './process-runner.ts';

const execute = promisify(execFile);
export async function git(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const { stdout } = await execute(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'commit.gpgSign=false',
      '-c',
      'maintenance.auto=false',
      '-c',
      'gc.auto=0',
      ...args,
    ],
    {
      cwd,
      signal,
      timeout: 7000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        LC_ALL: 'C',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_NO_LAZY_FETCH: '1',
        GIT_ATTR_NOSYSTEM: '1',
        GIT_ALLOW_PROTOCOL: 'file',
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_AUTHOR_NAME: 'Pan delivery',
        GIT_AUTHOR_EMAIL: 'delivery@localhost',
        GIT_COMMITTER_NAME: 'Pan delivery',
        GIT_COMMITTER_EMAIL: 'delivery@localhost',
      },
    }
  );
  return stdout;
}
export async function head(dir: string, signal?: AbortSignal) {
  const sha = (await git(dir, ['rev-parse', '--verify', 'HEAD^{commit}'], signal)).trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw Error('invalid_git_identity');
  return sha;
}
export async function checkout(source: string, dest: string, sha: string, signal?: AbortSignal) {
  // Import exactly one commit and its bounded tree into an independent shallow repository.
  // An alternate is used only while copying the objects. Neither checkout depends on the source afterward.
  const objects = (
    await git(source, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'], signal)
  ).trimEnd();
  if (!isAbsolute(objects) || /[\n\r]/.test(objects)) throw Error('unsupported_object_directory');
  await mkdir(dest, { mode: 0o700 });
  await git(
    dest,
    ['init', '--quiet', '--template=', '--object-format=' + (sha.length === 64 ? 'sha256' : 'sha1')],
    signal
  );
  const alternate = join(dest, '.git', 'objects', 'info', 'alternates');
  await writeFile(alternate, objects + '\n', { flag: 'wx', mode: 0o600 });
  try {
    const listing = await git(dest, ['ls-tree', '-r', '-l', '-z', sha], signal);
    const entries = listing.split('\0').filter(Boolean);
    let size = 0;
    if (entries.length > 512) throw Error('delivery_tree_file_limit');
    for (const row of entries) {
      const m = /^(100644|100755) blob [0-9a-f]+ +([0-9]+)\t([^\0]+)$/s.exec(row);
      if (!m || Number(m[2]) > 1024 * 1024 || m[3]!.split('/').length > 24)
        throw Error('unsupported_delivery_tree_entry');
      size += Number(m[2]);
    }
    if (size > 8 * 1024 * 1024) throw Error('delivery_tree_byte_limit');
    await writeFile(join(dest, '.git', 'shallow'), sha + '\n', { flag: 'wx', mode: 0o600 });
    await git(dest, ['update-ref', 'HEAD', sha], signal);
    await git(dest, ['repack', '-a', '-d'], signal);
  } finally {
    await unlink(alternate);
  }
  await git(dest, ['checkout', '--quiet', '--detach', sha], signal);
}
export async function observed(dir: string, signal?: AbortSignal) {
  const sha = await head(dir, signal);
  const status = await git(
    dir,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'],
    signal
  );
  if (status) throw Error('dirty_delivery_checkout');
  const manifest = await treeManifest(dir, true);
  signal?.throwIfAborted();
  return { sha, tree: identity(manifest) };
}
export async function checkTargetSpelling(dir: string, paths: readonly string[]) {
  // On case-folding filesystems, reject a different lexical path resolving to the same existing entry.
  for (const path of paths) {
    let parent = dir;
    for (const segment of path.split('/')) {
      const names = await readdir(parent).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return [];
        throw e;
      });
      if (names.some((name) => name.toLowerCase() === segment.toLowerCase() && name !== segment))
        throw Error('delivery_path_alias');
      parent += '/' + segment;
    }
  }
}
