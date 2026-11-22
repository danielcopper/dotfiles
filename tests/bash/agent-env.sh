#!/usr/bin/env bash
# Tests for bash/.local/bin/agent-env, which starts an agent harness with the
# secrets its list declares, read afresh from ~/.bashrc.secrets, and for the
# claude, opencode and pi functions bash/.bashrc defines on top of it. Each
# case runs in a clean environment (env -i) whose HOME is a directory of the
# test and whose PATH holds only bash and stand-ins:
#   child, claude, opencode, pi  one stand-in under four names: it writes the
#     name it was called by to $ROOT/child.name, its arguments to
#     $ROOT/child.args and `declare -px` to $ROOT/child.env, and exits with
#     CHILD_EXIT (0)
# HOME holds a ~/.bashrc.secrets with dummy values, one of them from a
# $(...), one assigned without export, and copies of the repo's lists under
# ~/.config/agent-env; the .bashrc cases put a link to the script at
# ~/.local/bin/agent-env. No dummy value contains the word of another and
# every one contains "dummy", which no other output does.
#   l1  the shipped lists of claude, opencode and pi pass SONARQUBE_CLI_ORG
#       and SONARQUBE_CLI_TOKEN, nothing else of the file, and no stderr
#   f1  an interactive shell on bash/.bashrc that sourced the file, which is
#       then rewritten: `claude` in that shell gets the new value, the shell
#       still holds the old one
#   d1  only the declared names reach the child; "#" comments, blank lines
#       and blanks around a name are skipped; a declared name the file
#       assigns without export is exported
#   d2  a value the caller holds for a name the file assigns and the list
#       does not declare is gone, exported by the file or not; a declared one
#       gets the file's value; a caller's name the file does not assign stays
#   d3  a declared name the file leaves without a value, or does not assign
#       at all: one stderr line each, naming it, not passed, the child runs
#   m1  a missing list: exit 1, the error names its path, the child does not
#       run
#   m2  no secrets file: the child runs without the secrets, one stderr line
#       naming the file
#   x1  under `bash -x` and `bash -xv` no value shows on stderr, the trace is
#       on before and after the secrets are read, and the child gets them
#   c1  the child's exit code is the script's, its arguments arrive as given
#       (an empty one and one with blanks included); a command not found
#       exits 127
#   u1  fewer than two arguments: exit 2 with the usage, no child
#   u2  a harness name with a "/", starting with "." or empty: exit 2, no
#       child, also where the path it makes leads to a list
#   u3  a list line that is no variable name: exit 1, the line named, no
#       child, and the $(...) in it not run
#   b1  each of claude, opencode and pi installed alone: .bashrc makes it a
#       function through agent-env and the other two none; it passes its
#       arguments unchanged; the cc alias runs through claude's function
#   b2  claude installed but agent-env not: no function, claude runs as
#       before
# usage: agent-env.sh [agent-env [bashrc]] [case ...]
#        agent-env.sh --list
#   The files default to the repo's bash/.local/bin/agent-env and
#   bash/.bashrc, the cases to all of them. A file argument needs a / in its
#   path, so a case name is never taken for a file.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end. Needs timeout.
set -uo pipefail

CASES=(l1_shipped_lists f1_fresh_read d1_only_declared d2_caller_value_gone d3_declared_without_value
  m1_missing_list m2_missing_secrets x1_xtrace c1_exit_code_and_args u1_usage u2_bad_harness
  u3_bad_list_line b1_bashrc_functions b2_no_agent_env)
