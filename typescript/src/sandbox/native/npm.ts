import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {basename, dirname, join, resolve, sep} from 'node:path';

export const npmRuntimeEntries = ['bin/npm-cli.js', 'lib', 'node_modules', 'package.json'] as const;

/** npm must belong to the running Node installation. PATH and project settings
 * never select a host directory to expose in the sandbox. */
export function bundledNpmRoot(workspace: string): string {
  const bin = dirname(realpathSync(process.execPath));
  const prefix = dirname(bin);
  const roots = [join(prefix, 'lib/node_modules/npm')];
  const cellar = resolve(prefix, '../..');
  if (process.platform === 'darwin' && basename(cellar) === 'Cellar')
    roots.push(join(dirname(cellar), 'lib/node_modules/npm'));

  for (const root of roots) {
    try {
      if (realpathSync(root) !== root || root === workspace || root.startsWith(workspace + sep) ||
          workspace.startsWith(root + sep)) continue;
      if (realpathSync(join(bin, 'npm')) !== join(root, 'bin/npm-cli.js')) continue;
      const canonical = npmRuntimeEntries.every(entry => {
        const file = join(root, entry);
        if (realpathSync(file) !== file) return false;
        const info = lstatSync(file);
        return entry === 'lib' || entry === 'node_modules' ? info.isDirectory() : info.isFile();
      });
      if (canonical && JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name === 'npm') return root;
    } catch { /* A missing path or a noncanonical installation is ineligible. */ }
  }
  throw Error('native_sandbox_npm_unavailable: install Node with its bundled npm outside the workspace');
}
