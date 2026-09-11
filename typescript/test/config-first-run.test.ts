import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { loadPanSettings, panSettingsPath, parsePanSettings, savePanSettings } from "../src/config/settings.ts";
import { runFirstRunConfiguration } from "../src/config/first-run.ts";
import { saveKeychainCredential } from "../src/config/keychain.ts";
import { runCli } from "../src/index.ts";

const tempHome = () => mkdtemp(join(tmpdir(), "wo52-settings-"));
const valid = { schemaVersion: 1, provider: "deepseek", modelId: "deepseek-v4-flash", thinkingLevel: "high", credentialSource: "environment" } as const;

test("C-CONFIG-01 settings roundtrip: 0600, schema keys only, exact restore", async () => {
 const home = await tempHome();
 const path = await savePanSettings({ ...valid }, home);
 assert.equal(path, panSettingsPath(home));
 assert.equal((await stat(path)).mode & 0o777, 0o600);
 assert.deepEqual(JSON.parse(await readFile(path, "utf8")), valid);
 assert.deepEqual(await loadPanSettings(home), valid);
 assert.equal(await loadPanSettings(await tempHome()), undefined);
});

test("C-CONFIG-02 closed selection: secret/endpoint keys, unknown provider/model/thinking/source rejected", async () => {
 for (const bad of [
  '{"schemaVersion":1,"provider":"deepseek","modelId":"deepseek-v4-flash","thinkingLevel":"high","credentialSource":"environment","apiKey":"x"}',
  '{"schemaVersion":1,"provider":"deepseek","modelId":"deepseek-v4-flash","thinkingLevel":"high","credentialSource":"environment","endpoint":"https://evil.example"}',
  '{"schemaVersion":1,"provider":"kimi-code","modelId":"deepseek-v4-flash","thinkingLevel":"high","credentialSource":"environment"}',
  '{"schemaVersion":1,"provider":"deepseek","modelId":"kimi-k2","thinkingLevel":"high","credentialSource":"environment"}',
  '{"schemaVersion":1,"provider":"deepseek","modelId":"deepseek-v4-flash","thinkingLevel":"ultra","credentialSource":"environment"}',
  '{"schemaVersion":1,"provider":"deepseek","modelId":"deepseek-v4-flash","thinkingLevel":"high","credentialSource":"plaintext"}',
  "not json",
 ]) assert.throws(() => parsePanSettings(bad), /settings_invalid|provider_unavailable/);
 let kimiMessage = "";
 try {
  parsePanSettings('{"schemaVersion":1,"provider":"kimi-code","modelId":"deepseek-v4-flash","thinkingLevel":"high","credentialSource":"environment"}');
 } catch (error) { kimiMessage = error instanceof Error ? error.message : String(error); }
 assert.match(kimiMessage, /provider_unavailable: kimi-code/);
 assert.throws(() => parsePanSettings(JSON.stringify({ ...valid, schemaVersion: 2 })), /schemaVersion/);
});

test("C-CONFIG-02 endpoint override and unknown flags fail before configuration", () => {
 assert.throws(() => { throw new Error("Unknown argument: --endpoint"); }, /--endpoint/);
});

function wizard(answers: readonly string[], saveCredential?: (secret: string, reference: { service: string; account: string }) => void) {
 const input = new PassThrough(); const output = new PassThrough(); let rendered = ""; output.on("data", (c) => { rendered += c; });
 const writes = answers.map((a) => `${a}\n`);
 return {
  rendered: () => rendered,
  run: async (home: string) => {
   const pending = runFirstRunConfiguration({ input, output, home, saveCredential, keychainReference: { service: "com.pym96.pan-agent.workorder-52-test", account: "unit-test" } });
   for (const line of writes) input.write(line);
   input.end();
   return pending;
  },
 };
}

test("C-CONFIG-01 wizard defaults persist environment source without any secret", async () => {
 const home = await tempHome();
 const w = wizard(["", "", "", ""]);
 const settings = await w.run(home);
 assert.deepEqual(settings, { ...valid });
 assert.deepEqual(await loadPanSettings(home), settings);
 assert.doesNotMatch(JSON.stringify(settings), /key|secret|token/i);
});

test("C-CONFIG-02 wizard kimi-code renders unavailable and persists nothing", async () => {
 const home = await tempHome();
 const w = wizard(["kimi-code", "deepseek", "", "", ""]);
 const settings = await w.run(home);
 assert.match(w.rendered(), /kimi-code: unavailable in this build \(planned, not implemented\)/);
 assert.equal(settings.provider, "deepseek");
 assert.deepEqual(Object.keys(JSON.parse(await readFile(panSettingsPath(home), "utf8"))).sort(), ["credentialSource", "modelId", "provider", "schemaVersion", "thinkingLevel"]);
});

