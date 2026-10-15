# Licensing inventory — MIT release preparation

Human selected MIT on 2026-10-15 under #56 Criteria1.3. Root and packed `LICENSE` contain identical standard MIT text, copyright 2026 Pan Agent contributors. The package declares `license: MIT`. This applies to Pan-authored code, not upstream dependency code, quoted external materials, fonts, or model weights.

The earlier Criteria1.2 license-pending state remains in the historical evidence and manifests; it is superseded for this new candidate only.

## Distributed package

- Compiled Pan TypeScript product, launcher, README and RUNBOOK.
- No npm runtime dependencies; Node built-in modules are used.
- Pi reference and Python/Web/evaluation source are excluded from the tarball.
- No fonts, renderer libraries, model weights or provider credentials are included in the tarball.

## Build-only dependencies (locked)

| Package | Version | Upstream license |
|---|---|---|
| TypeScript | 5.9.3 | Apache-2.0 |
| @types/node | 22.19.19 | MIT |
| undici-types | 6.21.0 | MIT |

License strings are checked against installed dependency package metadata, not guessed from names. These development dependencies are not bundled in the consumer tarball. Their original package LICENSE files remain in the dependency installation.

## Optional recording/render environment

Terminal capture uses Python standard library and an actual pseudo-terminal. Rendering uses Pillow 12.3.0 (MIT-CMU), pyte 0.8.2 (LGPLv3 classifier and included license), wcwidth 0.9.2 (MIT), local macOS Menlo font and the host FFmpeg executable. These tools/font files are not redistributed. Their terms must be rechecked if a renderer environment or font assets are later distributed. The video is rasterized terminal output and discloses scripted versus live model operation.

## Final checks before publication

1. Independently verify root/packed MIT text, attribution and package metadata.
2. Confirm dist/bin bytes match the accepted Stage A package and third-party notices remain unchanged.
3. Verify the new manifest and SHA256SUMS; the accepted video is reused unchanged.
4. Master publishes only after the exact candidate SHA is independently accepted and integrated.

`references/pi/README.md` identifies its sources as Pan-authored integration with no copied Pi upstream source. Pi packages are separate dependencies, not included in this TUI distribution. No third-party LICENSE/NOTICE is deleted or relicensed by this change.
