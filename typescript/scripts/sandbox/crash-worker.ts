import { DockerSandbox } from '../../src/sandbox/docker.ts';
const [root, point] = process.argv.slice(2);
const box = await DockerSandbox.prepare({ stateRoot: root + '/states', onCheckpoint: async (kind) => { if (kind === point) {
        process.send?.({ point });
        await new Promise(() => { setInterval(() => { }, 1000); });
    } } });
await box.call('bash', { command: 'echo once >> attempts.txt; sleep 5', timeout: 10 }, new AbortController().signal);
await box.stop();
await box.export(root + '/export');
