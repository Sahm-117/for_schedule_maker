#!/usr/bin/env bash
# One-time per clone: point git at the committed hooks in .githooks/.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
git -C "$root" config core.hooksPath .githooks
chmod +x "$root"/.githooks/* "$root"/scripts/flow-map-check.sh
echo "git hooks enabled (core.hooksPath = .githooks)"
