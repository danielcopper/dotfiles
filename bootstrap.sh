#!/usr/bin/env bash
# Wrapper: install OS packages, then symlink dotfiles for the given class.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"

"$DIR/install-packages.sh" "$CLASS"
"$DIR/install-dotfiles.sh" "$CLASS"

cat <<'BANNER'

─────────────────────────────────────────────────────────────
  Bootstrap complete.

  To pick up shell config changes:
    • run:  exec bash -l
    • or close this terminal and open a new one
─────────────────────────────────────────────────────────────
BANNER
