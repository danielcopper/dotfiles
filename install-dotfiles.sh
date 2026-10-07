#!/usr/bin/env bash
# Symlink dotfiles for the given class via GNU Stow.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"

common_pkgs=(
  bash
  git
  herdr
  inputrc
  claude
  mise
  nvim
  sesh
  starship
  systemd
  tmux
  wezterm
  lazygit
  opencode
)

case "$CLASS" in
  arch)
    class_pkgs=(host-arch)
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
    # The Claude settings are a reference copy, not a stow source (see
    # claude/.stow-local-ignore). The file at the target belongs to the user
    # and to Claude Code, which writes model, effort and the auto-mode
    # environment into it; moving it aside as a "conflict" would take the
    # live configuration with it.
    [ "$src" = "claude/.claude/settings.json" ] && continue
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

# ~/.claude must be a real directory before stow runs. On a fresh machine it
# does not exist yet, and stow would fold the whole directory into one link to
# this repo: the live settings.json would be the public reference, and every
# file Claude Code writes there would land in the repo.
mkdir -p "$HOME/.claude"
# systemd skips a drop-in directory that is a symlink, so a folded
# session.slice.d would leave the desktop's memory protection unloaded.
if [ "$CLASS" = steamdeck ]; then
  mkdir -p "$HOME/.config/systemd/user/session.slice.d"
fi
stow -R "${all_pkgs[@]}"

# The user's tmpfiles timer is what applies ~/.config/user-tmpfiles.d/claude.conf;
# it is not enabled on SteamOS. Without a user bus (no login session) this only
# warns, so the rest of the install still runs.
if [ "$CLASS" = steamdeck ]; then
  systemctl --user enable --now systemd-tmpfiles-clean.timer ||
    echo "could not enable systemd-tmpfiles-clean.timer; run: systemctl --user enable --now systemd-tmpfiles-clean.timer" >&2
fi

# Seed the live Claude settings from the repo's reference copy on a fresh
# machine. The reference is deliberately not stowed: Claude Code writes the
# model, the effort level and the auto-mode environment description into the
# live file, and this repo is public. After this first copy the two drift on
# purpose - diff them when you want to carry something over.
# A machine set up before that split still has the live file as a symlink into
# this repo, so everything Claude Code writes lands in the public reference.
# Replace such a link with a local copy of what it points at.
live_settings="$HOME/.claude/settings.json"
if [ -L "$live_settings" ] && into_our_repo "$(readlink -f -- "$live_settings")"; then
  settings_src="$(readlink -f -- "$live_settings")"
  [ -f "$settings_src" ] || settings_src="$DIR/claude/.claude/settings.json"
  cp --remove-destination -- "$settings_src" "$live_settings"
  echo "replaced the ~/.claude/settings.json link into the repo with a local copy"
elif [ ! -e "$live_settings" ] && [ ! -L "$live_settings" ]; then
  mkdir -p "$HOME/.claude"
  cp "$DIR/claude/.claude/settings.json" "$HOME/.claude/settings.json"
  echo "seeded ~/.claude/settings.json from the repo reference"
fi

# OpenCode reports its panes to the tmux agent sidebar through a plugin file that
# ships with the sidebar (installed by TPM). OpenCode loads every file in its
# plugins directory, so the file is linked in by name rather than stowed. On a
# fresh machine TPM has not installed the sidebar yet; run this script again after
# the first tmux start.
sidebar_bridge="$HOME/.config/tmux/plugins/tmux-agent-sidebar/.opencode/plugins/tmux-agent-sidebar.js"
if [ -f "$sidebar_bridge" ]; then
  mkdir -p "$HOME/.config/opencode/plugins"
  ln -sfn "$sidebar_bridge" "$HOME/.config/opencode/plugins/tmux-agent-sidebar.js"
fi

# Post-stow: prune dangling symlinks under managed package roots that point
# into this repo. These appear when a previously-stowed source file is
# removed or moved in the repo — vanilla stow only manages what currently
# exists in the package, not what used to. Without this, every refactor
# leaves orphaned links in $HOME.
for pkg in "${all_pkgs[@]}"; do
  while IFS= read -r entry; do
    rel="${entry#"$pkg"/}"
    home_dir="$HOME/$rel"
    [ -d "$home_dir" ] || continue
    while IFS= read -r broken; do
      # -m (canonicalize-missing) instead of -f: -f returns empty when the
      # symlink's parent dir also no longer exists in the repo, which is
      # exactly the case for sources removed by a refactor.
      canonical="$(readlink -m -- "$broken" 2>/dev/null || true)"
      case "$canonical" in
        "$DIR"/*) rm -- "$broken" ;;
      esac
    done < <(find "$home_dir" -xtype l)
  done < <(find "$pkg" -mindepth 1 -maxdepth 1 -type d)
done

# Materialize mise-managed tools (runtimes + LSPs) declared in the
# just-stowed ~/.config/mise/config.toml. mise itself is installed
# by install-packages.sh via packages/common.pkglist.
if command -v mise >/dev/null 2>&1; then
  echo
  echo "running mise install"
  (cd "$HOME" && mise install)
fi
