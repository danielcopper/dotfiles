#!/usr/bin/env bash
# Wrapper: install OS packages, then symlink dotfiles for the given class.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"

"$DIR/install-packages.sh" "$CLASS"
"$DIR/install-dotfiles.sh" "$CLASS"

# Catppuccin Mocha — overlay1 (muted), green (success), mauve (highlight).
# Skip colours when stdout isn't a terminal so logs stay clean.
if [ -t 1 ]; then
  C_DIM=$'\033[38;2;127;132;156m'
  C_GREEN=$'\033[38;2;166;227;161m'
  C_MAUVE=$'\033[38;2;203;166;247m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_DIM='' C_GREEN='' C_MAUVE='' C_BOLD='' C_RESET=''
fi

cat <<BANNER

${C_DIM}─────────────────────────────────────────────────────────────${C_RESET}
  ${C_BOLD}${C_GREEN}Bootstrap complete.${C_RESET}

  To pick up shell config changes:
    • run:  ${C_BOLD}${C_MAUVE}exec bash -l${C_RESET}
    • or close this terminal and open a new one
${C_DIM}─────────────────────────────────────────────────────────────${C_RESET}
BANNER
