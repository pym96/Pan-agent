#!/usr/bin/env python3
"""Reproduce the three retired revision assertions; never fetch from a network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('proof', choices=('layout41', 'facts25', 'routing43', 'all'))
    parser.add_argument('--repository', type=Path, required=True,
                        help='Local Git repository containing the pinned historical commits (read only)')
    parser.add_argument('--npm-cache', type=Path, required=True,
                        help='Prepared npm cache; layout41 installs its original lockfile offline')
    parser.add_argument('--output', type=Path, required=True, help='New external directory; retained on failure')
    args = parser.parse_args()
    out = args.output.resolve()
    repository = args.repository.resolve()
    if out == ROOT or ROOT in out.parents or out == repository or repository in out.parents:
        parser.error('output must be outside both the current checkout and historical repository')
    out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    report = {'status': 'FAIL', 'network_fetch': False, 'repository': str(repository),
              'manifest_sha256': sha256(HERE/'manifest.json'), 'proofs': {}, 'commands': []}
    env = {key: value for key, value in os.environ.items()
           if key in ('PATH', 'LANG', 'LC_ALL', 'SYSTEMROOT')}
    for name in ('home', 'tmp', 'cache'):
        (out/name).mkdir()
    env.update(HOME=str(out/'home'), TMPDIR=str(out/'tmp'), TMP=str(out/'tmp'),
               TEMP=str(out/'tmp'), XDG_CACHE_HOME=str(out/'cache'),
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
               GIT_TERMINAL_PROMPT='0', GIT_ALLOW_PROTOCOL='file')

    def save():
        (out/'result.json').write_text(json.dumps(report, indent=2)+'\n')

    def run(name, command, cwd=out):
        remaining = 600 - (time.monotonic() - started)
        if remaining <= 0:
            raise RuntimeError('historical replay aggregate 600 second deadline exceeded')
        row = {'name': name, 'command': list(map(str, command)), 'cwd': str(cwd),
               'timeout_seconds': min(120, remaining)}
        report['commands'].append(row)
        save()
        with (out/(name+'.stdout')).open('wb') as stdout, (out/(name+'.stderr')).open('wb') as stderr:
            proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=stdout, stderr=stderr,
                                    start_new_session=True)
            row['pid'] = proc.pid
            try:
                row['returncode'] = proc.wait(timeout=row['timeout_seconds'])
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
                row.update(returncode=124, timed_out=True)
        save()
        if row['returncode']:
            raise RuntimeError(f'{name} failed ({row["returncode"]}); inspect {name}.stderr; '
                               'prepare the exact Git revisions / locked npm cache explicitly and use a new output directory')
        return (out/(name+'.stdout')).read_text()

    try:
        manifest = json.loads((HERE/'manifest.json').read_text())
        if manifest['schema'] != 'pan-historical-assertions/v1':
            raise RuntimeError('unknown historical manifest schema')
        node = run('node', ['node', '--version']).strip()
        if node not in ('v22.19.0', 'v26.7.0'):
            raise RuntimeError('requires Node 22.19.0 or 26.7.0')
        report['node'] = node
        report['npm'] = run('npm', ['npm', '--version']).strip()
        for name, spec in manifest['proofs'].items():
            if args.proof not in ('all', name):
                continue
            for item in spec['criteria']:
                path = HERE/item['file']
                if sha256(path) != item['sha256']:
                    raise RuntimeError(f'criteria snapshot identity mismatch: {path}')
            revisions = [spec['source_sha'], *spec['required_git']]
            for revision in revisions:
                if not re.fullmatch('[0-9a-f]{40}', revision):
                    raise RuntimeError(f'{name}: revision must be a full immutable SHA')
                run(name+'-present-'+revision[:8], ['git', '-C', str(repository), 'cat-file', '-e', revision+'^{commit}'])
            checkout = out/name
            run(name+'-init', ['git', 'init', '--quiet', str(checkout)])
            # A private object database: local file transport only, no alternates/hardlinks.
            run(name+'-objects', ['git', '-C', str(checkout), 'fetch', '--quiet', '--no-tags',
                                 '--depth=1', repository.as_uri(), *revisions])
            run(name+'-checkout', ['git', '-C', str(checkout), 'checkout', '--quiet', '--detach', spec['source_sha']])
            if (checkout/'.git/objects/info/alternates').exists():
                raise RuntimeError('historical checkout unexpectedly has shared object alternates')
            verified = {}
            for file, expected in spec['files'].items():
                actual = sha256(checkout/file)
                if actual != expected:
                    raise RuntimeError(f'{name}: original input identity mismatch: {file}')
                verified[file] = actual
            record = {'source_sha': spec['source_sha'], 'required_git': spec['required_git'],
                      'verified_files': verified, 'criteria': spec['criteria']}
            report['proofs'][name] = record
            if name == 'layout41':
                run(name+'-dependencies', ['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit',
                                          '--no-fund', '--cache', str(args.npm_cache.resolve())], checkout/'typescript')
            test_file = spec['test_file']
            if name == 'facts25':
                # Reproduce only the revision freeze being retired, without loading
                # the unrelated Pi-era runtime. The original assertion bytes survive.
                lines = (checkout/test_file).read_bytes().splitlines(keepends=True)
                excerpt = b''.join(lines[spec['excerpt']['first_line']-1:spec['excerpt']['last_line']])
                if hashlib.sha256(excerpt).hexdigest() != spec['excerpt']['sha256']:
                    raise RuntimeError('original facts assertion excerpt identity mismatch')
                adapter = (b'import assert from "node:assert/strict";\n'
                           b'import { execFileSync } from "node:child_process";\n'
                           b'import { readFileSync } from "node:fs";\n'
                           b'import { dirname, join } from "node:path";\n'
                           b'import { fileURLToPath } from "node:url";\n'
                           b'import { test } from "node:test";\n'
                           b'test("original #25 facts-register revision freeze", () => {\n'
                           + excerpt + b'});\n')
                test_file = 'typescript/test/replayed-facts25.test.mjs'
                (checkout/test_file).write_bytes(adapter)
                record['excerpt'] = spec['excerpt']
                record['adapter_sha256'] = sha256(checkout/test_file)
            tap = run(name+'-tests', ['node', '--experimental-strip-types', '--test', '--test-reporter=tap',
                                    str(checkout/test_file)], checkout)
            counters = {key: int(value) for key, value in
                        re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$', tap, re.M)}
            if (set(counters) != {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}
                    or counters['tests'] <= 0 or counters['pass'] != counters['tests']
                    or any(counters[key] for key in ('fail', 'cancelled', 'skipped', 'todo'))):
                raise RuntimeError(f'{name}: empty/incomplete/nonpassing original assertions: {counters}')
            record.update(status='PASS', tests=counters)
        for row in report['commands']:
            for suffix in ('.stdout', '.stderr'):
                if not (out/(row['name']+suffix)).is_file():
                    raise RuntimeError('missing replay command log')
        report['status'] = 'PASS'
    except Exception as error:
        report['error'] = repr(error)
        print(error, file=sys.stderr)
    finally:
        report['elapsed_seconds'] = time.monotonic() - started
        save()
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
