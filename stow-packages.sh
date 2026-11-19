#!/usr/bin/env bash
# Stow the given packages into $HOME, after making real the directories that
# must be real directories, and seed the live file of each reference copy;
# what that does and when it stops is in the README, "Install / update".
#
# Stow folds a directory that only one package fills into one link to that
# package, and what a program then writes there lands in this repo. A fold is
# also what `stow -R` trips over once a second package fills that directory:
# it aborts with "unstow_contents() called with invalid target" (GNU Stow
# 2.4.1), as its unstow pass plans to remove the link and then still descends
# through it for the second package. A plain `stow` would unfold the link;
# `-R` does not get that far.
#
# Usage: stow-packages.sh [--backup] <package>...
#   A package is a directory at the top of this repo that holds dotfiles, laid
#   out as in $HOME; one trailing / after its name is dropped.
#   --backup  move what stands in $HOME where a package file belongs, a file
#             or a link that does not lead into this repo, such as one to a
#             file outside it or one dangling outside its worktrees, into
#             ~/.dotfiles-pre-stow.<time>/ instead of letting stow refuse. Such
#             a link at the top of a package with a staging directory beside
#             it is left alone and named with it. Without --backup, such a
#             top-level link is left alone, and the run says to remove or move
#             it.
set -euo pipefail
shopt -s inherit_errexit

DIR="$(dirname "$(readlink -f "$0")")"
cd "$DIR"

usage_error() {
  echo "stow-packages.sh: $1" >&2
  echo "usage: stow-packages.sh [--backup] <package>..." >&2
  exit 2
}

# is_package <name>: true when the directory holds a dotfile at its top, as
# every package does and tests/, samples/ and packages/ do not.
is_package() {
  local entry
  for entry in "$DIR/$1"/.[!.]* "$DIR/$1"/..?*; do
    if [ -e "$entry" ] || [ -L "$entry" ]; then return 0; fi
  done
  return 1
}

backup=""
if [ "${1:-}" = --backup ]; then
  backup=1
  shift
