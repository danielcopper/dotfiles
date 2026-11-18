#!/usr/bin/env bash
# Tests for the directories that must be real directories in $HOME, such as
# ~/.config/environment.d: stow-packages.sh makes each real before stow runs,
# also where an earlier run left it folded into one link to the repo. Each case
# runs install-dotfiles.sh, the dotfiles-relink task or stow-packages.sh in a
# throwaway home, once or, to see what a rerun does, more often.
#   s1  debian, ~/.config/environment.d folded into the mise package: the run
#       succeeds, the directory is real, and the files of both packages are
#       linked
#   s2  the same on the arch class with host-arch
#   s3  a link from ~/.config/environment.d to a directory outside the repo is
#       left as it is, with its files, also one named like a package file; the
#       run says so, stow names the conflict, exit 1
#   s4  files a program wrote through the fold, untracked in the repo, are moved
#       into the new real directory, also from a subdirectory, with a space or
#       a non-ASCII character in the name, and when git ignores them; the run
#       lists them first; the repo keeps its tracked files and is clean again
#   s5  a fold into another worktree of the repo is undone the same way, and
#       the run names that worktree
#   s6  below a link to outside the repo (~/.local) nothing is created; the
#       run says so, exit 1
#   s7  a link into the repo that is no fold of that directory, to packages/,
#       is left as it is, and so is the untracked file there; the run says so
#   s8  a file in place of ~/.config/environment.d is left as it is; the run
#       says so, stow names the conflict, exit 1
#   s9  a fold-shaped link into another git repo is left as it is
#   s10 steamdeck, ~/.config/systemd/user folded with the timers.target.wants/
#       link that systemctl writes: it moves into the real directory
#   s11 a program's file named like another package's file ends in the backup,
#       and stow links the package file; exit 0
#   s12 a fold of ~/.config/systemd with an untracked path below a tracked
#       directory (user/timers.target.wants/x.timer)
#   s13 a second run changes nothing and says nothing about directories
#   s14 the dotfiles-relink task undoes a fold too
#   s15 a failing git ls-files leaves the link and the files; a rerun finishes
#   s16 a failing mv leaves the link and says what stayed where; a rerun
#       finishes
#   s17 a dangling fold into a removed worktree under .worktrees/ is removed
#       and reported, and the directory made real
#   s18 the same for a registered worktree whose directory is gone
#   s19 a fold into a directory git tracks nothing in: all of it moves
#   s20 a fold of ~/.claude: the settings.json Claude Code wrote through it is
#       copied in as the live file, and its other files move
#   s21 arch, a fold of ~/.config/herdr-app: made real, the same for herdr's
#       settings.json and files
#   s22 a link at ~/.config into the repo that is no fold is left as it is
#   s23 a link to a file in another worktree is linked to this one
#   s24 below a link at ~/.config/systemd to outside the repo nothing is
#       created, on arch, where only the systemd package fills it
#   s25 the dotfiles-relink task over a fold of ~/.claude keeps the live
#       settings.json
#   s26 the same for herdr's settings.json
#   s27-s30 a fresh home on each class: every directory in program_dirs of
#       stow-packages.sh is real (on steamdeck both slice drop-in directories
#       too)
#   s31 a dangling link outside every worktree is left alone; exit 1
#   s32 dotfiles-relink backs nothing up: a file in the way ends in stow's
#       conflict
#   s33 the swap fails after the link is gone: the staging directory holds
#       everything, the run names the command that finishes it, and a rerun
#       does
#   s34 a staging directory beside an existing directory stops the run
#   s35 what the app wrote through the link between two runs into a directory
#       already staged is merged in
#   s36 a file staged and written again stops the run with both paths; once
#       one is removed, a rerun finishes
#   s37 what the app writes while the run fills the staging directory is
#       moved in after the swap
#   s38 a file the app writes then that the new directory has too goes into
#       the staging directory; the run stows, names both paths and exits 1, and
#       the next run stops on the staging directory until it is gone
#   s39 a reference copy the app changes then is named
#   s40 stow-packages.sh refuses no package, a path, an option, ".", a missing
#       package, a directory that is no package or a late --backup with exit 2,
#       each with its own message, before it changes anything
#   s41 one trailing / after a package name is fine
#   s42 with git unusable, stow-packages.sh stops before it changes anything
#   s43 a failing find stops the run before stow
#   s44 a failing git worktree list stops the run before stow
#   s45 a top-level directory linked into another worktree is made real, and
#       what git does not track there moves along
#   s46 a dangling fold into a removed worktree under the sibling
#       <main>.worktrees/ is removed
#   s47 dotfiles-relink replaces a ~/.claude/settings.json link into the repo
#       with a local copy
#   s48 the same for herdr's settings.json
#   s49 a link into a directory two levels into the repo is no fold
#   s50 a ~/.claude/settings.json link outside the repo is left alone
#   s51 a settings link into the repo whose file is gone is removed, and the
#       reference seeded
#   s52 a link into another package of this worktree is relinked
#   s53 what the app writes into an already moved directory during the swap
#       is merged in
#   s54 a failing rmdir after a merge leaves the link
#   s55 without stow nothing changes
#   s56 one package in conflict: the others are stowed, and the run names it
#   s57 a write to the live settings after the swap is no change to report
#   s58 a link into a worktree git cannot read is left alone with git's error
#   s59 a file gone between listing and moving counts as moved
#   s60 a staging directory beside a link left alone is named with it
#   s61 a dangling settings link into a removed worktree is removed and the
#       reference seeded
#   s62 dotfiles-relink seeds the live settings too
#   s63 a run that stops after making a directory real names it
#   s64 a file the app writes during the swap of a top-level directory linked
#       into another worktree also stops the next runs on the staging
#       directory until it is gone
#   s65 a file at ~/.claude beside a staging directory is left alone with it;
#       the run names both once, says to move the file elsewhere, stows the
#       other packages and exits 1; once the file is moved, the next run puts
#       the staging directory in its place
#   s66 the same for a file at a top-level directory of a package, ~/.githooks
#   s67 a staging directory beside a top-level directory not listed, which
#       stow folded into its own package, stops the run, which says that what
#       is moved into the link lands in the repo and to remove the link; once
#       it is gone, the next run puts the staging directory in its place
#   s68 a dangling top-level link into a removed worktree, under the sibling
#       <main>.worktrees/ (relative, as stow writes it) or under .worktrees/, is
#       removed and the package file linked
#   s69 a staging directory beside such a link is put in its place
#   s70 without --backup, a dangling top-level link outside every worktree is
#       left alone, the run says to remove or move it, and stow names the
#       conflict
#   s71 a late clash on a listed top-level directory (~/.claude): the run
#       stows, names both paths and exits 1
#   s72 a staging directory beside a link to a package file is named as not
#       belonging there and left alone, also at the end; the run stows and
#       exits 1
#   s73 the same beside a dangling link to a package file, which is removed
#   s74 a staging directory beside a top-level link outside the repo is named
#       with it
#   s75 beside such a link to a file where a directory belongs, the run says
#       to move the link elsewhere; once it is gone, the next run puts the
#       staging directory in its place
#   s76 beside such a link where a file belongs, without --backup, it says to
#       remove or move the link, that no directory belongs there, and names the
#       staging directory at the end
#   s77 a staging directory beside a link to a file in another worktree, which
#       is relinked, is named as in s72
#   s78 s67 with files the app wrote through the fold: the run names them and
#       says to move them into the staging directory first, which keeps the
#       repo clean
#   s79 with --backup, a top-level link to a file outside the repo and one
#       dangling outside the worktrees go into the backup, each named in one
#       line, and stow links the package files
#   s80 a failing rm keeps a dangling link into a removed worktree; the run
#       says so and stops before stow
#   s81 the same for a failing readlink
#   s82 with --backup, such a link with a staging directory beside it is left
#       alone and named with it, also at the end, with what then happens to
#       the link; the other one is backed up
#   s83 without --backup, both are left alone, each line says to remove or
#       move the link, nothing is backed up, stow names the conflict
#   s84 with --backup, a link to a file outside the repo below a real
#       directory (~/.githooks/pre-commit) goes into the backup
#   s85 beside a dangling link where a directory belongs, the run says to move
#       the link elsewhere; once it is gone, the next run puts the staging
#       directory in its place
#   s86 s67 with git ls-files failing: the run says the listing failed and
#       what to do all the same, once
#   s87 s78 with a file, and a name the staging directory has as a dangling
#       link, that the staging directory has too: the run names them apart and
#       says to merge them
#   s88 with --backup, a top-level link into a worktree git cannot read goes
#       into the backup, named with git's error
#   s89 with --backup, a top-level link into the repo that is no fold is left
#       alone and not backed up
# usage: shared-dirs.sh [installer] [case ...]
#   The installer defaults to the repo's install-dotfiles.sh, the cases to all
#   of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. VERBOSE=1 prints every run's output. The installer runs from a
# throwaway git repo holding a copy of this repo's files (tracked and new, as
# they are in the working tree) and the installer under test, so files written
# into a package stay out of this repo. HOME points into a temporary directory
# for the whole run, and systemctl and mise are stand-ins that only log their
# calls, so neither the user manager nor mise is reached; the directory is
# removed at the end. Needs stow, git and tar.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/install-dotfiles.sh
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(readlink -f "$(mktemp -d "${TMPDIR:-/tmp}/shared-dirs-test.XXXXXX")")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
unset XDG_CONFIG_HOME XDG_DATA_HOME
export GIT_CONFIG_NOSYSTEM=1
mkdir -p "$ROOT/bin" "$HOME"
for tool in systemctl mise; do
  printf '#!/bin/sh\necho "%s $*" >>"%s/calls"\n' "$tool" "$ROOT" >"$ROOT/bin/$tool"
  chmod +x "$ROOT/bin/$tool"
done
PATH=$ROOT/bin:$PATH

# The throwaway repo, committed, with a second worktree for s5; both ignore
# *.log, for s4 and s5.
COPY=$ROOT/repo
SIBLING=$ROOT/sibling
mkdir -p "$COPY"
while IFS= read -r -d '' f; do
  # A tracked file deleted in the working tree is not copied.
  if [ -e "$REPO/$f" ] || [ -L "$REPO/$f" ]; then printf '%s\0' "$f"; fi
