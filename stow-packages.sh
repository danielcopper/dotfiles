#!/usr/bin/env bash
# Stow the given packages into $HOME, after making real the directories that
# must be real directories (README, "Install / update").
#
# Stow folds a directory that only one package fills into one link to that
# package, and what a program then writes there lands in this repo. A fold is
# also what `stow -R` trips over once a second package fills that directory:
# it aborts with "unstow_contents() called with invalid target" (GNU Stow
# 2.4.1), as its unstow pass plans to remove the link and then still descends
# through it for the second package. A plain `stow` would unfold the link;
# `-R` does not get that far. So the directories below are made real before
# stow runs, an old fold of one into this repo included.
#
# Usage: stow-packages.sh [--backup] <package>...
#   --backup  move a file in $HOME that stands where a package file belongs
#             into ~/.dotfiles-pre-stow.<time>/ instead of letting stow refuse
#             (install-dotfiles.sh passes it)
set -euo pipefail

DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"
# shellcheck source=stow-lib.sh
. "$DIR/stow-lib.sh"

backup=""
if [ "${1:-}" = --backup ]; then
  backup=1
  shift
fi
pkgs=()
for pkg in "$@"; do
  pkgs+=("${pkg%/}")
done
given() { [[ " ${pkgs[*]} " == *" $1 "* ]]; }

# The herdr app writes its own files into every directory of the herdr-app
# package: ~/.config/herdr-app, each mod folder, themes and layouts. So
# herdr-app is stowed with --no-folding, and each of its directories must be
# real.
no_folding_pkgs=(herdr-app)

# Reference copies: tracked, but not stowed (each package's
# .stow-local-ignore). The app writes into the live file (CLAUDE.md, "Claude
# config lives here"; README, "herdr app").
reference_copies=(claude/.claude/settings.json herdr-app/.config/herdr-app/settings.json)

# Directories that only one package fills and that a program writes into, as
# <package>:<directory>, each made real when its package is stowed:
# - claude:.claude: Claude Code's own files, and the live settings.json would
#   be the public reference.
# - opencode:.config/opencode: OpenCode's node_modules and package files, and
#   the sidebar plugin install-dotfiles.sh links into plugins/.
# - tmux:.config/tmux: the plugins TPM clones into plugins/.
# - systemd:.config/systemd/user/default.target.wants: with its parent
#   ~/.config/systemd/user, where `systemctl --user enable` writes its links,
#   such as timers.target.wants for the tmpfiles timer install-dotfiles.sh
#   enables. The package ships default.target.wants, so it would fold on its
#   own.
# - host-steamdeck:.config/systemd/user/session.slice.d: systemd skips a
#   drop-in directory that is a symlink, so a folded one would leave the
#   desktop's memory protection unloaded.
written_dirs=(
  claude:.claude
  opencode:.config/opencode
  tmux:.config/tmux
  systemd:.config/systemd/user/default.target.wants
  host-steamdeck:.config/systemd/user/session.slice.d
)

# The directories to make real: those that more than one of the given
# packages fills, every directory of a package stowed without folding, the
# ones listed above, and the parents of each, parents first.
with_parents() {
  local d
  while IFS= read -r d; do
    while [ "$d" != . ]; do
      echo "$d"
      d="$(dirname -- "$d")"
    done
  done
}
real_dirs=()
while IFS= read -r rel; do
  real_dirs+=("$rel")
done < <(
  {
    for pkg in "${pkgs[@]}"; do find "$pkg" -mindepth 1 -type d -printf '%P\n'; done | LC_ALL=C sort | uniq -d
    for pkg in "${pkgs[@]}"; do
      if [[ " ${no_folding_pkgs[*]} " == *" $pkg "* ]]; then find "$pkg" -mindepth 1 -type d -printf '%P\n'; fi
    done
    for entry in "${written_dirs[@]}"; do
      if given "${entry%%:*}"; then echo "${entry#*:}"; fi
    done
  } | with_parents | LC_ALL=C sort -u
)

# The paths that worktrees of this repo live under: each registered one, also
# when its directory is gone, and the main checkout, whose .worktrees/ holds
# the others.
worktree_roots=()
if [ -n "$repo_common_dir" ]; then
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) worktree_roots+=("${line#worktree }") ;;
    esac
  done < <(git -C "$DIR" worktree list --porcelain)
