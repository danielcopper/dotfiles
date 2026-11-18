#!/usr/bin/env bash
# Tests for the directories that several stowed packages fill, such as
# ~/.config/environment.d (mise and host-debian or host-arch): install-dotfiles.sh
# makes each a real directory before stow runs, also where an earlier run left
# it folded into one link to the repo. One run of the installer per case, each
# in a throwaway home.
#   s1  debian, ~/.config/environment.d folded into the mise package: the run
#       succeeds, the directory is real, and the files of both packages are
#       linked
#   s2  the same on the arch class with host-arch
#   s3  a link from ~/.config/environment.d to a directory outside the repo is
#       left as it is, with its files; stow names the conflict, exit 1
#   s4  files a program wrote through the fold, untracked in the repo, are moved
#       into the new real directory, also from a subdirectory and also when
#       git ignores them; the repo keeps its tracked files and is clean again
#   s5  a fold into another worktree of the repo is undone the same way, and
#       the program's files moved out of that worktree
#   s6  below a link to outside the repo (~/.local) nothing is created
#   s7  a link into the repo that is no fold of that directory, to packages/,
#       is left as it is, and so is the untracked file there
#   s8  a file in place of ~/.config/environment.d is left as it is; stow
#       names the conflict, exit 1
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
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/shared-dirs-test.XXXXXX")
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

# fold_env_d <package dir>: ~/.config/environment.d as the relative link to the
# package's directory that stow makes when only that package fills it.
fold_env_d() {
  mkdir -p "$HOME/.config"
  ln -s "$(realpath --relative-to="$HOME/.config" "$1/.config/environment.d")" "$HOME/.config/environment.d"
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
  ln -s "$ROOT/elsewhere" "$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points elsewhere" eq "$(readlink -- "$HOME/.config/environment.d")" "$ROOT/elsewhere"
  check "its file untouched" eq "$(cat "$ROOT/elsewhere/own.conf")" own
  check "nothing else in it" eq "$(ls -A "$ROOT/elsewhere")" own.conf
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
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "environment.d is a real directory" test -d "$HOME/.config/environment.d" -a ! -L "$HOME/.config/environment.d"
  local f
  for f in written.conf sub/deep.conf ignored.log; do
    check "$f is a real file in the home" test -f "$HOME/.config/environment.d/$f" -a ! -L "$HOME/.config/environment.d/$f"
    check "$f is gone from the package" test ! -e "$pkg_dir/$f"
  done
  check "written.conf kept its content" eq "$(cat "$HOME/.config/environment.d/written.conf")" written
  check "sub/deep.conf kept its content" eq "$(cat "$HOME/.config/environment.d/sub/deep.conf")" deep
  check "ignored.log kept its content" eq "$(cat "$HOME/.config/environment.d/ignored.log")" ignored
  check "the tracked file still in the package" test -f "$pkg_dir/mise-shims.conf"
  check "mise-shims.conf linked" linked_to .config/environment.d/mise-shims.conf "$COPY/mise/.config/environment.d/mise-shims.conf"
  check "ssh-agent.conf linked" linked_to .config/environment.d/ssh-agent.conf "$COPY/host-debian/.config/environment.d/ssh-agent.conf"
  check "names what it moved" grep -qx "  sub" <<<"$OUT"
  check "the repo clean again" eq "$(git -C "$1" status --porcelain --ignored)" ""
}
s4_program_files_moved() { expect_program_files_moved "$COPY"; }
s5_fold_into_other_worktree() { expect_program_files_moved "$SIBLING"; }

s6_nothing_created_below_other_link() {
  mkdir -p "$ROOT/elsewhere"
  ln -s "$ROOT/elsewhere" "$HOME/.local"
  run_install debian
  check "the link still points elsewhere" eq "$(readlink -- "$HOME/.local")" "$ROOT/elsewhere"
  check "nothing created there" eq "$(ls -A "$ROOT/elsewhere")" ""
}

s7_link_into_repo_not_a_fold_kept() {
  mkdir -p "$HOME/.config"
  printf 'stray\n' >"$COPY/packages/stray"
  ln -s "$COPY/packages" "$HOME/.config/environment.d"
  run_install debian
  check "the link still points into packages" eq "$(readlink -- "$HOME/.config/environment.d")" "$COPY/packages"
  check "the untracked file still there" eq "$(cat "$COPY/packages/stray")" stray
}

s8_file_kept() {
  mkdir -p "$HOME/.config"
  printf 'own\n' >"$HOME/.config/environment.d"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "still the file" eq "$(cat "$HOME/.config/environment.d")" own
  check "stow names the conflict" grep -q "over existing target .config/environment.d since neither a link nor a directory" <<<"$OUT"
}

all=(s1_fold_undone_on_debian s2_fold_undone_on_arch s3_fold_elsewhere_kept s4_program_files_moved
  s5_fold_into_other_worktree s6_nothing_created_below_other_link s7_link_into_repo_not_a_fold_kept
  s8_file_kept)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  rm -rf "$HOME" "$ROOT/elsewhere"
  mkdir -p "$HOME"
  git -C "$COPY" clean -qffdx
  git -C "$SIBLING" clean -qffdx
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
  if [ "$FAILED" != 0 ] || [ -n "${VERBOSE:-}" ]; then sed 's/^/    /' "$ROOT/$CASE.transcript" 2>/dev/null; fi
done
[ "$failures" = 0 ]
