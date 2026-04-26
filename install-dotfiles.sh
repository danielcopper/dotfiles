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

# Resolve the repo's shared git dir. Worktrees of the same repo share this,
# so it lets us recognise existing symlinks that point into a sibling
# worktree (or into the main checkout) as stale stow folds rather than
# foreign files. `git rev-parse --git-common-dir` returns paths relative
# to the queried directory, so resolve them with cd-then-readlink.
git_common_dir_abs() {
  local d="$1" rel
  rel="$(git -C "$d" rev-parse --git-common-dir 2>/dev/null)" || return 1
  (cd "$d" && readlink -f -- "$rel" 2>/dev/null) || return 1
}

repo_common_dir=""
if command -v git >/dev/null 2>&1; then
  repo_common_dir="$(git_common_dir_abs "$DIR" || true)"
fi

into_our_repo() {
  # Return 0 if $1's containing dir is inside any worktree of our repo.
  local p="$1"
  [ -z "$p" ] && return 1
  [ -z "$repo_common_dir" ] && return 1
  local d="$p"
  [ -d "$d" ] || d="$(dirname -- "$d")"
  [ -d "$d" ] || return 1
  local their
  their="$(git_common_dir_abs "$d" || true)"
  [ -n "$their" ] && [ "$their" = "$repo_common_dir" ]
}

# Pre-pass: drop top-level $HOME entries that are symlinks pointing into
# our repo but at a different worktree path than $DIR. These are stale
# stow folds left over from a previous run done from another working
# tree. Removing them lets stow re-fold cleanly into $DIR. Critically,
# this happens BEFORE the per-leaf backup loop — a parent-dir symlink
# (e.g. ~/.githooks -> main_checkout/git/.githooks/) would otherwise see
# `mv ~/.githooks/leaf backup/leaf` follow the symlink and yank the file
# out of the source repo.
for pkg in "${all_pkgs[@]}"; do
  while IFS= read -r entry; do
    rel="${entry#"$pkg"/}"
    target="$HOME/$rel"
    [ -L "$target" ] || continue
    canonical="$(readlink -f -- "$target" 2>/dev/null || true)"
    into_our_repo "$canonical" || continue
    expected="$(readlink -f -- "$DIR/$pkg/$rel" 2>/dev/null || true)"
    if [ "$canonical" != "$expected" ]; then
      rm -- "$target"
    fi
  done < <(find "$pkg" -mindepth 1 -maxdepth 1)
done

# Back up any pre-existing target files that would conflict with stow.
# A real file (or symlink not pointing into this repo) at a target path
# blocks stow with refuses-conflicts. We move them aside into a
# timestamped backup dir under $HOME, so stow can land cleanly.
backup_dir=""
backed_up_count=0
for pkg in "${all_pkgs[@]}"; do
  while IFS= read -r src; do
    rel="${src#"$pkg"/}"
    target="$HOME/$rel"
    if [ ! -e "$target" ] && [ ! -L "$target" ]; then
      continue
    fi
    # Already stowed, in either form:
    #   1. target is a symlink resolving to our repo file at the matching path
    #   2. target is reached via a parent-dir tree-fold symlink into our repo
    # The pre-pass above drops parent-dir folds from sibling worktrees, so by
    # this point an into-our-repo canonical means the leaf is fine to keep.
    target_canonical="$(readlink -f -- "$target" 2>/dev/null || true)"
    if into_our_repo "$target_canonical"; then
      continue
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