fi
[ $# -gt 0 ] || usage_error "no package given"
pkgs=()
for arg in "$@"; do
  pkg="${arg%/}"
  case "$pkg" in
    "" | -* | .* | */*) usage_error "not a package name: $arg" ;;
  esac
  [ -d "$DIR/$pkg" ] || usage_error "no package $arg in $DIR"
  is_package "$pkg" || usage_error "not a stow package, as it holds no dotfile: $arg"
  pkgs+=("$pkg")
done

# in_list <word> <item>...: true when <word> is one of the items.
in_list() {
  local word="$1" item
  shift
  for item in "$@"; do
    [ "$item" = "$word" ] && return 0
  done
  return 1
}

# git tells a link into this repo from any other. Without it every link would
# look foreign, and --backup would move the stowed ones aside. Both are checked
# before anything changes.
if ! command -v git >/dev/null 2>&1; then
  echo "stow-packages.sh: git not found; it is needed to tell links into this repo from others" >&2
  exit 1
fi
if ! git_error="$(git -C "$DIR" rev-parse --git-common-dir 2>&1 >/dev/null)"; then
  echo "stow-packages.sh: git cannot read the repo at $DIR: $git_error" >&2
  exit 1
fi
if ! command -v stow >/dev/null 2>&1; then
  echo "stow-packages.sh: stow not found; nothing changed" >&2
  exit 1
fi

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
repo_common_dir="$(git_common_dir_abs "$DIR")"

into_our_repo() {
  # Return 0 if $1's containing dir is inside any worktree of our repo.
  local p="$1"
  [ -z "$p" ] && return 1
  local d="$p"
  [ -d "$d" ] || d="$(dirname -- "$d")"
  [ -d "$d" ] || return 1
  local their
  their="$(git_common_dir_abs "$d" || true)"
  [ -n "$their" ] && [ "$their" = "$repo_common_dir" ]
}

# git_trouble <path>: when <path> lies in a git checkout that git cannot read,
# such as a worktree whose entry in its main repo was pruned, print git's
# error.
git_trouble() {
  local d="$1" up error
  [ -d "$d" ] || d="$(dirname -- "$d")"
  up="$d"
  while [ "$up" != / ] && [ ! -e "$up/.git" ]; do
    up="$(dirname -- "$up")"
  done
  [ -e "$up/.git" ] || return 1
  if error="$(git -C "$d" rev-parse --git-common-dir 2>&1 >/dev/null)"; then
    return 1
  fi
  printf '%s\n' "$error"
}

# herdr-app is stowed with --no-folding: the herdr app writes its own files
# into every directory of the package, ~/.config/herdr-app, each mod folder,
# themes and layouts, so each of them must be real.
no_folding_pkgs=(herdr-app)

# Reference copies: tracked, but not stowed (each package's
# .stow-local-ignore). The app writes into the live file (CLAUDE.md, "Claude
# config lives here"; README, "herdr app").
reference_copies=(claude/.claude/settings.json herdr-app/.config/herdr-app/settings.json)

# Directories that must be real because a program writes into them or reads
# them only as real directories, as <package>:<directory>, each made real when
# its package is stowed:
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
# - host-steamdeck:.config/systemd/user/session.slice.d and app.slice.d:
#   README, "Memory protection on the Steam Deck".
program_dirs=(
  claude:.claude
  opencode:.config/opencode
  tmux:.config/tmux
  systemd:.config/systemd/user/default.target.wants
  host-steamdeck:.config/systemd/user/session.slice.d
  host-steamdeck:.config/systemd/user/app.slice.d
)

# package_dirs <package>: the package's directories, relative to it, without
# those its .stow-local-ignore names and everything below them. Stow links
# nothing there, so nothing there is to be made real. The patterns are Perl
# regular expressions as stow reads them: one with a / is matched against the
# path below the package with a leading /, one without against the last
# component.
package_dirs() {
  find "$1" -mindepth 1 -type d -printf '%P\n' |
    perl -e '
      my @pats;
      if (open my $fh, "<", shift) {
        while (<$fh>) {
          chomp;
          s/^\s+|\s+$//g;
          next if $_ eq "" || /^#/;
          push @pats, $_;
        }
      }
      LINE: while (my $path = <STDIN>) {
        chomp $path;
        my @parts = split m{/}, $path;
        for my $i (0 .. $#parts) {
          my $sub = "/" . join "/", @parts[0 .. $i];
          for my $pat (@pats) {
            next LINE if $pat =~ m{/} ? $sub =~ /$pat/ : $parts[$i] =~ /$pat/;
          }
        }
        print "$path\n";
      }' "$1/.stow-local-ignore"
}

# The directories to make real: those that more than one of the given
# packages fills, every directory of a package stowed without folding, the
# ones listed above, and the parents of each, parents first.
list_real_dirs() {
  local pkg entry d
  {
    for pkg in "${pkgs[@]}"; do
      package_dirs "$pkg"
    done | LC_ALL=C sort | uniq -d
    for pkg in "${pkgs[@]}"; do
      if in_list "$pkg" "${no_folding_pkgs[@]}"; then
        package_dirs "$pkg"
      fi
    done
    for entry in "${program_dirs[@]}"; do
      if in_list "${entry%%:*}" "${pkgs[@]}"; then
        echo "${entry#*:}"
      fi
    done
  } | while IFS= read -r d; do
    while [ "$d" != . ]; do
      echo "$d"
      d="$(dirname -- "$d")"
    done
  done | LC_ALL=C sort -u
}
real_dirs_text="$(list_real_dirs)"
real_dirs=()
if [ -n "$real_dirs_text" ]; then
  mapfile -t real_dirs <<<"$real_dirs_text"
fi

# Where worktrees of this repo live: each registered one, also when its
# directory is gone, the main checkout first; the sibling
# <main checkout>.worktrees/ that `mise run worktree-new` creates them in;
# and .worktrees/, an older place, inside the main checkout.
worktree_list="$(git -C "$DIR" worktree list --porcelain)"
worktree_roots=()
while IFS= read -r line; do
  case "$line" in
    "worktree "*) worktree_roots+=("${line#worktree }") ;;
  esac
done <<<"$worktree_list"
if [ ${#worktree_roots[@]} -gt 0 ]; then
  worktree_roots+=("$(dirname -- "${worktree_roots[0]}")/$(basename -- "${worktree_roots[0]}").worktrees")
fi
under_worktree_root() {
  local root
  for root in "${worktree_roots[@]}"; do
    [[ "$1" == "$root"/* ]] && return 0
  done
  return 1
}

# fold_of <link> <rel>: when the link points at <rel> in a package of a
# worktree of this repo, the place stow links it to, print that worktree and
# the package, one per line.
fold_of() {
  local src d top pkg
  src="$(readlink -f -- "$1" 2>/dev/null)" || return 1
  if [ ! -e "$src" ] || ! into_our_repo "$src"; then
    return 1
  fi
  d="$src"
  [ -d "$d" ] || d="$(dirname -- "$d")"
  top="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" || return 1
  pkg="${src#"$top"/}"
  pkg="${pkg%/"$2"}"
  if [ "$src" != "$top/$pkg/$2" ] || [[ "$pkg" == */* ]]; then
    return 1
  fi
  printf '%s\n%s\n' "$top" "$pkg"
}

