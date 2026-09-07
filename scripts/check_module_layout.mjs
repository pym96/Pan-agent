/** #41 checks only compiler-parsed module spans and explicitly listed test locators.
 * All remaining bytes (including comments, declarations and literals) must match.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from '../typescript/node_modules/typescript/lib/typescript.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const BASE = '97fb7db1574a240b1a689733bc1b56791879c6d6';
const options = {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true};
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const root = fs.realpathSync(path.resolve(value('--root', repository)));
const mode = value('--check', 'all');
assert.ok(['all', 'fidelity', 'graph', 'scope'].includes(mode), 'unknown check');
const productOnly = args.includes('--product-only');
assert.ok(!productOnly || mode === 'fidelity' || mode === 'graph', 'full scope must include Reference clients');
const git = (...arguments_) => execFileSync('git', ['-C', repository, ...arguments_], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const before = file => git('show', `${BASE}:${file}`);
const baseline = git('ls-tree', '-r', '--name-only', BASE).trim().split('\n');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const map = JSON.parse(read('docs/design/workorder-41-relocations.json'));
assert.equal(map.base, BASE);
assert.equal(map.schema, 'workorder-41-relocations/v1');
const sourceFiles = () => fs.readdirSync(path.join(root, 'typescript/src'), {recursive: true})
  .filter(file => file.endsWith('.ts')).map(file => `typescript/src/${file}`).sort();
const report = {base: BASE, checked_root: root, compiler: ts.version, product_only_test_mode: productOnly, checks: {}, graph: {}};

function modules(file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length, 0, `syntax: ${file}`);
  const result = [];
  const add = (node, kind, typeOnly = false) => {
    assert.ok(node && ts.isStringLiteralLike(node), `non-literal module dependency: ${file} ${kind}`);
    result.push({start: node.getStart(tree) + 1, end: node.end - 1, name: node.text, kind, typeOnly});
  };
  function visit(node) {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, 'import', node.importClause?.isTypeOnly ?? false);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier, 'export', node.isTypeOnly);
    if (ts.isImportTypeNode(node)) {
      assert.ok(ts.isLiteralTypeNode(node.argument), `non-literal import type: ${file}`);
      add(node.argument.literal, 'import-type', true);
    }
    if (ts.isImportEqualsDeclaration(node)) {
      assert.ok(ts.isExternalModuleReference(node.moduleReference), `internal import alias: ${file}`);
      add(node.moduleReference.expression, 'import-equals', node.isTypeOnly);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import' : 'require');
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result.sort((a, b) => a.start - b.start);
}

function destination(file, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
}

function relocated(file, targetFile, text, inventory) {
  const edits = [];
  for (const item of modules(file, text)) {
    if (!item.name.startsWith('.')) continue;
    const oldTarget = destination(file, item.name);
    assert.ok(baseline.includes(oldTarget), `unresolved baseline dependency: ${file} ${item.name}`);
    const target = map.sources[oldTarget] ?? oldTarget;
    let specifier = path.posix.relative(path.posix.dirname(targetFile), target);
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    if (specifier === item.name) continue;
    edits.push({file, destination: targetFile, start: item.start, end: item.end, before: item.name, after: specifier});
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.after + text.slice(edit.end);
  }
  inventory.push(...edits);
  return text;
}

function fidelity() {
  const original = baseline.filter(file => file.startsWith('typescript/src/') && file.endsWith('.ts')).sort();
  assert.equal(original.length, 17, 'base source inventory drift');
  assert.deepEqual(Object.keys(map.sources).sort(), original, 'incomplete relocation map');
  assert.equal(new Set(Object.values(map.sources)).size, original.length, 'ambiguous destinations');
  assert.deepEqual(sourceFiles(), Object.values(map.sources).sort(), 'extra, missing or duplicate source implementation');
  assert.deepEqual(map.source_asset_exceptions, [], 'root CLI preserves Runbook location; no source locator exception');
  const imports = [];
  const identities = [];
  const clients = baseline.filter(file => /^(typescript\/test|references\/pi\/(src|test))\/.+\.ts$/.test(file) && (!productOnly || file.startsWith('typescript/')));
  for (const file of [...original, ...clients]) {
    const target = map.sources[file] ?? file;
    const text = before(file);
    let expected = relocated(file, target, text, imports);
    for (const change of map.locator_substitutions.filter(change => change.file === file)) {
      // Only test locators may have explicit non-import changes. They are also
      // checked below against allowed source mapping/one frozen heading update.
      assert.ok(file.startsWith('typescript/test/') || file.startsWith('references/pi/test/'), file);
      assert.equal(expected.split(change.before).length - 1, change.occurrences, `locator count: ${file}`);
      expected = expected.split(change.before).join(change.after);
    }
    const actual = read(target);
    assert.equal(actual, expected, `source fidelity: ${file} -> ${target}`);
    const oldImports = modules(file, text), newImports = modules(target, actual);
    assert.equal(newImports.length, oldImports.length, `module count: ${file}`);
    for (let i = 0; i < oldImports.length; i++) {
      const oldTarget = destination(file, oldImports[i].name);
      assert.equal(destination(target, newImports[i].name), map.sources[oldTarget] ?? oldTarget, `changed target: ${file}`);
    }
    identities.push({from: file, to: target, before_sha256: hash(text), after_sha256: hash(actual)});
  }
  const canonical = rows => [...rows].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  assert.deepEqual(canonical(map.import_substitutions.filter(row => !productOnly || row.file.startsWith('typescript/'))), canonical(imports), 'import span inventory must match parsed baseline');
  for (const change of map.locator_substitutions.filter(row => !productOnly || row.file.startsWith('typescript/'))) {
    assert.ok(clients.includes(change.file), 'unknown locator file');
    const from = change.before.slice(1, -1), to = change.after.slice(1, -1);
    const sourcePath = change.before === JSON.stringify(from) && change.after === JSON.stringify(to) && map.sources[from] === to && from !== to;
    const providerLoop = change.file === 'typescript/test/pan-deepseek-adapter.test.ts' &&
      change.before === 'join(REPOSITORY_ROOT, "typescript/src", name)' &&
      change.after === 'join(REPOSITORY_ROOT, "typescript/src/providers/deepseek", name)';
    const assignment = change.file === 'typescript/test/cutover-contract.test.ts' &&
      change.before === 'WorkOrder #35 compiled package and offline consumer/' && change.after === 'WorkOrder #41 Native Module layout/';
    assert.ok(sourcePath || providerLoop || assignment, `non-path exception: ${JSON.stringify(change)}`);
  }
  report.checks.fidelity = {sources: original.length, clients: clients.length, identities, import_spans: imports.length, locator_spans: map.locator_substitutions.length};
}

function group(file) {
  const relative = file.replace(/^typescript\/src\//, '');
  if (relative === 'cli.ts') return 'cli';
  if (relative === 'index.ts') return 'index';
  const name = relative.split('/')[0];
  assert.ok(['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui'].includes(name), `ungrouped source: ${file}`);
  return name;
}

function graph() {
  const files = sourceFiles();
  assert.ok(files.length > 0, 'empty source graph');
  const allowed = {
    protocol: ['protocol'], runtime: ['runtime', 'protocol', 'memory'],
    providers: ['providers', 'protocol'], tools: ['tools', 'protocol'],
    memory: ['memory', 'protocol', 'runtime'], tui: ['tui', 'runtime', 'memory', 'protocol'],
    cli: ['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui', 'cli'],
    index: ['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui', 'cli', 'index'],
  };
  const edges = new Map(Object.keys(allowed).map(name => [name, new Set()]));
  for (const file of files) {
    assert.ok(fs.lstatSync(path.join(root, file)).isFile(), `source must be a regular file: ${file}`);
    assert.equal(fs.realpathSync(path.join(root, file)), path.join(root, file), `source path escape: ${file}`);
    const sourceGroup = group(file), dependencies = [];
    for (const item of modules(file, read(file))) {
      if (isBuiltin(item.name) && item.name.startsWith('node:')) {
        dependencies.push({...item, target: item.name}); continue;
      }
      assert.ok(item.name.startsWith('.'), `external Product dependency: ${file} ${item.name}`);
      const result = ts.resolveModuleName(item.name, path.join(root, file), options, ts.sys).resolvedModule;
      assert.ok(result, `unresolved module: ${file} ${item.name}`);
      const target = path.relative(root, fs.realpathSync(result.resolvedFileName));
      assert.ok(files.includes(target), `outside Product: ${file} -> ${target}`);
      const targetGroup = group(target);
      assert.ok(allowed[sourceGroup].includes(targetGroup), `forbidden edge: ${sourceGroup} -> ${targetGroup} (${file} -> ${target})`);
      if (sourceGroup !== targetGroup) edges.get(sourceGroup).add(targetGroup);
      dependencies.push({...item, target});
    }
    report.graph[file] = dependencies;
  }
  const visiting = new Set(), done = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `module-group cycle: ${name}`);
    if (done.has(name)) return;
    visiting.add(name); for (const next of edges.get(name)) visit(next);
    visiting.delete(name); done.add(name);
  }
  for (const name of edges.keys()) visit(name);
  report.checks.graph = {source_files: files.length, group_edges: Object.fromEntries([...edges].map(([key, set]) => [key, [...set].sort()]))};
}

function scope() {
  const documents = new Set(['README.md', 'typescript/README.md', 'docs/agents/current-assignment.md', 'docs/design/README.md', 'scripts/README.md']);
  const existing = new Set([...Object.keys(map.sources), ...Object.values(map.sources), ...documents, 'typescript/package.json']);
  for (const row of map.import_substitutions) existing.add(row.file);
  for (const row of map.locator_substitutions) existing.add(row.file);
  for (const row of map.document_locator_substitutions) existing.add(row.file);
  for (const file of new Set(map.document_locator_substitutions.map(row => row.file))) {
    let expected = before(file);
    for (const row of map.document_locator_substitutions.filter(row => row.file === file)) {
      const original = row.before.slice(8, -1);
      assert.equal(row.before, `](../../${original})`);
      assert.equal(row.after, `](../../${map.sources[original]})`);
      assert.ok(expected.includes(row.before));
      expected = expected.split(row.before).join(row.after);
    }
    assert.equal(read(file), expected, `non-locator design edit: ${file}`);
  }
  const additions = new Set(['scripts/check_module_layout.mjs', 'scripts/check_public_package.mjs', 'typescript/test/module-layout.test.ts', 'scripts/fixtures/module-layout-public-types.ts', 'scripts/fixtures/README.md', 'docs/design/workorder-41-relocations.json', 'docs/design/native-module-layout.md', 'typescript/src/README.md']);
  for (const name of ['protocol', 'runtime', 'providers', 'providers/deepseek', 'providers/faux', 'tools', 'memory', 'tui']) additions.add(`typescript/src/${name}/README.md`);
  const changed = [...new Set([...git('diff', '--name-only', BASE).trim().split('\n'), ...git('ls-files', '--others', '--exclude-standard').trim().split('\n')].filter(Boolean))];
  for (const file of changed) assert.ok(existing.has(file) || additions.has(file), `out of scope: ${file}`);
  const protectedFiles = {};
  for (const file of baseline) {
    if (existing.has(file) || additions.has(file)) continue;
    const oldBytes = execFileSync('git', ['-C', repository, 'show', `${BASE}:${file}`], {maxBuffer: 32 * 1024 * 1024});
    const bytes = fs.readFileSync(path.join(root, file));
    assert.deepEqual(bytes, oldBytes, `protected file: ${file}`);
    protectedFiles[file] = hash(bytes);
  }
  const manifest = JSON.parse(read('typescript/package.json'));
  const expected = JSON.parse(before('typescript/package.json'));
  expected.exports['./faux'] = {types: './dist/providers/faux/faux-model-adapter.d.ts', import: './dist/providers/faux/faux-model-adapter.js'};
  assert.deepEqual(manifest, expected, 'only package-internal Faux export locators may change');
  const titles = {};
  for (const [dir, count] of [['typescript/test/', 69], ['references/pi/test/', 34]]) {
    const cases = baseline.filter(file => file.startsWith(dir) && file.endsWith('.test.ts')).flatMap(file => {
      const old = [...before(file).matchAll(/^test\("([^"]+)"/gm)].map(match => match[1]);
      const current = [...read(file).matchAll(/^test\("([^"]+)"/gm)].map(match => match[1]);
      assert.deepEqual(current, old, `test obligation drift: ${file}`);
      return old.map(title => ({file, title}));
    });
    assert.equal(cases.length, count, `baseline test count: ${dir}`); titles[dir] = cases;
  }
  for (const file of [...changed, ...additions].filter(file => file.endsWith('.md'))) {
    if (!fs.existsSync(path.join(root, file))) continue;
    for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1]; if (/^(https?:|mailto:|#)/.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), target.split('#')[0])), `${file}: broken link ${target}`);
    }
  }
  git('diff', '--check', BASE);
  report.checks.scope = {changed_files: changed.sort(), protected_sha256: protectedFiles, baseline_obligations: titles};
}

if (mode === 'all' || mode === 'fidelity') fidelity();
if (mode === 'all' || mode === 'graph') graph();
if (mode === 'all' || mode === 'scope') scope();
console.log(JSON.stringify(report, null, 2));
console.log(`PASS #41 ${mode}`);
