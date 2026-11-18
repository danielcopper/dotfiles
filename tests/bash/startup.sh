#!/usr/bin/env bash
# Tests for the startup of an interactive shell on bash/.bashrc: the fastfetch
# greeter, the TMUX variables a herdr terminal drops, and the gnome-keyring
# daemon that host-wsl-arch/.bashrc.local starts or reuses. Each case starts an
# interactive bash on the repo's .bashrc, with the wsl-arch .bashrc.local in
# place, in a clean environment: XDG_RUNTIME_DIR is a directory of the test,
# and PATH holds only stand-ins. fastfetch and gnome-keyring-daemon log their
# calls, flock logs its lock file and runs the real flock, mkdir only logs, so
# nothing is created outside the test directory.
#   f1  the first shell of a plain terminal window greets
#   f2  a top-level shell in a herdr terminal (HC_TERMINAL_ID) does not
#   f3  a nested shell (SHLVL already 1) does not
#   f4  a herdr terminal drops the TMUX and TMUX_PANE it inherited; a tmux
#       pane keeps its own
#   k1  with the daemon's control socket in place, GNOME_KEYRING_CONTROL is
#       exported to its directory and no daemon is started
#   k2  without it the daemon is started once, under the lock in
#       XDG_RUNTIME_DIR, and GNOME_KEYRING_CONTROL is exported
#   k3  an inherited GNOME_KEYRING_CONTROL is kept, no daemon started
#   k4  a herdr terminal without the socket starts the daemon too
#   k5  so does a nested shell in a tmux pane
#   k6  two shells starting at once reach the daemon one after the other, and
#       both export GNOME_KEYRING_CONTROL
# Every case also checks that the shell read .bashrc to its end and found the
# stand-ins, so a case that expects no call cannot pass on a shell that never
# got that far.
# usage: startup.sh [bashrc [bashrc.local]] [case ...]
#   The files default to the repo's bash/.bashrc and
#   host-wsl-arch/.bashrc.local, the cases to all of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end. Needs flock and python3.
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
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/startup-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
RUN=$ROOT/run
mkdir -p "$HOME" "$ROOT/bin"
cp "$SUT_LOCAL" "$HOME/.bashrc.local"
BASH_BIN=$(command -v bash)
FLOCK_BIN=$(command -v flock)
PYTHON_BIN=$(command -v python3)

for tool in fastfetch mkdir; do
  printf '#!/bin/sh\necho "%s $*" >>"%s/calls"\n' "$tool" "$ROOT" >"$ROOT/bin/$tool"
done
cat >"$ROOT/bin/flock" <<EOF
#!/bin/sh
echo "flock \$1" >>"$ROOT/calls"
exec "$FLOCK_BIN" "\$@"
EOF
# A second daemon entered while the first is still inside logs "overlap".
cat >"$ROOT/bin/gnome-keyring-daemon" <<EOF
#!/bin/sh
echo "gnome-keyring-daemon \$*" >>"$ROOT/calls"
if "$(command -v mkdir)" "$ROOT/inside" 2>/dev/null; then
  "$(command -v sleep)" "\${KEYRING_SLEEP:-0}"
  "$(command -v rmdir)" "$ROOT/inside"
else
  echo overlap >>"$ROOT/calls"
fi
echo "GNOME_KEYRING_CONTROL=\$XDG_RUNTIME_DIR/keyring"
EOF
chmod +x "$ROOT/bin/"*

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }

# start_shell <tag> [VAR=value ...]: an interactive bash on $SUT; what it ends
# with goes to $ROOT/control.<tag>, one key=value line each. Only the given
# variables and XDG_RUNTIME_DIR are set.
start_shell() {
  local tag=$1
  shift
  # shellcheck disable=SC2016 # expanded by the inner bash, not here
  env -i PATH="$ROOT/bin" HOME="$HOME" TERM=dumb XDG_RUNTIME_DIR="$RUN" "$@" \
    "$BASH_BIN" --rcfile "$SUT" -i -c '
    {
      echo "fastfetch=$(command -v fastfetch || echo missing)"
      echo "daemon=$(command -v gnome-keyring-daemon || echo missing)"
      echo "flock=$(command -v flock || echo missing)"
      case ":$PATH:" in *":$HOME/.opencode/bin:"*) echo "end=yes" ;; *) echo "end=no" ;; esac
      echo "gkc=$(declare -p GNOME_KEYRING_CONTROL 2>/dev/null || echo unset)"
      echo "tmux=${TMUX-unset}"
      echo "tmux_pane=${TMUX_PANE-unset}"
    } >"$1"' _ "$ROOT/control.$tag" </dev/null >/dev/null 2>&1
}
get() { sed -n "s/^$2=//p" "$ROOT/control.$1"; } # get <tag> <key>
# controls <tag>: the shell read .bashrc to its end and found the stand-ins.
controls() {
  local tool
  for tool in fastfetch daemon flock; do
    local want=$ROOT/bin/$tool
    [ "$tool" = daemon ] && want=$ROOT/bin/gnome-keyring-daemon
    check "control: $tool found (got $(get "$1" "$tool"))" eq "$(get "$1" "$tool")" "$want"
  done
  check "control: .bashrc read to its end" eq "$(get "$1" end)" yes
}
# shell [VAR=value ...]: start_shell and controls in one; the number of greeter
# runs in $GREETS, of daemon starts in $STARTS, `declare -p` of the shell's
# GNOME_KEYRING_CONTROL in $GKC.
shell() {
  : >"$ROOT/calls"
  start_shell one "$@"
  controls one
  GREETS=$(grep -c '^fastfetch' "$ROOT/calls")
  STARTS=$(grep -c '^gnome-keyring-daemon --start' "$ROOT/calls")
  GKC=$(get one gkc)
}
EXPORTED="declare -x GNOME_KEYRING_CONTROL=\"$RUN/keyring\""
socket() { # the daemon's control socket, as a running daemon leaves it
  mkdir -p "$RUN/keyring"
  "$PYTHON_BIN" -Ic 'import socket, sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])' "$RUN/keyring/control"
}

