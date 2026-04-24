#!/usr/bin/env bash
# Symlink dotfiles for the given class via GNU Stow.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"

common_pkgs=(
  bash
  git
  inputrc
  claude
  starship
  tmux
  wezterm
  lazygit
)

case "$CLASS" in
  arch)
    class_pkgs=(alacritty host-arch)
    ;;
  steamdeck)
    class_pkgs=(host-steamdeck)
    ;;
  wsl-arch)
    class_pkgs=(host-wsl-arch)
    ;;
  *)
    echo "unknown class: $CLASS" >&2
    echo "supported: arch, steamdeck, wsl-arch" >&2
    exit 1
    ;;
esac

all_pkgs=("${common_pkgs[@]}" "${class_pkgs[@]}")

echo "stowing for class=$CLASS:"
printf '  %s\n' "${all_pkgs[@]}"
echo

stow -R "${all_pkgs[@]}"
