// Exercise the same complete Session/Adapter tool-round suite through packed exports.
// Required explicit identity-matching consumer; no source fallback in this entry.
if (!process.env.PAN_TEST_ENTRY) throw Error('PAN_TEST_ENTRY required for packed KCONT94 controls');
await import('../../../typescript/test/kimi-continuation-94.test.ts');
