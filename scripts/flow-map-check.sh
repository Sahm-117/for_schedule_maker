#!/usr/bin/env bash
# Prints the rules from FLOW_MAP.md section 4 so a human or an agent can check a
# change set against them before pushing. Used by .githooks/pre-push; run it by
# hand any time:  scripts/flow-map-check.sh
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
map="$root/FLOW_MAP.md"
[ -f "$map" ] || { echo "FLOW_MAP.md not found at $map" >&2; exit 1; }

echo "FLOW_MAP.md section 4 — rules that bite (full text: FLOW_MAP.md):"
awk '/^## 4\./{f=1;next} /^## 5\./{f=0} f && /^[0-9]+\. \*\*/{match($0,/\*\*[^*]+\*\*/); printf "  %s %s\n", substr($0,1,index($0,".")), substr($0,RSTART+2,RLENGTH-4)}' "$map"