if [ "${1:-}" = --list ]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.local/bin/agent-env
BASHRC=$REPO/bash/.bashrc
LISTS=$REPO/bash/.config/agent-env
if [ $# -gt 0 ] && [[ $1 == */* ]] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
  if [ $# -gt 0 ] && [[ $1 == */* ]] && [ -f "$1" ]; then
    BASHRC=$(readlink -f "$1")
    shift
  fi
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/agent-env-test.XXXXXX")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
BASH_BIN=$(command -v bash)
mkdir -p "$ROOT/bin" "$ROOT/stand-in"
ln -s "$BASH_BIN" "$ROOT/bin/bash"
cat >"$ROOT/stand-in/child" <<EOF
#!$BASH_BIN
printf '%s\n' "\${0##*/}" >"$ROOT/child.name"
: >"$ROOT/child.args"
for arg in "\$@"; do printf 'arg %q\n' "\$arg" >>"$ROOT/child.args"; done
declare -px >"$ROOT/child.env"
exit "\${CHILD_EXIT:-0}"
EOF
chmod +x "$ROOT/stand-in/child"
ln -s "$ROOT/stand-in/child" "$ROOT/bin/child"

# The secrets file of every case. The token comes from a $(...), whose text
# holds no value; PLAIN_SECRET is assigned without export.
IFS= read -r -d '' SECRETS <<'END'
# dummy secrets of the test
export SONARQUBE_CLI_ORG=org-dummy-1
export SONARQUBE_CLI_TOKEN=$(printf "%s-%s" tok dummy-1)
export OTHER_TOKEN=other-dummy-1
  PLAIN_SECRET=plain-dummy-1
END

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
err() { cat "$ROOT/stderr" 2>/dev/null; }
err_lines() { grep -c '' "$ROOT/stderr"; }
ran() { [ -f "$ROOT/child.env" ]; }
not_ran() { ! [ -e "$ROOT/child.env" ]; }
not_there() { ! [ -e "$1" ]; }
args() { cat "$ROOT/child.args" 2>/dev/null; }
# has <name> <value>: the child got the variable exported with that value.
has() { grep -qxF "declare -x $1=\"$2\"" "$ROOT/child.env"; }
# lacks <name>: the child has no such variable (and did run).
lacks() { ran && absent "^declare -x $1\(=\|$\)" "$ROOT/child.env"; }
no_value_on_stderr() { absent dummy "$ROOT/stderr"; }

# install <harness>...: these stand-ins on PATH, the others removed.
install() {
  local h
  rm -f "$ROOT/bin/claude" "$ROOT/bin/opencode" "$ROOT/bin/pi"
  for h in "$@"; do ln -s "$ROOT/stand-in/child" "$ROOT/bin/$h"; done
}
list() { printf '%s\n' "$@" >"$HOME/.config/agent-env/t"; } # list <line>...: the list of harness t

# run [VAR=value ...] -- <command...>: in the clean environment; stdout in
# $OUT, stderr in $ROOT/stderr, exit code in $RC. The child's files of the
# previous run are removed first.
run() {
  local vars=()
  while [ "$1" != -- ]; do
    vars+=("$1")
    shift
  done
  shift
  rm -f "$ROOT/child.name" "$ROOT/child.args" "$ROOT/child.env"
  RC=0
  OUT=$(timeout -k 2 10 env -i PATH="$ROOT/bin" HOME="$HOME" "${vars[@]}" "$@" 2>"$ROOT/stderr") || RC=$?
}
agent_env() { # agent_env [VAR=value ...] -- <args>: the script itself
  local vars=()
  while [ "$1" != -- ]; do
    vars+=("$1")
    shift
  done
  shift
  run "${vars[@]}" -- "$SUT" "$@"
}

# shell <script> [arg ...]: an interactive bash on $BASHRC running <script>
# with the args as $1...; its stdout in $OUT, stderr in $ROOT/stderr, exit
# code in $RC. TERM is dumb, nothing else is set beside PATH and HOME.
shell() {
  local script=$1
  shift
  rm -f "$ROOT/child.name" "$ROOT/child.args" "$ROOT/child.env"
  RC=0
  OUT=$(timeout -k 2 10 env -i PATH="$ROOT/bin" HOME="$HOME" TERM=dumb \
    "$BASH_BIN" --rcfile "$BASHRC" -i -c "$script" _ "$@" </dev/null 2>"$ROOT/stderr") || RC=$?
}
with_agent_env() { ln -s "$SUT" "$HOME/.local/bin/agent-env"; }

l1_shipped_lists() {
  local h
  for h in claude opencode pi; do
    agent_env -- "$h" child
    check "$h: exit 0 (got $RC)" eq "$RC" 0
    check "$h: org passed" has SONARQUBE_CLI_ORG org-dummy-1
    check "$h: token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
    check "$h: OTHER_TOKEN not passed" lacks OTHER_TOKEN
    check "$h: PLAIN_SECRET not passed" lacks PLAIN_SECRET
    check "$h: nothing on stderr (got: $(err))" eq "$(err)" ""
  done
}

f1_fresh_read() {
  install claude
  with_agent_env
  printf '%s\n' 'export SONARQUBE_CLI_ORG=org-dummy-0' 'export SONARQUBE_CLI_TOKEN=tok-dummy-0' \
    >"$HOME/.bashrc.secrets"
  # shellcheck disable=SC2016 # expanded by the inner bash
  shell 'printf "caller=%s\n" "$SONARQUBE_CLI_TOKEN"; printf "%s" "$1" >"$HOME/.bashrc.secrets"; claude' \
    "$SECRETS"
  check "exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "the shell held the old value (got: $OUT)" eq "$OUT" "caller=tok-dummy-0"
  check "the child got the new token" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "the child got the new org" has SONARQUBE_CLI_ORG org-dummy-1
}

d1_only_declared() {
  list '# a comment' '   ' 'SONARQUBE_CLI_TOKEN  # a trailing comment' $'\tSONARQUBE_CLI_ORG' ''
  agent_env -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "org passed" has SONARQUBE_CLI_ORG org-dummy-1
  check "OTHER_TOKEN not passed" lacks OTHER_TOKEN
  check "PLAIN_SECRET not passed" lacks PLAIN_SECRET
  check "nothing on stderr (got: $(err))" eq "$(err)" ""
  list PLAIN_SECRET
  agent_env -- t child
  check "declared PLAIN_SECRET: exit 0 (got $RC)" eq "$RC" 0
  check "declared PLAIN_SECRET exported" has PLAIN_SECRET plain-dummy-1
}

d2_caller_value_gone() {
  list SONARQUBE_CLI_TOKEN
  agent_env OTHER_TOKEN=stale-dummy-9 PLAIN_SECRET=stale-dummy-9 SONARQUBE_CLI_ORG=stale-dummy-9 \
    SONARQUBE_CLI_TOKEN=stale-dummy-9 UNRELATED=kept-9 -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "OTHER_TOKEN gone" lacks OTHER_TOKEN
  check "PLAIN_SECRET gone (the file assigns it without export)" lacks PLAIN_SECRET
  check "undeclared SONARQUBE_CLI_ORG gone" lacks SONARQUBE_CLI_ORG
  check "the declared token has the file's value" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "a name the file does not assign stays" has UNRELATED kept-9
}

d3_declared_without_value() {
  printf '%s%s\n' "$SECRETS" 'export EMPTY_ONE=' >"$HOME/.bashrc.secrets"
  list SONARQUBE_CLI_TOKEN NOT_IN_FILE EMPTY_ONE
  agent_env -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the child ran" ran
  check "token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "NOT_IN_FILE not passed" lacks NOT_IN_FILE
  check "EMPTY_ONE not passed" lacks EMPTY_ONE
  check "two lines on stderr (got: $(err))" eq "$(err_lines)" 2
  check "NOT_IN_FILE named" grep -qx "agent-env: NOT_IN_FILE has no value in $HOME/.bashrc.secrets, not passed to child" \
    "$ROOT/stderr"
  check "EMPTY_ONE named" grep -qx "agent-env: EMPTY_ONE has no value in $HOME/.bashrc.secrets, not passed to child" \
    "$ROOT/stderr"
  check "no value on stderr" no_value_on_stderr
}

m1_missing_list() {
  agent_env -- nope child
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the path named (got: $(err))" grep -qF "$HOME/.config/agent-env/nope" "$ROOT/stderr"
  check "one line on stderr" eq "$(err_lines)" 1
  check "no child" not_ran
}

m2_missing_secrets() {
  rm "$HOME/.bashrc.secrets"
  agent_env -- claude child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the child ran" ran
  check "one line on stderr (got: $(err))" eq "$(err_lines)" 1
  check "it names the file" grep -qF "$HOME/.bashrc.secrets" "$ROOT/stderr"
  check "no token" lacks SONARQUBE_CLI_TOKEN
}

x1_xtrace() {
  local opts
  for opts in -x -xv; do
    run -- "$BASH_BIN" "$opts" "$SUT" claude child
    check "$opts: exit 0 (got $RC)" eq "$RC" 0
    check "$opts: the token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
    check "$opts: the org passed" has SONARQUBE_CLI_ORG org-dummy-1
    check "$opts: traced before the read (got: $(err))" grep -q '^+ list=' "$ROOT/stderr"
    check "$opts: traced after the read" grep -qx '+ exec child' "$ROOT/stderr"
    check "$opts: no value on stderr (got: $(grep dummy "$ROOT/stderr"))" no_value_on_stderr
  done
}

c1_exit_code_and_args() {
  agent_env CHILD_EXIT=7 -- claude child a "b c" "" "\$x"
  check "exit 7 (got $RC)" eq "$RC" 7
  check "arguments as given (got: $(args))" eq "$(args)" "$(printf 'arg %q\n' a "b c" "" "\$x")"
  agent_env -- claude no-such-command
  check "not found: exit 127 (got $RC)" eq "$RC" 127
}

u1_usage() {
  agent_env --
  check "no args: exit 2 (got $RC)" eq "$RC" 2
  check "no args: usage (got: $(err))" grep -q '^usage: agent-env ' "$ROOT/stderr"
  agent_env -- claude
  check "one arg: exit 2 (got $RC)" eq "$RC" 2
  check "one arg: usage (got: $(err))" grep -q '^usage: agent-env ' "$ROOT/stderr"
  check "no child" not_ran
}

u2_bad_harness() {
  local name
  cp "$LISTS/claude" "$HOME/.config/agent-env/.hidden"
  for name in ../agent-env/claude .hidden ""; do
    agent_env -- "$name" child
    check "'$name': exit 2 (got $RC; stderr: $(err))" eq "$RC" 2
    check "'$name': no child" not_ran
  done
}

u3_bad_list_line() {
  local line
  for line in "X[\$(printf ran >\"\$HOME/ran\")]" 'TWO WORDS' 1ABC; do
    list SONARQUBE_CLI_TOKEN "$line"
    agent_env -- t child
    check "'$line': exit 1 (got $RC)" eq "$RC" 1
    check "'$line': line 2 named (got: $(err))" grep -qF "$HOME/.config/agent-env/t line 2 is no variable name" \
      "$ROOT/stderr"
    check "'$line': no child" not_ran
  done
  check "the \$(...) did not run" not_there "$HOME/ran"
}

b1_bashrc_functions() {
  local h other
  with_agent_env
  for h in claude opencode pi; do
    install "$h"
    # shellcheck disable=SC2016 # expanded by the inner bash
    shell 'for h in claude opencode pi; do printf "%s=%s\n" "$h" "$(type -t "$h")"; done; "$1" a "b c" ""' "$h"
    check "$h: exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
    check "$h: a function (got: $OUT)" grep -qx "$h=function" <<<"$OUT"
    for other in claude opencode pi; do
      [ "$other" = "$h" ] && continue
      check "$h: $other no function (got: $OUT)" grep -qx "$other=" <<<"$OUT"
    done
    check "$h: the harness ran (got $(cat "$ROOT/child.name" 2>/dev/null))" \
      eq "$(cat "$ROOT/child.name" 2>/dev/null)" "$h"
    check "$h: arguments unchanged (got: $(args))" eq "$(args)" "$(printf 'arg %q\n' a "b c" "")"
    check "$h: through agent-env: the token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
    check "$h: through agent-env: OTHER_TOKEN, exported by .bashrc, not passed" lacks OTHER_TOKEN
  done
  install claude
  shell 'cc x'
  check "cc: exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "cc: its flags and argument (got: $(args))" eq "$(args)" \
    "$(printf 'arg %q\n' --model opus --effort xhigh x)"
  check "cc: through agent-env" lacks OTHER_TOKEN
}

b2_no_agent_env() {
  install claude
  # shellcheck disable=SC2016 # expanded by the inner bash
  shell 'printf "%s\n" "$(type -t claude)"; claude a'
  check "exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "no function (got: $OUT)" eq "$OUT" file
  check "claude ran" eq "$(cat "$ROOT/child.name" 2>/dev/null)" claude
  check "it inherited the shell's OTHER_TOKEN" has OTHER_TOKEN other-dummy-1
}

# in_cases <name>: the name is in CASES.
in_cases() {
  local name
  for name in "${CASES[@]}"; do
    [ "$name" = "$1" ] && return 0
  done
  return 1
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
  rm -rf "$HOME"
  mkdir -p "$HOME/.config/agent-env" "$HOME/.local/bin"
  cp "$LISTS/claude" "$LISTS/opencode" "$LISTS/pi" "$HOME/.config/agent-env/"
  printf '%s' "$SECRETS" >"$HOME/.bashrc.secrets"
  install
  if in_cases "$CASE"; then
    "$CASE"
  else
    fail "no such case"
  fi
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
