#!/usr/bin/env python3
"""#35 packaging-only diff, exact accepted source bytes and test obligations."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = '13d659a7292748f7f01dd592aa417848917d9065'


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def before(path):
    return git('show', f'{BASE}:{path}')


def digest(body):
    return hashlib.sha256(body).hexdigest()


allowed = {
    'README.md', 'typescript/README.md', 'typescript/.gitignore',
    'typescript/package.json', 'typescript/package-lock.json',
    'typescript/tsconfig.build.json', 'typescript/scripts/build.mjs',
    'typescript/bin/pan-agent.mjs', 'typescript/src/index.ts',
    'typescript/test/packaging.test.ts', 'typescript/test/cutover-contract.test.ts',
    'scripts/README.md', 'scripts/check_workorder_35_scope.py',
    'scripts/verify_packed_consumer.py', 'scripts/wo35-consumer-guard.mjs',
    'scripts/wo35-consumer-driver.mjs', 'scripts/fixtures/README.md',
    'scripts/fixtures/packed-create-run-verify-v1.json',
    'docs/agents/current-assignment.md', 'docs/design/README.md',
    'docs/design/packed-product-consumer.md',
}
changed = set(git('diff', '--name-only', BASE).decode().splitlines())
changed |= set(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
assert changed and changed <= allowed, sorted(changed - allowed)
protected = {}
# Every baseline file outside the enumerated packaging exceptions is exact,
# including all existing src/, Reference, Python, Evidence, Wiki and fixtures.
for name in git('ls-tree', '-r', '--name-only', BASE).decode().splitlines():
    if name in allowed:
        continue
    body = (ROOT / name).read_bytes()
    assert body == before(name), f'protected bytes: {name}'
    protected[name] = digest(body)
# The only edit to any baseline test is its current-assignment heading locator.
path = 'typescript/test/cutover-contract.test.ts'
expected = before(path).replace(
    b'WorkOrder #34 Product isolation and Frozen Reference/',
    b'WorkOrder #35 compiled package and offline consumer/',
)
assert (ROOT / path).read_bytes() == expected, 'baseline assertion changes'
case_re = re.compile(r'^test\("([^"]+)"', re.M)
coverage = {}
for directory, expected_count in [('typescript/test', 67), ('references/pi/test', 34)]:
    baseline = [(p, title)
                for p in git('ls-tree', '-r', '--name-only', BASE, directory).decode().splitlines()
                if p.endswith('.test.ts') for title in case_re.findall(before(p).decode())]
    assert len(baseline) == expected_count, (directory, len(baseline))
    for name, title in baseline:
        assert title in case_re.findall((ROOT / name).read_text()), (name, title)
    coverage[directory] = [{'file': name, 'title': title} for name, title in baseline]
manifest = json.loads((ROOT / 'typescript/package.json').read_text())
old = json.loads(before('typescript/package.json'))
assert manifest['private'] is True and manifest['engines'] == old['engines']
assert manifest.get('dependencies', {}) == old.get('dependencies', {}) == {}
assert manifest['devDependencies'] == old['devDependencies']
lock = json.loads((ROOT / 'typescript/package-lock.json').read_text())
old_lock = json.loads(before('typescript/package-lock.json'))
expected_lock = json.loads(json.dumps(old_lock))
expected_lock['packages']['']['bin'] = manifest['bin']
assert lock == expected_lock, 'dependency lock drift'
assert manifest['scripts'] == {**old['scripts'], 'build': 'node scripts/build.mjs', 'prepack': 'npm run build'}
for file in sorted(changed):
    if not file.endswith('.md'):
        continue
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', (ROOT / file).read_text()):
        if re.match(r'^(?:https?:|mailto:|#)', target):
            continue
        assert (ROOT / file).parent.joinpath(target.split('#', 1)[0]).exists(), (file, target)
subprocess.run(['git', '-C', str(ROOT), 'diff', '--check', BASE], check=True)
print(json.dumps({'base': BASE, 'candidate': git('rev-parse', 'HEAD').decode().strip(),
                  'changed_files': sorted(changed), 'protected_sha256': protected,
                  'baseline_obligations': coverage,
                  'source_rule': 'all baseline src files exact; only new export facade',
                  'new_tests': case_re.findall((ROOT / 'typescript/test/packaging.test.ts').read_text())}, indent=2))
print('PASS #35 packaging scope, protected bytes, 67 Product + 34 Reference baseline obligations, links and whitespace')
