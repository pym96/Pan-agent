#!/bin/sh
# #51 documented shortest-path offline preview: build the exact local package,
# install it into a fresh consumer without dev dependencies, then start the
# actual installed Pan TUI with the scripted offline first task.
# No real Provider, credential, network or paid action is used by the demo.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
echo "==> 1/4 Install locked build dependencies (development side only)"
( set -x; npm --prefix "$ROOT/typescript" ci --ignore-scripts )
DEST=$(mktemp -d "${TMPDIR:-/tmp}/pan-preview-try.XXXXXX")
echo "==> 2/4 Build the exact local package artifact"
( set -x; npm --prefix "$ROOT/typescript" pack --pack-destination "$DEST" )
echo "==> 3/4 Install into a fresh consumer: $DEST/consumer (offline, no dev dependencies)"
mkdir "$DEST/consumer"
( set -x; cd "$DEST/consumer" && npm install "$DEST"/pan-agent-0.1.0.tgz --omit=dev --offline --ignore-scripts --no-audit --no-fund )
echo "==> 4/4 Start the installed offline first-task preview (records under $DEST/records)"
mkdir "$DEST/records"
set -x
exec node "$ROOT/scripts/demo_preview.mjs" "$DEST/consumer/node_modules/pan-agent" "$DEST/records" "$ROOT"
