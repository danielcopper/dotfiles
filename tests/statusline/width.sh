#!/usr/bin/env bash
# Tests for term_width in claude/.claude/statusline.sh, which sets the width the
# status line fits itself into ($COLS) and where that width came from
# ($COLS_SRC). Each case runs the function alone, in a clean environment whose
# PATH holds only stand-ins for hc and tmux and the few tools the function
# needs, so neither a real herdr nor a real tmux server is asked.
#   w1  in a herdr terminal hc's cols win over tmux and $COLUMNS; tmux is not
#       asked
#   w2  hc failing, printing no JSON, JSON without cols, or cols 0: $COLUMNS;
#       tmux is not asked, the TMUX and TMUX_PANE a herdr terminal carries
#       name another pane
#   w3  hc hanging: given up within a second, $COLUMNS
#   w4  hc missing: $COLUMNS
#   w5  outside herdr hc is not asked; tmux is asked for this pane's width
#   w6  tmux failing or printing no number: $COLUMNS
#   w7  tmux hanging: given up within a second, $COLUMNS
#   w8  TMUX_PANE without TMUX: tmux is not asked, $COLUMNS
#   w8b TMUX without TMUX_PANE: tmux is not asked, $COLUMNS
#   w9  nothing usable to ask and no usable $COLUMNS: 140
#   d1  the whole script with STATUSLINE_DEBUG set logs the width and where
#       it came from; it runs as a copy whose git cache and debug log sit in
#       the temporary directory instead of /tmp
# Every case also checks that nothing reaches stderr, which would land in the
# status line. Before the cases, the script must define term_width once and
# call it once, so the function run here is the one that sets $COLS.
# usage: width.sh [statusline] [case ...]
#   The script defaults to the repo's claude/.claude/statusline.sh, the cases
#   to all of them.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end. Needs jq and timeout.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/claude/.claude/statusline.sh
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/statusline-width-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
mkdir -p "$HOME" "$ROOT/bin"
BASH_BIN=$(command -v bash)

for tool in jq timeout sleep cat; do
  ln -s "$(command -v "$tool")" "$ROOT/bin/$tool"
done
# stand_ins: hc and tmux, fresh for each case. Each logs its call, then acts
# as its *_MODE variable says.
stand_ins() {
  cat >"$ROOT/bin/hc" <<EOF
#!/bin/sh
echo "hc \$*" >>"$ROOT/calls"
case "\${HC_MODE:-ok}" in
  ok) printf '{"address":"%s","cols":218,"rows":55,"state":"live"}\n' "\$2" ;;
  fail) echo "hc: no such terminal" >&2; exit 1 ;;
  text) echo "hc: server not running" ;;
  nocols) echo '{"address":"t7","rows":55}' ;;
  zero) echo '{"address":"t7","cols":0,"rows":55}' ;;
  hang) exec sleep 10 ;;
esac
EOF
  cat >"$ROOT/bin/tmux" <<EOF
#!/bin/sh
echo "tmux \$*" >>"$ROOT/calls"
case "\${TMUX_MODE:-ok}" in
  ok) echo 90 ;;
  fail) echo "no server running on /tmp/tmux-1000/default" >&2; exit 1 ;;
  text) echo "can't find pane: %5" ;;
  hang) exec sleep 10 ;;
esac
EOF
  chmod +x "$ROOT/bin/hc" "$ROOT/bin/tmux"
}

# The function alone, from its definition line to the closing brace.
sed -n '/^term_width() {$/,/^}$/p' "$SUT" >"$ROOT/term_width.sh"

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
eq() { [ "$1" = "$2" ]; }
calls() { cat "$ROOT/calls" 2>/dev/null; }

HERDR=(HC_TERMINAL_ID=t7)
IN_TMUX=("TMUX=/tmp/tmux-1000/default,1,0" TMUX_PANE=%5)

# width [VAR=value ...]: "$COLS $COLS_SRC" after term_width in $OUT, its
# stderr in $ERR, the milliseconds it took in $MS. Only the given variables
# are set.
width() {
  : >"$ROOT/calls"
  local start end
  start=$(date +%s%N)
  # shellcheck disable=SC2016 # expanded by the inner bash, not here
  OUT=$(env -i PATH="$ROOT/bin" HOME="$HOME" "$@" "$BASH_BIN" -c \
    '. "$1"; term_width; printf "%s %s\n" "$COLS" "$COLS_SRC"' _ "$ROOT/term_width.sh" 2>"$ROOT/stderr")
  end=$(date +%s%N)
  MS=$(((end - start) / 1000000))
  ERR=$(cat "$ROOT/stderr")
}
quiet() { check "nothing on stderr (got: $ERR)" eq "$ERR" ""; }

w1_herdr_first() {
  width "${HERDR[@]}" "${IN_TMUX[@]}" COLUMNS=70
  check "hc's cols (got $OUT)" eq "$OUT" "218 hc"
  check "hc asked about this terminal (calls: $(calls))" eq "$(calls)" "hc get t7"
  quiet
}

