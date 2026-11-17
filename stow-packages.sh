#!/usr/bin/env bash
# Stow the given packages into $HOME.
#
# The herdr app writes its own files into every directory of the herdr-app
# package: ~/.config/herdr-app, each mod folder and themes. Stow folds a
# directory that is missing in $HOME into a single link to this repo, and
# everything herdr writes there, into the tracked settings.json reference
# too, would then land in the repo. So herdr-app is stowed with --no-folding,
# and when one of its directories is already a link in $HOME, nothing is
# stowed: the script names the link and stops.
#
# Usage: stow-packages.sh <package>...
set -euo pipefail

DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"

no_folding_pkgs=(herdr-app)

folding=()
no_folding=()
linked=()
for pkg in "$@"; do
  pkg="${pkg%/}"
  if [[ " ${no_folding_pkgs[*]} " == *" $pkg "* ]]; then
    no_folding+=("$pkg")
    while IFS= read -r dir; do
      live="$HOME/${dir#"$pkg"/}"
      if [ -L "$live" ]; then
        linked+=("$live -> $(readlink -- "$live")")
      fi
    done < <(find "$pkg" -mindepth 1 -type d)
  else
    folding+=("$pkg")
  fi
done

if [ ${#linked[@]} -gt 0 ]; then
  echo "stow-packages.sh: these directories must be real directories, but are links:" >&2
  printf '  %s\n' "${linked[@]}" >&2
  echo "Remove each link, create a real directory in its place and move the untracked" >&2
  echo "files from where it pointed back into it. If it pointed into this repo, copy" >&2
  echo "settings.json into the new directory too, then restore what the app changed in" >&2
  echo "the repo (git status) with git checkout and run this again." >&2
  exit 1
fi

[ ${#folding[@]} -eq 0 ] || stow -R "${folding[@]}"
[ ${#no_folding[@]} -eq 0 ] || stow -R --no-folding "${no_folding[@]}"