f1_plain_terminal() {
  shell
  check "greeter ran once (got $GREETS)" eq "$GREETS" 1
}

f2_herdr_terminal() {
  shell HC_TERMINAL_ID=t7
  check "no greeter (got $GREETS)" eq "$GREETS" 0
}

f3_nested_shell() {
  shell SHLVL=1
  check "no greeter (got $GREETS)" eq "$GREETS" 0
}

f4_herdr_drops_tmux() {
  shell HC_TERMINAL_ID=t7 "TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5
  check "TMUX dropped (got $(get one tmux))" eq "$(get one tmux)" unset
  check "TMUX_PANE dropped (got $(get one tmux_pane))" eq "$(get one tmux_pane)" unset
  shell "TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5
  check "a tmux pane keeps TMUX (got $(get one tmux))" eq "$(get one tmux)" "/tmp/tmux-1000/default,1,0"
  check "a tmux pane keeps TMUX_PANE (got $(get one tmux_pane))" eq "$(get one tmux_pane)" %5
}

k1_socket_present() {
  socket
  shell
  check "no daemon started (got $STARTS)" eq "$STARTS" 0
  check "exported to the socket's directory (got $GKC)" eq "$GKC" "$EXPORTED"
}

k2_socket_absent() {
  shell
  check "daemon started once (got $STARTS)" eq "$STARTS" 1
  check "under the lock in XDG_RUNTIME_DIR (calls: $(cat "$ROOT/calls"))" grep -qx "flock $RUN/keyring.lock" "$ROOT/calls"
  check "with the secrets component" grep -qx "gnome-keyring-daemon --start --components=secrets" "$ROOT/calls"
  check "exported (got $GKC)" eq "$GKC" "$EXPORTED"
}

k3_keyring_inherited() {
  shell GNOME_KEYRING_CONTROL=/elsewhere/keyring
  check "no daemon started (got $STARTS)" eq "$STARTS" 0
  check "kept (got $GKC)" eq "$GKC" 'declare -x GNOME_KEYRING_CONTROL="/elsewhere/keyring"'
}

k4_herdr_terminal() {
  shell HC_TERMINAL_ID=t7
  check "daemon started once (got $STARTS)" eq "$STARTS" 1
  check "exported (got $GKC)" eq "$GKC" "$EXPORTED"
}

k5_nested_tmux_pane() {
  shell SHLVL=1 "TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5
  check "daemon started once (got $STARTS)" eq "$STARTS" 1
  check "exported (got $GKC)" eq "$GKC" "$EXPORTED"
}

k6_parallel_start() {
  : >"$ROOT/calls"
  start_shell a KEYRING_SLEEP=0.5 &
  start_shell b KEYRING_SLEEP=0.5 &
  wait
  controls a
  controls b
  check "two starts (calls: $(cat "$ROOT/calls"))" eq "$(grep -c '^gnome-keyring-daemon --start' "$ROOT/calls")" 2
  check "one after the other (calls: $(cat "$ROOT/calls"))" eq "$(grep -c '^overlap' "$ROOT/calls")" 0
  check "first shell exported (got $(get a gkc))" eq "$(get a gkc)" "$EXPORTED"
  check "second shell exported (got $(get b gkc))" eq "$(get b gkc)" "$EXPORTED"
}

all=(f1_plain_terminal f2_herdr_terminal f3_nested_shell f4_herdr_drops_tmux k1_socket_present
  k2_socket_absent k3_keyring_inherited k4_herdr_terminal k5_nested_tmux_pane k6_parallel_start)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  rm -rf "$RUN" "$ROOT/inside"
  mkdir -p "$RUN"
  if declare -F "$CASE" >/dev/null; then
    "$CASE"
  else
    fail "no such case"
  fi
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
