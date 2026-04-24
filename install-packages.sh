#!/usr/bin/env bash
# Install OS packages for the given class.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl>}
DIR="$(dirname "$(readlink -f "$0")")"

if ! command -v pacman >/dev/null 2>&1; then
  echo "pacman not found; this script only supports pacman-based systems" >&2
  exit 1
fi

for list in "$DIR/packages/common.pkglist" "$DIR/packages/${CLASS}.pkglist"; do
  if [[ ! -f "$list" ]]; then
    echo "skipping (not found): $list"
    continue
  fi
  echo "installing from $list"
  grep -vE '^(#|$)' "$list" | sudo pacman -S --needed --noconfirm -
done
