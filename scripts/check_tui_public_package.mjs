/** Compile and import the same client against two installed local tarballs.
 * This is an API/type check; the unchanged #35 verifier supplies runtime isolation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const arg = flag => { assert.ok(args.includes(flag), `required ${flag}`); return path.resolve(args[args.indexOf(flag) + 1]); };
const output = arg('--output'), npm = arg('--npm');
assert.ok(!fs.existsSync(output), 'fresh output required'); fs.mkdirSync(output, {recursive: true});
for (const name of ['user.conf', 'global.conf']) fs.writeFileSync(path.join(output, name), '');
const environment = {PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(output, 'home'),
  NPM_CONFIG_USERCONFIG: path.join(output, 'user.conf'), NPM_CONFIG_GLOBALCONFIG: path.join(output, 'global.conf'), NPM_CONFIG_UPDATE_NOTIFIER: 'false'};
fs.mkdirSync(environment.HOME);
const commands = [], results = [];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(name, command, directory, env) {
  const result = spawnSync(command[0], command.slice(1), {cwd: directory, env, encoding: 'utf8'});
  const log = path.join(output, name + '.log'); fs.writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  commands.push({command, cwd: directory, exit: result.status, log, sha256: hash(log)});
  fs.writeFileSync(path.join(output, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  return result.stdout;
}
for (const which of ['baseline', 'candidate']) {
  const tarball = arg(`--${which}-tarball`), tarHash = hash(tarball);
  const consumer = path.join(output, which); fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({name: `wo41-${which}-api-probe`, private: true, type: 'module'}) + '\n');
  const env = {...environment, NPM_CONFIG_CACHE: path.join(consumer, 'cache')};
  run(which + '-install', [process.execPath, npm, '--prefix', consumer, 'install', tarball, '--omit=dev', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer, env);
  assert.equal(hash(tarball), tarHash, 'retained tarball changed');
  const fixture = path.join(consumer, 'client.ts');
  fs.copyFileSync(path.join(root, 'scripts/fixtures/module-layout-public-types.ts'), fixture);
  const compiler = path.join(root, 'typescript/node_modules/typescript/bin/tsc');
  // The compiler/type libraries remain build-time tools outside both consumers.
  run(which + '-types', [process.execPath, compiler, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--typeRoots', path.join(root, 'typescript/node_modules/@types'), fixture], consumer, env);
  const driver = path.join(consumer, 'exports.mjs');
  fs.writeFileSync(driver, `import assert from 'node:assert/strict';\nimport * as product from 'pan-agent';\nimport * as cli from 'pan-agent/cli';\nimport * as faux from 'pan-agent/faux';\nassert.equal(product.runCli,cli.runCli);\nassert.equal(product.FauxModelAdapter,faux.FauxModelAdapter);\nconsole.log(JSON.stringify(Object.fromEntries(Object.entries({product,cli,faux}).map(([name,module])=>[name,Object.fromEntries(Object.keys(module).sort().map(key=>[key,typeof module[key]]))]))));\n`);
  const shape = JSON.parse(run(which + '-exports', [process.execPath, driver], consumer, env));
  results.push({which, tarball_sha256: tarHash, fixture_sha256: hash(fixture), exports: shape});
}
for (const [module, exports] of Object.entries(results[0].exports)) {
  for (const [name, type] of Object.entries(exports)) assert.equal(results[1].exports[module][name], type, `legacy export ${module}.${name}`);
}
assert.deepEqual(Object.keys(results[1].exports.product).filter(name => !(name in results[0].exports.product)), ['createCompactPresentation']);
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({node: process.version, results}, null, 2) + '\n');
console.log('PASS all legacy public named exports plus the optional presentation factory and the same typed client against both installed tarballs');