done < <(git -C "$REPO" ls-files -z --cached --others --exclude-standard) |
  tar -C "$REPO" --null -T - -cf - | tar -C "$COPY" -xf -
cp -- "$SUT" "$COPY/install-dotfiles.sh"
git -C "$COPY" init -q
git -C "$COPY" add -A
git -C "$COPY" -c user.name=test -c user.email=test@example.invalid -c core.hooksPath=/dev/null \
  commit -qm copy
git -C "$COPY" worktree add -q "$SIBLING"
printf '*.log\n' >"$COPY/.git/info/exclude"

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }
linked_to() { [ "$(readlink -f -- "$HOME/$1")" = "$(readlink -f -- "$2")" ]; }

# run_install <class>: output in $OUT, exit in $RC.
run_install() {
  OUT=$("$COPY/install-dotfiles.sh" "$1" 2>&1)
  RC=$?
  { echo "\$ install-dotfiles.sh $1 -> exit $RC"; printf '%s\n' "$OUT"; } >>"$ROOT/$CASE.transcript"
}

# run_relink <package...>: the dotfiles-relink task; output in $OUT, exit in $RC.
run_relink() {
  OUT=$(DOTFILES_DIR=$COPY "$COPY/mise/.config/mise/tasks/dotfiles-relink" "$@" 2>&1)
  RC=$?
  { echo "\$ dotfiles-relink $* -> exit $RC"; printf '%s\n' "$OUT"; } >>"$ROOT/$CASE.transcript"
}

# run_stow <argument...>: stow-packages.sh itself; output in $OUT, exit in $RC.
run_stow() {
  OUT=$("$COPY/stow-packages.sh" "$@" 2>&1)
  RC=$?
  { echo "\$ stow-packages.sh $* -> exit $RC"; printf '%s\n' "$OUT"; } >>"$ROOT/$CASE.transcript"
}

# standin <tool> <pattern> <action>: a stand-in for <tool> in $ROOT/failbin
# that, on every call with an argument matching the case <pattern>, runs the
# shell <action> and then, unless the action exits, the real tool.
standin() {
  local real
  real=$(command -v "$1")
  mkdir -p "$ROOT/failbin"
  # shellcheck disable=SC2016 # expanded by the stand-in, not here
  printf '#!/bin/sh\nfor a; do\n  case "$a" in\n    %s)\n      %s\n      break ;;\n  esac\ndone\nexec %s "$@"\n' \
    "$2" "$3" "$real" >"$ROOT/failbin/$1"
  chmod +x "$ROOT/failbin/$1"
}
# failing <tool> <pattern>: the stand-in refuses with exit 1.
failing() { standin "$1" "$2" "echo '$1 stand-in: refused' >&2; exit 1"; }

# home_state: every path in the home with its type and link target.
home_state() { (cd "$HOME" && find . -printf '%p %y %l\n' | LC_ALL=C sort); }

# fold <rel> <package dir>: ~/<rel> as the relative link to the package's
# directory that stow makes when only that package fills it.
fold() {
  mkdir -p "$(dirname -- "$HOME/$1")"
  ln -s "$(realpath -m --relative-to="$(dirname -- "$HOME/$1")" "$2/$1")" "$HOME/$1"
}
fold_env_d() { fold .config/environment.d "$1"; }
left_alone_line() { # left_alone_line <rel> <why>
  local live=$HOME/$1
  grep -qxF "stow-packages.sh: left alone: $live -> $(readlink -- "$live"): $2" <<<"$OUT"
}

# expect_unfolded <class> <host package>
expect_unfolded() {
  fold_env_d "$COPY/mise"
  run_install "$1"
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "mise-shims.conf linked to the mise package" \
    linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "ssh-agent.conf linked to $2" \
    linked_to .config/environment.d/ssh-agent.conf "$COPY/$2/.config/environment.d/ssh-agent.conf"
  check "the repo unchanged" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}
s1_fold_undone_on_debian() { expect_unfolded debian host-debian; }
s2_fold_undone_on_arch() { expect_unfolded arch host-arch; }

s3_fold_elsewhere_kept() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.config"
  printf 'own\n' >"$ROOT/elsewhere/own.conf"
  printf 'own shims\n' >"$ROOT/elsewhere/mise-shims.conf"
  ln -s "$ROOT/elsewhere" "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points elsewhere" eq "$(readlink -- "$HOME/.config/environment.d")" "$ROOT/elsewhere"
  check "its file untouched" eq "$(cat "$ROOT/elsewhere/own.conf")" own
  check "its file named like mise's untouched" eq "$(cat "$ROOT/elsewhere/mise-shims.conf" 2>/dev/null)" "own shims"
  check "nothing else in it" eq "$(find "$ROOT/elsewhere" -mindepth 1 -printf '%f\n' | LC_ALL=C sort | tr '\n' ' ')" "mise-shims.conf own.conf "
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
  check "says it left it alone" left_alone_line .config/environment.d "it points outside this repo"
  check "stow names the conflict" grep -q "existing target is not owned by stow: .config/environment.d" <<<"$OUT"
}

# expect_program_files_moved <repo or worktree the fold points into>
expect_program_files_moved() {
  local pkg_dir=$1/mise/.config/environment.d
  fold_env_d "$1/mise"
  mkdir -p "$HOME/.config/environment.d/sub"
  printf 'written\n' >"$HOME/.config/environment.d/written.conf"
  printf 'deep\n' >"$HOME/.config/environment.d/sub/deep.conf"
  printf 'ignored\n' >"$HOME/.config/environment.d/ignored.log"
  printf 'space\n' >"$HOME/.config/environment.d/with space.conf"
  printf 'umlaut\n' >"$HOME/.config/environment.d/ünï.conf"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  local f
  for f in written.conf sub/deep.conf ignored.log "with space.conf" ünï.conf; do
    check "$f is a real file in the home" test -f "$HOME/.config/environment.d/$f" -a ! -L "$HOME/.config/environment.d/$f"
    check "$f is gone from the package" test ! -e "$pkg_dir/$f"
  done
  for f in written.conf sub ignored.log "with space.conf" ünï.conf; do
    check "$f is listed" grep -qxF "  $f" <<<"$OUT"
  done
  check "written.conf kept its content" eq "$(cat "$HOME/.config/environment.d/written.conf")" written
  check "sub/deep.conf kept its content" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf")" deep
  check "ignored.log kept its content" eq "$(cat "$HOME/.config/environment.d/ignored.log")" ignored
  check "with space.conf kept its content" eq "$(cat "$HOME/.config/environment.d/with space.conf")" space
  check "ünï.conf kept its content" eq "$(cat "$HOME/.config/environment.d/ünï.conf")" umlaut
  check "the tracked file still in the package" test -f "$pkg_dir/mise-shims.conf"
  check "mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "ssh-agent.conf linked" linked_to .config/environment.d/ssh-agent.conf "$COPY/host-debian/.config/environment.d/ssh-agent.conf"
  check "names the worktree" grep -qxF "moving into it what $1 does not track in mise/.config/environment.d:" <<<"$OUT"
  check "the repo clean again" eq "$(git -C "$1" status --porcelain --ignored)" ""
}
s4_program_files_moved() { expect_program_files_moved "$COPY"; }
s5_fold_into_other_worktree() { expect_program_files_moved "$SIBLING"; }

s6_nothing_created_below_other_link() {
  mkdir -p "$ROOT/elsewhere"
  ln -s "$ROOT/elsewhere" "$HOME/.local"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points elsewhere" eq "$(readlink -- "$HOME/.local")" "$ROOT/elsewhere"
  check "nothing created there" eq "$(ls -A "$ROOT/elsewhere")" ""
  check "says it left it alone" left_alone_line .local "it points outside this repo"
}

s7_link_into_repo_not_a_fold_kept() {
  mkdir -p "$HOME/.config"
  printf 'stray\n' >"$COPY/packages/stray"
  ln -s "$COPY/packages" "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points into packages" eq "$(readlink -- "$HOME/.config/environment.d")" "$COPY/packages"
  check "the untracked file still there" eq "$(cat "$COPY/packages/stray")" stray
  check "says it left it alone" left_alone_line .config/environment.d \
    "it points into this repo, but not at .config/environment.d in a package"
}

s8_file_kept() {
  mkdir -p "$HOME/.config"
  printf 'own\n' >"$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "still the file" eq "$(cat "$HOME/.config/environment.d")" own
  check "says it left it alone" grep -qxF \
    "stow-packages.sh: left alone: $HOME/.config/environment.d: a file where a directory belongs" <<<"$OUT"
  check "stow names the conflict" grep -q "over existing target .config/environment.d since neither a link nor a directory" <<<"$OUT"
}

s9_fold_into_other_repo_kept() {
  local other=$ROOT/other/mise/.config/environment.d
  mkdir -p "$other"
  printf 'x\n' >"$other/x.conf"
  printf 'y\n' >"$other/y.conf"
  git -C "$ROOT/other" init -q
  git -C "$ROOT/other" add mise/.config/environment.d/x.conf
  fold_env_d "$ROOT/other/mise"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points into the other repo" eq "$(readlink -f -- "$HOME/.config/environment.d")" "$other"
  check "its untracked file still there" eq "$(cat "$other/y.conf")" y
  check "says it left it alone" left_alone_line .config/environment.d "it points outside this repo"
}

