# DeepSeek Live trusted-local shell + Human PTY smoke candidate Evidence — 2026-09-02

- Status: Working Agent candidate Evidence, repaired after two rejected independent Verdicts ([issue #22 comment 5508347506](https://github.com/pym96/workspace-agent-harness/issues/22#issuecomment-5508347506), [issue #22 comment 5509294824](https://github.com/pym96/workspace-agent-harness/issues/22#issuecomment-5509294824)); still requires a different-session **high-risk** independent Regulator review (shell execution, Human authority boundary, credential handling) before any acceptance
- Session role: Working Agent (Builder)
- Base commit: `4ebf660b7166724e604263e6c3d60a139bf0db8b` (accepted `main`)
- Candidate code bytes for the final smoke: `09ccaa85a303babcec74ab62ebe6a7d963641950` on `workorder/22-candidate`; later commits on that branch add the four Verdict-mandated offline repairs with their regression tests plus this Evidence update — no Provider, balance, or smoke call was made after `09ccaa8`, and the Handoff states the exact final SHA
- WorkOrder: [Issue #22](https://github.com/pym96/workspace-agent-harness/issues/22) superseding Agent brief, including its durable live-development authorization: real `deepseek-v4-flash` use, combined `CNY 2.00` ceiling, exact candidate bytes, one pre-run and one post-run balance observation
- Observed external use across the whole WorkOrder, recomputed from all raw retained artifacts after the rejected Verdict: `2` official balance queries; `55` Gateway exchange attempts (`model.exchange_started`) across `13` Run Event Logs (12 valid terminal hash chains plus the documented incomplete abandoned `49ac7d06` log); `53` settled and `2` failed exchange events (`reasoning_content_missing`, `transport_unavailable`); `54` retained model HTTP response bodies (every settled exchange plus the protocol-failed response; the transport failure retained none); all `54` responses carry numeric usage totaling `221,694` input + `37,826` output = `259,520` Tokens; `12` terminal Run summaries plus the abandoned Run account for the full activity. The four responses (15,118 Tokens) of the abandoned Run are included in all totals above — an earlier revision of this document undercounted by summing only terminal summaries (`51`/`50`), which the rejected Verdict established as blocking

## Final smoke (the acceptance run)

The acceptance smoke ran interactively on exact candidate bytes `09ccaa85a303babcec74ab62ebe6a7d963641950` (`git rev-parse HEAD` was confirmed in the operating terminal before launch), via the documented command with `--live-deepseek --trusted-local`, workspace `.runs/workorder-22-smoke-2026-09-02/workspace-3`, session root `session-4`. The Human submitted this task verbatim:

```text
运行本地的贪吃蛇
```

Causal sequence from the retained Event Log (`run-event/v1`, hash-chained):

| # | Event | Observation |
|---|---|---|
| 1 | `inspect_workspace` | empty except `two_sum.cpp` from the earlier Human task |
| 2 | `read_file two_sum.cpp` | exact-text retained Observation |
| 3 | `trusted_local_shell` `uname -a; python3 --version; which python3 gcc g++` | exit `0`; bounded preview + lossless `command-001/{stdout,stderr}.raw` identities |
| 4 | `write_file snake.py` | new 5,000+ byte curses snake program |
| 5 | `verify_workspace python-syntax` | pass |
| 6 | `write_file snake.py` | second revision |
| 7 | `human_interactive_pty` proposal `python3 snake.py` | `tool.human_handoff_requested` carried the exact command, resolved cwd, and `current-host-user` authority; `tool.human_handoff_accepted` records `child_started: false` — no child existed before the Human typed `y` |
| 8 | PTY attach | `tool.pty_started` after acceptance; Human keyboard operated the game for `11,151 ms`; clean quit |
| 9 | settlement | `tool.pty_settled status=completed exit_code=0`, transcript identity `sha256:a5311bc6…` (37,708 bytes), terminal control returned to the TUI; only the typed settlement became the next model Observation |
| 10 | terminal | `run.terminal status=completed` with a final answer summarizing the retained facts |

Terminal metadata: `model_calls=8`, `tool_calls=7`, `steps=7`, usage `30,758 in / 5,087 out / 35,845 total` Tokens, `known_calls=8/8`, changed workspace paths `["snake.py"]`. Requested/returned model was `deepseek-v4-flash` throughout; cost fields remain `unreported` (the provider response carries no cost field; see the balance section).

Retained artifact identities (secret-free locator `.runs/workorder-22-smoke-2026-09-02/`):

| Material | SHA-256 |
|---|---|
| Run Event Log (`session-4/runs/98a98ed909af4808a849b662641fac85/events.jsonl`) | `adcd63e4a4670db929d5e8b12a73a60716d218efc6a0216c5d133bdcb798a0fe` |
| Run summary | `3c9b117b38ebcb65512f9b6910b8d846946f52817772ceea581fd3d2807c050e` |
| PTY transcript (`pty-001/transcript.raw`, local-only provenance, never replayed to the model) | `a5311bc66b04c141cae1d8ff99af6fe39eb371430fb11852245e15d63e4bb354` |
| Shell `command-001/stdout.raw` / `stderr.raw` | `9b3fdbd1cd801b71a637fa085c3b1a81c4a0b694a77f37dc5478e72aece1cbd7` / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Workspace `snake.py` after the Run | `d8ca412ff43654193d766c67202363f74cb1253304c05ca9b101ea4d90ff0dda` |
| Provider exchanges 001–008 (`request.body` / `response.body` / `receipt.json`) | `e9384765f7f0eb44`/`5f26ebf6b117158e`/`1ec2c2500b7d8126`; `0a294ca25cd346d9`/`d91f4fe91f4c2431`/`1f0621e991c982b1`; `48a9c084e82cf9a8`/`9bebe1fd3568a6a4`/`03ba8ff5a05465b4`; `abaac7b37f425c29`/`65c16b22a6497116`/`d3a4f98cd3fb05c8`; `9785a285528f6cb6`/`675870ecf1f41240`/`bbe24d94995bfbe7`; `6a9c7a3408563cee`/`0fbd35fbf30471c3`/`af9d09030e12ae97`; `8941f9edce051664`/`95277821cf1011f7`/`c78dbdad155a42b5`; `53076d044423f172`/`790a871f90df2def`/`fc2aa5bfb6656877` (16-hex prefixes shown; full values recomputed from the retained files) |
| Balance before body / receipt | `fa0a1ab27080ab1dce8d0c37b82fc89f6b0d3835e4b680a1b0c6627502b74497` / `38c059c131d8229693bf38188ce4179bac4c9c0a37dce11b8df1efb4cf0221df` |
| Balance after body / receipt | `1c80bc2e64fa1f45ba80b58595977805e45b9b9a7b853bcf83c75a5f3bb80e5c` / `ade1edb816a109f4ab85b51581c9da96addc05af9e93dfeef257689fc2d0da64` |

A targeted byte search confirmed the Provider credential string appears in **zero** retained smoke artifacts (request/response bodies, receipts, event logs, tool artifacts). Provider reasoning text stays inside the ignored local response artifacts only; it is never rendered by the TUI or copied here.

## Balance and spend boundary

The two authorized official balance observations returned HTTP `200`:

- before (immediately preceding the first post-repair smoke attempt this afternoon): reported CNY total `6.16`;
- after (after the final smoke): reported CNY total `5.49`;
- observed window delta: **CNY `0.67`**, under the combined `CNY 2.00` ceiling.

Boundary qualifications: the balance endpoint reports hundredth-precision CNY; the `0.67` delta is the whole account's spend inside the observation window (covering attempts `e926148d`, `f6569a3a`, `7c59bf2a`, `8723ec70`, `98a98ed9`, `8a2e86c2` — 70,971 reported Tokens) and is an upper bound for #22 usage in that window; the earlier same-day attempts (`a07eab23`, `0a88bc23`, `f7a017c8` — 173,431 reported Tokens) preceded the first authorized balance observation, so their spend is not balance-measured and is reported by Token count only. No cost field exists in Provider responses; all `cost` fields remain `unreported`.

## Retained development attempts and repairs

All attempts are retained under `.runs/` and remain distinguishable; nothing was replaced or rerun silently. Event Log identities (full SHA-256 recomputed from the retained files):

| Attempt (bytes) | Run | Terminal | Model calls | Reported Tokens | Event Log SHA-256 |
|---|---|---|---|---|---|
| `b40df8a` initial candidate | `49ac7d06` | no terminal event — session abandoned at a pending PTY confirmation ("我要继续玩，请求"); this exact hang motivated repair `81ace71` | 4 (per retained responses; no summary exists) | 15,118 | `12e1c61877913b70d3b1488fe6e0a4c0bb6e71ec693b406d6ba53636dd81ca13` |
| `b40df8a` | `601310cf` | `completed` (snake created; PTY path exercised) | 5 | 23,166 | `d093290636401d4f53b8be3da0450bff826084842ea83014ba3912cfd87a1626` |
| `b40df8a` | `68a01e3a` | `completed` (snake.py + snake.html) | 7 | 77,831 | `e2f747c11a0b9554c70b5dde9b142bea9d91563d6368743142c019925276c9b4` |
| `81ace71` | `8d94f3e5` | `step_limit` — legitimate multi-part trusted-local task (pi-mono environment setup + snake) exhausted the then-`12`-step budget during exploration | 8 | 47,585 | `63ac6493efaa62cebe5b71b1e569161ea73eabc7a93ff97b370e24c107965d63` |
| `81ace71` | `cb86d515` | `abstained` — non-task input ("SessionRole: Working Agent (Builder)."), correct abstain | 2 | 2,943 | `6a83c5c85b4143ecd263fc9215d74903b585f1724cb41c0d4cace1bca2ce29a1` |
| `81ace71` | `e844f9c7` | `abstained` — non-task input ("1"), correct abstain | 2 | 2,939 | `0393c156761924ae9615c0502ac4d5c98aaad8385e9d7fe769b63191fddbd72b` |
| `81ace71` | `f96c9fa0` | `model_error` — `reasoning_content_missing`: a valid ToolCall whose Provider reasoning was an empty string was rejected | 3 | 18,967 | `ac30348a170421f04f31e335313f713dd5b482c91ee9d38973f47bbcaab134fe` |
| `e004d8b` | `e926148d` | `model_error` — `transport_unavailable: TimeoutError`: second exchange stalled in server-side Thinking past the then-`60`-second HTTP timeout | 2 | 1,526 (1 known call) | `12f29b25e26827ebf76ce905ce36959aa1f92257bef498a0160ad16bd3be2ce3` |
| `e004d8b` | `f6569a3a` | `time_limit` — full snake/shell/PTY flow succeeded (Human operated 26.9 s, clean `q`, exit `0`), but a `768`-second Human confirmation wait counts against the then-`300`-second Run clock, so no final `complete` was emitted | 4 | 12,312 | `331f574c0853a52ec4f73ddbdce551845153615f5878d0db9414377c36031de3` |
| `09ccaa8` | `7c59bf2a` | `completed` — Human's own `two_sum.cpp` inspection task (real shell execution; not the acceptance task) | 4 | 8,940 | `147384da6cd1ad74ace8dd89b846afc61fa07b555404e011a8a24584daf60efb` |
| `09ccaa8` | `8723ec70` | `completed` — Human's own LeetCode C++ authoring task (write + syntax check + real shell compile/test) | 4 | 9,415 | `617f30e5f88a5c84dc7df69791f4469f4e0b26cc2b5d3567dac964a418738a7f` |
| `09ccaa8` | `8a2e86c2` | `abstained` — non-task input, correct abstain | 2 | 2,933 | `fc73c9c5f6fe5c3a22fbee67eb9580c87b1df011c3380ba9220975a11e8fd659` |
| `09ccaa8` | `98a98ed9` | **`completed` — the acceptance smoke described above** | 8 | 35,845 | `adcd63e4a4670db929d5e8b12a73a60716d218efc6a0216c5d133bdcb798a0fe` |

Defects exposed by Human-operated attempts and their repairs (each repair is a separate commit on `workorder/22-candidate`; no Provider call was made while repairing):

1. `81ace71` — cancellation while a PTY confirmation was still pending blocked waiting for another input line (the `49ac7d06` hang above); now interrupts the wait, records `human_handoff_cancelled`, and starts no child (red/green deterministic coverage).
2. `6546aa7` — identity-bound opt-in admission treats absent/null/empty-string Provider `reasoning_content` as canonical `None`; non-text reasoning remains a protocol failure (red/green deterministic coverage; the historical #19/#20 campaign contract stays reasoning-required and unchanged). After the rejected Verdict this admission applies only to the trusted-local profile — see repair R1 below.
3. `8bdcf66` — interactive Run budget raised from `12` steps / `16` model calls to `100` / `160` after the legitimate `step_limit` above; scoped to the trusted-local profile by R1.
4. `e004d8b` — per-call HTTP transport timeout raised from `60` to `240` seconds after the Thinking-stall `transport_unavailable`; scoped to the trusted-local profile by R1 and pinned by regression tests.
5. `09ccaa8` — interactive Run wall clock raised from `300` to `3600` seconds after Human-paced confirmation/PTY time expired the budget mid-flow; scoped to the trusted-local profile by R1.

The rejected Verdict ([comment 5508347506](https://github.com/pym96/workspace-agent-harness/issues/22#issuecomment-5508347506)) established four blocking defects; the repair commit carrying this updated Evidence fixes all four offline (exact SHA in the new Handoff), with no new Provider, balance, or smoke call:

- **R1 — default-off drift**: the raised Run/transport limits and optional-reasoning admission previously leaked into the default no-shell profile. The default-off profile is restored to the accepted #21 values (`12`/`16`/`300`, `60`-second transport timeout, reasoning-required admission); the raised values and optional reasoning now apply only after explicit trusted-local opt-in. Regression tests instantiate `trusted_local=False` (constants, transport wiring, `run.started` limits, fail-closed empty-reasoning rejection with zero effects) and `trusted_local=True` (raised values, empty-reasoning admission and replay).
- **R2 — confirmation display forgery**: the controller printed the model-supplied command raw. The first repair rendered command and cwd as escaped JSON strings; the second rejected Verdict ([comment 5509294824](https://github.com/pym96/workspace-agent-harness/issues/22#issuecomment-5509294824)) showed raw DEL (U+007F), C1 CSI (U+009B), bidi override (U+202E), and Unicode line/paragraph separators (U+2028/U+2029) still reached the display. The final renderer emits printable ASCII `0x20-0x7E` only via `ascii()` — every other code point becomes a visible, deterministic, reversible escape — for both command and cwd, while the request event, adapter invocation, and execution keep the original unmodified strings. Negative tests cover ESC/Tab/CR/LF, DEL, C1, bidi, and Unicode separators, assert no raw code point reaches terminal output, assert display reversibility to the exact string, and assert the adapter receives the unmodified hostile command on acceptance.
- **R3 — confirmation/cancel race**: cancellation is now rechecked after the answer line arrives (both the fd and non-fd input paths), between the affirmative answer and the acceptance event, between acceptance and the PTY-start seam, and inside `PosixPtyAdapter.run` before any fd/terminal mutation/spawn. Each crossing settles `human_handoff_cancelled` (`phase` distinguishes `pending-confirmation` / `pre-acceptance` / `pre-spawn`) with `child_started: false`; three deterministic race tests cover the affirmative-answer race, the post-acceptance race, and the adapter pre-spawn path.
- **R4 — Evidence undercount**: this document's external-activity counts were recomputed from all 13 raw Run Event Logs and all 54 retained response bodies rather than terminal summaries; the layered counts are stated at the top of this document.

## Verification receipt

On the exact smoke bytes `09ccaa85a303babcec74ab62ebe6a7d963641950` the checks read: focused 59 PASS, full 236 PASS, TypeScript/Pi 12 PASS, changed-source mypy PASS, compileall PASS, `git diff --check` PASS. The rejected Verdict independently reproduced those results and its own probes.

After the offline R1–R4 repair commit (no new external calls), on the repair-candidate bytes:

```text
focused Live TUI/trusted-local/v3-gateway/evented: PASS — 66 tests
full project suite: PASS — 243 tests
TypeScript/Pi checks (npm run check: tsc --noEmit + node --test): PASS — 12 tests
changed-source mypy (trusted_local, live_tui, deepseek_live, evented, tui): PASS
python3 -m compileall workspace_agent_harness tests: PASS
git diff --check: PASS
```

The pre-existing `tests/test_live_tui.py` mypy annotations debt (12 errors) is unchanged by this candidate and untouched sources remain as accepted. The TypeScript/Pi product side was not migrated or redesigned; its real TUI entry and deterministic checks remain green and directly runnable. The outer top-level career-workspace acceptance gate (`80-监管与验收/自动检查/run_acceptance.sh`) result on the repair candidate is reported in the Builder Handoff.

## Claim boundary

This document records Working Agent candidate Evidence for one authorized interactive development smoke. It is not accepted Evidence until the high-risk independent Regulator Gate closes; it is not a benchmark, a persistent Provider property, a model-quality conclusion, a security/sandbox/containment/network-denial claim, a Verified Project Fact, a Learning Wiki fact, a resume fact, or a public product claim. The trusted-local shell executes with the current host user's authority and the workspace is only a default cwd; no isolation is claimed. This document authorizes no further Provider call, campaign, retry, or fact promotion.