fi
under_worktree_root() {
  local root
  for root in "${worktree_roots[@]}"; do
    [[ "$1" == "$root"/* ]] && return 0
  done
  return 1
}

# fold_of <link> <rel>: true when the link points at <rel> in a package of a
# worktree of this repo, the place stow links it to; sets fold_top and
# fold_pkg.
fold_of() {
  local src d
  src="$(readlink -f -- "$1" 2>/dev/null)" || return 1
  if [ ! -e "$src" ] || ! into_our_repo "$src"; then
    return 1
  fi
  d="$src"
  [ -d "$d" ] || d="$(dirname -- "$d")"
  fold_top="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" || return 1
  fold_pkg="${src#"$fold_top"/}"
  fold_pkg="${fold_pkg%/"$2"}"
  [ "$src" = "$fold_top/$fold_pkg/$2" ] && [[ "$fold_pkg" != */* ]]
}

left_alone=()
leave_alone() { # leave_alone <rel> <why>
  local live="$HOME/$1"
  left_alone+=("$1")
  if [ -L "$live" ]; then
    echo "stow-packages.sh: left alone: $live -> $(readlink -- "$live"): $2" >&2
  else
    echo "stow-packages.sh: left alone: $live: $2" >&2
  fi
}

# unfold <rel>: replace the fold at ~/<rel> with a real directory. What git
# does not track in the folded package directory moves into it, and each
# reference copy there is copied, as the app reads it there. All of it goes
# into a staging directory beside the link first; only once everything is in
# it does it take the link's place, so a failure leaves the link, and a rerun
# picks up where this one stopped.
unfold() {
  local rel="$1" live="$HOME/$1" src="$fold_top/$fold_pkg/$1"
  local stage list entry child
  local entries=() copies=() moved=() stayed=()
  stage="$(dirname -- "$live")/.$(basename -- "$live").unfolding"
  list="$(mktemp)"
  if ! git -C "$fold_top" ls-files -z --others --directory -- "$fold_pkg/$rel/" >"$list"; then
    rm -f -- "$list"
    echo "stow-packages.sh: git ls-files failed in $fold_top; $live stays the link to $src" >&2
    return 1
  fi
  while IFS= read -r -d '' entry; do
    entry="${entry#"$fold_pkg/$rel/"}"
    entry="${entry%/}"
    if [ -n "$entry" ]; then
      entries+=("$entry")
    else
      # git tracks nothing in it: all of it moves.
      shopt -s nullglob dotglob
      for child in "$src"/*; do
        entries+=("${child##*/}")
      done
      shopt -u nullglob dotglob
    fi
  done <"$list"
  rm -f -- "$list"
  for entry in "${reference_copies[@]}"; do
    if [[ "$entry" == "$fold_pkg/$rel/"* ]] && [ -f "$fold_top/$entry" ]; then
      copies+=("${entry#"$fold_pkg/$rel/"}")
    fi
  done

  echo "making $live a real directory in place of its link to $src"
  if [ ${#entries[@]} -gt 0 ]; then
    echo "moving into it what $fold_top does not track in $fold_pkg/$rel:"
    printf '  %s\n' "${entries[@]}"
  fi
  if [ ${#copies[@]} -gt 0 ]; then
    echo "copying into it from $fold_top/$fold_pkg/$rel, as the live file the app reads:"
    printf '  %s\n' "${copies[@]}"
    echo "git status in $fold_top shows whether the app changed the repo's copy through the link"
  fi
  mkdir -p -- "$stage" || {
    echo "stow-packages.sh: could not create $stage; $live stays the link to $src" >&2
    return 1
  }
  for entry in "${entries[@]}"; do
    if mkdir -p -- "$(dirname -- "$stage/$entry")" && mv -T -- "$src/$entry" "$stage/$entry"; then
      moved+=("$entry")
    else
      stayed+=("$entry")
    fi
  done
  for entry in "${copies[@]}"; do
    if ! { mkdir -p -- "$(dirname -- "$stage/$entry")" && cp -p -- "$src/$entry" "$stage/$entry"; }; then
      stayed+=("$entry (to copy)")
    fi
  done
  if [ ${#stayed[@]} -gt 0 ]; then
    echo "stow-packages.sh: $live stays the link to $src; run this again to finish." >&2
    echo "  still in $src:" >&2
    printf '    %s\n' "${stayed[@]}" >&2
    if [ ${#moved[@]} -gt 0 ]; then
      echo "  already in $stage:" >&2
      printf '    %s\n' "${moved[@]}" >&2
    fi
    return 1
  fi
  if ! { rm -- "$live" && mv -T -- "$stage" "$live"; }; then
    echo "stow-packages.sh: could not put $stage in the place of the link $live; all of it is in $stage" >&2
    return 1
  fi
}

for rel in "${real_dirs[@]}"; do
  live="$HOME/$rel"
  for left in "${left_alone[@]}"; do
    [[ "$rel/" == "$left/"* ]] && continue 2
  done
  if [ -L "$live" ]; then
    target="$(readlink -m -- "$live")"
    if [ ! -e "$live" ] && under_worktree_root "$target"; then
      # A fold into a worktree removed since: nothing is behind it.
      rm -- "$live"
      echo "removed $live: it was a link to $target, which no longer exists"
    elif [ -d "$live" ] && fold_of "$live" "$rel"; then
      unfold "$rel" || exit 1
      continue
    elif [ ! -e "$live" ]; then
      leave_alone "$rel" "its target does not exist"
      continue
    elif into_our_repo "$(readlink -f -- "$live")"; then
      leave_alone "$rel" "it points into this repo, but not at $rel in a package"
      continue
    else
      leave_alone "$rel" "it points outside this repo"
      continue
    fi
  elif [ -e "$live" ] && [ ! -d "$live" ]; then
    leave_alone "$rel" "a file where a directory belongs"
    continue
  fi
  [ -d "$live" ] || mkdir -- "$live"
done

# Drop the links to a package path in another worktree of this repo, left by a
# run from there, so stow links them to this one. The directories above are no
# such links any more.
for pkg in "${pkgs[@]}"; do
  while IFS= read -r rel; do
    live="$HOME/$rel"
    [ -L "$live" ] || continue
    if fold_of "$live" "$rel" && [ "$fold_top/$fold_pkg" != "$DIR/$pkg" ]; then
      rm -- "$live"
    fi
  done < <(find "$pkg" -mindepth 1 -maxdepth 1 -printf '%P\n')
done

# below_link <rel>: true when a directory on the way to ~/<rel> is a link.
below_link() {
  local d="$1"
  while [[ "$d" == */* ]]; do
    d="${d%/*}"
    [ -L "$HOME/$d" ] && return 0
  done
  return 1
}

# With --backup, move aside any pre-existing target file that would conflict
# with stow: a real file (or a symlink not pointing into this repo) at a
# target path blocks stow with refuses-conflicts. It goes into a timestamped
# backup dir under $HOME, so stow can land cleanly. A target reached through a
# link stays where it is: the link is either a fold into this repo, which
# stow handles, or a directory left alone above, which stow reports.
backup_dir=""
backed_up_count=0
if [ -n "$backup" ]; then
  for pkg in "${pkgs[@]}"; do
    while IFS= read -r src; do
      rel="${src#"$pkg"/}"
      target="$HOME/$rel"
      # The app writes into the live file of a reference copy, so moving it
      # aside as a "conflict" would take the live configuration with it.
      [[ " ${reference_copies[*]} " == *" $src "* ]] && continue
      if [ ! -e "$target" ] && [ ! -L "$target" ]; then
        continue
      fi
      below_link "$rel" && continue
      # Already stowed: target is a symlink resolving into our repo.
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
fi
if [ "$backed_up_count" -gt 0 ]; then
  echo "backed up $backed_up_count file(s)"
  echo
fi

folding=()
no_folding=()
for pkg in "${pkgs[@]}"; do
  if [[ " ${no_folding_pkgs[*]} " == *" $pkg "* ]]; then
    no_folding+=("$pkg")
  else
    folding+=("$pkg")
  fi
done
[ ${#folding[@]} -eq 0 ] || stow -R "${folding[@]}"
[ ${#no_folding[@]} -eq 0 ] || stow -R --no-folding "${no_folding[@]}"