# drop_dangling <rel>: when ~/<rel> is a dangling link into a worktree of this
# repo, nothing is behind it: remove it and say so. False otherwise.
drop_dangling() {
  local live="$HOME/$1" target
  if [ ! -L "$live" ] || [ -e "$live" ]; then
    return 1
  fi
  if ! target="$(readlink -m -- "$live")"; then
    echo "stow-packages.sh: readlink could not resolve the dangling link $live, which stays; remove it and run this again" >&2
    exit 1
  fi
  under_worktree_root "$target" || return 1
  if ! rm -- "$live"; then
    echo "stow-packages.sh: could not remove $live, a dangling link to $target; remove it and run this again" >&2
    exit 1
  fi
  echo "removed $live: it was a link to $target, which no longer exists"
}

# not_fold_why <rel>: why the link at ~/<rel>, which is no fold to unfold, is
# left alone.
not_fold_why() {
  local live="$HOME/$1" error
  if [ ! -e "$live" ]; then
    echo "its target does not exist"
  elif into_our_repo "$(readlink -f -- "$live")"; then
    echo "it points into this repo, but not at $1 in a package"
  elif error="$(git_trouble "$(readlink -f -- "$live")")"; then
    echo "git cannot read where it points: $error"
  else
    echo "it points outside this repo"
  fi
}

