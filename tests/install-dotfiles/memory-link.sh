#!/usr/bin/env bash
# Tests for the memex package and the ~/Memory link that install-dotfiles.sh
# makes for the classes that stow it: one run of the installer per case, each
# in a throwaway home.
#   m1  the link is made, relative (memex/daniel/memory) as on the Deck, and a
#       second run leaves it
#   m2  a real directory at ~/Memory is left with its notes; the run ends
#       with exit 1 after the rest of the install
#   m3  a link at ~/Memory to somewhere else is left; exit 1
#   m4  an absolute link to the clone counts as the link
#   m5  without the clone no link is made; the run says why, exit 0
#   m6  the steamdeck class gets the same link
#   m7  a class without the memex package (arch) gets none
#   m8, m9  debian and steamdeck stow the memex package's five files
#   m10 a failing mise install still gets the link made; the run ends with
#       exit 1 and names mise install
#   m11 a failing mise install and a real directory at ~/Memory: exit 1, both
#       named
# usage: memory-link.sh [installer] [case ...]
#   The installer defaults to the repo's install-dotfiles.sh, the cases to all
#   of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. VERBOSE=1 prints every run's output. HOME points into a
# temporary directory for the whole run, and systemctl and mise are stand-ins
# that only log their calls, so neither the user manager nor mise is reached;
# the mise stand-in exits with $MISE_EXIT (default 0). The directory is
# removed at the end. Needs stow and git.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/install-dotfiles.sh
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/memory-link-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
unset XDG_CONFIG_HOME XDG_DATA_HOME
mkdir -p "$ROOT/bin"
for tool in systemctl mise; do
  printf '#!/bin/sh\necho "%s $*" >>"%s/calls"\n' "$tool" "$ROOT" >"$ROOT/bin/$tool"
  chmod +x "$ROOT/bin/$tool"
done
# shellcheck disable=SC2016 # expanded by the stand-in, not here
printf 'exit "${MISE_EXIT:-0}"\n' >>"$ROOT/bin/mise"
PATH=$ROOT/bin:$PATH

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }

# run_install <class>: output in $OUT, exit in $RC.
run_install() {
  OUT=$("$SUT" "$1" 2>&1)
  RC=$?
  { echo "\$ install-dotfiles.sh $1 -> exit $RC"; printf '%s\n' "$OUT"; } >>"$ROOT/$CASE.transcript"
}
with_clone() { mkdir -p "$HOME/memex/daniel/memory/global" && printf 'note\n' >"$HOME/memex/daniel/memory/global/MEMORY.md"; }

m1_link_made() {
  with_clone
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "Memory is a link" test -L "$HOME/Memory"
  check "relative, as on the Deck" eq "$(readlink -- "$HOME/Memory")" memex/daniel/memory
  check "reaches the clone's notes" eq "$(cat "$HOME/Memory/global/MEMORY.md" 2>/dev/null)" note
  check "says so" grep -qx "linked $HOME/Memory to memex/daniel/memory" <<<"$OUT"
  run_install debian
  check "second run exit 0 (got $RC)" eq "$RC" 0
  check "second run leaves the link" eq "$(readlink -- "$HOME/Memory")" memex/daniel/memory
  check "second run says nothing about it" eq "$(grep -c Memory <<<"$OUT")" 0
}

m2_real_directory_kept() {
  with_clone
  mkdir -p "$HOME/Memory/global"
  printf 'own note\n' >"$HOME/Memory/global/own.md"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "still a real directory" test -d "$HOME/Memory" -a ! -L "$HOME/Memory"
  check "its note untouched" eq "$(cat "$HOME/Memory/global/own.md")" "own note"
  check "the clone untouched" eq "$(cat "$HOME/memex/daniel/memory/global/MEMORY.md")" note
  check "says why" grep -qx "$HOME/Memory exists and is not the link to $HOME/memex/daniel/memory; left as it is." <<<"$OUT"
  check "the rest of the install done first" test -L "$HOME/.bashrc"
}

