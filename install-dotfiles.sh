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
    class_pkgs=(konsole host-arch)
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

# Back up any pre-existing target files that would conflict with stow.
# A real file (or symlink not pointing into this repo) at a target path
# blocks stow with refuses-conflicts. We move them aside into a
# timestamped backup dir under $HOME, so stow can land cleanly.
backup_dir=""
backed_up_count=0
for pkg in "${all_pkgs[@]}"; do
  while IFS= read -r src; do
    rel="${src#$pkg/}"
    target="$HOME/$rel"
    if [ ! -e "$target" ] && [ ! -L "$target" ]; then
      continue
    fi
    if [ -L "$target" ]; then
      linkdest="$(readlink -f -- "$target" 2>/dev/null || true)"
      expected="$(readlink -f -- "$DIR/$pkg/$rel" 2>/dev/null || true)"
      if [ -n "$linkdest" ] && [ "$linkdest" = "$expected" ]; then
        continue
      fi
    fi
    if [ -z "$backup_dir" ]; then
      backup_dir="$HOME/.dotfiles-pre-stow.$(date +%Y%m%d-%H%M%S)"
      echo "backing up pre-existing files to $backup_dir"
    fi
    mkdir -p "$backup_dir/$(dirname -- "$rel")"
    mv -- "$target" "$backup_dir/$rel"
    backed_up_count=$((backed_up_count + 1))
  done < <(find "$pkg" \( -type f -o -type l \))
done

if [ "$backed_up_count" -gt 0 ]; then
  echo "backed up $backed_up_count file(s)"
  echo
fi

# --override lets host-<class> replace shared files where needed (e.g. claude/.claude/settings.json).
# Harmless on hosts without overrides since no conflict exists.
stow -R --override='^\.claude/settings\.json$' "${all_pkgs[@]}"
