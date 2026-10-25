import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DockerSandbox } from '../../src/sandbox/docker.ts';
const root = process.argv[2]!;
const receipts = [];
for (const point of ['effective_profile', 'command_started', 'archive_directory_committed']) {
    const dir = root + '/' + point;
    await mkdir(dir);
    const child = fork(fileURLToPath(new URL('./crash-worker.ts', import.meta.url)), [dir, point], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let output = '';
    child.stdout?.on('data', b => output += b);
    child.stderr?.on('data', b => output += b);
    await new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(Error('checkpoint not reached ' + output)), 20000); child.once('message', () => { clearTimeout(t); resolve(); }); child.once('exit', code => { clearTimeout(t); reject(Error('early worker exit ' + code + ' ' + output)); }); });
    if (point === 'command_started')
        await new Promise(r => setTimeout(r, 300));
    const exited = new Promise(r => child.once('exit', r));
    child.kill('SIGKILL');
    await exited;
    const states = await DockerSandbox.list(dir + '/states');
    assert.equal(states.length, 1);
    const box = await DockerSandbox.load(dir + '/states/' + states[0]!.runId);
    await box.recover();
    await box.recover();
    assert.equal(box.identity.phase, 'stopped');
    await box.export(dir + '/export');
    await box.cleanup();
    await box.cleanup();
    if (point !== 'effective_profile')
        assert.equal(await readFile(dir + '/export/files/attempts.txt', 'utf8'), 'once\n');
    receipts.push({ point, identity: box.identity, output, noReplay: true });
    await writeFile(root + '/results.json', JSON.stringify(receipts, null, 2));
}
console.log('CRASH_RECOVERY_PASS');
