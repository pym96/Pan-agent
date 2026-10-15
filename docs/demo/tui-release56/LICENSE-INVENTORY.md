# Licensing inventory — release blocked

Pan's author has not selected a license. Do not infer MIT, Apache-2.0 or a public reuse grant from this candidate. No LICENSE file or package `license` value has been added. Public Release remains blocked pending that decision and a final package inclusion check.

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

## Before public release

1. Human selects Pan's license and copyright attribution.
2. Add approved LICENSE/NOTICE as required; explicitly include them in the npm tarball.
3. Rebuild, inspect tar contents, hash the final artifact and independently check the new SHA.
4. Publish only verified artifacts and a video reviewed for incidental private content.