s10_systemd_user_fold_on_steamdeck() {
  local wants=.config/systemd/user/timers.target.wants
  fold .config/systemd/user "$COPY/systemd"
  mkdir -p "$HOME/$wants"
  ln -s /usr/lib/systemd/user/systemd-tmpfiles-clean.timer "$HOME/$wants/systemd-tmpfiles-clean.timer"
  run_install steamdeck
  check "exit 0 (got $RC)" eq "$RC" 0
  check "user is a real directory" test -d "$HOME/.config/systemd/user" -a ! -L "$HOME/.config/systemd/user"
  check "timers.target.wants is a real directory" test -d "$HOME/$wants" -a ! -L "$HOME/$wants"
  check "the timer link moved as it was" \
    eq "$(readlink -- "$HOME/$wants/systemd-tmpfiles-clean.timer")" /usr/lib/systemd/user/systemd-tmpfiles-clean.timer
  check "default.target.wants is a real directory" \
    test -d "$HOME/.config/systemd/user/default.target.wants" -a ! -L "$HOME/.config/systemd/user/default.target.wants"
  check "ssh-agent.service linked" linked_to .config/systemd/user/ssh-agent.service "$COPY/systemd/.config/systemd/user/ssh-agent.service"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s11_program_file_named_like_package_file() {
  fold_env_d "$COPY/mise"
  printf 'mine\n' >"$HOME/.config/environment.d/ssh-agent.conf"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "ssh-agent.conf linked to host-debian" \
    linked_to .config/environment.d/ssh-agent.conf "$COPY/host-debian/.config/environment.d/ssh-agent.conf"
  check "the program's file in the backup" \
    eq "$(cat "$HOME"/.dotfiles-pre-stow.*/.config/environment.d/ssh-agent.conf 2>/dev/null)" mine
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s12_parent_fold_with_partial_untracked_path() {
  local timer=.config/systemd/user/timers.target.wants/x.timer
  fold .config/systemd "$COPY/systemd"
  mkdir -p "$(dirname -- "$HOME/$timer")"
  printf 'timer\n' >"$HOME/$timer"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "systemd is a real directory" test -d "$HOME/.config/systemd" -a ! -L "$HOME/.config/systemd"
  check "user is a real directory" test -d "$HOME/.config/systemd/user" -a ! -L "$HOME/.config/systemd/user"
  check "the program's file is a real file" test -f "$HOME/$timer" -a ! -L "$HOME/$timer"
  check "it kept its content" eq "$(cat "$HOME/$timer")" timer
  check "it is listed" grep -qxF "  user/timers.target.wants" <<<"$OUT"
  check "ssh-agent.service linked" linked_to .config/systemd/user/ssh-agent.service "$COPY/systemd/.config/systemd/user/ssh-agent.service"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s13_second_run_changes_nothing() {
  fold_env_d "$COPY/mise"
  printf 'written\n' >"$HOME/.config/environment.d/written.conf"
  run_install debian
  check "first run exit 0 (got $RC)" eq "$RC" 0
  local before
  before=$(home_state)
  run_install debian
  check "second run exit 0 (got $RC)" eq "$RC" 0
  check "the home unchanged" eq "$(home_state)" "$before"
  check "says nothing about directories" eq "$(grep -c -e '^making ' -e 'left alone' -e '^removed ' -e '^backing up' <<<"$OUT")" 0
}

s14_relink_over_fold() {
  fold_env_d "$COPY/mise"
  run_relink mise host-debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "ssh-agent.conf linked" linked_to .config/environment.d/ssh-agent.conf "$COPY/host-debian/.config/environment.d/ssh-agent.conf"
}

# expect_retried <what failed>: the rerun after a failed one finishes.
expect_retried() {
  run_install debian
  check "rerun exit 0 (got $RC)" eq "$RC" 0
  check "rerun: environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "rerun: written.conf in the home" eq "$(cat "$HOME/.config/environment.d/written.conf" 2>/dev/null)" written
  check "rerun: sub/deep.conf in the home" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
  check "rerun: no staging directory left" test ! -e "$HOME/.config/environment.d.unfolding"
  check "rerun: the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

# with_program_files: a fold of environment.d with two files written through it.
with_program_files() {
  fold_env_d "$COPY/mise"
  mkdir -p "$HOME/.config/environment.d/sub"
  printf 'written\n' >"$HOME/.config/environment.d/written.conf"
  printf 'deep\n' >"$HOME/.config/environment.d/sub/deep.conf"
}

s15_git_failure_keeps_link() {
  local link src=$COPY/mise/.config/environment.d
  with_program_files
  link=$(readlink -- "$HOME/.config/environment.d")
  failing git '*ls-files*'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
  check "written.conf still in the package" eq "$(cat "$src/written.conf")" written
  check "no staging directory" test ! -e "$HOME/.config/environment.d.unfolding"
  check "says so" grep -qxF \
    "stow-packages.sh: git ls-files failed in $COPY; $HOME/.config/environment.d stays the link to $src" <<<"$OUT"
  expect_retried
}

s16_mv_failure_keeps_link() {
  local link src=$COPY/mise/.config/environment.d
  with_program_files
  link=$(readlink -- "$HOME/.config/environment.d")
  failing mv '*written.conf'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
  check "written.conf still in the package" eq "$(cat "$src/written.conf")" written
  check "sub in the staging directory" eq "$(cat "$HOME/.config/environment.d.unfolding/sub/deep.conf")" deep
  check "listed written.conf first" grep -qxF "  written.conf" <<<"$OUT"
  check "says the link stays" grep -qxF \
    "stow-packages.sh: $HOME/.config/environment.d stays the link to $src; run this again to finish." <<<"$OUT"
  check "says what stayed" eq "$(grep -A1 -xF "  still in $src:" <<<"$OUT" | tail -1)" "    written.conf"
  check "says what moved" eq "$(grep -A1 -xF "  already in $HOME/.config/environment.d.unfolding:" <<<"$OUT" | tail -1)" "    sub"
  expect_retried
  check "rerun says it resumes" eq "$(grep -A1 -xF "resuming from $HOME/.config/environment.d.unfolding, which already holds:" <<<"$OUT" | tail -1)" "  sub"
}

# expect_dangling_removed <link target>
expect_dangling_removed() {
  mkdir -p "$HOME/.config"
  ln -s "$1" "$HOME/.config/environment.d"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says it removed it" grep -qxF \
    "removed $HOME/.config/environment.d: it was a link to $1, which no longer exists" <<<"$OUT"
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "ssh-agent.conf linked" linked_to .config/environment.d/ssh-agent.conf "$COPY/host-debian/.config/environment.d/ssh-agent.conf"
}
s17_dangling_fold_into_removed_worktree() {
  expect_dangling_removed "$COPY/.worktrees/gone/mise/.config/environment.d"
}
s18_dangling_fold_into_registered_worktree() {
  git -C "$COPY" worktree add -q --detach "$ROOT/gone"
  rm -rf "$ROOT/gone"
  expect_dangling_removed "$ROOT/gone/mise/.config/environment.d"
}

s19_untracked_fold_target_moves_whole() {
  local src=$COPY/host-steamdeck/.config/environment.d
  mkdir -p "$src/sub"
  printf 'prog\n' >"$src/prog.conf"
  printf 'deep\n' >"$src/sub/deep.conf"
  fold_env_d "$COPY/host-steamdeck"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "prog.conf a real file in the home" eq "$(cat "$HOME/.config/environment.d/prog.conf" 2>/dev/null)" prog
  check "sub/deep.conf a real file in the home" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
  check "nothing left in the package" eq "$(ls -A "$src" 2>/dev/null)" ""
  check "lists prog.conf" grep -qxF "  prog.conf" <<<"$OUT"
  check "lists sub" grep -qxF "  sub" <<<"$OUT"
  check "mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s20_folded_claude_keeps_live_settings() {
  fold .claude "$COPY/claude"
  printf '{"model":"mine"}\n' >"$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude/projects"
  printf 'session\n' >"$HOME/.claude/projects/p.jsonl"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".claude is a real directory" test -d "$HOME/.claude" -a ! -L "$HOME/.claude"
  check "settings.json a real file" test -f "$HOME/.claude/settings.json" -a ! -L "$HOME/.claude/settings.json"
  check "settings.json keeps what Claude Code wrote" eq "$(cat "$HOME/.claude/settings.json")" '{"model":"mine"}'
  check "projects moved" eq "$(cat "$HOME/.claude/projects/p.jsonl" 2>/dev/null)" session
  check "projects gone from the package" test ! -e "$COPY/claude/.claude/projects"
  check "CLAUDE.md linked" linked_to .claude/CLAUDE.md "$COPY/claude/.claude/CLAUDE.md"
  check "names the copy" grep -qxF "  settings.json" <<<"$OUT"
  check "reports no change" eq "$(grep -c 'settings.json changed' <<<"$OUT")" 0
  check "the repo's reference copy still there" test -f "$COPY/claude/.claude/settings.json"
  check "nothing seeded" eq "$(grep -c '^seeded ' <<<"$OUT")" 0
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
}

s21_folded_herdr_on_arch() {
  local d=.config/herdr-app
  fold "$d" "$COPY/herdr-app"
  printf '{"zoom":2}\n' >"$HOME/$d/settings.json"
  printf 'own\n' >"$HOME/$d/shared.json"
  run_install arch
  check "exit 0 (got $RC)" eq "$RC" 0
  check "herdr-app is a real directory" test -d "$HOME/$d" -a ! -L "$HOME/$d"
  check "mods/leader is a real directory" test -d "$HOME/$d/mods/leader" -a ! -L "$HOME/$d/mods/leader"
  check "main.js linked" linked_to "$d/mods/leader/main.js" "$COPY/herdr-app/$d/mods/leader/main.js"
  check "settings.json keeps what herdr wrote" eq "$(cat "$HOME/$d/settings.json")" '{"zoom":2}'
  check "settings.json a real file" test ! -L "$HOME/$d/settings.json"
  check "shared.json moved" eq "$(cat "$HOME/$d/shared.json" 2>/dev/null)" own
  check "shared.json gone from the package" test ! -e "$COPY/herdr-app/$d/shared.json"
  check "names the copy" grep -qxF "  settings.json" <<<"$OUT"
  check "the repo's reference copy still there" test -f "$COPY/herdr-app/$d/settings.json"
  check "herdr's settings not seeded" eq "$(grep -c '^seeded ~/.config/herdr-app/' <<<"$OUT")" 0
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
}

s25_relink_keeps_live_claude_settings() {
  fold .claude "$COPY/claude"
  printf '{"model":"mine"}\n' >"$HOME/.claude/settings.json"
  run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".claude is a real directory" test -d "$HOME/.claude" -a ! -L "$HOME/.claude"
  check "settings.json keeps what Claude Code wrote" eq "$(cat "$HOME/.claude/settings.json" 2>/dev/null)" '{"model":"mine"}'
  check "settings.json a real file" test ! -L "$HOME/.claude/settings.json"
  check "the repo's reference copy still there" test -f "$COPY/claude/.claude/settings.json"
}

s26_relink_keeps_live_herdr_settings() {
  local d=.config/herdr-app
  fold "$d" "$COPY/herdr-app"
  printf '{"zoom":2}\n' >"$HOME/$d/settings.json"
  run_relink herdr-app
  check "exit 0 (got $RC)" eq "$RC" 0
  check "herdr-app is a real directory" test -d "$HOME/$d" -a ! -L "$HOME/$d"
  check "settings.json keeps what herdr wrote" eq "$(cat "$HOME/$d/settings.json" 2>/dev/null)" '{"zoom":2}'
  check "keys.json linked" linked_to "$d/keys.json" "$COPY/herdr-app/$d/keys.json"
  check "the repo's reference copy still there" test -f "$COPY/herdr-app/$d/settings.json"
}

s22_link_at_config_into_repo_kept() {
  ln -s "$COPY/packages" "$HOME/.config"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config")" "$COPY/packages"
  check "says it left it alone" left_alone_line .config "it points into this repo, but not at .config in a package"
}

s23_file_link_into_other_worktree_relinked() {
  ln -s "$SIBLING/bash/.bashrc" "$HOME/.bashrc"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".bashrc linked to this worktree" linked_to .bashrc "$COPY/bash/.bashrc"
  check "says so" grep -qxF "relinking $HOME/.bashrc from $SIBLING/bash to $COPY/bash" <<<"$OUT"
}

s24_nothing_created_below_foreign_systemd() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.config"
  ln -s "$ROOT/elsewhere" "$HOME/.config/systemd"
  run_install arch
  check "exit 1 (got $RC)" eq "$RC" 1
  check "nothing created there" eq "$(ls -A "$ROOT/elsewhere")" ""
  check "says it left it alone" left_alone_line .config/systemd "it points outside this repo"
}

# expect_program_dirs_real <class> <dir...>: a fresh home on the class gets each
# directory as a real one.
expect_program_dirs_real() {
  local class=$1 d
  shift
  run_install "$class"
  check "exit 0 (got $RC)" eq "$RC" 0
  for d in "$@"; do
    check "$d is a real directory" test -d "$HOME/$d" -a ! -L "$HOME/$d"
  done
}
program_dirs=(.claude .config/opencode .config/tmux .config/systemd/user .config/systemd/user/default.target.wants)
s27_fresh_debian() { expect_program_dirs_real debian "${program_dirs[@]}"; }
s28_fresh_arch() { expect_program_dirs_real arch "${program_dirs[@]}"; }
s29_fresh_steamdeck() {
  expect_program_dirs_real steamdeck "${program_dirs[@]}" \
    .config/systemd/user/session.slice.d .config/systemd/user/app.slice.d
}
s30_fresh_wsl_arch() { expect_program_dirs_real wsl-arch "${program_dirs[@]}"; }

s31_dangling_outside_worktrees_kept() {
  mkdir -p "$HOME/.config"
  ln -s /nonexistent/x "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" /nonexistent/x
  check "says it left it alone" left_alone_line .config/environment.d "its target does not exist"
}

s32_relink_backs_nothing_up() {
  printf 'own\n' >"$HOME/.bashrc"
  run_relink bash
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check "the file left as it is" eq "$(cat "$HOME/.bashrc")" own
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
  check "stow names the conflict" grep -q "over existing target .bashrc since neither a link nor a directory" <<<"$OUT"
}

stage=.config/environment.d.unfolding

s33_swap_failure_then_rerun() {
  with_program_files
  failing mv '*/environment.d.unfolding'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link is gone" test ! -e "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "written.conf in the staging directory" eq "$(cat "$HOME/$stage/written.conf" 2>/dev/null)" written
  check "names the command" grep -qxF \
    "all of it is there. Run this again, or: mv -T $HOME/$stage $HOME/.config/environment.d" <<<"$OUT"
  run_install debian
  check "rerun exit 0 (got $RC)" eq "$RC" 0
  check "rerun says it finished" grep -qxF \
    "finished making $HOME/.config/environment.d a real directory: moved $HOME/$stage, left by an earlier run, into its place" <<<"$OUT"
  check "rerun: written.conf in the home" eq "$(cat "$HOME/.config/environment.d/written.conf" 2>/dev/null)" written
  check "rerun: sub/deep.conf in the home" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
  check "rerun: no staging directory left" test ! -e "$HOME/$stage"
  check "rerun: mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
}

s34_stage_beside_existing_dir_stops() {
  mkdir -p "$HOME/.config/environment.d" "$HOME/$stage"
  printf 'kept\n' >"$HOME/$stage/kept.conf"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names both" grep -qxF \
    "stow-packages.sh: $HOME/$stage holds what an earlier run moved out of this repo for $HOME/.config/environment.d, which exists now." <<<"$OUT"
  check "the staging directory untouched" eq "$(cat "$HOME/$stage/kept.conf")" kept
  check "nothing stowed" test ! -e "$HOME/.bashrc"
}

# staged_then_written <content>: a first run stages sub/ but fails on
# written.conf; then the app writes sub/<file> through the link still standing.
staged_then_written() {
  with_program_files
  failing mv '*written.conf'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "first run exit 1 (got $RC)" eq "$RC" 1
  rm -rf "$ROOT/failbin"
  mkdir -p "$HOME/.config/environment.d/sub"
  printf '%s\n' "$2" >"$HOME/.config/environment.d/sub/$1"
}

s35_written_into_staged_dir_merged() {
  staged_then_written new.conf new
  run_install debian
  check "rerun exit 0 (got $RC)" eq "$RC" 0
  check "the staged file in the home" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
  check "the new file in the home" eq "$(cat "$HOME/.config/environment.d/sub/new.conf" 2>/dev/null)" new
  check "no staging directory left" test ! -e "$HOME/$stage"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s36_staged_file_written_again_stops() {
  local src=$COPY/mise/.config/environment.d
  staged_then_written deep.conf again
  run_install debian
  check "rerun exit 1 (got $RC)" eq "$RC" 1
  check "names the package's copy" grep -qxF "  $src/sub/deep.conf" <<<"$OUT"
  check "names the staged copy" grep -qxF "  $HOME/$stage/sub/deep.conf" <<<"$OUT"
  check "the link still there" test -L "$HOME/.config/environment.d"
  rm -- "$src/sub/deep.conf"
  run_install debian
  check "third run exit 0 (got $RC)" eq "$RC" 0
  check "the staged file in the home" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
}

s37_written_during_swap_moved_in() {
  local src=$COPY/mise/.config/environment.d
  with_program_files
  standin mv '*/environment.d.unfolding' "echo late >'$src/late.conf'"
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "late.conf a real file in the home" eq "$(cat "$HOME/.config/environment.d/late.conf" 2>/dev/null)" late
  check "says so" eq "$(grep -A1 -xF "moved into it what the app wrote into $src meanwhile:" <<<"$OUT" | tail -1)" "  late.conf"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s38_written_during_swap_clash_stops() {
  local src=$COPY/mise/.config/environment.d
  with_program_files
  standin mv '*/environment.d.unfolding' "echo again >'$src/written.conf'"
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the repo's copy, now staged" grep -qxF "  $HOME/$stage/written.conf" <<<"$OUT"
  check "names the live one" grep -qxF "  $HOME/.config/environment.d/written.conf" <<<"$OUT"
  check "the live one kept" eq "$(cat "$HOME/.config/environment.d/written.conf")" written
  check "the repo's copy kept" eq "$(cat "$HOME/$stage/written.conf" 2>/dev/null)" again
  check "the repo clean" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
  check "stowed all the same" linked_to .bashrc "$COPY/bash/.bashrc"
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
  rm -rf "$ROOT/failbin"
  run_install debian
  check "the next run exit 1 (got $RC)" eq "$RC" 1
  check "the next run names the staging directory" grep -qxF \
    "stow-packages.sh: $HOME/$stage holds what an earlier run moved out of this repo for $HOME/.config/environment.d, which exists now." <<<"$OUT"
  rm -rf "${HOME:?}/$stage"
  run_install debian
  check "once it is gone exit 0 (got $RC)" eq "$RC" 0
}

s39_reference_copy_changed_during_swap() {
  local ref=$COPY/claude/.claude/settings.json
  fold .claude "$COPY/claude"
  standin mv '*/.claude.unfolding' "echo changed >'$ref'"
  PATH=$ROOT/failbin:$PATH run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check "names the change" grep -qxF \
    "stow-packages.sh: $ref changed after it was copied into $HOME/.claude; compare it with $HOME/.claude/settings.json, the live file" <<<"$OUT"
}

# expect_refused <message> <argument...>: stow-packages.sh exits 2 with it.
expect_refused() {
  local message=$1
  shift
  run_stow "$@"
  check "$*: exit 2 (got $RC)" eq "$RC" 2
  check "$*: says $message" grep -qxF "stow-packages.sh: $message" <<<"$OUT"
}

s40_bad_arguments_refused() {
  printf 'own\n' >"$HOME/.bashrc"
  mkdir -p "$HOME/.claude" "$COPY/-x"
  printf 'live\n' >"$HOME/.claude/settings.json"
  expect_refused "no package given"
  expect_refused "no package given" --backup
  expect_refused "not a package name: ./claude" --backup ./claude
  expect_refused "not a package name: claude/.claude" --backup claude/.claude
  expect_refused "not a package name: claude//" --backup claude//
  expect_refused "not a package name: -x" --backup -x
  expect_refused "not a package name: ." --backup .
  expect_refused "not a package name: --backup" bash --backup
  expect_refused "no package nonexistent in $COPY" --backup nonexistent
  expect_refused "not a stow package, as it holds no dotfile: tests" --backup tests
  expect_refused "not a stow package, as it holds no dotfile: samples" --backup samples
  expect_refused "not a stow package, as it holds no dotfile: packages" --backup packages
  check "the file left as it is" eq "$(cat "$HOME/.bashrc")" own
  check "the live settings left as they are" eq "$(cat "$HOME/.claude/settings.json")" live
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
}

s41_trailing_slash_accepted() {
  run_stow bash/
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".bashrc linked" linked_to .bashrc "$COPY/bash/.bashrc"
}

s42_git_unusable_stops() {
  run_stow bash
  check "first run exit 0 (got $RC)" eq "$RC" 0
  standin git '*' "echo 'fatal: not a git repository' >&2; exit 128"
  PATH=$ROOT/failbin:$PATH run_stow --backup bash
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names git's error" grep -qxF "stow-packages.sh: git cannot read the repo at $COPY: fatal: not a git repository" <<<"$OUT"
  check ".bashrc still linked" linked_to .bashrc "$COPY/bash/.bashrc"
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
}

s43_find_failure_stops() {
  failing find '*'
  PATH=$ROOT/failbin:$PATH run_stow bash
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check "nothing stowed" test ! -e "$HOME/.bashrc" -a ! -L "$HOME/.bashrc"
}

s44_worktree_list_failure_stops() {
  failing git worktree
  PATH=$ROOT/failbin:$PATH run_stow bash
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check "nothing stowed" test ! -e "$HOME/.bashrc" -a ! -L "$HOME/.bashrc"
}

s45_directory_link_into_other_worktree_relinked() {
  printf 'extra\n' >"$SIBLING/git/.githooks/extra"
  ln -s "$SIBLING/git/.githooks" "$HOME/.githooks"
  run_relink git
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says so" grep -qxF "making $HOME/.githooks a real directory in place of its link to $SIBLING/git/.githooks" <<<"$OUT"
  check "lists what moves" eq "$(grep -A1 -xF "moving into it what $SIBLING does not track in git/.githooks:" <<<"$OUT" | tail -1)" "  extra"
  check "a real directory" test -d "$HOME/.githooks" -a ! -L "$HOME/.githooks"
  check "the file moved along" eq "$(cat "$HOME/.githooks/extra" 2>/dev/null)" extra
  check "gone from the other worktree" test ! -e "$SIBLING/git/.githooks/extra"
  check "linked to this worktree" linked_to .githooks/pre-commit "$COPY/git/.githooks/pre-commit"
}

s46_dangling_fold_into_sibling_worktrees_dir() {
  expect_dangling_removed "$ROOT/repo.worktrees/fix/gone/mise/.config/environment.d"
}

s47_relink_replaces_claude_settings_link() {
  mkdir -p "$HOME/.claude"
  printf '{"from":"sibling"}\n' >"$SIBLING/claude/.claude/settings.json"
  ln -s "$SIBLING/claude/.claude/settings.json" "$HOME/.claude/settings.json"
  run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check "a real file" test -f "$HOME/.claude/settings.json" -a ! -L "$HOME/.claude/settings.json"
  check "with what the link pointed at" eq "$(cat "$HOME/.claude/settings.json")" '{"from":"sibling"}'
  check "says so" grep -qxF "replaced the ~/.claude/settings.json link into the repo with a local copy" <<<"$OUT"
}

s48_relink_replaces_herdr_settings_link() {
  local d=.config/herdr-app
  mkdir -p "$HOME/$d"
  printf '{"zoom":3}\n' >"$SIBLING/herdr-app/$d/settings.json"
  ln -s "$SIBLING/herdr-app/$d/settings.json" "$HOME/$d/settings.json"
  run_relink herdr-app
  check "exit 0 (got $RC)" eq "$RC" 0
  check "a real file" test -f "$HOME/$d/settings.json" -a ! -L "$HOME/$d/settings.json"
  check "with what the link pointed at" eq "$(cat "$HOME/$d/settings.json")" '{"zoom":3}'
  check "says so" grep -qxF "replaced the ~/$d/settings.json link into the repo with a local copy" <<<"$OUT"
}

s49_link_two_levels_into_repo_kept() {
  local deep=$COPY/packages/sub/.config/environment.d
  mkdir -p "$deep" "$HOME/.config"
  printf 'x\n' >"$deep/x.conf"
  ln -s "$deep" "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$deep"
  check "its file still there" eq "$(cat "$deep/x.conf")" x
  check "says it left it alone" left_alone_line .config/environment.d \
    "it points into this repo, but not at .config/environment.d in a package"
}

s50_settings_link_outside_repo_kept() {
  mkdir -p "$HOME/.claude" "$ROOT/elsewhere"
  printf '{"mine":1}\n' >"$ROOT/elsewhere/settings.json"
  ln -s "$ROOT/elsewhere/settings.json" "$HOME/.claude/settings.json"
  run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the link left as it is" eq "$(readlink -- "$HOME/.claude/settings.json")" "$ROOT/elsewhere/settings.json"
  check "its file untouched" eq "$(cat "$ROOT/elsewhere/settings.json")" '{"mine":1}'
}

s51_settings_link_to_gone_file_reseeded() {
  mkdir -p "$HOME/.claude"
  ln -s "$COPY/claude/.claude/gone.json" "$HOME/.claude/settings.json"
  run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says it removed it" grep -qxF \
    "removed $HOME/.claude/settings.json: it was a link to $COPY/claude/.claude/gone.json, which no longer exists" <<<"$OUT"
  check "a real file" test -f "$HOME/.claude/settings.json" -a ! -L "$HOME/.claude/settings.json"
  check "the reference's content" cmp -s "$HOME/.claude/settings.json" "$COPY/claude/.claude/settings.json"
  check "says it seeded it" grep -qxF "seeded ~/.claude/settings.json from the repo reference" <<<"$OUT"
}

s52_link_into_other_package_relinked() {
  mkdir -p "$COPY/oldpkg"
  printf 'old\n' >"$COPY/oldpkg/.bashrc"
  ln -s "$COPY/oldpkg/.bashrc" "$HOME/.bashrc"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".bashrc linked to the bash package" linked_to .bashrc "$COPY/bash/.bashrc"
  check "says so" grep -qxF "relinking $HOME/.bashrc from $COPY/oldpkg to $COPY/bash" <<<"$OUT"
}

s53_written_into_moved_dir_during_swap_merged() {
  local src=$COPY/mise/.config/environment.d
  with_program_files
  standin mv '*/environment.d.unfolding' "mkdir -p '$src/sub' && echo new >'$src/sub/new.conf'"
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the moved file still there" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf" 2>/dev/null)" deep
  check "the new file merged in" eq "$(cat "$HOME/.config/environment.d/sub/new.conf" 2>/dev/null)" new
  check "says so" eq "$(grep -A1 -xF "moved into it what the app wrote into $src meanwhile:" <<<"$OUT" | tail -1)" "  sub"
  check "the repo clean again" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s54_rmdir_failure_keeps_link() {
  local link
  staged_then_written new.conf new
  link=$(readlink -- "$HOME/.config/environment.d")
  failing rmdir '*'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
  check "names sub as still there" eq "$(grep -A1 -xF "  still in $COPY/mise/.config/environment.d:" <<<"$OUT" | tail -1)" "    sub"
}

s55_no_stow_changes_nothing() {
  local tool link
  mkdir -p "$ROOT/nostow"
  for tool in bash dirname readlink git find sort uniq mkdir mv rm rmdir cp cksum mktemp date; do
    ln -s "$(command -v "$tool")" "$ROOT/nostow/$tool"
  done
  fold_env_d "$COPY/mise"
  link=$(readlink -- "$HOME/.config/environment.d")
  OUT=$(PATH=$ROOT/nostow "$COPY/stow-packages.sh" --backup mise host-debian 2>&1)
  RC=$?
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says so" grep -qxF "stow-packages.sh: stow not found; nothing changed" <<<"$OUT"
  check "the link left as it is" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
}

s56_one_package_in_conflict() {
  printf 'own\n' >"$HOME/.bashrc"
  run_relink bash git claude
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check "git stowed" linked_to .gitconfig "$COPY/git/.gitconfig"
  check "claude stowed" linked_to .claude/CLAUDE.md "$COPY/claude/.claude/CLAUDE.md"
  check "the file left as it is" eq "$(cat "$HOME/.bashrc")" own
  check "names the package" grep -qxF "stow-packages.sh: not stowed: bash; stow says why above" <<<"$OUT"
}

s57_write_to_live_settings_after_swap_not_reported() {
  fold .claude "$COPY/claude"
  standin git ls-files "[ -L '$HOME/.claude' ] || echo '{\"app\":1}' >'$HOME/.claude/settings.json'"
  PATH=$ROOT/failbin:$PATH run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the app's write is there" eq "$(cat "$HOME/.claude/settings.json")" '{"app":1}'
  check "reports no change" eq "$(grep -c 'settings.json changed' <<<"$OUT")" 0
}

s58_link_into_unreadable_worktree_kept() {
  git -C "$COPY" worktree add -q --detach "$ROOT/pruned"
  rm -rf "$COPY/.git/worktrees/pruned"
  fold_env_d "$ROOT/pruned/mise"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" test -L "$HOME/.config/environment.d"
  check "names git's error" grep -q \
    "^stow-packages.sh: left alone: $HOME/.config/environment.d -> .*: git cannot read where it points: ." <<<"$OUT"
}

s59_file_gone_before_move_counts_as_moved() {
  local src=$COPY/mise/.config/environment.d
  with_program_files
  printf 'gone\n' >"$HOME/.config/environment.d/gone.conf"
  standin git ls-files "$(command -v git) \"\$@\"; rc=\$?; rm -f '$src/gone.conf'; exit \$rc"
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  check "no false still-in" eq "$(grep -c 'still in' <<<"$OUT")" 0
  check "written.conf in the home" eq "$(cat "$HOME/.config/environment.d/written.conf" 2>/dev/null)" written
}

s60_stage_beside_left_alone_link_named() {
  mkdir -p "$ROOT/elsewhere" "$HOME/$stage"
  ln -s "$ROOT/elsewhere" "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the staging directory" left_alone_line .config/environment.d \
    "it points outside this repo; $HOME/$stage holds what an earlier run staged for it"
}

s61_dangling_settings_link_into_removed_worktree() {
  mkdir -p "$HOME/.claude"
  ln -s "$COPY/.worktrees/gone/claude/.claude/settings.json" "$HOME/.claude/settings.json"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says it removed it" grep -qxF \
    "removed $HOME/.claude/settings.json: it was a link to $COPY/.worktrees/gone/claude/.claude/settings.json, which no longer exists" <<<"$OUT"
  check "a real file" test -f "$HOME/.claude/settings.json" -a ! -L "$HOME/.claude/settings.json"
  check "says it seeded it" grep -qxF "seeded ~/.claude/settings.json from the repo reference" <<<"$OUT"
}

s62_relink_seeds_settings() {
  run_relink claude
  check "exit 0 (got $RC)" eq "$RC" 0
  check "seeded" cmp -s "$HOME/.claude/settings.json" "$COPY/claude/.claude/settings.json"
  check "says so" grep -qxF "seeded ~/.claude/settings.json from the repo reference" <<<"$OUT"
}

s63_stop_after_making_real_names_it() {
  fold .claude "$COPY/claude"
  with_program_files
  failing mv '*written.conf'
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names what it made real" eq "$(grep -A1 -xF "so the package links in them are missing until a run gets through:" <<<"$OUT" | tail -1)" "  $HOME/.claude"
}

s64_top_level_clash_stops_next_run() {
  local src=$SIBLING/git/.githooks
  printf 'written\n' >"$src/written"
  ln -s "$src" "$HOME/.githooks"
  standin mv '*/.githooks.unfolding' "echo again >'$src/written'"
  PATH=$ROOT/failbin:$PATH run_relink git
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the repo's copy, now staged" grep -qxF "  $HOME/.githooks.unfolding/written" <<<"$OUT"
  check "names the live one" grep -qxF "  $HOME/.githooks/written" <<<"$OUT"
  rm -rf "$ROOT/failbin"
  run_relink git
  check "the next run exit 1 (got $RC)" eq "$RC" 1
  check "the next run names the staging directory" grep -qxF \
    "stow-packages.sh: $HOME/.githooks.unfolding holds what an earlier run moved out of this repo for $HOME/.githooks, which exists now." <<<"$OUT"
  check "the staged copy kept" eq "$(cat "$HOME/.githooks.unfolding/written" 2>/dev/null)" again
  rm -rf "${HOME:?}/.githooks.unfolding"
  run_relink git
  check "once it is gone exit 0 (got $RC)" eq "$RC" 0
}

# file_beside_stage <rel>: a file at ~/<rel> and a staging directory beside it
# that holds staged.
file_beside_stage() {
  mkdir -p "$HOME/$1.unfolding"
  printf 'own\n' >"$HOME/$1"
  printf 'staged\n' >"$HOME/$1.unfolding/staged"
}

# expect_file_beside_stage_left_alone <rel>: the run left both alone, said so
# once with what to do, and did not stop before stow.
expect_file_beside_stage_left_alone() {
  local live=$HOME/$1 stage=$HOME/$1.unfolding
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the file untouched" eq "$(cat "$live")" own
  check "the staged file untouched" eq "$(cat "$stage/staged")" staged
  check "says once what to do" eq "$(grep -cxF "stow-packages.sh: left alone: $live: a file where a directory belongs; $stage holds what an earlier run staged for it; move $live elsewhere, and the next run puts $stage in its place" <<<"$OUT")" 1
  check "no merge into a file" eq "$(grep -c 'Move what you want to keep' <<<"$OUT")" 0
  check "stow names the conflict" grep -q "over existing target $1 since neither a link nor a directory" <<<"$OUT"
}

# expect_stage_put_in_place <rel>: once the file is moved elsewhere, the next
# run puts the staging directory in its place.
expect_stage_put_in_place() {
  local live=$HOME/$1 stage=$HOME/$1.unfolding
  mkdir -p "$ROOT/elsewhere"
  mv -- "$live" "$ROOT/elsewhere/file"
  "${@:2}"
  check "then exit 0 (got $RC)" eq "$RC" 0
  check "then says it finished" grep -qxF \
    "finished making $live a real directory: moved $stage, left by an earlier run, into its place" <<<"$OUT"
  check "then the staged file in place" eq "$(cat "$live/staged" 2>/dev/null)" staged
}

s65_file_at_claude_beside_stage_left_alone() {
  file_beside_stage .claude
  run_install debian
  expect_file_beside_stage_left_alone .claude
  check "the other packages stowed" linked_to .bashrc "$COPY/bash/.bashrc"
  expect_stage_put_in_place .claude run_install debian
  check "then CLAUDE.md linked" linked_to .claude/CLAUDE.md "$COPY/claude/.claude/CLAUDE.md"
}

s66_file_at_top_level_dir_beside_stage_left_alone() {
  file_beside_stage .githooks
  run_relink git
  expect_file_beside_stage_left_alone .githooks
  expect_stage_put_in_place .githooks run_relink git
  check "then pre-commit linked" linked_to .githooks/pre-commit "$COPY/git/.githooks/pre-commit"
}

# expect_stage_beside_own_fold_stops: a run over a fold of ~/.githooks into
# the git package with a staging directory beside it stops, names both, leaves
# the link and the staged file as they are and stows nothing; the caller
# checks what it says to do.
expect_stage_beside_own_fold_stops() {
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names both and the repo" grep -qxF \
    "stow-packages.sh: $HOME/.githooks.unfolding holds what an earlier run moved out of this repo for $HOME/.githooks, which is now stow's link to $COPY/git/.githooks: what is moved into it lands in the repo." <<<"$OUT"
  check "no merge into the link" eq "$(grep -c 'Move what you want to keep' <<<"$OUT")" 0
  check "the staged file untouched" eq "$(cat "$HOME/.githooks.unfolding/staged")" staged
  check "the link untouched" linked_to .githooks "$COPY/git/.githooks"
  check "nothing stowed" test ! -e "$HOME/.gitconfig"
}

# expect_stage_put_in_place_of_own_fold: once the link is gone, the next run
# puts the staging directory in its place, and the repo is clean.
expect_stage_put_in_place_of_own_fold() {
  rm -- "$HOME/.githooks"
  run_relink git
  check "then exit 0 (got $RC)" eq "$RC" 0
  check "then a real directory" test -d "$HOME/.githooks" -a ! -L "$HOME/.githooks"
  check "then the staged file in place" eq "$(cat "$HOME/.githooks/staged" 2>/dev/null)" staged
  check "then pre-commit linked" linked_to .githooks/pre-commit "$COPY/git/.githooks/pre-commit"
  check "then the repo clean" eq "$(git -C "$COPY" status --porcelain --ignored)" ""
}

s67_stage_beside_fold_into_own_package_stops() {
  fold .githooks "$COPY/git"
  mkdir -p "$HOME/.githooks.unfolding"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  run_relink git
  expect_stage_beside_own_fold_stops
  check "says what to do" grep -qxF \
    "To keep it out of the repo, remove the link $HOME/.githooks and run this again; the run then puts $HOME/.githooks.unfolding in its place, and stow links the package's files into it." <<<"$OUT"
  expect_stage_put_in_place_of_own_fold
}

s78_stage_beside_own_fold_names_app_files() {
  local src=$COPY/git/.githooks
  fold .githooks "$COPY/git"
  mkdir -p "$HOME/.githooks.unfolding" "$HOME/.githooks/sub"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  printf 'app\n' >"$HOME/.githooks/app"
  printf 'deep\n' >"$HOME/.githooks/sub/deep"
  run_relink git
  expect_stage_beside_own_fold_stops
  check "names what the app wrote, then what to do" eq "$(grep -A3 -xF "The app already wrote these through the link into the repo, untracked in $src:" <<<"$OUT" | tail -3)" \
    "  app
  sub
To keep it all out of the repo, move these from $src into $HOME/.githooks.unfolding, then remove the link $HOME/.githooks and run this again; the run then puts $HOME/.githooks.unfolding in its place, and stow links the package's files into it."
  mv -- "$src/app" "$src/sub" "$HOME/.githooks.unfolding/"
  expect_stage_put_in_place_of_own_fold
  check "then the app's files in place" eq "$(cat "$HOME/.githooks/app" "$HOME/.githooks/sub/deep" 2>/dev/null | tr '\n' ' ')" "app deep "
}

s68_dangling_top_level_links_into_removed_worktrees_removed() {
  local in_sibling=$ROOT/repo.worktrees/fix/gone/bash/.bashrc in_inner=$COPY/.worktrees/gone/inputrc/.inputrc
  ln -s "$(realpath -m --relative-to="$HOME" "$in_sibling")" "$HOME/.bashrc"
  ln -s "$in_inner" "$HOME/.inputrc"
  run_relink bash inputrc
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says it removed .bashrc" grep -qxF \
    "removed $HOME/.bashrc: it was a link to $in_sibling, which no longer exists" <<<"$OUT"
  check "says it removed .inputrc" grep -qxF \
    "removed $HOME/.inputrc: it was a link to $in_inner, which no longer exists" <<<"$OUT"
  check ".bashrc linked" linked_to .bashrc "$COPY/bash/.bashrc"
  check ".inputrc linked" linked_to .inputrc "$COPY/inputrc/.inputrc"
}

s69_dangling_top_level_link_beside_stage_settled() {
  local gone=$ROOT/repo.worktrees/fix/gone/git/.githooks
  ln -s "$gone" "$HOME/.githooks"
  mkdir -p "$HOME/.githooks.unfolding"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  run_relink git
  check "exit 0 (got $RC)" eq "$RC" 0
  check "says it removed it" grep -qxF "removed $HOME/.githooks: it was a link to $gone, which no longer exists" <<<"$OUT"
  check "says it finished" grep -qxF \
    "finished making $HOME/.githooks a real directory: moved $HOME/.githooks.unfolding, left by an earlier run, into its place" <<<"$OUT"
  check "a real directory" test -d "$HOME/.githooks" -a ! -L "$HOME/.githooks"
  check "the staged file in place" eq "$(cat "$HOME/.githooks/staged" 2>/dev/null)" staged
  check "pre-commit linked" linked_to .githooks/pre-commit "$COPY/git/.githooks/pre-commit"
}

s70_dangling_top_level_link_outside_worktrees_kept() {
  ln -s /nonexistent/.bashrc "$HOME/.bashrc"
  ln -s "$ROOT/elsewhere/.inputrc" "$HOME/.inputrc"
  run_relink bash inputrc
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check ".bashrc left as it is" eq "$(readlink -- "$HOME/.bashrc")" /nonexistent/.bashrc
  check ".inputrc left as it is" eq "$(readlink -- "$HOME/.inputrc")" "$ROOT/elsewhere/.inputrc"
  check "removes nothing" eq "$(grep -c '^removed ' <<<"$OUT")" 0
  check "says it left .bashrc alone" left_alone_line .bashrc "its target does not exist; remove or move it, then run this again"
  check "stow names the conflict" grep -q "existing target is not owned by stow: .bashrc" <<<"$OUT"
}

s71_late_clash_on_listed_top_level_dir_stows() {
  local src=$COPY/claude/.claude
  fold .claude "$COPY/claude"
  printf 'written\n' >"$HOME/.claude/written"
  standin mv '*/.claude.unfolding' "echo again >'$src/written'"
  PATH=$ROOT/failbin:$PATH run_relink
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the repo's copy, now staged" grep -qxF "  $HOME/.claude.unfolding/written" <<<"$OUT"
  check "names the live one" grep -qxF "  $HOME/.claude/written" <<<"$OUT"
  check "stowed all the same" linked_to .claude/CLAUDE.md "$COPY/claude/.claude/CLAUDE.md"
  check "does not stop on the staging directory" eq "$(grep -c 'Move what you want to keep' <<<"$OUT")" 0
}

# expect_stray_stage <rel> <package>: the run named the staging directory
# beside ~/<rel> as not belonging there, left it alone, stowed, and exited 1.
expect_stray_stage() {
  local stage=$HOME/$1.unfolding
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the staging directory" grep -qxF \
    "stow-packages.sh: left alone: $stage: an earlier run staged it for a directory at $HOME/$1, but $COPY/$2/$1 is no directory; move it elsewhere, or remove it if you need nothing in it" <<<"$OUT"
  check "no file where a directory belongs" eq "$(grep -c 'a file where a directory belongs' <<<"$OUT")" 0
  check "the staged file untouched" eq "$(cat "$stage/staged" 2>/dev/null)" staged
  check "$1 linked" linked_to "$1" "$COPY/$2/$1"
  check "names it at the end" stray_closing_line "$stage"
}

# stray_closing_line <stage>: the run's closing lines name it.
stray_closing_line() {
  eq "$(grep -A1 -xF "stow-packages.sh: no directory belongs beside these staging directories any more; move each elsewhere, or remove it if you need nothing in it:" <<<"$OUT" | tail -1)" "  $1"
}

s72_stage_beside_link_to_package_file_named() {
  run_relink bash
  mkdir -p "$HOME/.bashrc.unfolding"
  printf 'staged\n' >"$HOME/.bashrc.unfolding/staged"
  run_relink bash
  expect_stray_stage .bashrc bash
}

s73_stage_beside_dangling_file_link_named() {
  ln -s "$ROOT/repo.worktrees/fix/gone/bash/.bashrc" "$HOME/.bashrc"
  mkdir -p "$HOME/.bashrc.unfolding"
  printf 'staged\n' >"$HOME/.bashrc.unfolding/staged"
  run_relink bash
  check "says it removed it" grep -q "^removed $HOME/.bashrc: " <<<"$OUT"
  expect_stray_stage .bashrc bash
}

s77_stage_beside_relinked_file_link_named() {
  ln -s "$SIBLING/bash/.bashrc" "$HOME/.bashrc"
  mkdir -p "$HOME/.bashrc.unfolding"
  printf 'staged\n' >"$HOME/.bashrc.unfolding/staged"
  run_relink bash
  check "says it relinks it" grep -qxF "relinking $HOME/.bashrc from $SIBLING/bash to $COPY/bash" <<<"$OUT"
  expect_stray_stage .bashrc bash
}

s74_stage_beside_foreign_top_level_link_named() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.githooks.unfolding"
  ln -s "$ROOT/elsewhere" "$HOME/.githooks"
  run_relink git
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the staging directory" left_alone_line .githooks \
    "it points outside this repo; $HOME/.githooks.unfolding holds what an earlier run staged for it"
  check "the link left as it is" eq "$(readlink -- "$HOME/.githooks")" "$ROOT/elsewhere"
}

s75_stage_beside_link_to_file_where_dir_belongs() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.githooks.unfolding"
  printf 'own\n' >"$ROOT/elsewhere/file"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  ln -s "$ROOT/elsewhere/file" "$HOME/.githooks"
  run_relink git
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says what to do" left_alone_line .githooks \
    "it points outside this repo; $HOME/.githooks.unfolding holds what an earlier run staged for it; move $HOME/.githooks elsewhere, and the next run puts $HOME/.githooks.unfolding in its place"
  rm -- "$HOME/.githooks"
  run_relink git
  check "then exit 0 (got $RC)" eq "$RC" 0
  check "then the staged file in place" eq "$(cat "$HOME/.githooks/staged" 2>/dev/null)" staged
}

s76_stage_beside_link_to_file_where_file_belongs() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.bashrc.unfolding"
  printf 'own\n' >"$ROOT/elsewhere/file"
  ln -s "$ROOT/elsewhere/file" "$HOME/.bashrc"
  run_relink bash
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says it does not belong" left_alone_line .bashrc \
    "it points outside this repo; remove or move it, then run this again; $HOME/.bashrc.unfolding holds what an earlier run staged for it; no directory belongs here any more: move $HOME/.bashrc.unfolding elsewhere, or remove it if you need nothing in it"
  check "names it at the end" stray_closing_line "$HOME/.bashrc.unfolding"
}

# foreign_top_level_links [stage]: ~/.bashrc a link to a file outside the
# repo, ~/.inputrc a link dangling outside the worktrees; with "stage", a
# staging directory beside ~/.bashrc.
foreign_top_level_links() {
  mkdir -p "$ROOT/elsewhere"
  printf 'own\n' >"$ROOT/elsewhere/file"
  ln -s "$ROOT/elsewhere/file" "$HOME/.bashrc"
  ln -s /nonexistent/.inputrc "$HOME/.inputrc"
  if [ "${1:-}" = stage ]; then
    mkdir -p "$HOME/.bashrc.unfolding"
    printf 'staged\n' >"$HOME/.bashrc.unfolding/staged"
  fi
}
backed_up_link() { readlink -- "$HOME"/.dotfiles-pre-stow.*/"$1" 2>/dev/null; }

s79_backup_takes_foreign_top_level_links() {
  foreign_top_level_links
  run_stow --backup bash inputrc
  check "exit 0 (got $RC)" eq "$RC" 0
  check "leaves nothing alone" eq "$(grep -c 'left alone' <<<"$OUT")" 0
  check "names .bashrc" grep -qxF "$HOME/.bashrc -> $ROOT/elsewhere/file: it points outside this repo; it goes into the backup" <<<"$OUT"
  check "names .inputrc" grep -qxF "$HOME/.inputrc -> /nonexistent/.inputrc: its target does not exist; it goes into the backup" <<<"$OUT"
  check ".bashrc's link in the backup" eq "$(backed_up_link .bashrc)" "$ROOT/elsewhere/file"
  check ".inputrc's link in the backup" eq "$(backed_up_link .inputrc)" /nonexistent/.inputrc
  check "says so" grep -qxF "backed up 2 file(s)" <<<"$OUT"
  check ".bashrc linked" linked_to .bashrc "$COPY/bash/.bashrc"
  check ".inputrc linked" linked_to .inputrc "$COPY/inputrc/.inputrc"
}

s82_backup_leaves_foreign_link_beside_stage() {
  foreign_top_level_links stage
  run_stow --backup bash inputrc
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names .bashrc with the staging directory" left_alone_line .bashrc \
    "it points outside this repo; $HOME/.bashrc.unfolding holds what an earlier run staged for it; no directory belongs here any more: move $HOME/.bashrc.unfolding elsewhere, or remove it if you need nothing in it; then run this again, and the backup takes the link"
  check "names the staging directory at the end" stray_closing_line "$HOME/.bashrc.unfolding"
  check ".bashrc left as it is" eq "$(readlink -- "$HOME/.bashrc")" "$ROOT/elsewhere/file"
  check "the staged file untouched" eq "$(cat "$HOME/.bashrc.unfolding/staged" 2>/dev/null)" staged
  check ".bashrc not in the backup" eq "$(backed_up_link .bashrc)" ""
  check ".inputrc's link in the backup" eq "$(backed_up_link .inputrc)" /nonexistent/.inputrc
  check "says so" grep -qxF "backed up 1 file(s)" <<<"$OUT"
  check "leaves .inputrc to the backup" eq "$(grep -c "left alone: $HOME/.inputrc" <<<"$OUT")" 0
}

s83_relink_says_to_move_foreign_links() {
  foreign_top_level_links
  run_relink bash inputrc
  check "exit non-zero (got $RC)" test "$RC" -ne 0
  check "says what to do with .bashrc" left_alone_line .bashrc "it points outside this repo; remove or move it, then run this again"
  check "says what to do with .inputrc" left_alone_line .inputrc "its target does not exist; remove or move it, then run this again"
  check ".bashrc left as it is" eq "$(readlink -- "$HOME/.bashrc")" "$ROOT/elsewhere/file"
  check ".inputrc left as it is" eq "$(readlink -- "$HOME/.inputrc")" /nonexistent/.inputrc
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
  check "says nothing about a backup" eq "$(grep -c 'backing up\|backed up' <<<"$OUT")" 0
  check "stow names the conflict" grep -q "existing target is not owned by stow: .bashrc" <<<"$OUT"
}

s84_backup_takes_nested_foreign_link() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.githooks"
  printf 'own\n' >"$ROOT/elsewhere/file"
  ln -s "$ROOT/elsewhere/file" "$HOME/.githooks/pre-commit"
  run_stow --backup git
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the link in the backup" eq "$(backed_up_link .githooks/pre-commit)" "$ROOT/elsewhere/file"
  check "pre-commit linked" linked_to .githooks/pre-commit "$COPY/git/.githooks/pre-commit"
}

s85_dangling_link_beside_stage_where_dir_belongs() {
  mkdir -p "$HOME/$stage"
  printf 'staged\n' >"$HOME/$stage/staged"
  ln -s /nonexistent/x "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says what to do" left_alone_line .config/environment.d \
    "its target does not exist; $HOME/$stage holds what an earlier run staged for it; move $HOME/.config/environment.d elsewhere, and the next run puts $HOME/$stage in its place"
  rm -- "$HOME/.config/environment.d"
  run_install debian
  check "then exit 0 (got $RC)" eq "$RC" 0
  check "then the staged file in place" eq "$(cat "$HOME/.config/environment.d/staged" 2>/dev/null)" staged
}

s86_own_fold_listing_failure_says_what_to_do() {
  local src=$COPY/git/.githooks
  fold .githooks "$COPY/git"
  mkdir -p "$HOME/.githooks.unfolding"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  failing git '*ls-files*'
  PATH=$ROOT/failbin:$PATH run_relink git
  expect_stage_beside_own_fold_stops
  check "says the listing failed" grep -qxF \
    "stow-packages.sh: git ls-files failed in $COPY, so what the app wrote into $src cannot be listed." <<<"$OUT"
  check "says what to do" grep -qxF \
    "To keep it all out of the repo, move what git does not track in $src into $HOME/.githooks.unfolding, merging what $HOME/.githooks.unfolding already has into its own copy, then remove the link $HOME/.githooks and run this again; the run then puts $HOME/.githooks.unfolding in its place, and stow links the package's files into it." <<<"$OUT"
  check "says it once" eq "$(grep -c '^To keep it' <<<"$OUT")" 1
}

s87_own_fold_app_file_staged_too_merged() {
  local src=$COPY/git/.githooks
  fold .githooks "$COPY/git"
  mkdir -p "$HOME/.githooks.unfolding"
  printf 'staged\n' >"$HOME/.githooks.unfolding/staged"
  printf 'staged app\n' >"$HOME/.githooks.unfolding/app"
  ln -s /nonexistent/link "$HOME/.githooks.unfolding/link"
  printf 'app\n' >"$HOME/.githooks/app"
  printf 'link\n' >"$HOME/.githooks/link"
  printf 'new\n' >"$HOME/.githooks/new"
  run_relink git
  expect_stage_beside_own_fold_stops
  check "names what the app wrote, what is staged too, then what to do" \
    eq "$(grep -A7 -xF "The app already wrote these through the link into the repo, untracked in $src:" <<<"$OUT" | tail -7)" \
    "  app
  link
  new
$HOME/.githooks.unfolding already has these too:
  app
  link
To keep it all out of the repo, move everything in the first list from $src into $HOME/.githooks.unfolding, merging the ones $HOME/.githooks.unfolding already has into its own copies, then remove the link $HOME/.githooks and run this again; the run then puts $HOME/.githooks.unfolding in its place, and stow links the package's files into it."
  check "the staged app untouched" eq "$(cat "$HOME/.githooks.unfolding/app")" "staged app"
}

# expect_dangling_kept <message>: a run that could not drop a dangling link
# into a removed worktree at ~/.bashrc stops with the message.
expect_dangling_kept() {
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" test -L "$HOME/.bashrc"
  check "says so" grep -qxF "stow-packages.sh: $1" <<<"$OUT"
  check "nothing stowed" test ! -e "$HOME/.inputrc"
}

s80_dangling_link_rm_failure_stops() {
  local gone=$ROOT/repo.worktrees/fix/gone/bash/.bashrc
  ln -s "$gone" "$HOME/.bashrc"
  failing rm '*/.bashrc'
  PATH=$ROOT/failbin:$PATH run_relink bash inputrc
  expect_dangling_kept "could not remove $HOME/.bashrc, a dangling link to $gone; remove it and run this again"
}

s81_dangling_link_readlink_failure_stops() {
  ln -s "$ROOT/repo.worktrees/fix/gone/bash/.bashrc" "$HOME/.bashrc"
  failing readlink -m
  PATH=$ROOT/failbin:$PATH run_relink bash inputrc
  expect_dangling_kept "readlink could not resolve the dangling link $HOME/.bashrc, which stays; remove it and run this again"
}

s88_backup_names_link_into_unreadable_worktree() {
  git -C "$COPY" worktree add -q --detach "$ROOT/pruned"
  rm -rf "$COPY/.git/worktrees/pruned"
  ln -s "$ROOT/pruned/bash/.bashrc" "$HOME/.bashrc"
  run_stow --backup bash
  check "exit 0 (got $RC)" eq "$RC" 0
  check "names it with git's error" grep -qx \
    "$HOME/.bashrc -> $ROOT/pruned/bash/.bashrc: git cannot read where it points: .*; it goes into the backup" <<<"$OUT"
  check "the link in the backup" eq "$(backed_up_link .bashrc)" "$ROOT/pruned/bash/.bashrc"
  check ".bashrc linked" linked_to .bashrc "$COPY/bash/.bashrc"
}

s89_backup_keeps_link_into_repo_left_alone() {
  ln -s "$COPY/README.md" "$HOME/.bashrc"
  run_stow --backup bash
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says it left it alone" left_alone_line .bashrc "it points into this repo, but not at .bashrc in a package"
  check "the link left as it is" eq "$(readlink -- "$HOME/.bashrc")" "$COPY/README.md"
  check "nothing backed up" eq "$(find "$HOME" -maxdepth 1 -name '.dotfiles-pre-stow.*')" ""
}

all=(s1_fold_undone_on_debian s2_fold_undone_on_arch s3_fold_elsewhere_kept s4_program_files_moved
  s5_fold_into_other_worktree s6_nothing_created_below_other_link s7_link_into_repo_not_a_fold_kept
  s8_file_kept s9_fold_into_other_repo_kept s10_systemd_user_fold_on_steamdeck
  s11_program_file_named_like_package_file s12_parent_fold_with_partial_untracked_path
  s13_second_run_changes_nothing s14_relink_over_fold s15_git_failure_keeps_link s16_mv_failure_keeps_link
  s17_dangling_fold_into_removed_worktree s18_dangling_fold_into_registered_worktree
  s19_untracked_fold_target_moves_whole s20_folded_claude_keeps_live_settings s21_folded_herdr_on_arch
  s22_link_at_config_into_repo_kept s23_file_link_into_other_worktree_relinked
  s24_nothing_created_below_foreign_systemd s25_relink_keeps_live_claude_settings
  s26_relink_keeps_live_herdr_settings s27_fresh_debian s28_fresh_arch s29_fresh_steamdeck s30_fresh_wsl_arch
  s31_dangling_outside_worktrees_kept s32_relink_backs_nothing_up s33_swap_failure_then_rerun
  s34_stage_beside_existing_dir_stops s35_written_into_staged_dir_merged s36_staged_file_written_again_stops
  s37_written_during_swap_moved_in s38_written_during_swap_clash_stops s39_reference_copy_changed_during_swap
  s40_bad_arguments_refused s41_trailing_slash_accepted s42_git_unusable_stops s43_find_failure_stops
  s44_worktree_list_failure_stops s45_directory_link_into_other_worktree_relinked
  s46_dangling_fold_into_sibling_worktrees_dir s47_relink_replaces_claude_settings_link
  s48_relink_replaces_herdr_settings_link s49_link_two_levels_into_repo_kept
  s50_settings_link_outside_repo_kept s51_settings_link_to_gone_file_reseeded s52_link_into_other_package_relinked
  s53_written_into_moved_dir_during_swap_merged s54_rmdir_failure_keeps_link s55_no_stow_changes_nothing
  s56_one_package_in_conflict s57_write_to_live_settings_after_swap_not_reported
  s58_link_into_unreadable_worktree_kept s59_file_gone_before_move_counts_as_moved
  s60_stage_beside_left_alone_link_named s61_dangling_settings_link_into_removed_worktree s62_relink_seeds_settings
  s63_stop_after_making_real_names_it s64_top_level_clash_stops_next_run
  s65_file_at_claude_beside_stage_left_alone s66_file_at_top_level_dir_beside_stage_left_alone
  s67_stage_beside_fold_into_own_package_stops s68_dangling_top_level_links_into_removed_worktrees_removed
  s69_dangling_top_level_link_beside_stage_settled s70_dangling_top_level_link_outside_worktrees_kept
  s71_late_clash_on_listed_top_level_dir_stows s72_stage_beside_link_to_package_file_named
  s73_stage_beside_dangling_file_link_named s74_stage_beside_foreign_top_level_link_named
  s75_stage_beside_link_to_file_where_dir_belongs s76_stage_beside_link_to_file_where_file_belongs
  s77_stage_beside_relinked_file_link_named s78_stage_beside_own_fold_names_app_files
  s79_backup_takes_foreign_top_level_links s80_dangling_link_rm_failure_stops
  s81_dangling_link_readlink_failure_stops s82_backup_leaves_foreign_link_beside_stage
  s83_relink_says_to_move_foreign_links s84_backup_takes_nested_foreign_link
  s85_dangling_link_beside_stage_where_dir_belongs s86_own_fold_listing_failure_says_what_to_do
  s87_own_fold_app_file_staged_too_merged s88_backup_names_link_into_unreadable_worktree
  s89_backup_keeps_link_into_repo_left_alone)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  rm -rf "$HOME" "$ROOT/elsewhere" "$ROOT/other" "$ROOT/failbin" "$ROOT/gone" "$ROOT/repo.worktrees" \
    "$ROOT/pruned" "$ROOT/nostow" "$COPY/-x"
  mkdir -p "$HOME"
  for tree in "$COPY" "$SIBLING"; do
    git -C "$tree" clean -qffdx
    git -C "$tree" checkout -q -- .
  done
  git -C "$COPY" worktree prune
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
  if [ "$FAILED" != 0 ] || [ -n "${VERBOSE:-}" ]; then sed 's/^/    /' "$ROOT/$CASE.transcript" 2>/dev/null; fi
done
[ "$failures" = 0 ]
