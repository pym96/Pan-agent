import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function text(path: string): Promise<string> {
	return readFile(join(ROOT, path), "utf8");
}

function markdownSection(document: string, heading: string): string {
	const start = document.indexOf(`${heading}\n`);
	assert.notEqual(start, -1, `missing section: ${heading}`);
	const bodyStart = start + heading.length + 1;
	const next = document.indexOf("\n## ", bodyStart);
	return document.slice(bodyStart, next === -1 ? document.length : next);
}

test("C-CUT-01 default README route installs and launches only the TypeScript product", async () => {
	const readme = await text("README.md");
	const defaultRoute = markdownSection(
		readme,
		"## Default product path | TypeScript/Pi",
	);
	assert.match(defaultRoute, /npm --prefix typescript ci --ignore-scripts/);
	assert.match(defaultRoute, /read -s DEEPSEEK_API_KEY/);
	assert.match(defaultRoute, /export DEEPSEEK_API_KEY/);
	assert.match(defaultRoute, /npm --prefix typescript run agent --/);
	assert.match(defaultRoute, /--workspace \/absolute\/path\/to\/workspace/);
	assert.match(defaultRoute, /--memory-root \/absolute\/path\/to\/memory/);
	assert.doesNotMatch(defaultRoute, /python3|PYTHONPATH|pip install/i);
});

test("C-CUT-04 and C-CUT-08 classify every retained non-product lane", async () => {
	const readme = await text("README.md");
	for (const row of [
		"| TypeScript/Pi working stack | **authoritative product** |",
		"| Python evented TUI/runtime | **reference-only** |",
		"| ReAct mechanism | **experiment/reference** |",
		"| Protocol reliability | **experiment/reference** |",
		"| DeepSeek campaigns | **experiment/reference** |",
		"| Proof packs and evaluators | **experiment/reference** |",
		"| Benchmark machinery | **experiment/reference** |",
	]) {
		assert.ok(readme.includes(row), `missing classification row: ${row}`);
	}
	assert.match(readme, /Reference-only Python TUI/);
	assert.match(readme, /python3 -m workspace_agent_harness\.tui/);

	const designIndex = await text("docs/design/README.md");
	assert.match(designIndex, /## Authoritative product/);
	assert.match(designIndex, /## Reference-only implementation/);
	assert.match(designIndex, /## Historical experiment and evaluation designs/);
});

test("C-CUT-06 assignment and ADR record architectural supersession", async () => {
	const assignment = await text("docs/agents/current-assignment.md");
	assert.match(
		assignment,
		/## Active mission \| WorkOrder #24 authoritative TypeScript cutover/,
	);
	assert.match(assignment, /Bash-only ReAct lane is retired as an active mission/);

	const adr = await text(
		"docs/adr/0016-authoritative-typescript-product-path.md",
	);
	assert.match(adr, /workspace and authority/);
	assert.match(adr, /attributable outcomes/);
	assert.match(adr, /canonical tool semantics/);
	assert.match(adr, /Context behavior/);
	assert.match(adr, /events/);
	assert.match(adr, /Python.*reference-only/s);
	assert.match(adr, /historical Evidence.*preserved/s);
});

test("C-CUT-03 and C-CUT-05 conformance artifacts are language-neutral and the TypeScript specification is readable", async () => {
	const manifest = JSON.parse(
		await text("conformance/fixtures/v1/manifest.json"),
	) as { cases: Array<{ file: string }> };
	const artifacts = await Promise.all([
		text("conformance/README.md"),
		...manifest.cases.map((entry) =>
			text(`conformance/fixtures/v1/${entry.file}`),
		),
	]);
	for (const artifact of artifacts) {
		assert.doesNotMatch(artifact, /workspace_agent_harness|\.py\b|python import/i);
	}
	const runner = await text("typescript/test/conformance.test.ts");
	assert.doesNotMatch(runner, /workspace_agent_harness|from .*\.py|import .*\.py/i);
	assert.match(
		await text("docs/design/typescript-pi-general-agent-working-stack.md"),
		/GeneralAgentSession/,
	);
});

test("C-CUT-09 cutover documentation has no broken local links", async () => {
	const referenceRoot = join(ROOT, "workspace_agent_harness");
	const referencePackagePresent = await access(referenceRoot).then(
		() => true,
		() => false,
	);
	const documents = [
		"README.md",
		"docs/adr/README.md",
		"docs/adr/0016-authoritative-typescript-product-path.md",
		"docs/agents/current-assignment.md",
		"docs/design/README.md",
		"docs/design/typescript-pi-general-agent-working-stack.md",
		"scripts/README.md",
		"tests/README.md",
		"typescript/README.md",
	];
	for (const document of documents) {
		const body = await text(document);
		for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
			const target = match[1] ?? "";
			assert.notEqual(target, "", `${document} has an empty local link`);
			if (/^(?:https?:|mailto:|#)/.test(target)) {
				continue;
			}
			const path = target.split("#", 1)[0] ?? "";
			assert.notEqual(path, "", `${document} has an empty local path`);
			const resolvedTarget = resolve(dirname(join(ROOT, document)), path);
			if (
				!referencePackagePresent &&
				(resolvedTarget === referenceRoot ||
					resolvedTarget.startsWith(`${referenceRoot}${sep}`))
			) {
				continue;
			}
			await assert.doesNotReject(
				access(resolvedTarget),
				`${document} has broken local link: ${target}`,
			);
		}
	}
});
