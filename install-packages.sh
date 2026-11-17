#!/usr/bin/env bash
# Install OS packages for the given class.
# Per-class backend:
#   arch / wsl-arch  -> pacman, reads packages/common.pkglist + packages/<class>.pkglist
#   steamdeck        -> linuxbrew (root is read-only on SteamOS),
#                       reads packages/steamdeck.brewlist
#                       plus flatpak for apps unavailable as Linux brew formulae,
#                       reads packages/steamdeck.flatpaklist
#   debian           -> apt, reads packages/debian.pkglist
set -euo pipefail

CLASS=${1:?usage: $0 <arch|debian|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"

# Read the names in the list file $1 into $entries, one per line, without
# blank lines and `#` comments. Returns 1, saying why, when the file is missing
# or lists nothing.
read_list() {
  local list=$1
  if [[ ! -f "$list" ]]; then
    echo "skipping (not found): $list"
    return 1
  fi
  entries=$(grep -vE '^(#|$)' "$list" || true)
  if [ -z "$entries" ]; then
    echo "no entries in $list"
    return 1
  fi
}

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
    read_list "$list" || continue
    echo "installing from $list"
    echo "$entries" | sudo pacman -S --needed --noconfirm -
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
  read_list "$list" || return 0
  echo "installing/upgrading from $list"
  # `brew install` is idempotent on already-installed packages (warns + exit 0).
  # `brew upgrade` then catches new versions of installed packages.
  echo "$entries" | xargs -r brew install
  echo "$entries" | xargs -r brew upgrade || true
}

install_flatpak() {
  if ! command -v flatpak >/dev/null 2>&1; then
    echo "flatpak not found; cannot install flatpak apps on this system" >&2
    exit 1
  fi

  local list="$DIR/packages/${CLASS}.flatpaklist"
  read_list "$list" || return 0
  echo "installing flatpaks from $list"
  # `flatpak install --noninteractive` is idempotent: already-installed apps
  # exit 0 with a "is already installed" message.
  echo "$entries" | xargs -r flatpak install --user -y --noninteractive flathub

  # Flatpaks read config from their sandbox XDG_CONFIG_HOME
  # (~/.var/app/<id>/config), not from ~/.config. For wezterm two pieces
  # are needed: (1) expose the host's ~/.config/wezterm into the sandbox
  # via xdg-config:ro, and (2) point wezterm at the file via
  # WEZTERM_CONFIG_FILE. The filesystem override alone doesn't help —
  # wezterm still searches its own sandbox XDG_CONFIG_HOME by default.
  # `flatpak override` rewrites the per-app override file each call, so
  # this is idempotent.
  if printf '%s\n' "$entries" | grep -qx 'org.wezfurlong.wezterm'; then
    flatpak override --user \
      --filesystem=xdg-config/wezterm:ro \
      --env=WEZTERM_CONFIG_FILE="$HOME/.config/wezterm/wezterm.lua" \
      org.wezfurlong.wezterm
  fi
}

install_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get not found; cannot install packages on this system" >&2
    exit 1
  fi

  local list="$DIR/packages/${CLASS}.pkglist"
  read_list "$list" || return 0

  # Nothing may wait for an answer in an unattended run. DEBIAN_FRONTEND
  # takes debconf's default for a package's configuration questions; the two
  # dpkg options answer dpkg's own prompt for a config file changed both
  # locally and in the package: dpkg's default action where there is one,
  # else the local file stays.
  local apt=(sudo env DEBIAN_FRONTEND=noninteractive apt-get
    -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

  # mise is not in Debian. For Debian 11+ mise's docs add its apt repository
  # through extrepo, Debian's tool for external repositories with a pinned
  # signing key: https://mise.jdx.dev/installing-mise.html#apt
  # `extrepo enable` leaves an enabled repository as it is.
  "${apt[@]}" update
  "${apt[@]}" install -y extrepo
  sudo extrepo enable mise
  "${apt[@]}" update

  echo "installing from $list"
  echo "$entries" | xargs -r "${apt[@]}" install -y
}

case "$CLASS" in
  arch|wsl-arch)  install_pacman ;;
  debian)         install_apt ;;
  steamdeck)      install_brew; install_flatpak ;;
  *)
    echo "unknown class: $CLASS" >&2
    echo "supported: arch, debian, steamdeck, wsl-arch" >&2
    exit 1
    ;;
esac
