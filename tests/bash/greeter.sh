#!/usr/bin/env bash
# Tests for the greeter in bash/.bashrc: when an interactive shell runs
# fastfetch. Each case starts an interactive bash on the repo's .bashrc in a
# clean environment whose PATH holds only a stand-in for fastfetch that logs
# its call.
#   g1  a top-level shell in a plain terminal window runs it
#   g2  a top-level shell in a herdr terminal (HC_TERMINAL_ID) does not
#   g3  a nested shell (SHLVL already 1) does not
# usage: greeter.sh [bashrc] [case ...]
#   The file defaults to the repo's bash/.bashrc, the cases to all of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.bashrc
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/greeter-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
mkdir -p "$HOME" "$ROOT/bin"
BASH_BIN=$(command -v bash)
printf '#!/bin/sh\necho fastfetch >>"%s/calls"\n' "$ROOT" >"$ROOT/bin/fastfetch"
chmod +x "$ROOT/bin/fastfetch"

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }

# shell [VAR=value ...]: an interactive bash on $SUT; the number of fastfetch
# runs in $RUNS. Only the given variables are set.
shell() {
  : >"$ROOT/calls"
  env -i PATH="$ROOT/bin" HOME="$HOME" TERM=dumb "$@" "$BASH_BIN" --rcfile "$SUT" -i -c true \
    </dev/null >/dev/null 2>&1
  RUNS=$(grep -c fastfetch "$ROOT/calls")
}

g1_plain_terminal() {
  shell
  check "fastfetch ran once (got $RUNS)" eq "$RUNS" 1
}

g2_herdr_terminal() {
  shell HC_TERMINAL_ID=t7
  check "fastfetch did not run (got $RUNS)" eq "$RUNS" 0
}

g3_nested_shell() {
  shell SHLVL=1
  check "fastfetch did not run (got $RUNS)" eq "$RUNS" 0
}

all=(g1_plain_terminal g2_herdr_terminal g3_nested_shell)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