# Directories this run made real in place of a link. Until stow has run, the
# package links in them are missing; a run that stops before that names them.
made_real=()
reached_stow=""
tmp_list=""
cleanup() {
  local rc=$?
  if [ -n "$tmp_list" ]; then rm -f -- "$tmp_list"; fi
  if [ "$rc" -ne 0 ] && [ -z "$reached_stow" ] && [ ${#made_real[@]} -gt 0 ]; then
    echo "stow-packages.sh: this run made these real in place of their links, but stopped before stow," >&2
    echo "so the package links in them are missing until a run gets through:" >&2
    printf '  %s\n' "${made_real[@]}" >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# untracked_in <worktree> <package> <rel>: set `listed` to what git does not
# track in <package>/<rel> of the worktree, relative to it; when git tracks
# nothing there, to all it holds. False when git fails.
untracked_in() {
  local dir="$1/$2/$3" entry child
  listed=()
  if [ -z "$tmp_list" ]; then
    if ! tmp_list="$(mktemp)"; then
      echo "stow-packages.sh: mktemp failed, so what git does not track in $dir cannot be listed" >&2
      exit 1
    fi
  fi
  git --literal-pathspecs -C "$1" ls-files -z --others --directory -- "$2/$3/" >"$tmp_list" || return 1
  while IFS= read -r -d '' entry; do
    entry="${entry#"$2/$3/"}"
    entry="${entry%/}"
    if [ -n "$entry" ]; then
      listed+=("$entry")
    else
      for child in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do
        if [ -e "$child" ] || [ -L "$child" ]; then listed+=("${child##*/}"); fi
      done
    fi
  done <"$tmp_list"
}

# move_in <from> <to>: move <from> to <to>. A directory that is there already
# takes in what <from> holds; any other thing there already stops it, and both
# paths go to `clashes`. A <from> that is gone by now counts as moved.
clashes=()
move_in() {
  local from="$1" to="$2" child rc=0
  if [ ! -e "$from" ] && [ ! -L "$from" ]; then
    return 0
  fi
  if [ ! -e "$to" ] && [ ! -L "$to" ]; then
    mkdir -p -- "$(dirname -- "$to")" && mv -T -- "$from" "$to"
    return
  fi
  if [ -d "$from" ] && [ ! -L "$from" ] && [ -d "$to" ] && [ ! -L "$to" ]; then
    for child in "$from"/* "$from"/.[!.]* "$from"/..?*; do
      if [ -e "$child" ] || [ -L "$child" ]; then
        move_in "$child" "$to/${child##*/}" || rc=1
      fi
    done
    if [ "$rc" = 0 ]; then rmdir -- "$from" || rc=1; fi
    return "$rc"
  fi
  clashes+=("$from" "$to")
  return 1
}

# print_clashes <intro> <path>...: the intro, then the paths two by two, on
# stderr.
print_clashes() {
  local i paths
  echo "$1" >&2
  shift
  paths=("$@")
  for ((i = 0; i < ${#paths[@]}; i += 2)); do
    printf '  %s\n  %s\n' "${paths[i]}" "${paths[i + 1]}" >&2
  done
}

stage_of() { echo "$HOME/$1.unfolding"; }

# package_dir <package> <rel>: true when the package has a real directory at
# <rel>.
package_dir() { [ -d "$DIR/$1/$2" ] && [ ! -L "$DIR/$1/$2" ]; }

# dir_belongs <rel> [<package>]: true when a directory belongs at ~/<rel>:
# when it is one of the directories to make real, or a directory at <rel> in
# the package.
dir_belongs() {
  in_list "$1" "${real_dirs[@]}" || { [ -n "${2:-}" ] && package_dir "$2" "$1"; }
}

# Staging directories left alone where no directory belongs; the run names
# them again at the end and exits 1.
stray_stages=()

# stray_stage <rel> [<package>]: true when a staging directory sits beside
# ~/<rel> where no directory belongs (dir_belongs).
stray_stage() {
  [ -d "$(stage_of "$1")" ] && ! dir_belongs "$1" "${2:-}"
}

# leave_alone <rel> <why> [<package> [<next>]]: say that ~/<rel> is left alone
# and why, naming a staging directory beside it, and then <next>, what follows
# once the owner has acted; the package as for dir_belongs.
left_alone=()
leave_alone() {
  local live="$HOME/$1" why="$2" stage
  stage="$(stage_of "$1")"
  if [ -e "$stage" ]; then
    why="$why; $stage holds what an earlier run staged for it"
    if stray_stage "$1" "${3:-}"; then
      stray_stages+=("$stage")
      why="$why; no directory belongs here any more: move $stage elsewhere, or remove it if you need nothing in it"
    elif [ -d "$stage" ] && [ ! -d "$live" ]; then
      # settle_stage puts the staging directory in place of a missing ~/<rel>.
      why="$why; move $live elsewhere, and the next run puts $stage in its place"
    fi
  fi
  if [ -n "${4:-}" ]; then why="$why; $4"; fi
  left_alone+=("$1")
  if [ -L "$live" ]; then
    echo "stow-packages.sh: left alone: $live -> $(readlink -- "$live"): $why" >&2
  else
    echo "stow-packages.sh: left alone: $live: $why" >&2
  fi
}

# settle_stage <rel> [<package>]: a staging directory an earlier run left beside
# ~/<rel>, where a directory belongs (dir_belongs), takes its place when ~/<rel>
# is missing. A file at ~/<rel> is left alone, named with the staging directory
# and what to do. When ~/<rel> is stow's link into the package, the run names
# both and what the app already wrote through the link, and stops; when it is
# a directory, it names both and stops. Where no directory belongs, the staging
# directory is left alone and named, and the run exits 1 after stow.
settle_stage() {
  local live="$HOME/$1" stage
  stage="$(stage_of "$1")"
  [ -d "$stage" ] || return 0
  if stray_stage "$1" "${2:-}"; then
    stray_stages+=("$stage")
    echo "stow-packages.sh: left alone: $stage: an earlier run staged it for a directory at $live, but $DIR/$2/$1 is no directory; move it elsewhere, or remove it if you need nothing in it" >&2
    return 0
  fi
  if [ -e "$live" ] && [ ! -d "$live" ]; then
    leave_alone "$1" "a file where a directory belongs" "${2:-}"
    return 0
  fi
  if [ -L "$live" ]; then
    # Only the top-level pass leaves such a link in place: one stow made into
    # the package.
    local src="$DIR/$2/$1" entry both=() rest
    rest="remove the link $live and run this again; the run then puts $stage in its place, and stow links the package's files into it."
    echo "stow-packages.sh: $stage holds what an earlier run moved out of this repo for $live, which is now stow's link to $src: what is moved into it lands in the repo." >&2
    if ! untracked_in "$DIR" "$2" "$1"; then
      echo "stow-packages.sh: git ls-files failed in $DIR, so what the app wrote into $src cannot be listed." >&2
      echo "To keep it all out of the repo, move what git does not track in $src into $stage, merging what $stage already has into its own copy, then $rest" >&2
      exit 1
    fi
    if [ ${#listed[@]} -eq 0 ]; then
      echo "To keep it out of the repo, $rest" >&2
      exit 1
    fi
    echo "The app already wrote these through the link into the repo, untracked in $src:" >&2
    printf '  %s\n' "${listed[@]}" >&2
    for entry in "${listed[@]}"; do
      if [ -e "$stage/$entry" ] || [ -L "$stage/$entry" ]; then both+=("$entry"); fi
    done
    if [ ${#both[@]} -gt 0 ]; then
      echo "$stage already has these too:" >&2
      printf '  %s\n' "${both[@]}" >&2
      echo "To keep it all out of the repo, move everything in the first list from $src into $stage, merging the ones $stage already has into its own copies, then $rest" >&2
    else
      echo "To keep it all out of the repo, move these from $src into $stage, then $rest" >&2
    fi
    exit 1
  fi
  if [ -e "$live" ]; then
    echo "stow-packages.sh: $stage holds what an earlier run moved out of this repo for $live, which exists now." >&2
    echo "Move what you want to keep from $stage into $live, remove $stage and run this again." >&2
    exit 1
  fi
  mv -T -- "$stage" "$live"
  made_real+=("$live")
  echo "finished making $live a real directory: moved $stage, left by an earlier run, into its place"
}

# unfold <rel> <worktree> <package>: replace the link at ~/<rel> to <rel> in
# that package with a real directory, through the staging directory stage_of
# names (README, "Install / update"). Only the swap changes the link, so every
# stop before it leaves the link in place. A clash found after the swap is
# kept in `late_clashes` and reported after stow.
late_clashes=()
unfold() {
  local rel="$1" top="$2" pkg="$3"
  local live="$HOME/$1" src="$2/$3/$1" stage entry count i
  local entries=() copies=() moved=() stayed=() late=()
  local -A copied=()
  stage="$(stage_of "$rel")"
  if ! untracked_in "$top" "$pkg" "$rel"; then
    echo "stow-packages.sh: git ls-files failed in $top; $live stays the link to $src" >&2
    exit 1
  fi
  entries=("${listed[@]}")
  for entry in "${reference_copies[@]}"; do
    if [[ "$entry" == "$pkg/$rel/"* ]] && [ -f "$top/$entry" ]; then
      copies+=("${entry#"$pkg/$rel/"}")
    fi
  done

  echo "making $live a real directory in place of its link to $src"
  if [ -d "$stage" ]; then
    echo "resuming from $stage, which already holds:"
    (cd "$stage" && find . -mindepth 1 -maxdepth 1 -printf '  %P\n' | LC_ALL=C sort)
  fi
  if [ ${#entries[@]} -gt 0 ]; then
    echo "moving into it what $top does not track in $pkg/$rel:"
    printf '  %s\n' "${entries[@]}"
  fi
  if [ ${#copies[@]} -gt 0 ]; then
    echo "copying into it from $src, as the live file the app reads:"
    printf '  %s\n' "${copies[@]}"
    echo "git status in $top shows whether the app changed the repo's copy through the link"
  fi
  if ! mkdir -p -- "$stage"; then
    echo "stow-packages.sh: could not create $stage; $live stays the link to $src" >&2
    exit 1
  fi
  clashes=()
  for entry in "${entries[@]}"; do
    if move_in "$src/$entry" "$stage/$entry"; then
      moved+=("$entry")
    else
      stayed+=("$entry")
    fi
  done
  for entry in "${copies[@]}"; do
    if mkdir -p -- "$(dirname -- "$stage/$entry")" && cp -p -- "$src/$entry" "$stage/$entry"; then
      copied[$entry]="$(cksum <"$stage/$entry")"
    else
      stayed+=("$entry (to copy)")
    fi
  done
  if [ ${#clashes[@]} -gt 0 ]; then
    print_clashes "stow-packages.sh: $live stays the link to $src. Each of these is both staged and back in the repo; merge the first into the second, so that only the second is left, and run this again:" "${clashes[@]}"
    exit 1
  fi
  if [ ${#stayed[@]} -gt 0 ]; then
    echo "stow-packages.sh: $live stays the link to $src; run this again to finish." >&2
    echo "  still in $src:" >&2
    printf '    %s\n' "${stayed[@]}" >&2
    if [ ${#moved[@]} -gt 0 ]; then
      echo "  already in $stage:" >&2
      printf '    %s\n' "${moved[@]}" >&2
    fi
    exit 1
  fi

  if ! rm -- "$live"; then
    echo "stow-packages.sh: could not remove the link $live; all of it is in $stage, run this again" >&2
    exit 1
  fi
  if ! mv -T -- "$stage" "$live"; then
    echo "stow-packages.sh: removed the link $live, but could not move $stage into its place;" >&2
    echo "all of it is there. Run this again, or: mv -T $(printf %q "$stage") $(printf %q "$live")" >&2
    exit 1
  fi
  made_real+=("$live")

  # The app may have written through the link while the staging directory
  # filled.
  if ! untracked_in "$top" "$pkg" "$rel"; then
    echo "stow-packages.sh: git ls-files failed in $top; what the app wrote into $src meanwhile stays there" >&2
    exit 1
  fi
  # What clashes with the new directory leaves the repo for the staging
  # directory, now free again, which the next run reports until it is gone.
  clashes=()
  for entry in "${listed[@]}"; do
    count=${#clashes[@]}
    if move_in "$src/$entry" "$live/$entry"; then
      late+=("$entry")
      continue
    fi
    if [ ${#clashes[@]} -eq "$count" ]; then
      clashes+=("$src/$entry" "$live/$entry")
    fi
    if [ -e "$src/$entry" ] || [ -L "$src/$entry" ]; then
      if ! { mkdir -p -- "$(dirname -- "$stage/$entry")" && mv -T -- "$src/$entry" "$stage/$entry"; }; then
        echo "stow-packages.sh: could not move $src/$entry, which clashes with $live/$entry, out of the repo into $stage" >&2
        exit 1
      fi
    fi
  done
  for ((i = 0; i < ${#clashes[@]}; i += 2)); do
    late_clashes+=("$stage/${clashes[i]#"$src/"}" "${clashes[i + 1]}")
  done
  if [ ${#late[@]} -gt 0 ]; then
    echo "moved into it what the app wrote into $src meanwhile:"
    printf '  %s\n' "${late[@]}"
  fi
  for entry in "${copies[@]}"; do
    if [ "$(cksum <"$src/$entry")" != "${copied[$entry]}" ]; then
      echo "stow-packages.sh: $src/$entry changed after it was copied into $live; compare it with $live/$entry, the live file" >&2
    fi
  done
}

for rel in "${real_dirs[@]}"; do
  live="$HOME/$rel"
  for left in "${left_alone[@]}"; do
    [[ "$rel/" == "$left/"* ]] && continue 2
  done
  if [ -L "$live" ] && ! drop_dangling "$rel"; then
    if [ -d "$live" ] && fold="$(fold_of "$live" "$rel")"; then
      unfold "$rel" "${fold%%$'\n'*}" "${fold#*$'\n'}"
      continue
    fi
    why="$(not_fold_why "$rel")"
    leave_alone "$rel" "$why"
    continue
  elif [ -e "$live" ] && [ ! -d "$live" ]; then
    leave_alone "$rel" "a file where a directory belongs"
    continue
  fi
  settle_stage "$rel"
  [ -d "$live" ] || mkdir -- "$live"
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

# backup_moves <package> <rel>: true when the backup below, run with --backup,
# moves ~/<rel>: the package has a file or a link at <rel> that is no reference
# copy, whose live file the app writes; something stands at ~/<rel> that the
# run did not leave alone, with no link on the way to it, which would be a
# fold stow handles or reports; and it does not lead into this repo, as a
# link stow made does.
backup_moves() {
  local target="$HOME/$2"
  package_dir "$1" "$2" && return 1
  in_list "$1/$2" "${reference_copies[@]}" && return 1
  in_list "$2" "${left_alone[@]}" && return 1
  if [ ! -e "$target" ] && [ ! -L "$target" ]; then return 1; fi
  below_link "$2" && return 1
  ! into_our_repo "$(readlink -f -- "$target" 2>/dev/null || true)"
}

# Top-level links to a package path in another worktree of this repo, or in
# another package of this one, left by an earlier run. A link to a file is
# dropped, so stow links the given package's file; a link to a directory is
# made real like the directories above, so what git does not track there moves
# along. A dangling link into a worktree of this repo is removed, and any other
# link, except stow's own into this package, is left alone, as above; one the
# backup below moves (backup_moves) goes there instead with --backup, which
# names it, unless a staging directory sits beside it. The directories above
# are skipped: the pass above handles each of them.
for pkg in "${pkgs[@]}"; do
  top_level="$(find "$pkg" -mindepth 1 -maxdepth 1 -printf '%P\n')"
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    in_list "$rel" "${real_dirs[@]}" && continue
    live="$HOME/$rel"
    if [ -L "$live" ] && ! drop_dangling "$rel"; then
      if ! fold="$(fold_of "$live" "$rel")"; then
        why="$(not_fold_why "$rel")"
        # Otherwise, with --backup, the backup below moves it and names it.
        if ! backup_moves "$pkg" "$rel"; then
          leave_alone "$rel" "$why" "$pkg"
        elif [ -z "$backup" ]; then
          leave_alone "$rel" "$why" "$pkg" "remove or move the link, then run this again"
        elif stray_stage "$rel" "$pkg"; then
          leave_alone "$rel" "$why" "$pkg" "then run this again, and the backup takes the link"
        fi
        continue
      fi
      top="${fold%%$'\n'*}"
      from_pkg="${fold#*$'\n'}"
      if [ "$top/$from_pkg" != "$DIR/$pkg" ]; then
        if [ -d "$live" ]; then
          unfold "$rel" "$top" "$from_pkg"
          continue
        fi
        echo "relinking $live from $top/$from_pkg to $DIR/$pkg"
        rm -- "$live"
      fi
    fi
    settle_stage "$rel" "$pkg"
  done <<<"$top_level"
done

# A machine set up before a reference copy was split off still has its live
# file as a link into this repo, so everything the app writes lands in the
# public reference. Such a link becomes a local copy of what it points at; a
# dangling one into a worktree of this repo is removed, and the seed below
# takes its place.
for ref in "${reference_copies[@]}"; do
  in_list "${ref%%/*}" "${pkgs[@]}" || continue
  rel="${ref#*/}"
  live="$HOME/$rel"
  if [ ! -L "$live" ] || below_link "$rel"; then continue; fi
  if drop_dangling "$rel"; then continue; fi
  src="$(readlink -f -- "$live" 2>/dev/null || true)"
  into_our_repo "$src" || continue
  cp --remove-destination -- "$src" "$live"
  echo "replaced the ~/$rel link into the repo with a local copy"
done

# With --backup, move aside what stands where a package file belongs and would
# make stow refuse, as backup_moves decides: a real file, or a link that does
# not lead into this repo, such as one to a file outside it or one dangling
# outside the worktrees. It goes into a timestamped backup dir under $HOME, so
# stow can land cleanly.
backup_dir=""
backed_up_count=0
if [ -n "$backup" ]; then
  for pkg in "${pkgs[@]}"; do
    files="$(find "$pkg" \( -type f -o -type l \))"
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      rel="${src#"$pkg"/}"
      target="$HOME/$rel"
      backup_moves "$pkg" "$rel" || continue
      if [ -z "$backup_dir" ]; then
        backup_dir="$HOME/.dotfiles-pre-stow.$(date +%Y%m%d-%H%M%S)"
        echo "backing up pre-existing files to $backup_dir"
      fi
      if [[ "$rel" != */* ]] && [ -L "$target" ]; then
        # A top-level link the pass above let through, as no fold.
        why="$(not_fold_why "$rel")"
        echo "$target -> $(readlink -- "$target"): $why; it goes into the backup"
      fi
      mkdir -p "$backup_dir/$(dirname -- "$rel")"
      mv -- "$target" "$backup_dir/$rel"
      backed_up_count=$((backed_up_count + 1))
    done <<<"$files"
  done
fi
if [ "$backed_up_count" -gt 0 ]; then
  echo "backed up $backed_up_count file(s)"
  echo
fi

# stow_all [--no-folding] <package>...: stow them together; when that fails,
# each one alone, so one conflict does not keep the others unlinked, and the
# ones that still fail go to `not_stowed`.
not_stowed=()
stow_all() {
  local opts=() pkg
  if [ "${1:-}" = --no-folding ]; then
    opts=(--no-folding)
    shift
  fi
  [ $# -gt 0 ] || return 0
  stow -R "${opts[@]}" "$@" && return 0
  echo "stow-packages.sh: stowing them together failed; stowing each one alone" >&2
  for pkg in "$@"; do
    stow -R "${opts[@]}" "$pkg" || not_stowed+=("$pkg")
  done
}
folding=()
no_folding=()
for pkg in "${pkgs[@]}"; do
  if in_list "$pkg" "${no_folding_pkgs[@]}"; then
    no_folding+=("$pkg")
  else
    folding+=("$pkg")
  fi
done
reached_stow=1
stow_all "${folding[@]}"
stow_all --no-folding "${no_folding[@]}"

# Seed the live file of each reference copy that has none yet; after this
# first copy the two drift on purpose.
for ref in "${reference_copies[@]}"; do
  in_list "${ref%%/*}" "${pkgs[@]}" || continue
  rel="${ref#*/}"
  live="$HOME/$rel"
  if [ -e "$live" ] || [ -L "$live" ] || below_link "$rel" || [ ! -d "$(dirname -- "$live")" ]; then
    continue
  fi
  cp -- "$DIR/$ref" "$live"
  echo "seeded ~/$rel from the repo reference"
done

if [ ${#late_clashes[@]} -gt 0 ]; then
  print_clashes "stow-packages.sh: the app wrote these into the repo while their directory was made real, and the directory has its own; the repo's are in the staging directory now. Merge each first into its second, so that only the second is left, and remove the staging directory:" "${late_clashes[@]}"
fi
if [ ${#not_stowed[@]} -gt 0 ]; then
  echo "stow-packages.sh: not stowed: ${not_stowed[*]}; stow says why above" >&2
fi
if [ ${#stray_stages[@]} -gt 0 ]; then
  echo "stow-packages.sh: no directory belongs beside these staging directories any more; move each elsewhere, or remove it if you need nothing in it:" >&2
  printf '  %s\n' "${stray_stages[@]}" >&2
fi
if [ ${#late_clashes[@]} -gt 0 ] || [ ${#not_stowed[@]} -gt 0 ] || [ ${#stray_stages[@]} -gt 0 ]; then
  exit 1
fi
