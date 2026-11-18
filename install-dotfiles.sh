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

# The memex package syncs the memex clone (README, "memex sync"); only the
# classes whose host keeps a clone stow it.
case "$CLASS" in
  arch)
    class_pkgs=("${desktop_pkgs[@]}" host-arch)
    ;;
  debian)
    class_pkgs=(memex host-debian)
    ;;
  steamdeck)
    class_pkgs=("${desktop_pkgs[@]}" memex host-steamdeck)
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

# Shared with stow-packages.sh: into_our_repo, for the settings link below.
# shellcheck source=stow-lib.sh
. "$DIR/stow-lib.sh"

# Makes the directories real that must be (README, "Install / update"), moves
# a conflicting file in $HOME aside and stows.
"$DIR/stow-packages.sh" --backup "${all_pkgs[@]}"

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
# install-packages.sh from the class's package list. When `mise install`
# fails, the steps below still run; the end of this script names the failure.
mise_status=0
if command -v mise >/dev/null 2>&1; then
  echo
  echo "running mise install"
  (cd "$HOME" && mise install) || mise_status=$?
fi

# A class that stows the memex package gets ~/Memory as a link into the memex
# clone (README, "memex sync"), once the clone is there. Anything else already
# at ~/Memory, a directory with notes of its own say, is left alone and fails
# the run.
memory_left=""
if [[ " ${all_pkgs[*]} " == *" memex "* ]]; then
  memory_link=memex/daniel/memory
  if [ "$(readlink -m -- "$HOME/Memory")" = "$(readlink -m -- "$HOME/$memory_link")" ]; then
    :
  elif [ -e "$HOME/Memory" ] || [ -L "$HOME/Memory" ]; then
    echo >&2
    echo "$HOME/Memory exists and is not the link to $HOME/$memory_link; left as it is." >&2
    echo "Move what it holds into $HOME/$memory_link, remove it and run this again." >&2
    memory_left=1
  elif [ -d "$HOME/$memory_link" ]; then
    ln -s "$memory_link" "$HOME/Memory"
    echo "linked $HOME/Memory to $memory_link"
  else
    echo "no $HOME/$memory_link yet: clone memex and run this again for the $HOME/Memory link"
  fi
fi

# A failed `mise install` and a ~/Memory left alone fail the run here, last,
# so every step above has run.
if [ "$mise_status" -ne 0 ]; then
  echo >&2
  echo "mise install failed with exit $mise_status; see its output above, fix it and run this again." >&2
fi
if [ "$mise_status" -ne 0 ] || [ -n "$memory_left" ]; then
  exit 1
fi
