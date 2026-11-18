#!/usr/bin/env bash
# Tests for the one-time work of the first shell in bash/.bashrc: the fastfetch
# greeter, and the gnome-keyring daemon that host-wsl-arch/.bashrc.local starts.
# Each case starts an interactive bash on the repo's .bashrc, with the wsl-arch
# .bashrc.local in place, in a clean environment whose PATH holds only
# stand-ins: fastfetch and gnome-keyring-daemon log their calls, mkdir only
# logs, so nothing is created outside the test directory.
#   f1  the first shell of a plain terminal window greets and starts the
#       keyring daemon, exporting its GNOME_KEYRING_CONTROL
#   f2  a top-level shell in a herdr terminal (HC_TERMINAL_ID) does neither
#   f3  a nested shell (SHLVL already 1) does neither
#   f4  a shell in a tmux pane does not start the keyring daemon
#   f5  a shell that already has GNOME_KEYRING_CONTROL does not start it
# Every case also checks that the shell read .bashrc to its end and found the
# stand-ins, so a case that expects no call cannot pass on a shell that never
# got that far.
# usage: first-shell.sh [bashrc [bashrc.local]] [case ...]
#   The files default to the repo's bash/.bashrc and
#   host-wsl-arch/.bashrc.local, the cases to all of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.bashrc
SUT_LOCAL=$REPO/host-wsl-arch/.bashrc.local
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
  if [ $# -gt 0 ] && [ -f "$1" ]; then
    SUT_LOCAL=$(readlink -f "$1")
    shift
  fi
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/first-shell-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
mkdir -p "$HOME" "$ROOT/bin"
cp "$SUT_LOCAL" "$HOME/.bashrc.local"
BASH_BIN=$(command -v bash)
for tool in fastfetch mkdir; do
  printf '#!/bin/sh\necho "%s $*" >>"%s/calls"\n' "$tool" "$ROOT" >"$ROOT/bin/$tool"
done
printf '#!/bin/sh\necho "gnome-keyring-daemon $*" >>"%s/calls"\necho GNOME_KEYRING_CONTROL=/run/user/1000/keyring\n' \
  "$ROOT" >"$ROOT/bin/gnome-keyring-daemon"
chmod +x "$ROOT/bin/"*

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }

# shell [VAR=value ...]: an interactive bash on $SUT. The number of greeter
# runs in $GREETS, of keyring daemon starts in $KEYRINGS, the shell's
# GNOME_KEYRING_CONTROL in $GKC. Only the given variables are set. Checks that
# the shell got to the end of .bashrc and finds both stand-ins.
shell() {
  : >"$ROOT/calls"
  : >"$ROOT/control"
  # shellcheck disable=SC2016 # expanded by the inner bash, not here
  env -i PATH="$ROOT/bin" HOME="$HOME" TERM=dumb "$@" "$BASH_BIN" --rcfile "$SUT" -i -c '
    {
      command -v fastfetch gnome-keyring-daemon
      case ":$PATH:" in *":$HOME/.opencode/bin:"*) echo "read to the end" ;; esac
      echo "GNOME_KEYRING_CONTROL=${GNOME_KEYRING_CONTROL:-}"
    } >"$1"' _ "$ROOT/control" </dev/null >/dev/null 2>&1
  GREETS=$(grep -c '^fastfetch' "$ROOT/calls")
  KEYRINGS=$(grep -c '^gnome-keyring-daemon --start' "$ROOT/calls")
  GKC=$(sed -n 's/^GNOME_KEYRING_CONTROL=//p' "$ROOT/control")
  check "control: fastfetch found ($(sed -n 1p "$ROOT/control"))" eq "$(sed -n 1p "$ROOT/control")" "$ROOT/bin/fastfetch"
  check "control: gnome-keyring-daemon found ($(sed -n 2p "$ROOT/control"))" \
    eq "$(sed -n 2p "$ROOT/control")" "$ROOT/bin/gnome-keyring-daemon"
  check "control: .bashrc read to its end" grep -qx "read to the end" "$ROOT/control"
}

f1_plain_terminal() {
  shell
  check "greeter ran once (got $GREETS)" eq "$GREETS" 1
  check "keyring daemon started once (got $KEYRINGS)" eq "$KEYRINGS" 1
  check "GNOME_KEYRING_CONTROL exported (got '$GKC')" eq "$GKC" /run/user/1000/keyring
}

f2_herdr_terminal() {
  shell HC_TERMINAL_ID=t7
  check "no greeter (got $GREETS)" eq "$GREETS" 0
  check "no keyring daemon (got $KEYRINGS)" eq "$KEYRINGS" 0
}

f3_nested_shell() {
  shell SHLVL=1
  check "no greeter (got $GREETS)" eq "$GREETS" 0
  check "no keyring daemon (got $KEYRINGS)" eq "$KEYRINGS" 0
}

f4_tmux_pane() {
  shell "TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5
  check "no keyring daemon (got $KEYRINGS)" eq "$KEYRINGS" 0
}

f5_keyring_inherited() {
  shell GNOME_KEYRING_CONTROL=/run/user/1000/keyring
  check "no keyring daemon (got $KEYRINGS)" eq "$KEYRINGS" 0
  check "the inherited GNOME_KEYRING_CONTROL kept (got '$GKC')" eq "$GKC" /run/user/1000/keyring
}

all=(f1_plain_terminal f2_herdr_terminal f3_nested_shell f4_tmux_pane f5_keyring_inherited)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
