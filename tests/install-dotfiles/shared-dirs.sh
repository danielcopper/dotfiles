#!/usr/bin/env bash
# Tests for the directories that must be real directories in $HOME, such as
# ~/.config/environment.d, which mise and, on arch and debian, the class's
# host package fill: stow-packages.sh makes each real before stow runs, also
# where an earlier run left it folded into one link to the repo. One run of
# install-dotfiles.sh (or of the dotfiles-relink task) per case, each in a
# throwaway home.
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
REAL_GIT=$(command -v git)
REAL_MV=$(command -v mv)

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

# failing <tool> <argument>: a stand-in for git or mv in $ROOT/failbin that
# exits 1 when one of its arguments contains <argument>, and runs the real
# tool otherwise.
failing() {
  local real=$REAL_GIT
  [ "$1" = mv ] && real=$REAL_MV
  mkdir -p "$ROOT/failbin"
  # shellcheck disable=SC2016 # expanded by the stand-in, not here
  printf '#!/bin/sh\nfor a; do case "$a" in *%s*) echo "%s stand-in: refused" >&2; exit 1 ;; esac; done\nexec %s "$@"\n' \
    "$2" "$1" "$real" >"$ROOT/failbin/$1"
  chmod +x "$ROOT/failbin/$1"
}

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
  check "rerun: no staging directory left" test ! -e "$HOME/.config/.environment.d.unfolding"
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
  failing git ls-files
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
  check "written.conf still in the package" eq "$(cat "$src/written.conf")" written
  check "no staging directory" test ! -e "$HOME/.config/.environment.d.unfolding"
  check "says so" grep -qxF \
    "stow-packages.sh: git ls-files failed in $COPY; $HOME/.config/environment.d stays the link to $src" <<<"$OUT"
  expect_retried
}

s16_mv_failure_keeps_link() {
  local link src=$COPY/mise/.config/environment.d
  with_program_files
  link=$(readlink -- "$HOME/.config/environment.d")
  failing mv written.conf
  PATH=$ROOT/failbin:$PATH run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still there" eq "$(readlink -- "$HOME/.config/environment.d")" "$link"
  check "written.conf still in the package" eq "$(cat "$src/written.conf")" written
  check "sub in the staging directory" eq "$(cat "$HOME/.config/.environment.d.unfolding/sub/deep.conf")" deep
  check "listed written.conf first" grep -qxF "  written.conf" <<<"$OUT"
  check "says the link stays" grep -qxF \
    "stow-packages.sh: $HOME/.config/environment.d stays the link to $src; run this again to finish." <<<"$OUT"
  check "says what stayed" eq "$(grep -A1 -xF "  still in $src:" <<<"$OUT" | tail -1)" "    written.conf"
  check "says what moved" eq "$(grep -A1 -xF "  already in $HOME/.config/.environment.d.unfolding:" <<<"$OUT" | tail -1)" "    sub"
  expect_retried
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
}

s25_relink_keeps_live_claude_settings() {
  fold .claude "$COPY/claude"
  printf '{"model":"mine"}\n' >"$HOME/.claude/settings.json"
  run_relink
  check "exit 0 (got $RC)" eq "$RC" 0
  check ".claude is a real directory" test -d "$HOME/.claude" -a ! -L "$HOME/.claude"
  check "settings.json keeps what Claude Code wrote" eq "$(cat "$HOME/.claude/settings.json" 2>/dev/null)" '{"model":"mine"}'
  check "settings.json a real file" test ! -L "$HOME/.claude/settings.json"
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
}

s24_nothing_created_below_foreign_systemd() {
  mkdir -p "$ROOT/elsewhere" "$HOME/.config"
  ln -s "$ROOT/elsewhere" "$HOME/.config/systemd"
  run_install arch
  check "exit 1 (got $RC)" eq "$RC" 1
  check "nothing created there" eq "$(ls -A "$ROOT/elsewhere")" ""
  check "says it left it alone" left_alone_line .config/systemd "it points outside this repo"
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
  s26_relink_keeps_live_herdr_settings)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  rm -rf "$HOME" "$ROOT/elsewhere" "$ROOT/other" "$ROOT/failbin" "$ROOT/gone"
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
