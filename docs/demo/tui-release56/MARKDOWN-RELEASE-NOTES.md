# v0.1.4 — readable assistant Markdown in the TUI

Assistant responses and their archived replay now format headings, lists, bold, inline code and fenced code blocks. Partial streaming text remains readable. Tool output, permission prompts and stored run records keep their original semantics and literal text.

Download `pan-agent-0.1.4.tgz` and `SHA256SUMS`, verify the checksum and install with npm as described in README. `markdown-before.png` and `markdown-after.png` compare actual TUI replay of the same offline fixture. No new paid model or benchmark run was used.

This is a limited presentation feature, not full CommonMark. `NO_COLOR` and `TERM=dumb` suppress styles; unsupported Markdown stays readable. No new runtime dependencies. MIT license; macOS arm64 validated, other platforms remain unverified.
