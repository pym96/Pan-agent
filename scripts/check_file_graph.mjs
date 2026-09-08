/** #43 current compiler-resolved graph; retained #41 graph oracle with a narrow input leaf. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from '../typescript/node_modules/typescript/lib/typescript.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const root=fs.realpathSync(path.resolve(process.argv[2]??repository));
const options={module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,allowImportingTsExtensions:true};
const sourceFiles=()=>fs.readdirSync(path.join(root,'typescript/src'),{recursive:true}).filter(f=>f.endsWith('.ts')).map(f=>'typescript/src/'+f).sort();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const report={checks:{},graph:{}};
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

function group(file) {
  const relative = file.replace(/^typescript\/src\//, '');
  if (relative === 'cli.ts') return 'cli';
  if (relative === 'index.ts') return 'index';
  const name = relative.split('/')[0];
  assert.ok(['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui', 'input'].includes(name), `ungrouped source: ${file}`);
  return name;
}

function graph() {
  const files = sourceFiles();
  assert.ok(files.length > 0, 'empty source graph');
  const allowed = {
    input: ['input'], protocol: ['protocol'], runtime: ['runtime', 'protocol', 'memory'],
    providers: ['providers', 'protocol'], tools: ['tools', 'protocol'],
    memory: ['memory', 'protocol', 'runtime'], tui: ['tui', 'runtime', 'memory', 'protocol', 'input'],
    cli: ['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui', 'cli', 'input'],
    index: ['protocol', 'runtime', 'providers', 'tools', 'memory', 'tui', 'cli', 'index', 'input'],
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

graph();console.log(JSON.stringify(report,null,2));console.log('PASS #43 current graph');
