import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
test("C-PFREE-A03/A06 relocated compatibility preservation assertions", async () => {
	const compatibilitySource = await readFile(join(REPOSITORY_ROOT, "references/pi/src/pi-compatibility.ts"), "utf8");
	assert.match(compatibilitySource, /Transitional Pan↔Pi compatibility boundary/);
	assert.match(compatibilitySource, /Legacy test\/reference bridge/);
	assert.match(compatibilitySource, /#33 replaces/);
});
