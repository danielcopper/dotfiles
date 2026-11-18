#!/usr/bin/env bash
# Tests for the startup of an interactive shell on bash/.bashrc: the fastfetch
# greeter, the TMUX variables a herdr terminal drops, and the gnome-keyring
# daemon that host-wsl-arch/.bashrc.local starts or attaches to. Each case
# starts an interactive bash on the repo's .bashrc, with the wsl-arch
# .bashrc.local in place, in a clean environment whose XDG_RUNTIME_DIR is a
# directory of the test and whose PATH holds only these:
#   fastfetch             a stand-in that logs its calls
#   gnome-keyring-daemon  a stand-in that acts like the real one on --start:
#     it attaches to a live daemon and prints nothing; otherwise it creates
#     $XDG_RUNTIME_DIR/keyring at 0700, or keyring-XXXXXX when that exists
#     with another mode, binds a socket named control there, leaves a
#     background child that keeps every inherited descriptor above 2, and
#     prints GNOME_KEYRING_CONTROL only for a keyring-XXXXXX directory. It
#     also writes a marker to stderr, which the shell must not show.
#   flock, mkdir          logging wrappers around the real tools that refuse
#                         any path outside the test directory
# Each shell gets 8 seconds (and 2 more to end after TERM); one still running
# then counts as hung.
#   f1  the first shell of a plain terminal window greets
#   f2  a top-level shell in a herdr terminal (HC_TERMINAL_ID) does not
#   f3  a nested shell (SHLVL already 1) does not
#   f4  a herdr terminal drops the TMUX and TMUX_PANE it inherited; a tmux
#       pane keeps its own
#   k1  with a live daemon the shell attaches to it, starts none, and exports
#       GNOME_KEYRING_CONTROL to its directory
#   k2  without one the shell starts it once, under the lock in
#       XDG_RUNTIME_DIR, the directory at 0700, and exports the variable
#   k3  an inherited GNOME_KEYRING_CONTROL is kept and the daemon not asked
#   k4  a herdr terminal starts the daemon too
#   k5  so does a nested shell in a tmux pane
#   k6  two shells starting at once: one starts the daemon, the other then
#       attaches, neither hangs, both export the variable
#   k7  a later shell attaches to the daemon an earlier one started
#   k8  a socket left by a dead daemon: a new daemon is started
#   k9  a keyring directory without a socket, or with a plain file named
#       control: the daemon is started
#   k10 a daemon that fails and prints nothing, with a plain file named
#       control or a dead daemon's socket in place: the variable stays unset,
#       the shell says so in one line on stderr with the daemon's exit code,
#       and still starts; a start ended by an interrupt (130, 143) says nothing
#   k11 with XDG_RUNTIME_DIR unset or empty the daemon and the lock are left
#       alone
#   k12 a lock another process holds on, also with a dead daemon's socket in
#       place: the shell gives up waiting after 5 s, says so in one line on
#       stderr (the only case with that line; k2 and k10 have none) and starts
#       without the variable instead of hanging
#   k13 a keyring directory at 0755, also with a dead daemon's socket in it:
#       the daemon starts in keyring-XXXXXX and the variable names that
# Every case also checks that the shell exited 0 within its time, read .bashrc
# to its end, found fastfetch, gnome-keyring-daemon and flock in PATH, kept no
# keyring_ variable, showed nothing of the daemon's own stderr and had no path
# refused, so a case that expects no call cannot pass on a shell that never got
# that far.
# usage: startup.sh [bashrc [bashrc.local]] [case ...]
#        startup.sh --list
#   The files default to the repo's bash/.bashrc and
#   host-wsl-arch/.bashrc.local, the cases to all of them. --list prints the
#   case names; every name in CASES must be a function of this file.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end. Needs flock, python3 and timeout.
set -uo pipefail
umask 022

CASES=(f1_plain_terminal f2_herdr_terminal f3_nested_shell f4_herdr_drops_tmux k1_live_daemon
  k2_no_daemon k3_keyring_inherited k4_herdr_terminal k5_nested_tmux_pane k6_parallel_start
  k7_later_shell k8_dead_socket k9_no_socket k10_daemon_fails k11_no_runtime_dir k12_stuck_lock
  k13_keyring_dir_0755)