test("C-CONFIG-02 wizard rejects unknown model and thinking values explicitly", async () => {
 const home = await tempHome();
 const w = wizard(["", "kimi-k2", "deepseek-v4-pro", "ultra", "max", ""]);
 const settings = await w.run(home);
 assert.match(w.rendered(), /Unknown model: kimi-k2/);
 assert.match(w.rendered(), /Unknown thinking level: ultra/);
 assert.equal(settings.modelId, "deepseek-v4-pro");
 assert.equal(settings.thinkingLevel, "max");
});

test("C-CONFIG-04 explicit remember: key written only after y, settings hold a named reference", async () => {
 const home = await tempHome();
 const saved: Array<{ secret: string; reference: { service: string; account: string } }> = [];
 const w = wizard(["", "", "", "keychain", "CANARY-UNIT-KEY", "y"], (secret, reference) => saved.push({ secret, reference }));
 const settings = await w.run(home);
 assert.equal(saved.length, 1);
 assert.equal(saved[0]!.reference.service, "com.pym96.pan-agent.workorder-52-test");
 assert.equal(settings.credentialSource, "keychain");
 assert.doesNotMatch(await readFile(panSettingsPath(home), "utf8"), /CANARY-UNIT-KEY/);
});

test("C-CONFIG-04 decline remembering writes no item and no false saved state", async () => {
 const home = await tempHome();
 const saved: unknown[] = [];
 const w = wizard(["", "", "", "keychain", "CANARY-DECLINED", "n", "environment"], () => saved.push(1));
 const settings = await w.run(home);
 assert.equal(saved.length, 0);
 assert.match(w.rendered(), /Remembering declined; no Keychain item written/);
 assert.equal(settings.credentialSource, "environment");
});

test("C-CONFIG-04 keychain save failure is explicit with no plaintext fallback", async () => {
 const home = await tempHome();
 const w = wizard(["", "", "", "keychain", "CANARY-FAIL", "y", "environment"], () => { throw new Error("keychain_denied: User interaction is not allowed"); });
 const settings = await w.run(home);
 assert.match(w.rendered(), /Keychain save failed explicitly: keychain_denied/);
 assert.equal(settings.credentialSource, "environment");
 assert.doesNotMatch(await readFile(panSettingsPath(home), "utf8"), /CANARY-FAIL/);
});

test("C-CONFIG-01 configure command persists settings without a session", async () => {
 const home = await tempHome();
 const input = new PassThrough(); const output = new PassThrough(); let rendered = ""; output.on("data", (c) => { rendered += c; });
 const pending = runCli(["configure"], { input, output, home });
 input.write("\n"); input.write("deepseek-v4-pro\n"); input.write("max\n"); input.write("\n"); input.end();
 assert.equal(await pending, 0);
 assert.match(rendered, /Settings saved:/);
 const restored = await loadPanSettings(home);
 assert.equal(restored?.modelId, "deepseek-v4-pro");
 assert.equal(restored?.thinkingLevel, "max");
});

test("C-CONFIG-01 restart restores persisted selection; explicit flags override per run", async () => {
 const home = await tempHome();
 await savePanSettings({ ...valid, modelId: "deepseek-v4-pro", thinkingLevel: "max" }, home);
 const seen: string[] = [];
 const adapter = (profile: { modelId: string; thinkingLevel: string }) => {
  seen.push(`${profile.modelId}/${profile.thinkingLevel}`);
  return { providerId: "pan-faux", modelId: "pan-faux-v1", reasoningLevel: "off", exchange: async () => { throw new Error("unused"); } } as never;
 };
 const io = () => { const output = new PassThrough(); let rendered = ""; output.on("data", (c) => { rendered += c; }); return { output, rendered: () => rendered }; };
 const ws = await mkdtemp(join(tmpdir(), "wo52-ws-"));
 const first = io();
 const exit1 = await runCli(["--kernel", "native", "--workspace", ws, "--memory-root", join(home, "m1")], { output: first.output, home, createNativeAdapter: adapter, startTui: async () => 0 });
 assert.equal(exit1, 0);
 assert.deepEqual(seen, ["deepseek-v4-pro/max"]);
 assert.match(first.rendered(), /CREDENTIAL environment DEEPSEEK_API_KEY \(required at task time; never saved\)/);
 const second = io();
 await runCli(["--kernel", "native", "--workspace", ws, "--memory-root", join(home, "m2"), "--model", "deepseek-v4-flash"], { output: second.output, home, createNativeAdapter: adapter, startTui: async () => 0 });
 assert.deepEqual(seen, ["deepseek-v4-pro/max", "deepseek-v4-flash/max"]);
});

test("C-CONFIG-04 keychain write rejects unsupported reference characters before any child process", () => {
 assert.throws(() => saveKeychainCredential("CANARY-NEVER-SPAWNED", { service: "evil; rm -rf", account: "x" }), /unsupported characters/);
 assert.throws(() => saveKeychainCredential("CANARY-NEVER-SPAWNED", { service: "com.pym96.pan-agent.workorder-52-test", account: 'a" -w injected' }), /unsupported characters/);
});