m3_other_link_kept() {
  with_clone
  mkdir -p "$ROOT/elsewhere"
  ln -s "$ROOT/elsewhere" "$HOME/Memory"
  run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the link still points elsewhere" eq "$(readlink -- "$HOME/Memory")" "$ROOT/elsewhere"
}

m4_absolute_link_accepted() {
  with_clone
  ln -s "$HOME/memex/daniel/memory" "$HOME/Memory"
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the link left as it is" eq "$(readlink -- "$HOME/Memory")" "$HOME/memex/daniel/memory"
}

m5_no_clone() {
  run_install debian
  check "exit 0 (got $RC)" eq "$RC" 0
  check "no Memory" test ! -e "$HOME/Memory" -a ! -L "$HOME/Memory"
  check "says what to do" grep -qx "no $HOME/memex/daniel/memory yet: clone memex and run this again for the $HOME/Memory link" <<<"$OUT"
}

m6_steamdeck_link_too() {
  with_clone
  run_install steamdeck
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the same link on the steamdeck class" eq "$(readlink -- "$HOME/Memory")" memex/daniel/memory
}

# A class without the memex package gets no link.
m7_no_link_without_memex() {
  with_clone
  run_install arch
  check "exit 0 (got $RC)" eq "$RC" 0
  check "no Memory on the arch class" test ! -e "$HOME/Memory" -a ! -L "$HOME/Memory"
}

# expect_memex_stowed <class>
expect_memex_stowed() {
  run_install "$1"
  check "exit 0 (got $RC)" eq "$RC" 0
  local f
  for f in .local/bin/memex-sync .local/bin/memex-watch .config/systemd/user/memex-sync.service \
    .config/systemd/user/memex-sync.timer .config/systemd/user/memex-watch.service; do
    check "$f linked to the memex package" eq "$(readlink -f -- "$HOME/$f")" "$(readlink -f -- "$(dirname "$SUT")/memex/$f")"
  done
}
m8_memex_stowed_on_debian() { expect_memex_stowed debian; }
m9_memex_stowed_on_steamdeck() { expect_memex_stowed steamdeck; }

m10_link_made_after_failed_mise() {
  with_clone
  : >"$ROOT/calls"
  MISE_EXIT=1 run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "mise install was run" grep -qx "mise install" "$ROOT/calls"
  check "the link made after it" eq "$(readlink -- "$HOME/Memory")" memex/daniel/memory
  check "names the mise install failure" grep -qx "mise install failed with exit 1; see its output above, fix it and run this again." <<<"$OUT"
}

m11_failed_mise_and_real_directory() {
  with_clone
  mkdir -p "$HOME/Memory"
  MISE_EXIT=1 run_install debian
  check "exit 1 (got $RC)" eq "$RC" 1
  check "still a real directory" test -d "$HOME/Memory" -a ! -L "$HOME/Memory"
  check "says why about Memory" grep -qx "$HOME/Memory exists and is not the link to $HOME/memex/daniel/memory; left as it is." <<<"$OUT"
  check "names the mise install failure" grep -qx "mise install failed with exit 1; see its output above, fix it and run this again." <<<"$OUT"
}

all=(m1_link_made m2_real_directory_kept m3_other_link_kept m4_absolute_link_accepted m5_no_clone
  m6_steamdeck_link_too m7_no_link_without_memex m8_memex_stowed_on_debian m9_memex_stowed_on_steamdeck
  m10_link_made_after_failed_mise m11_failed_mise_and_real_directory)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  rm -rf "$HOME"
  mkdir -p "$HOME"
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
  if [ "$FAILED" != 0 ] || [ -n "${VERBOSE:-}" ]; then sed 's/^/    /' "$ROOT/$CASE.transcript" 2>/dev/null; fi
done
[ "$failures" = 0 ]