if [ "${1:-}" = --list ]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi

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
# stop_daemons: end the background children the stand-in daemon left and
# k12's lock holder.
stop_daemons() {
  local pid
  if [ -f "$ROOT/pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null; done <"$ROOT/pids"
    rm -f "$ROOT/pids"
  fi
}
trap 'stop_daemons; rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
RUN=$ROOT/run
# A socket path is limited to 107 bytes; keyring-XXXXXX/control is the longest.
if [ $((${#RUN} + 23)) -gt 107 ]; then
  echo "FAIL: $RUN is too long for a socket path below it; set a shorter TMPDIR"
  exit 1
fi
mkdir -p "$HOME" "$ROOT/bin"
cp "$SUT_LOCAL" "$HOME/.bashrc.local"
BASH_BIN=$(command -v bash)
PYTHON_BIN=$(command -v python3)

printf '#!/bin/sh\necho "fastfetch $*" >>"%s/calls"\n' "$ROOT" >"$ROOT/bin/fastfetch"
for tool in flock mkdir; do
  cat >"$ROOT/bin/$tool" <<EOF
#!$BASH_BIN
echo "$tool \$*" >>"$ROOT/calls"
args=("\$@")
while [ \$# -gt 0 ]; do
  case "\$1" in
    -w | -E | -m) shift 2 ;;
    -*) shift ;;
    *)
      case "\$1" in "$ROOT"/*) ;; *) echo "refused \$1" >>"$ROOT/calls"; exit 1 ;; esac
      [ "$tool" = flock ] && break
      shift
      ;;
  esac
done
exec "$(command -v "$tool")" "\${args[@]}"
EOF
done
cat >"$ROOT/bin/gnome-keyring-daemon" <<EOF
#!$BASH_BIN
echo "gnome-keyring-daemon \$*" >>"$ROOT/calls"
echo "stand-in daemon on stderr" >&2
[ "\${KEYRING_MODE:-}" = fail ] && exit 3
[ -n "\${KEYRING_EXIT:-}" ] && exit "\$KEYRING_EXIT"
dir=\$XDG_RUNTIME_DIR/keyring
pidfile=\$XDG_RUNTIME_DIR/stand-in-daemon.pid
if [ -S "\$dir/control" ] && [ -f "\$pidfile" ] && kill -0 "\$("$(command -v cat)" "\$pidfile")" 2>/dev/null; then
  echo attach >>"$ROOT/calls"
  exit 0
fi
# A second start while the first is still inside logs "overlap".
if ! "$(command -v mkdir)" "$ROOT/inside" 2>/dev/null; then
  echo overlap >>"$ROOT/calls"
fi
"$(command -v sleep)" "\${KEYRING_SLEEP:-0}"
other=""
if [ -e "\$dir" ] && [ "\$("$(command -v stat)" -c %a "\$dir")" != 700 ]; then
  dir=\$("$(command -v mktemp)" -d "\$XDG_RUNTIME_DIR/keyring-XXXXXX")
  other=1
elif [ ! -e "\$dir" ]; then
  "$(command -v mkdir)" -m 700 "\$dir"
fi
"$(command -v rm)" -f "\$dir/control"
if ! "$PYTHON_BIN" -Ic 'import socket, sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])' "\$dir/control" 2>/dev/null; then
  echo "bind failed" >>"$ROOT/calls"
  exit 1
fi
"$(command -v sleep)" 60 </dev/null >/dev/null 2>&1 &
echo \$! >"\$pidfile"
echo \$! >>"$ROOT/pids"
echo "started \$dir" >>"$ROOT/calls"
"$(command -v rmdir)" "$ROOT/inside" 2>/dev/null
[ -n "\$other" ] && echo "GNOME_KEYRING_CONTROL=\$dir"
exit 0
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
absent() { # absent <pattern> <file>: no line matches; a grep error fails too
  grep -q -- "$1" "$2"
  [ $? = 1 ]
}

# start_shell <tag> [--no-runtime-dir] [VAR=value ...]: an interactive bash on
# $SUT; what it ends with goes to $ROOT/control.<tag>, one key=value line each,
# its stderr to $ROOT/stderr.<tag>, its exit code to $ROOT/rc.<tag>; the
# previous run's files of that tag are removed first. Only PATH, HOME, TERM,
# XDG_RUNTIME_DIR (left out with --no-runtime-dir) and the given variables are
# set.
start_shell() {
  local tag=$1
  shift
  local runtime=("XDG_RUNTIME_DIR=$RUN")
  if [ "${1:-}" = --no-runtime-dir ]; then
    runtime=()
    shift
  fi
  rm -f "$ROOT/control.$tag" "$ROOT/stderr.$tag" "$ROOT/rc.$tag"
  # The braces' stderr takes bash's notice about a killed hung shell.
  # shellcheck disable=SC2016 # expanded by the inner bash, not here
  { timeout -k 2 8 env -i PATH="$ROOT/bin" HOME="$HOME" TERM=dumb "${runtime[@]}" "$@" \
    "$BASH_BIN" --rcfile "$SUT" -i -c '
    {
      echo "fastfetch=$(command -v fastfetch || echo missing)"
      echo "daemon=$(command -v gnome-keyring-daemon || echo missing)"
      echo "flock=$(command -v flock || echo missing)"
      case ":$PATH:" in *":$HOME/.opencode/bin:"*) echo "end=yes" ;; *) echo "end=no" ;; esac
      echo "gkc=$(declare -p GNOME_KEYRING_CONTROL 2>/dev/null || echo unset)"
      echo "tmux=${TMUX-unset}"
      echo "tmux_pane=${TMUX_PANE-unset}"
      vars=$(compgen -v keyring_)
      echo "keyring_vars=${vars//[[:space:]]/ }"
    } >"$1"' _ "$ROOT/control.$tag" </dev/null >/dev/null 2>"$ROOT/stderr.$tag"; } 2>/dev/null
  echo $? >"$ROOT/rc.$tag"
}
get() { sed -n "s/^$2=//p" "$ROOT/control.$1" 2>/dev/null; } # get <tag> <key>
# controls <tag>: the shell exited 0 within its time, read .bashrc to its end,
# found fastfetch, gnome-keyring-daemon and flock in PATH, kept no keyring_
# variable, showed nothing of the daemon's own stderr, and had no path refused.
controls() {
  local tool want rc
  rc=$(cat "$ROOT/rc.$1" 2>/dev/null)
  if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
    fail "hung: still running after 8 s (exit $rc)"
  else
    check "exited 0 (got ${rc:-nothing})" eq "$rc" 0
  fi
  for tool in fastfetch daemon flock; do
    want=$ROOT/bin/$tool
    [ "$tool" = daemon ] && want=$ROOT/bin/gnome-keyring-daemon
    check "control: $tool found (got $(get "$1" "$tool"))" eq "$(get "$1" "$tool")" "$want"
  done
  check "control: .bashrc read to its end" eq "$(get "$1" end)" yes
  check "control: keyring_vars written" grep -q "^keyring_vars=" "$ROOT/control.$1"
  check "no keyring_ variable left (got $(get "$1" keyring_vars))" eq "$(get "$1" keyring_vars)" ""
  check "daemon's stderr kept out of the shell" absent "stand-in daemon on stderr" "$ROOT/stderr.$1"
  check "nothing refused (calls: $(cat "$ROOT/calls"))" absent "^refused" "$ROOT/calls"
}
# shell [--no-runtime-dir] [VAR=value ...]: start_shell and controls in one;
# greeter runs in $GREETS, daemon starts in $STARTS, attaches in $ATTACHES,
# `declare -p` of the shell's GNOME_KEYRING_CONTROL in $GKC.
shell() {
  start_shell one "$@"
  controls one
  counts one
}
counts() {
  GREETS=$(grep -c '^fastfetch' "$ROOT/calls")
  STARTS=$(grep -c '^started' "$ROOT/calls")
  ATTACHES=$(grep -c '^attach' "$ROOT/calls")
  GKC=$(get "$1" gkc)
}
calls() { cat "$ROOT/calls"; }
EXPORTED="declare -x GNOME_KEYRING_CONTROL=\"$RUN/keyring\""
socket() { # socket <path>: a unix socket nobody listens on
  "$PYTHON_BIN" -Ic 'import socket, sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])' "$1"
  [ -S "$1" ] || { echo "FAIL $CASE: could not create the socket $1"; exit 1; }
}
# lock_held: someone holds the lock; an error of flock itself is no answer.
lock_held() {
  flock -n -E 99 "$RUN/keyring.lock" true
  [ $? = 99 ]
}
# other_dir <declare -p output>: exported to $RUN/keyring-XXXXXX.
other_dir() {
  local prefix="declare -x GNOME_KEYRING_CONTROL=\"$RUN/keyring-" suffix='^[A-Za-z0-9]{6}"$'
  [[ $1 == "$prefix"* ]] && [[ ${1#"$prefix"} =~ $suffix ]]
}
BUSY="keyring: $RUN/keyring.lock busy for 5 s, GNOME_KEYRING_CONTROL not set"
started() { # started: the daemon started once and exported (shell one)
  check "daemon started once (got $STARTS; calls: $(calls))" eq "$STARTS" 1
  check "exported (got $GKC)" eq "$GKC" "$EXPORTED"
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

k1_live_daemon() {
  XDG_RUNTIME_DIR=$RUN "$ROOT/bin/gnome-keyring-daemon" --start >/dev/null 2>&1
  : >"$ROOT/calls"
  shell
  check "no daemon started (got $STARTS; calls: $(calls))" eq "$STARTS" 0
  check "attached (got $ATTACHES)" eq "$ATTACHES" 1
  check "exported to its directory (got $GKC)" eq "$GKC" "$EXPORTED"
}

k2_no_daemon() {
  shell
  started
  check "no keyring line on stderr" absent "^keyring: " "$ROOT/stderr.one"
  check "under the lock in XDG_RUNTIME_DIR (calls: $(calls))" grep -q "^flock .*$RUN/keyring.lock" "$ROOT/calls"
  check "with the secrets component" grep -qx "gnome-keyring-daemon --start --components=secrets" "$ROOT/calls"
  check "the default directory, at 0700" eq "$(stat -c %a "$RUN/keyring" 2>/dev/null)" 700
}

k3_keyring_inherited() {
  shell GNOME_KEYRING_CONTROL=/elsewhere/keyring
  check "daemon not asked (calls: $(calls))" absent "^gnome-keyring-daemon" "$ROOT/calls"
  check "kept (got $GKC)" eq "$GKC" 'declare -x GNOME_KEYRING_CONTROL="/elsewhere/keyring"'
}

k4_herdr_terminal() {
  shell HC_TERMINAL_ID=t7
  started
}

k5_nested_tmux_pane() {
  shell SHLVL=1 "TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5
  started
}

k6_parallel_start() {
  start_shell a KEYRING_SLEEP=0.5 &
  start_shell b KEYRING_SLEEP=0.5 &
  wait
  controls a
  controls b
  counts a
  check "one start (got $STARTS; calls: $(calls))" eq "$STARTS" 1
  check "one attach (got $ATTACHES)" eq "$ATTACHES" 1
  check "one after the other" absent "^overlap" "$ROOT/calls"
  check "first shell exported (got $(get a gkc))" eq "$(get a gkc)" "$EXPORTED"
  check "second shell exported (got $(get b gkc))" eq "$(get b gkc)" "$EXPORTED"
}

k7_later_shell() {
  start_shell a
  controls a
  start_shell b
  controls b
  counts b
  check "one start (got $STARTS; calls: $(calls))" eq "$STARTS" 1
  check "the later shell attached (got $ATTACHES)" eq "$ATTACHES" 1
  check "the later shell exported (got $GKC)" eq "$GKC" "$EXPORTED"
}

k8_dead_socket() {
  mkdir -m 700 "$RUN/keyring"
  socket "$RUN/keyring/control"
  : >"$ROOT/calls"
  shell
  started
}

k9_no_socket() {
  mkdir -m 700 "$RUN/keyring"
  : >"$ROOT/calls"
  shell
  started
  stop_daemons
  rm -rf "${RUN:?}"/*
  mkdir -m 700 "$RUN/keyring"
  : >"$RUN/keyring/control"
  : >"$ROOT/calls"
  shell
  started
}

k10_daemon_fails() {
  mkdir -m 700 "$RUN/keyring"
  : >"$RUN/keyring/control"
  shell KEYRING_MODE=fail
  check "the daemon was asked (calls: $(calls))" grep -q "^gnome-keyring-daemon --start" "$ROOT/calls"
  check "not exported (got $GKC)" eq "$GKC" unset
  failed_line ""
  rm -f "$RUN/keyring/control"
  socket "$RUN/keyring/control"
  : >"$ROOT/calls"
  shell KEYRING_MODE=fail
  check "dead socket: the daemon was asked (calls: $(calls))" grep -q "^gnome-keyring-daemon --start" "$ROOT/calls"
  check "dead socket: not exported (got $GKC)" eq "$GKC" unset
  failed_line "dead socket: "
  local code
  for code in 130 143; do
    shell KEYRING_EXIT=$code
    check "exit $code: not exported (got $GKC)" eq "$GKC" unset
    check "exit $code: no keyring line on stderr" absent "^keyring: " "$ROOT/stderr.one"
  done
}

# failed_line <label>: the shell said, with the stand-in's exit code 3, that
# the start failed, and said nothing of a busy lock.
failed_line() {
  check "${1}says the start failed (got: $(cat "$ROOT/stderr.one"))" grep -qxF \
    "keyring: gnome-keyring-daemon --start failed (exit 3), GNOME_KEYRING_CONTROL not set" "$ROOT/stderr.one"
  check "${1}no busy line" absent "busy for 5 s" "$ROOT/stderr.one"
}

k11_no_runtime_dir() {
  local how
  for how in unset empty; do
    : >"$ROOT/calls"
    if [ "$how" = unset ]; then shell --no-runtime-dir; else shell XDG_RUNTIME_DIR=; fi
    check "$how: daemon not asked (calls: $(calls))" absent "^gnome-keyring-daemon" "$ROOT/calls"
    check "$how: no lock taken (calls: $(calls))" absent "^flock" "$ROOT/calls"
    check "$how: not exported (got $GKC)" eq "$GKC" unset
  done
}

k12_stuck_lock() {
  local holder tries how
  for how in plain dead-socket; do
    if [ "$how" = dead-socket ]; then
      mkdir -m 700 "$RUN/keyring"
      socket "$RUN/keyring/control"
    fi
    : >"$ROOT/calls"
    flock -F "$RUN/keyring.lock" sleep 20 &
    holder=$!
    echo "$holder" >>"$ROOT/pids"
    tries=0
    while ! lock_held && [ "$tries" -lt 50 ]; do
      sleep 0.1
      tries=$((tries + 1))
    done
    check "$how: the lock is held" lock_held
    shell
    kill "$holder" 2>/dev/null
    wait "$holder" 2>/dev/null
    check "$how: daemon not reached (calls: $(calls))" absent "^gnome-keyring-daemon" "$ROOT/calls"
    check "$how: not exported (got $GKC)" eq "$GKC" unset
    check "$how: one busy line on stderr (got: $(cat "$ROOT/stderr.one"))" \
      eq "$(grep -cxF "$BUSY" "$ROOT/stderr.one")" 1
    check "$how: no failure line" absent "start failed" "$ROOT/stderr.one"
  done
}

k13_keyring_dir_0755() {
  mkdir -m 755 "$RUN/keyring"
  shell
  check "daemon started once (got $STARTS; calls: $(calls))" eq "$STARTS" 1
  check "exported to keyring-XXXXXX (got $GKC)" other_dir "$GKC"
  stop_daemons
  rm -rf "${RUN:?}"/*
  mkdir -m 755 "$RUN/keyring"
  socket "$RUN/keyring/control"
  : >"$ROOT/calls"
  shell
  check "dead socket: daemon started once (got $STARTS; calls: $(calls))" eq "$STARTS" 1
  check "dead socket: exported to keyring-XXXXXX (got $GKC)" other_dir "$GKC"
}

missing=0
for CASE in "${CASES[@]}"; do
  if ! declare -F "$CASE" >/dev/null; then
    echo "FAIL $CASE: listed in CASES, but no such function"
    missing=1
  fi
done
[ "$missing" = 0 ] || exit 1

all=("${CASES[@]}")
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  stop_daemons
  rm -rf "$RUN" "$ROOT/inside"
  mkdir -p "$RUN"
  : >"$ROOT/calls"
  if printf '%s\n' "${CASES[@]}" | grep -qxF -- "$CASE" && declare -F "$CASE" >/dev/null; then
    "$CASE"
  else
    fail "no such case"
  fi
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
