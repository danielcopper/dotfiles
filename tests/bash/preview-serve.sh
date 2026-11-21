#!/usr/bin/env bash
# Tests for bash/.local/bin/preview-serve, which serves a directory on the
# home-network address and a port the range file allows. Each case runs the
# script in a clean environment (env -i) whose PATH holds stand-ins for ip, ss
# and python3 and links to the few real tools the script needs, so no root, no
# range file under /etc and no real port is involved:
#   ip       prints $ROOT/ip.out, a route with src 192.0.2.7
#   ss       prints $ROOT/ss.out, the listening sockets of the case
#   python3  logs its arguments to $ROOT/calls; then stays alive (PY_MODE=run)
#            or prints an error and exits 1 (PY_MODE=fail), as a server whose
#            port was taken after the check does
# PREVIEW_PORTS_FILE points at a range file in the test directory.
#   r1  the range file is read: the first port of 8710-8712, bound to the src
#       address of the route, serving the directory; link and PID printed, the
#       server alive and its log under the test's HOME
#   r2  ports with a listener on any address (0.0.0.0, [::], 127.0.0.1, *)
#       are skipped, a listener on 18703 does not take 8703: 8703
#   r3  every port of the range taken: exit 1, says so, no server started
#   r4  no range file: 8700-8799, so 8701 with 8700 taken
#   r5  a range file without <first>-<last>, or with first above last or a
#       port above 65535: exit 1, no server started
#   g1  a directory holding .git (a directory or, as in a worktree, a file):
#       refused, no server started
#   g2  a .git further below the directory: refused, no server started
#   i1  a route without src: exit 1, no server started
#   b1  a server that exits at once: exit 1, its output on stderr
#   s1  --stop ends a server the script started
#   s2  --stop refuses a process that is no preview server and leaves it
# usage: preview-serve.sh [preview-serve] [case ...]
#        preview-serve.sh --list
#   The script defaults to the repo's bash/.local/bin/preview-serve, the cases
#   to all of them. The script argument needs a / in its path.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end; every server a case starts is stopped.
set -uo pipefail

CASES=(r1_range_file r2_first_free r3_all_taken r4_no_file r5_bad_range g1_git_root
  g2_git_below i1_no_src b1_server_exits s1_stop s2_stop_refuses)
if [ "${1:-}" = --list ]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.local/bin/preview-serve
if [ $# -gt 0 ] && [[ $1 == */* ]] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/preview-serve-test.XXXXXX")
PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null; done
  rm -rf "$ROOT"
}
trap cleanup EXIT
export HOME=$ROOT/home
mkdir -p "$HOME" "$ROOT/bin"

for tool in bash cat find mkdir setsid sleep tr; do
  ln -s "$(command -v "$tool")" "$ROOT/bin/$tool"
done
cat >"$ROOT/bin/ip" <<EOF
#!/bin/sh
cat "$ROOT/ip.out"
EOF
cat >"$ROOT/bin/ss" <<EOF
#!/bin/sh
cat "$ROOT/ss.out"
EOF
# Stays a bash process (no exec) so its command line keeps -m http.server.
cat >"$ROOT/bin/python3" <<EOF
#!/usr/bin/env bash
echo "python3 \$*" >>"$ROOT/calls"
if [ "\${PY_MODE:-run}" = fail ]; then
  echo "OSError: [Errno 98] Address already in use" >&2
  exit 1
fi
sleep 30
EOF
chmod +x "$ROOT/bin/ip" "$ROOT/bin/ss" "$ROOT/bin/python3"

ROUTE="1.1.1.1 via 192.0.2.1 dev eth0 src 192.0.2.7 uid 1000"
failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
calls() { cat "$ROOT/calls" 2>/dev/null; }
no_server() { [ -z "$(calls)" ]; }
alive() { kill -0 "$1" 2>/dev/null; }
gone() { ! alive "$1"; }

# ports <range>: write the range file. listening <addr:port>...: the ss lines.
ports() { printf '%s\n' "$1" >"$ROOT/preview-ports"; }
listening() {
  local addr
  : >"$ROOT/ss.out"
  for addr in "$@"; do
    printf 'LISTEN 0      5      %s 0.0.0.0:*\n' "$addr" >>"$ROOT/ss.out"
  done
}

