#!/bin/bash
# Check the exact local files apt plans to acquire; apt still authenticates bytes.
set -euo pipefail
root=${1:-/opt/wo74/repo}
while read -r quoted rest; do
    uri=${quoted#\'}; uri=${uri%\'}
    case "$uri" in
        file:/opt/wo74/repo/*)
            relative=${uri#file:/opt/wo74/repo/}
            # --print-uris enumerates provisional targets, even ones absent from
            # the signed Release (e.g. binary-all in this Ubuntu snapshot).
            if [[ "$relative" == dists/*/Packages* ]]; then
                tail=${relative#dists/}; suite=${tail%%/*}; target=${tail#*/}
                release="$root/dists/$suite/InRelease"
                test -f "$release" || { echo "missing authenticated Release: $release" >&2; exit 1; }
                if ! awk -v p="$target" '$3==p {found=1} END {exit !found}' "$release"; then
                    printf 'not advertised by Release: %s\n' "$uri"; continue
                fi
            fi
            test -f "$root/$relative" || { echo "missing planned apt index: $uri" >&2; exit 1; }
            printf 'present: %s\n' "$uri" ;;
        "") ;;
        *) echo "unexpected apt acquisition: $uri" >&2; exit 1 ;;
    esac
done
