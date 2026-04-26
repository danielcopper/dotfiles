#!/usr/bin/env bash
# Install OS packages for the given class.
# Per-class backend:
#   arch / wsl-arch  -> pacman, reads packages/common.pkglist + packages/<class>.pkglist
#   steamdeck        -> linuxbrew (root is read-only on SteamOS),
#                       reads packages/steamdeck.brewlist
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"

install_pacman() {
  if ! command -v pacman >/dev/null 2>&1; then
    echo "pacman not found; cannot install packages on this system" >&2
    exit 1
  fi

  # Enable colour output in /etc/pacman.conf if currently commented.
  # Idempotent: noop if Color is already active.
  if grep -q '^#Color' /etc/pacman.conf; then
    echo "enabling Color in /etc/pacman.conf"
    sudo sed -i 's/^#Color/Color/' /etc/pacman.conf
  fi

  for list in "$DIR/packages/common.pkglist" "$DIR/packages/${CLASS}.pkglist"; do
    if [[ ! -f "$list" ]]; then
      echo "skipping (not found): $list"
      continue
    fi
    local pkgs
    pkgs=$(grep -vE '^(#|$)' "$list" || true)
    if [ -z "$pkgs" ]; then
      echo "no packages in $list"
      continue
    fi
    echo "installing from $list"
    echo "$pkgs" | sudo pacman -S --needed --noconfirm -
  done
}

install_brew() {
  # Bootstrap linuxbrew if missing.
  if ! command -v brew >/dev/null 2>&1; then
    if [ -x /home/linuxbrew/.linuxbrew/bin/brew ]; then
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    else
      echo "linuxbrew not installed; bootstrapping..."
      NONINTERACTIVE=1 /bin/bash -c \
        "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    fi
  fi

  local list="$DIR/packages/steamdeck.brewlist"
  if [[ ! -f "$list" ]]; then
    echo "skipping (not found): $list"
    return 0
  fi
  local pkgs
  pkgs=$(grep -vE '^(#|$)' "$list" || true)
  if [ -z "$pkgs" ]; then
    echo "no packages in $list"
    return 0
  fi
  echo "installing/upgrading from $list"
  # `brew install` is idempotent on already-installed packages (warns + exit 0).
  # `brew upgrade` then catches new versions of installed packages.
  echo "$pkgs" | xargs -r brew install
  echo "$pkgs" | xargs -r brew upgrade || true
}

case "$CLASS" in
  arch|wsl-arch)  install_pacman ;;
  steamdeck)      install_brew ;;
  *)
    echo "unknown class: $CLASS" >&2
    echo "supported: arch, steamdeck, wsl-arch" >&2
    exit 1
    ;;
esac
