#!/usr/bin/env bash
# Install OS packages for the given class.
# Per-class backend:
#   arch / wsl-arch  -> pacman, reads packages/common.pkglist + packages/<class>.pkglist
#   steamdeck        -> linuxbrew (root is read-only on SteamOS),
#                       reads packages/steamdeck.brewlist
#                       plus flatpak for apps unavailable as Linux brew formulae,
#                       reads packages/steamdeck.flatpaklist
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

install_flatpak() {
  if ! command -v flatpak >/dev/null 2>&1; then
    echo "flatpak not found; cannot install flatpak apps on this system" >&2
    exit 1
  fi

  local list="$DIR/packages/${CLASS}.flatpaklist"
  if [[ ! -f "$list" ]]; then
    echo "skipping (not found): $list"
    return 0
  fi
  local apps
  apps=$(grep -vE '^(#|$)' "$list" || true)
  if [ -z "$apps" ]; then
    echo "no flatpak apps in $list"
    return 0
  fi
  echo "installing flatpaks from $list"
  # `flatpak install --noninteractive` is idempotent: already-installed apps
  # exit 0 with a "is already installed" message.
  echo "$apps" | xargs -r flatpak install --user -y --noninteractive flathub

  # Flatpaks read config from their sandbox XDG_CONFIG_HOME
  # (~/.var/app/<id>/config), not from ~/.config. Expose stow-managed configs
  # via xdg-config:ro mounts so the symlinked files in ~/.config/<app> are
  # visible inside the sandbox. `flatpak override` rewrites the per-app
  # override file each call, so this is idempotent.
  if printf '%s\n' "$apps" | grep -qx 'org.wezfurlong.wezterm'; then
    flatpak override --user --filesystem=xdg-config/wezterm:ro org.wezfurlong.wezterm
  fi
}

case "$CLASS" in
  arch|wsl-arch)  install_pacman ;;
  steamdeck)      install_brew; install_flatpak ;;
  *)
    echo "unknown class: $CLASS" >&2
    echo "supported: arch, steamdeck, wsl-arch" >&2
    exit 1
    ;;
esac