w2_hc_unusable() {
  local mode
  for mode in fail text nocols zero; do
    width HC_MODE=$mode "${HERDR[@]}" "${IN_TMUX[@]}" COLUMNS=70
    check "hc $mode: \$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
    check "hc $mode: only hc asked (calls: $(calls))" eq "$(calls)" "hc get t7"
    quiet
  done
}

w3_hc_hangs() {
  width HC_MODE=hang "${HERDR[@]}" "${IN_TMUX[@]}" COLUMNS=70
  check "\$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
  check "within a second (took ${MS} ms)" test "$MS" -lt 1000
  quiet
}

w4_hc_missing() {
  rm "$ROOT/bin/hc"
  width "${HERDR[@]}" "${IN_TMUX[@]}" COLUMNS=70
  check "\$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
  check "tmux not asked (calls: $(calls))" eq "$(calls)" ""
  quiet
}

w5_tmux_pane() {
  width "${IN_TMUX[@]}" COLUMNS=70
  check "tmux's width (got $OUT)" eq "$OUT" "90 tmux"
  check "only tmux, for this pane (calls: $(calls))" eq "$(calls)" "tmux display -p -t %5 #{pane_width}"
  quiet
}

w6_tmux_unusable() {
  local mode
  for mode in fail text; do
    width TMUX_MODE=$mode "${IN_TMUX[@]}" COLUMNS=70
    check "tmux $mode: \$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
    quiet
  done
}

w7_tmux_hangs() {
  width TMUX_MODE=hang "${IN_TMUX[@]}" COLUMNS=70
  check "\$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
  check "within a second (took ${MS} ms)" test "$MS" -lt 1000
  quiet
}

w8_pane_without_tmux() {
  width TMUX_PANE=%5 COLUMNS=70
  check "\$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
  check "tmux not asked (calls: $(calls))" eq "$(calls)" ""
  quiet
}

w8b_tmux_without_pane() {
  width "TMUX=/tmp/tmux-1000/default,1,0" COLUMNS=70
  check "\$COLUMNS (got $OUT)" eq "$OUT" "70 columns"
  check "tmux not asked (calls: $(calls))" eq "$(calls)" ""
  quiet
}

w9_default() {
  local columns
  for columns in "" 0 abc; do
    width COLUMNS="$columns"
    check "COLUMNS='$columns': 140 (got $OUT)" eq "$OUT" "140 default"
    quiet
  done
  width HC_MODE=fail "${HERDR[@]}" "${IN_TMUX[@]}"
  check "hc failing in herdr: 140 (got $OUT)" eq "$OUT" "140 default"
  check "hc failing in herdr: tmux not asked (calls: $(calls))" eq "$(calls)" "hc get t7"
  quiet
  width TMUX_MODE=fail "${IN_TMUX[@]}"
  check "tmux failing: 140 (got $OUT)" eq "$OUT" "140 default"
  quiet
}

d1_debug_log() {
  local script n path
  script=$(cat "$SUT")
  for path in /tmp/statusline-cache /tmp/statusline-debug.log; do
    n=$(grep -c "$path" "$SUT")
    check "$path named once in the script (got $n)" eq "$n" 1
  done
  [ "$FAILED" = 0 ] || return
  script=${script//\/tmp\/statusline-cache/$ROOT\/cache}
  script=${script//\/tmp\/statusline-debug.log/$ROOT\/debug.log}
  printf '%s\n' "$script" >"$ROOT/statusline.sh"
  mkdir -p "$ROOT/dir"
  # The stand-ins come first in PATH, so the real hc and tmux stay unasked.
  printf '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"%s"},"session_id":"x"}' "$ROOT/dir" |
    env -i PATH="$ROOT/bin:$PATH" HOME="$HOME" STATUSLINE_DEBUG=1 "${HERDR[@]}" "${IN_TMUX[@]}" \
      "$BASH_BIN" "$ROOT/statusline.sh" >/dev/null 2>"$ROOT/stderr"
  ERR=$(cat "$ROOT/stderr")
  quiet
  check "one log line (got: $(cat "$ROOT/debug.log" 2>/dev/null))" eq "$(wc -l <"$ROOT/debug.log" 2>/dev/null)" 1
  check "names hc as the source" grep -q " | src=hc COLUMNS=unset COLS=218 " "$ROOT/debug.log"
}

structure_ok=1
defs=$(grep -c '^term_width() {$' "$SUT")
call_sites=$(grep -c '^term_width$' "$SUT")
if [ "$defs" != 1 ]; then
  echo "FAIL: $defs definitions of term_width() in $SUT, want 1"
  structure_ok=0
fi
if [ "$call_sites" != 1 ]; then
  echo "FAIL: $call_sites lines calling term_width in $SUT, want 1"
  structure_ok=0
fi
[ "$structure_ok" = 1 ] || exit 1

all=(w1_herdr_first w2_hc_unusable w3_hc_hangs w4_hc_missing w5_tmux_pane w6_tmux_unusable
  w7_tmux_hangs w8_pane_without_tmux w8b_tmux_without_pane w9_default d1_debug_log)
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  stand_ins
  "$CASE"
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
