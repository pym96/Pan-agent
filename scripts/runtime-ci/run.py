#!/usr/bin/env python3
"""Bounded CPU regression entry. All command output survives a failing stage."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import tarfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True, help='New external evidence directory')
    args = parser.parse_args()
    out = args.output.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('output must be outside checkout')
    out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    report = {'status': 'FAIL', 'commands': [], 'os': platform.platform(), 'python': sys.version,
              'event_sha': os.environ.get('GITHUB_SHA'), 'run_id': os.environ.get('GITHUB_RUN_ID'),
              'docker': 'OUTSIDE_CPU_GATE', 'live_model': False}
    def save():
        (out / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    def run(name, command, cwd=ROOT, env=None, limit=120):
        remaining = 600 - (time.monotonic() - started)
        if remaining <= 0:
            raise RuntimeError('aggregate 600 second deadline exceeded')
        stdout, stderr = out / (name + '.stdout'), out / (name + '.stderr')
        record = {'name': name, 'command': list(map(str, command)), 'cwd': str(cwd),
                  'timeout_seconds': min(limit, remaining)}
        report['commands'].append(record)
        save()
        begin = time.monotonic()
        with stdout.open('wb') as so, stderr.open('wb') as se:
            proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=so, stderr=se, start_new_session=True)
            try:
                record['returncode'] = proc.wait(timeout=record['timeout_seconds'])
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
                record['timed_out'] = True
                record['returncode'] = 124
        record['elapsed_seconds'] = time.monotonic() - begin
        save()
        if record['returncode'] != 0:
            raise RuntimeError(f'{name} failed ({record["returncode"]}); see retained stdout/stderr')
        return stdout.read_text()
    try:
        report['source_sha'] = run('source', ['git', 'rev-parse', 'HEAD']).strip()
        report['dirty'] = bool(run('status', ['git', 'status', '--porcelain']).strip())
        report['node'] = run('node', ['node', '--version']).strip()
        report['npm'] = run('npm', ['npm', '--version']).strip()
        report['pytest'] = run('pytest-version', [sys.executable, '-m', 'pytest', '--version']).strip()
        if report['node'] not in ('v22.19.0', 'v26.7.0') or report['pytest'] != 'pytest 8.4.2':
            raise RuntimeError('requires Node22.19.0/26.7.0 and pytest8.4.2')
        tracked = run('tracked', ['git', 'ls-files', '-z']).split('\0')
        (out / 'source-files.json').write_text(json.dumps({p: digest(ROOT / p) for p in tracked if p and (ROOT/p).is_file()}, indent=2)+'\n')
        run('npm-ci', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], ROOT/'typescript')
        run('typecheck', ['npm', 'run', 'typecheck'], ROOT/'typescript')
        tests = sorted((ROOT/'typescript/test').glob('*.test.ts'))
        if not tests:
            raise RuntimeError('empty TypeScript test collection')
        tap = run('typescript-tests', ['node', '--experimental-strip-types', '--test', '--test-reporter=tap', *map(str, tests)], ROOT/'typescript', limit=600)
        counters = {key: int(value) for key, value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$', tap, re.M)}
        if set(counters) != {'tests','pass','fail','cancelled','skipped','todo'} or counters['tests'] <= 0 or counters['pass'] != counters['tests'] or any(counters[k] for k in ('fail','cancelled','skipped','todo')):
            raise RuntimeError(f'incomplete/nonpassing TAP: {counters}')
        report['typescript'] = counters
        run('build', ['npm', 'run', 'build'], ROOT/'typescript')
        packed = json.loads(run('pack', ['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', str(out)], ROOT/'typescript'))
        package = out / packed[0]['filename']
        report['package'] = {'name': packed[0]['name'], 'version': packed[0]['version'], 'sha256': digest(package)}
        consumer = out / 'consumer'
        run('install', ['npm', 'install', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--prefix', str(consumer), str(package)])
        identities = {}
        with tarfile.open(package, 'r:gz') as archive:
            for member in archive.getmembers():
                if member.isdir(): continue
                relative = Path(member.name).relative_to('package')
                if not member.isfile() or '..' in relative.parts:
                    raise RuntimeError('unsafe package entry')
                installed = consumer/'node_modules/pan-agent'/relative
                expected = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
                if installed.is_symlink() or digest(installed) != expected:
                    raise RuntimeError(f'installed byte mismatch: {relative}')
                identities[str(relative)] = expected
        (out/'installed-files.json').write_text(json.dumps(identities, indent=2)+'\n')
        cli = consumer/'node_modules/.bin/pan-agent'
        if cli.resolve() != (consumer/'node_modules/pan-agent/bin/pan-agent.mjs').resolve():
            raise RuntimeError('CLI does not target installed package')
        env = {**os.environ, 'PAN_PACKAGE': str(package), 'PAN_PREINSTALLED_ROOT': str(consumer), 'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1'}
        run('installed-tests', [sys.executable, '-m', 'pytest', '-q', '-p', 'no:cacheprovider', 'tests/execution150/test_cli.py', '--basetemp', str(out/'pytest-cases'), '--junitxml', str(out/'installed.junit.xml')], env=env, limit=600)
        cases = ET.parse(out/'installed.junit.xml').getroot().findall('.//testcase')
        if not cases or any(c.find(tag) is not None for c in cases for tag in ('skipped','error','failure')):
            raise RuntimeError('empty/skipped/failing installed suite')
        report['installed_tests'] = len(cases)
        run('walkthrough', ['node', str(ROOT/'scripts/consumer-readiness/walkthrough.mjs'), str(cli), str(out/'walkthrough')])
        if not (out/'walkthrough/summary.json').is_file():
            raise RuntimeError('missing walkthrough summary')
        for c in report['commands']:
            for suffix in ('.stdout','.stderr'):
                if not (out/(c['name']+suffix)).is_file():
                    raise RuntimeError('missing command log')
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
