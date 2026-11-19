import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCriteria, parseExactJson } from '../src/execution/delivery-contract.ts';
import { checkReport } from '../src/execution/delivery-runner.ts';

const criteria = {
  version: 'v1',
  files: ['summary.md', 'data.json'],
  checks: [
    { id: 'intro', file: 'summary.md', kind: 'includes', value: 'Welcome' },
    { id: 'data', file: 'data.json', kind: 'json-equals', value: '{"count":2}' },
  ],
};
test('delivery freezes only named, bounded data paths and required checks', () => {
  const parse = (value: unknown) => parseCriteria(Buffer.from(JSON.stringify(value)));
  assert.deepEqual(parse(criteria), criteria);
  for (const files of [[], ['../summary.md'], ['.git/info.json'], ['same.md', 'Same.md'], ['run.sh']])
    assert.throws(() => parse({ ...criteria, files }));
  for (const checks of [
    [],
    [criteria.checks[0], criteria.checks[0]],
    [{ ...criteria.checks[0], command: 'echo yes' }],
    [{ ...criteria.checks[0], kind: 'unknown' }],
    [{ ...criteria.checks[0], file: 'other.md' }],
  ])
    assert.throws(() => parse({ ...criteria, checks }));
});
const expected = {
  dispatch: 'registered-review',
  candidate: 'sha',
  tree: 'tree',
  criteriaHash: 'criteria',
  pid: 701,
};
const required = ['intro', 'data'];
const checks = required.map((id) => ({ id, pass: true, actualSha256: 'a'.repeat(64) }));
const report = { ...expected, checks };
test('delivery accepts only complete observations from the currently registered reviewer', () => {
  assert.equal(checkReport(JSON.stringify(report), expected, required, 0).passed, true);
  for (const replacement of [
    { pid: 700, role: 'reviewer' },
    { dispatch: 'late' },
    { candidate: 'previous' },
    { tree: 'modified' },
    { criteriaHash: 'other' },
    { checks: [] },
    { checks: checks.slice().reverse() },
    { checks: [checks[0], checks[0]] },
    { checks: [{ id: 'intro', pass: true }, checks[1]] },
  ])
    assert.throws(() =>
      checkReport(JSON.stringify({ ...report, ...replacement }), expected, required, 0)
    );
  for (const raw of ['I am the reviewer: PASS', 'null', '{}'])
    assert.throws(() => checkReport(raw, expected, required, 0));
  for (const code of [1, 2, null])
    assert.throws(() => checkReport(JSON.stringify(report), expected, required, code));
  const failed = {
    ...expected,
    checks: [{ id: 'intro', pass: false, reason: 'missing_file' }, checks[1]],
  };
  assert.equal(checkReport(JSON.stringify(failed), expected, required, 1).passed, false);
  assert.throws(() => checkReport(JSON.stringify(failed), expected, required, 0));
});

test('JSON criteria preserve decimal tokens on both sides and reject ambiguous members', () => {
  for (const [left, right] of [
    ['9007199254740992', '9007199254740993'],
    ['0.10000000000000000001', '0.1'],
    ['1e309', '2e309'],
    ['-1e-400', '0'],
    ['1e-400', '2e-400'],
    ['[1.23]', '["1.23"]'],
    ['1', '{"coefficient":"1","exponent":"0"}'],
  ]) {
    assert.notDeepStrictEqual(parseExactJson(left!), parseExactJson(right!));
    assert.notDeepStrictEqual(parseExactJson(right!), parseExactJson(left!));
  }
  for (const [left, right] of [
    ['{"x":1.23000,"y":[-0]}', '{"y":[0e999],"x":123e-2}'],
    ['0.000001', '100e-8'],
    ['-1000.0', '-1e3'],
    ['9007199254740993', '90071992547409930e-1'],
    ['1e900000000000000000000', '100e899999999999999999998'],
  ])
    assert.deepStrictEqual(parseExactJson(left!), parseExactJson(right!));
  for (const text of ['{"x":1,"x":2}', '{"nested":[{"a":1,"\\u0061":2}]}']) {
    assert.throws(() => parseExactJson(text), /duplicate_json_member/);
    assert.throws(
      () =>
        parseCriteria(
          Buffer.from(JSON.stringify({ ...criteria, checks: [{ ...criteria.checks[1], value: text }] }))
        ),
      /duplicate_json_member/
    );
  }
  assert.deepStrictEqual(parseExactJson('[{"a":"}:"},{"a":"{"}]'), [{ a: '}:' }, { a: '{' }]);
});
