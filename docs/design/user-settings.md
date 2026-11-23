# User settings and tool deny rules

These settings commands and deny rules ship in **pan-agent@0.1.10** on npm. The older GitHub v0.1.9 archive predates them.

## Find and inspect your settings

Pan uses one user file: `~/.pan-agent/settings.json`. Run `configure` first, then edit the ordinary preferences in that file with your editor. API keys belong in the selected environment variable or macOS Keychain, never in this JSON.

With a build containing this feature:

```sh
pan-agent settings path
pan-agent settings show
pan-agent settings validate
```

`path` prints the location even if the file is absent or invalid. `show` prints validated, stored JSON; an absent file prints `settings_absent` instead of inventing saved defaults. `validate` exits 0 only for an existing valid file; absent or invalid settings exit 2. Invalid JSON, unknown fields and invalid rules produce a diagnostic without echoing their values. These commands do not write settings, fetch a key, start a session or contact a provider. `show` describes stored preferences, not every effective runtime option.

To inspect current source from the repository root, after installing the development dependencies:

```sh
npm --prefix typescript ci --ignore-scripts
node --experimental-strip-types typescript/src/cli.ts settings path
node --experimental-strip-types typescript/src/cli.ts settings validate
node --experimental-strip-types typescript/src/cli.ts settings show > pan-settings-export.json
```

Export is useful only when settings exist and validate successfully. Keep the export separate from the source file: shell redirection to `settings.json` would truncate it before Pan reads it. For a compiled local launcher:

```sh
npm --prefix typescript run build
node typescript/bin/pan-agent.mjs settings path
```

The [package guide](../../typescript/README.md#build-a-package-developers) explains building a tarball. A private install of that tarball runs the same compiled launcher with no compiler or source checkout at runtime. Record the candidate commit and tarball hash to identify the exact bytes installed.

## Configuration example

This is a complete valid file for environment credentials:

```json
{
  "schemaVersion": 1,
  "provider": "deepseek",
  "modelId": "deepseek-v4-flash",
  "thinkingLevel": "high",
  "credentialSource": "environment",
  "protectedPaths": ["private"],
  "permissions": {
    "deny": ["bash(*git reset --hard*)", "retrieve"]
  },
  "maxAttachmentBytes": 1048576
}
```

`protectedPaths`, `permissions` and `maxAttachmentBytes` are optional. Existing schema version 1 files remain valid. `configure` changes the provider/model/thinking/credential-source selections while preserving valid optional preferences. Invalid existing settings stop configuration before any credential mutation; repair the reported field before retrying. Saving validates the complete configuration before writing and retains an atomic replacement, file mode 0600 and directory mode 0700.

Attachment limits are positive safe integers in bytes. The order is explicit `--max-attachment-bytes` flag, then saved `maxAttachmentBytes`, then the existing 1,048,576-byte default. This is an aggregate attachment snapshot limit, not a model token limit. It does not truncate content. Provider/model choices and credential precedence retain their existing behavior; Kimi uses its saved model/thinking selection and rejects those CLI overrides.

## Rule grammar

| Rule | Meaning |
| --- | --- |
| `read`, `write`, `edit`, `bash`, `retrieve`, `mcp_report`, `web_fetch` | Deny every invocation of that exact native tool name. |
| `bash(PATTERN)` | Deny a bash request whose entire command string matches PATTERN. |

PATTERN must be nonempty. Matching is case-sensitive. Only `*` is special: it matches any sequence, including an empty sequence and newlines. All other characters are literal, including `?`, `[`, `]`, `.`, backslashes, parentheses and shell metacharacters. There is no escape syntax for a literal `*`. This is Pan's grammar; Claude-style `Bash(...)`, regular expressions, negation, aliases and rules for other tools are rejected.

Examples:

| Rule | Command string | Matches? |
| --- | --- | --- |
| `bash(*git reset --hard*)` | `git reset --hard HEAD` | Yes |
| `bash(*git reset --hard*)` | `echo ready; git reset --hard HEAD` | Yes |
| `bash(*git reset --hard*)` | `git RESET --hard HEAD` | No |
| `bash(git reset --hard)` | `echo git reset --hard` | No |
| `bash(echo [x]?)` | `echo [x]?` | Yes; brackets and `?` are literal |
| `bash(a*b)` | `a`, then a newline, then `b` | Yes |

At most 256 rules are accepted, each at most 4096 JavaScript string code units including `bash(` and `)`. These caps bound policy size and matching work for a small user preference list; they are parsing-resource choices, not a security guarantee. Rules retain array order; the first match is reported. Empty `deny` is valid and adds no denials.

## When policy takes effect

The normal TUI startup path loads the file and passes its policy to `GeneralAgentSession`. Session construction validates and copies/freezes the deny array. Editing settings affects the next session; it cannot loosen the current session through hot reload or mutation of a caller's array.

For Native sessions, the shared authorization wrapper checks the policy before the tool implementation or approval callback. The same native names cover host tools and sandbox tools. A matching request never reaches file/shell/retrieval execution or the sandbox's `box.call`, including after Shell has been trusted. A nonmatch continues through the existing protected-path, approval, cancellation and sandbox rules. Empty `protectedPaths` does not remove built-in protection for `.git`, `.ssh`, `.pan-agent`, `.env` and `.npmrc` classes.

The observable tool result and sealed archive carry `details.code = "permission_denied"` and an `authorization` object with `reason = "settings_deny"`, the first matching `rule`, `policyRevision`, session/run/call IDs, tool name and an arguments hash. The policy revision is SHA-256 of the UTF-8 `JSON.stringify(["pan-deny-v1", {"deny": rules}])` snapshot. It is a policy identity, not a signature or tamper-proof seal. A denial contains no raw invocation arguments; the ordinary archive still follows its existing request-recording contract.

Library callers must explicitly pass `authorization: { permissions: { deny: [...] } }` to a Native `GeneralAgentSession`. They do not automatically read the user's settings. A nonempty deny policy with an opaque injected `AgentKernel` fails construction with `permissions_unsupported: injected kernel`, because that kernel owns tool dispatch beyond the shared wrapper. Injected kernels without deny rules retain their previous behavior.

Management commands (`mcp`, `retrieval`, `sandbox`, `loop`, `goal`, `execution`), the fixed offline `demo`, and library compositions that do not supply this policy are outside TUI settings propagation. A rule such as `retrieve` denies the model's retrieval tool; it does not disable the separate `retrieval configure` command. Attachment selection, model submission and provider network access are also separate from tool-name denials.

## Limits

A command pattern filters request text. It does not interpret shell semantics: scripts, interpreters, alternate spelling, quoting or an equivalent command can perform the same operation without matching the literal pattern. Deny all `bash` requests to remove that tool's shell access. The existing sandbox offers a separate execution boundary; deny rules do not add mounts, devices, network access or stronger sandbox isolation.

An already approved host shell has host-user authority and may modify user-owned settings. It cannot alter the copied policy for the current session through that file, but the next session will read the changed file. This feature does not promise hostile-code resistance or next-session tamper resistance. Project-local settings, recursive merges, managed policy, allow/bypass rules and hooks are not implemented.

[Source and installed checks](../../scripts/runtime-ci/README.md) exercise both denied effects and legitimate controls. [Candidate evidence](../evidence/settings/README.md) remains subject to independent review and the explicit high-risk Human gate.
