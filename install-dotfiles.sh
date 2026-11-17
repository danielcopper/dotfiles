#!/usr/bin/env bash
# Symlink dotfiles for the given class via GNU Stow.
set -euo pipefail

CLASS=${1:?usage: $0 <arch|debian|steamdeck|wsl-arch>}
DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"

common_pkgs=(
  bash
  git
  inputrc
  claude
  mise
  nvim
  sesh
  starship
  systemd
  tmux
  lazygit
  opencode
)

# Config of GUI apps: the wezterm terminal and the herdr desktop app. A
# headless class leaves them out.
desktop_pkgs=(
  wezterm
  herdr-app
)

case "$CLASS" in
  arch)
    class_pkgs=("${desktop_pkgs[@]}" host-arch)
    ;;
  debian)
    class_pkgs=(host-debian)
    ;;
  steamdeck)
    class_pkgs=("${desktop_pkgs[@]}" host-steamdeck)
    ;;
  wsl-arch)
    class_pkgs=("${desktop_pkgs[@]}" host-wsl-arch)
    ;;
  *)
    echo "unknown class: $CLASS" >&2
    echo "supported: arch, debian, steamdeck, wsl-arch" >&2
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
    # The Claude and herdr settings are reference copies, not stow sources
    # (see each package's .stow-local-ignore). The app writes into the live
    # file (CLAUDE.md, "Claude config lives here"; README, "herdr app"), so
    # moving it aside as a "conflict" would take the live configuration with
    # it.
    case "$src" in
      claude/.claude/settings.json | herdr-app/.config/herdr-app/settings.json) continue ;;
    esac
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

# A directory that only one shared package fills must be a real directory
# before stow runs. On a fresh machine it does not exist yet, stow would fold
# it into one link to this repo, and everything a program writes there would
# land in the repo:
# - ~/.claude: Claude Code's own files, and the live settings.json would be
#   the public reference.
# - ~/.config/opencode: OpenCode's node_modules and package files, and the
#   sidebar plugin linked into plugins/ below.
# - ~/.config/tmux: the plugins TPM clones into plugins/.
# - ~/.config/systemd/user and its default.target.wants: the links
#   `systemctl --user enable` writes, such as timers.target.wants for the
#   tmpfiles timer below. The systemd package ships default.target.wants, so
#   it would fold on its own.
# On a home where one of them is already such a link, mkdir -p finds the
# directory in the repo and creates nothing.
mkdir -p "$HOME/.claude" \
  "$HOME/.config/opencode" \
  "$HOME/.config/tmux" \
  "$HOME/.config/systemd/user/default.target.wants"
# systemd skips a drop-in directory that is a symlink, so a folded
# session.slice.d would leave the desktop's memory protection unloaded.
if [ "$CLASS" = steamdeck ]; then
  mkdir -p "$HOME/.config/systemd/user/session.slice.d"
fi
"$DIR/stow-packages.sh" "${all_pkgs[@]}"

# The user's tmpfiles timer is what applies ~/.config/user-tmpfiles.d/claude.conf;
# it is not enabled by default on SteamOS or WSL. Without a user bus (no login
# session) this only warns, so the rest of the install still runs.
systemctl --user enable --now systemd-tmpfiles-clean.timer ||
  echo "could not enable systemd-tmpfiles-clean.timer; run: systemctl --user enable --now systemd-tmpfiles-clean.timer" >&2

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
  cp "$DIR/claude/.claude/settings.json" "$HOME/.claude/settings.json"
  echo "seeded ~/.claude/settings.json from the repo reference"
fi

# herdr's settings.json is a reference copy too (README, "herdr app"). The
# stow above has made ~/.config/herdr-app a real directory, so the seed lands
# there and not in the repo. A class without the package has no such
# directory and no herdr app to read the file.
live_herdr_settings="$HOME/.config/herdr-app/settings.json"
if [[ " ${all_pkgs[*]} " == *" herdr-app "* ]] &&
  [ ! -e "$live_herdr_settings" ] && [ ! -L "$live_herdr_settings" ]; then
  cp "$DIR/herdr-app/.config/herdr-app/settings.json" "$live_herdr_settings"
  echo "seeded ~/.config/herdr-app/settings.json from the repo reference"
fi

# WSLg puts Linux GUI apps into the Windows Start menu and gives their windows
# a taskbar icon only from desktop entries under /usr/share/applications,
# /usr/local/share/applications and Flatpak's exports; the herdr installer
# writes its entry to ~/.local/share/applications, so Windows finds no Herdr
# and shows its windows with the Tux fallback. The entry is copied to
# /usr/local/share with a PNG icon rendered from the app's SVG, as the other
# entries WSLg loads use PNG icons. WSLg matches the window's app id herdr-app
# to the entry through Exec. A /usr/local/share/applications it found missing
# at start is picked up only after the next `wsl --shutdown`. The app is
# installed by its own installer (README, "herdr app"); before that, this step
# is skipped, so run this script again after it.
if [ "$CLASS" = wsl-arch ]; then
  herdr_svg="${XDG_DATA_HOME:-$HOME/.local/share}/herdr-app/herdr-app.svg"
  if [ -f "$herdr_svg" ]; then
    wslg_tmp="$(mktemp -d)"
    rsvg-convert -w 256 -h 256 "$herdr_svg" -o "$wslg_tmp/herdr-app.png"
    cat >"$wslg_tmp/herdr-app.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Herdr
Comment=Terminals and coding agents that keep running
Exec=$HOME/.local/bin/herdr-app
Icon=/usr/local/share/icons/hicolor/256x256/apps/herdr-app.png
Terminal=false
Categories=Development;
StartupWMClass=herdr-app
EOF
    sudo install -Dm644 "$wslg_tmp/herdr-app.png" /usr/local/share/icons/hicolor/256x256/apps/herdr-app.png
    sudo install -Dm644 "$wslg_tmp/herdr-app.desktop" /usr/local/share/applications/herdr-app.desktop
    rm -rf "$wslg_tmp"
    echo "installed the herdr Start menu entry for WSLg"
  else
    echo "herdr app not installed; run this script again after its installer for the WSLg Start menu entry"
  fi
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
# just-stowed ~/.config/mise/config.toml, and on debian in
# ~/.config/mise/conf.d/debian.toml. mise itself is installed by
# install-packages.sh from the class's package list.
if command -v mise >/dev/null 2>&1; then
  echo
  echo "running mise install"
  (cd "$HOME" && mise install)
fi
