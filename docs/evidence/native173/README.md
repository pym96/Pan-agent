# Linux sandbox builder evidence

[LNX1.0](https://github.com/pym96/Pan-agent/issues/173#issuecomment-6999137288) starts from `32be220a657d9fb28b991bf982c55eb33cf99583`. The issue Handoff identifies the submitted commit, package digest, clean local regression, supported Linux and macOS checks and private raw evidence. The Regulator supplies the independent Verdict and the Human reviews the exact high-risk boundary.

The installed fixture uses four scripted exchanges through the real CLI, TUI approval, Session and OS backend. It archives the edit, shell test, atomic output replacement, typed readback and final response. Linux-only source checks retain host and child denials, before/after file digests, a successful connection by a host control and denial from the child, environment/descriptor checks, controlled cancellation and teardown. Separate private fixtures remove access to the FUSE device or disable nested user namespaces. Both require a diagnostic, zero model calls, an empty workspace and removal of run temp. The portable CPU regression and restricted CI run the refusal test on unsupported hosts.

## Implementation decisions and earlier observations

A projection of individually writable files into a readonly project tree would lose ordinary creation and atomic replacement. The chosen FUSE view mediates those operations while applying path policy to newly created entries. A real ordinary-user mount first established feasibility. An initial nested user namespace attempt failed at UID mapping, and an attempted second network namespace failed during loopback setup. The implemented supervisor establishes the offline network namespace once. A separate inner PID and mount namespace plus capability drop and seccomp policy restrict the task. Only ordinary fixture files were used.

An initial macOS installed fixture was accidentally placed below the candidate clone's `.git` directory. The pre-existing protected-ancestor rule denied its edit and the original fixture stayed unchanged. An ordinary project fixture exercised the intended supported workflow. The first test typecheck also found an unchecked union access in an assertion. The final test compares the complete typed text record. Original outcomes and later successful runs remain separate.

See [Linux design and commands](../../design/native-linux-sandbox.md) for mounts, runtime dependencies and residual limitations. These are Builder observations pending review, with no change to project facts or résumé disclosure.
