# Pan Agent v0.1.0 — TUI learning release

Publication status: prepared, pending independent final review and Master publication. These are release notes for the intended tag `v0.1.0`, not a claim that it is already downloadable.

Pan Agent is a local terminal runtime with file/shell tools, per-operation approval and sealed run archives. This release includes an offline scripted walkthrough and supports real tasks through configured DeepSeek or Kimi Code credentials.

## Assets

- `pan-agent-0.1.0.tgz`: prebuilt JavaScript TUI package. Node >=22.19.0 and npm required; no compiler, Docker, database, Go or Python runtime requirement.
- `pan-agent-demo.mp4`: accepted 41-second demonstration of one real Kimi file task followed by a separately captured replay of the same run. Input automated, idle waits shortened; no fabricated UI.
- `SHA256SUMS`: SHA-256 checksums of the package and video.

Intended release: https://github.com/pym96/Pan-agent/releases/tag/v0.1.0

## Quick start after publication

Download the tarball and checksum file from the release, verify the package's SHA-256, then:

```sh
npm install ./pan-agent-0.1.0.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent demo
```

The demo uses scripted model responses and real local tools; no API key or provider call. For real tasks, run `pan-agent configure`, configure a credential source, and launch with explicit workspace/archive directories as documented in README.

## Boundaries

Validated on macOS arm64, Node v26.7.0 and an interactive PTY. Node >=22.19.0 is the declared engine range; the exact minimum, Linux and Windows have not been verified for this release. Tools use host-user authority: workspace is a working directory, not a sandbox. Replay is read-only inspection, not process/session resume. No production-platform maturity, benchmark score or reliability improvement is claimed.

## License and attribution

Pan-authored code: MIT, copyright 2026 Pan Agent contributors. The package includes LICENSE; dependencies and external material keep their respective licenses. Human set architecture/scope and licensing direction; Coding Agents implemented and independently reviewed the candidate. The licensed package preserves the accepted Stage A executable bytes and video.
