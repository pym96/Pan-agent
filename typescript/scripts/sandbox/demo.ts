import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { runCli } from '../../src/cli.ts';
import { FauxModelAdapter } from '../../src/providers/faux/faux-model-adapter.ts';
import { UNAVAILABLE, type ModelResponse, type JsonObject } from '../../src/protocol/canonical-protocol.ts';
import { DockerSandbox } from '../../src/sandbox/docker.ts';
const root = process.argv[2]!;
await mkdir(root + '/workspace');
await writeFile(root + '/input.txt', '21');
await writeFile(root + '/outside-sentinel', 'DO_NOT_EXPOSE');
const response = (name: string, args: JsonObject, id: number): ModelResponse => ({ kind: 'response', message: { role: 'assistant', timestamp: id, content: [{ type: 'tool_call', id: 'call-' + id, name, arguments: args }] }, stopReason: 'tool_calls', usage: UNAVAILABLE, identity: { provider: UNAVAILABLE, model: UNAVAILABLE, responseId: UNAVAILABLE } });
const calls: [
    string,
    JsonObject
][] = [['read', { path: '/inputs/input.txt' }], ['write', { path: 'result.txt', content: '21' }], ['edit', { path: 'result.txt', edits: [{ oldText: '21', newText: '42' }] }], ['bash', { command: 'test "$(cat result.txt)" = 42 && python -c "print(6*7)"', timeout: 5 }], ['read', { path: root + '/outside-sentinel' }], ['bash', { command: 'cat ' + root + '/outside-sentinel', timeout: 5 }]];
const adapter = new FauxModelAdapter([...calls.map(([n, a], i) => response(n, a, i)), { kind: 'response', message: { role: 'assistant', timestamp: 99, content: [{ type: 'text', text: 'Scripted provider: calculation complete; prohibited host read denied.' }] }, stopReason: 'stop', usage: UNAVAILABLE, identity: { provider: UNAVAILABLE, model: UNAVAILABLE, responseId: UNAVAILABLE } }]);
const observations: any[] = [];
const exit = await runCli(['--workspace', root + '/workspace', '--memory-root', root + '/memory', '--kernel', 'native', '--sandbox-root', root + '/states', '--sandbox-input', root + '/input.txt'], {
    home: root + '/home', createNativeAdapter: () => adapter,
    startTui: async (options) => {
        assert.equal(options.executionMode, 'sandbox');
        options.session.setApprovalChannel(async (r) => ({ requestId: r.requestId, decision: 'allow-once' }));
        const result = await options.session.runTask('Read input, write and edit result, compute, then attempt only the synthetic outside sentinel.');
        observations.push(result);
        assert.equal(result.status, 'completed');
        assert.equal(result.toolCalls, 6);
        await options.session.close();
        return 0;
    }, createPresentation: () => ({ observe: o => observations.push(o), settle: () => { }, details: () => { }, replay: () => { } } as any)
});
assert.equal(exit, 0);
const tools = adapter.state.requests[0]!.context.tools;
assert.deepEqual(tools.map(t => t.name).sort(), ['bash', 'edit', 'read', 'write']);
const settled = observations.filter(o => o.type === 'tool.settled');
assert.equal(settled.length, 6);
assert.ok(settled.slice(0, 4).every(o => !o.isError));
assert.ok(settled.slice(4).every(o => o.isError));
assert.ok(!JSON.stringify(adapter.state).includes('DO_NOT_EXPOSE'));
const states = await DockerSandbox.list(root + '/states');
assert.equal(states.length, 1);
const box = await DockerSandbox.load(root + '/states/' + states[0]!.runId);
assert.equal(box.identity.phase, 'stopped');
const verify = await box.verify('test "$(cat result.txt)" = 42', 5);
assert.equal(verify.code, 0);
await box.export(root + '/export');
await box.cleanup();
assert.equal(await readFile(root + '/export/files/result.txt', 'utf8'), '42');
assert.equal(await readFile(root + '/outside-sentinel', 'utf8'), 'DO_NOT_EXPOSE');
await writeFile(root + '/demo.json', JSON.stringify({ observations, adapter: adapter.state, identity: box.identity, verify }, null, 2));
console.log('DEMO_PASS', box.identity);