# run [VAR=value ...] -- <arg>...: the script's stdout in $OUT, stderr in
# $ERR, exit code in $RC; a PID it prints is remembered for the cleanup.
run() {
  local vars=()
  while [ "$1" != -- ]; do
    vars+=("$1")
    shift
  done
  shift
  RC=0
  OUT=$(env -i PATH="$ROOT/bin" HOME="$HOME" PREVIEW_PORTS_FILE="$ROOT/preview-ports" \
    "${vars[@]}" "$SUT" "$@" 2>"$ROOT/stderr") || RC=$?
  ERR=$(cat "$ROOT/stderr")
  PID=$(sed -n 's/^pid \([0-9]*\);.*/\1/p' <<<"$OUT")
  [ -z "$PID" ] || PIDS+=("$PID")
}
# serving <port>: the server started once, on <port>, the address and $DIR,
# and the output names the link and a live PID.
serving() {
  check "python3 called once with port $1" [ "$(calls)" = \
    "python3 -m http.server $1 --bind 192.0.2.7 --directory $DIR" ]
  check "exit 0, got $RC: $ERR" [ "$RC" = 0 ]
  check "link printed: $OUT" grep -qxF "http://192.0.2.7:$1/" <<<"$OUT"
  check "PID printed: $OUT" [ -n "$PID" ]
  check "server alive" alive "$PID"
}
refused() { # refused <stderr pattern>
  check "exit 1, got $RC" [ "$RC" = 1 ]
  check "stderr matches '$1': $ERR" grep -q -- "$1" <<<"$ERR"
  check "no server started: $(calls)" no_server
  check "nothing on stdout: $OUT" [ -z "$OUT" ]
}

r1_range_file() {
  ports 8710-8712
  run -- "$DIR"
  serving 8710
  check "log under the test HOME" [ -f "$HOME/.local/state/preview-serve/8710.log" ]
}

r2_first_free() {
  ports 8700-8719
  listening 0.0.0.0:8700 "[::]:8701" 127.0.0.1:8702 "*:8704" 0.0.0.0:18703
  run -- "$DIR"
  serving 8703
}

r3_all_taken() {
  ports 8700-8701
  listening 0.0.0.0:8700 192.0.2.7:8701
  run -- "$DIR"
  refused "every port of 8700-8701 is in use"
}

r4_no_file() {
  listening 0.0.0.0:8700
  run -- "$DIR"
  serving 8701
}

r5_bad_range() {
  local range
  for range in 8700 abc-def 8719-8700 0-10 8700-70000 "8700-8719 9000"; do
    : >"$ROOT/calls"
    ports "$range"
    run -- "$DIR"
    refused "port range"
  done
}

g1_git_root() {
  mkdir "$DIR/.git"
  run -- "$DIR"
  refused "holds $DIR/.git"
  rmdir "$DIR/.git"
  echo "gitdir: /elsewhere" >"$DIR/.git"
  run -- "$DIR"
  refused "holds $DIR/.git"
}

g2_git_below() {
  mkdir -p "$DIR/clone/.git"
  run -- "$DIR"
  refused "holds $DIR/clone/.git"
}

i1_no_src() {
  echo "1.1.1.1 via 192.0.2.1 dev eth0 uid 1000" >"$ROOT/ip.out"
  run -- "$DIR"
  refused "no src address"
}

b1_server_exits() {
  run PY_MODE=fail -- "$DIR"
  check "exit 1, got $RC" [ "$RC" = 1 ]
  check "the server's error on stderr: $ERR" grep -q "Address already in use" <<<"$ERR"
  check "says it exited: $ERR" grep -q "exited at once" <<<"$ERR"
  check "no link printed: $OUT" [ -z "$OUT" ]
}

s1_stop() {
  run -- "$DIR"
  serving 8700
  local pid=$PID
  run -- --stop "$pid"
  check "exit 0, got $RC: $ERR" [ "$RC" = 0 ]
  check "says stopped: $OUT" [ "$OUT" = "stopped $pid" ]
  local tries=0
  while alive "$pid" && [ "$tries" -lt 20 ]; do
    sleep 0.1
    tries=$((tries + 1))
  done
  check "server ended" gone "$pid"
}

s2_stop_refuses() {
  setsid sleep 30 &
  local pid=$!
  PIDS+=("$pid")
  run -- --stop "$pid"
  check "exit 1, got $RC" [ "$RC" = 1 ]
  check "says it is no preview server: $ERR" grep -q "is no preview server" <<<"$ERR"
  check "process left alone" alive "$pid"
}

missing=0
for CASE in "${CASES[@]}"; do
  if ! declare -F "$CASE" >/dev/null; then
    echo "FAIL $CASE: listed in CASES, but no such function"
    missing=1
  fi
done
[ "$missing" = 0 ] || exit 1

in_cases() {
  local name
  for name in "${CASES[@]}"; do [ "$name" = "$1" ] && return 0; done
  return 1
}

all=("${CASES[@]}")
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  DIR=$ROOT/site
  rm -rf "$DIR" "$ROOT/preview-ports" "$HOME/.local"
  mkdir -p "$DIR"
  echo "<p>shown</p>" >"$DIR/index.html"
  : >"$ROOT/calls"
  : >"$ROOT/ss.out"
  echo "$ROUTE" >"$ROOT/ip.out"
  if in_cases "$CASE"; then
    "$CASE"
  else
    fail "no such case"
  fi
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
