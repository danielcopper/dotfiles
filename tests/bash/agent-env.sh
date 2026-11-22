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
# ~/.config/agent-env; f1, b1 and s1 put a link to the script at
# ~/.local/bin/agent-env. No dummy value contains the word of another and
# every one contains "dummy", which no other output does.
#   l1  the shipped lists of claude, opencode and pi pass SONARQUBE_CLI_ORG,
#       SONARQUBE_CLI_TOKEN, SQLCMDPASSWORD, AZURE_DEVOPS_EXT_PAT,
#       FORGEJO_TOKEN and OPENAI_API_KEY, nothing else of the file, and no
#       stderr
#   f1  an interactive shell on bash/.bashrc that sourced the file, which is
#       then rewritten: `claude` in that shell gets the new value, the shell
#       held the old one when it started
#   d1  only the declared names reach the child; "#" comments, blank lines
#       and blanks around a name are skipped; a declared name the file
#       assigns without export is exported
#   d2  a value the caller holds for a name the file assigns and the list
#       does not declare is gone, exported by the file or not; a declared one
#       gets the file's value; a caller's name the file does not assign stays
#   d3  a declared name the file leaves without a value, or does not assign
#       at all: not passed, nothing on stderr, the child runs
#   a1  a value the caller holds for a declared name is gone where the file
#       does not assign it, and also without a file; without a file the
#       caller's value of a name the file would assign stays
#   m1  a missing list: exit 1, the error names its path, the child does not
#       run
#   m2  no secrets file: the child runs without the secrets, one stderr line
#       naming the file and the harness
#   m3  a secrets file that cannot be read (mode 000, a directory): exit 1,
#       one line naming it and the harness, no child
#   m4  a secrets file that does not parse: exit 1, one line naming it and
#       the harness and none of its content, no child; one that parses but whose command
#       fails at run time keeps the shell's error on stderr and starts
#   k1  PATH, HOME, SHELL, USER, LOGNAME and TERM, assigned by the file and
#       not declared, still reach the child
#   x1  under `bash -x` and `bash -xv` no value shows on stderr, the trace is
#       on before and after the secrets are read, and the child gets them;
#       under -xv a source line after the read is echoed again
#   t1  an undeclared name that is part of a declared one (CLI_TOKEN beside
#       SONARQUBE_CLI_TOKEN) is not passed
#   t2  a secrets file and a list whose last lines end without a newline:
#       the undeclared export on the file's last line is not passed, the
#       name on the list's last line is
#   t3  a secrets line that refers to an unset variable: exit 0, the value
#       around it passed
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
#   b3  opencode and pi functions defined in ~/.bashrc.local, both installed
#       and agent-env too: .bashrc keeps them, they run, the child does not
#   s1  the claude function of host-steamdeck/.bashrc.local in place: .bashrc
#       keeps it; it starts claude through agent-env and systemd-run in
#       claude.slice, with the two worker caps and the secrets of its list;
#       without agent-env through systemd-run alone, as before. A stand-in
#       systemd-run logs its arguments to $ROOT/systemd-run.args and runs
#       the command after "--". Only that function is copied to
#       ~/.bashrc.local: the rest of the file runs brew and nix, which on the
#       Deck would put real tools on PATH.
#   n1  nvim's claudecode.lua, loaded by nvim with stand-ins for vim.pack and
#       the plugin: with agent-env on PATH it sets terminal_cmd to
#       "agent-env claude claude", without it leaves terminal_cmd nil, the
#       plugin's default
# usage: agent-env.sh [agent-env [bashrc]] [case ...]
#        agent-env.sh --list
#   The files default to the repo's bash/.local/bin/agent-env and
#   bash/.bashrc, the cases to all of them. A file argument needs a / in its
#   path, so a case name is never taken for a file.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run, which
# is removed at the end. Needs timeout and nvim.
set -uo pipefail

CASES=(l1_shipped_lists f1_fresh_read d1_only_declared d2_caller_value_gone d3_declared_without_value
  a1_declared_from_file_only m1_missing_list m2_missing_secrets m3_unreadable_secrets m4_unparsable_secrets
  k1_kept_names x1_xtrace t1_part_of_a_name t2_no_final_newline t3_unset_reference c1_exit_code_and_args u1_usage u2_bad_harness
  u3_bad_list_line b1_bashrc_functions b2_no_agent_env b3_earlier_functions_kept s1_steamdeck_claude
  n1_nvim_terminal_cmd)
if [ "${1:-}" = --list ]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.local/bin/agent-env
BASHRC=$REPO/bash/.bashrc
LISTS=$REPO/bash/.config/agent-env
STEAMDECK_LOCAL=$REPO/host-steamdeck/.bashrc.local
CLAUDECODE_LUA=$REPO/nvim/.config/nvim/plugin/claudecode.lua
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
# The nvim binary itself, asked while HOME is still the real one: a mise shim
# on PATH finds its tool only with the real HOME.
printf '%s\n' 'io.write(vim.v.progpath)' >"$ROOT/progpath.lua"
NVIM_BIN=$(nvim --clean --headless -l "$ROOT/progpath.lua" 2>/dev/null)
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
cat >"$ROOT/stand-in/systemd-run" <<EOF
#!$BASH_BIN
printf '%s\n' "\$*" >"$ROOT/systemd-run.args"
while [ \$# -gt 0 ] && [ "\$1" != -- ]; do shift; done
shift
exec "\$@"
EOF
chmod +x "$ROOT/stand-in/systemd-run"

# The secrets file of every case. The token comes from a $(...), whose text
# holds no value; PLAIN_SECRET is assigned without export.
IFS= read -r -d '' SECRETS <<'END'
# dummy secrets of the test
export SONARQUBE_CLI_ORG=org-dummy-1
export SONARQUBE_CLI_TOKEN=$(printf "%s-%s" tok dummy-1)
export OTHER_TOKEN=other-dummy-1
  PLAIN_SECRET=plain-dummy-1
export SQLCMDPASSWORD=sql-dummy-1
export AZURE_DEVOPS_EXT_PAT=azure-dummy-1
export FORGEJO_TOKEN=forgejo-dummy-1
export OPENAI_API_KEY=openai-dummy-1
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

# install <harness>...: these stand-ins on PATH, the others and systemd-run
# removed.
install() {
  local h
  rm -f "$ROOT/bin/claude" "$ROOT/bin/opencode" "$ROOT/bin/pi" "$ROOT/bin/systemd-run"
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
    check "$h: SQL password passed" has SQLCMDPASSWORD sql-dummy-1
    check "$h: Azure DevOps PAT passed" has AZURE_DEVOPS_EXT_PAT azure-dummy-1
    check "$h: Forgejo token passed" has FORGEJO_TOKEN forgejo-dummy-1
    check "$h: OpenAI key passed" has OPENAI_API_KEY openai-dummy-1
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
  check "nothing on stderr (got: $(err))" eq "$(err)" ""
}

a1_declared_from_file_only() {
  printf '%s\n' 'export SONARQUBE_CLI_TOKEN=tok-dummy-1' >"$HOME/.bashrc.secrets"
  list SONARQUBE_CLI_TOKEN SONARQUBE_CLI_ORG
  agent_env SONARQUBE_CLI_ORG=stale-dummy-9 -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the file's token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "the caller's org, not in the file, gone" lacks SONARQUBE_CLI_ORG
  rm "$HOME/.bashrc.secrets"
  agent_env SONARQUBE_CLI_TOKEN=stale-dummy-9 OTHER_TOKEN=stale-dummy-9 -- t child
  check "no file: exit 0 (got $RC)" eq "$RC" 0
  check "no file: the caller's token gone" lacks SONARQUBE_CLI_TOKEN
  check "no file: an undeclared caller name stays" has OTHER_TOKEN stale-dummy-9
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
  list SONARQUBE_CLI_TOKEN
  agent_env -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the child ran" ran
  check "one line on stderr (got: $(err))" eq "$(err_lines)" 1
  check "it names the file and says so" grep -qxF \
    "agent-env: no $HOME/.bashrc.secrets, starting t without its secrets" "$ROOT/stderr"
  check "no token" lacks SONARQUBE_CLI_TOKEN
}

m3_unreadable_secrets() {
  local how
  list SONARQUBE_CLI_TOKEN
  for how in mode-000 directory; do
    if [ "$how" = directory ]; then
      rm -f "$HOME/.bashrc.secrets"
      mkdir "$HOME/.bashrc.secrets"
    else
      chmod 000 "$HOME/.bashrc.secrets"
    fi
    agent_env -- t child
    check "$how: exit 1 (got $RC)" eq "$RC" 1
    check "$how: one line naming it (got: $(err))" grep -qxF \
      "agent-env: cannot read $HOME/.bashrc.secrets, not starting t" "$ROOT/stderr"
    check "$how: only that line" eq "$(err_lines)" 1
    check "$how: no child" not_ran
  done
}

m4_unparsable_secrets() {
  list SONARQUBE_CLI_TOKEN
  printf '%s%s\n' "$SECRETS" 'if then dummy-in-the-broken-line (' >"$HOME/.bashrc.secrets"
  agent_env -- t child
  check "exit 1 (got $RC)" eq "$RC" 1
  check "one line naming it (got: $(err))" grep -qxF \
    "agent-env: $HOME/.bashrc.secrets does not parse as bash, not starting t" "$ROOT/stderr"
  check "only that line" eq "$(err_lines)" 1
  check "none of its content" no_value_on_stderr
  check "no child" not_ran
  printf '%s%s\n' "$SECRETS" 'no-such-command-of-the-test' >"$HOME/.bashrc.secrets"
  agent_env -- t child
  check "run-time error: exit 0 (got $RC)" eq "$RC" 0
  check "run-time error: on stderr (got: $(err))" grep -q 'no-such-command-of-the-test: command not found' \
    "$ROOT/stderr"
  check "run-time error: the token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
}

k1_kept_names() {
  { printf '%s' "$SECRETS"; printf '%s\n' "export PATH=\$PATH" "export HOME=\$HOME" 'export SHELL=/kept/sh' \
    'export USER=kept-user' 'LOGNAME=kept-logname' 'export TERM=kept-term'; } >"$HOME/.bashrc.secrets"
  agent_env SHELL=/caller/sh USER=caller-user LOGNAME=caller-logname TERM=caller-term -- claude child
  check "exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "PATH kept" has PATH "$ROOT/bin"
  check "HOME kept" has HOME "$HOME"
  check "SHELL kept" has SHELL /kept/sh
  check "USER kept" has USER kept-user
  check "LOGNAME kept" has LOGNAME kept-logname
  check "TERM kept" has TERM kept-term
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
  check "-xv: verbose after the read" grep -qxF 'exec "$@"' "$ROOT/stderr"
}

t1_part_of_a_name() {
  { printf '%s' "$SECRETS"; printf '%s\n' 'export CLI_TOKEN=cli-dummy-1'; } >"$HOME/.bashrc.secrets"
  agent_env -- claude child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the declared token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "CLI_TOKEN not passed" lacks CLI_TOKEN
}

t2_no_final_newline() {
  printf '%s%s' "$SECRETS" 'export LAST_UNDECLARED=last-dummy-1' >"$HOME/.bashrc.secrets"
  printf '%s\n%s' SONARQUBE_CLI_ORG SONARQUBE_CLI_TOKEN >"$HOME/.config/agent-env/t"
  agent_env -- t child
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the file's last export not passed" lacks LAST_UNDECLARED
  check "the list's last name passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
  check "the list's first name passed" has SONARQUBE_CLI_ORG org-dummy-1
}

t3_unset_reference() {
  printf '%s\n' "export SONARQUBE_CLI_ORG=org-\${AGENT_ENV_TEST_UNSET}dummy-1" \
    'export SONARQUBE_CLI_TOKEN=tok-dummy-1' >"$HOME/.bashrc.secrets"
  agent_env -- claude child
  check "exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "the value around it passed" has SONARQUBE_CLI_ORG org-dummy-1
  check "the next line's value passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
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

b3_earlier_functions_kept() {
  install opencode pi
  with_agent_env
  cat >"$HOME/.bashrc.local" <<'END'
opencode() { printf 'own-opencode %s\n' "$*" >>"$HOME/own.log"; }
pi() { printf 'own-pi %s\n' "$*" >>"$HOME/own.log"; }
END
  shell 'opencode a; pi b'
  check "exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
  check "both earlier functions ran (got: $(cat "$HOME/own.log" 2>/dev/null))" \
    eq "$(cat "$HOME/own.log" 2>/dev/null)" "$(printf '%s\n' 'own-opencode a' 'own-pi b')"
  check "no child" not_ran
}

s1_steamdeck_claude() {
  local how
  sed -n '/^claude() {$/,/^}$/p' "$STEAMDECK_LOCAL" >"$HOME/.bashrc.local"
  check "the function copied" grep -q '^claude() {$' "$HOME/.bashrc.local"
  install claude
  ln -s "$ROOT/stand-in/systemd-run" "$ROOT/bin/systemd-run"
  for how in agent-env plain; do
    if [ "$how" = agent-env ]; then with_agent_env; else rm "$HOME/.local/bin/agent-env"; fi
    rm -f "$ROOT/systemd-run.args"
    # shellcheck disable=SC2016 # expanded by the inner bash
    shell 'printf "%s\n" "$(type -t claude)"; claude a "b c"'
    check "$how: exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
    check "$how: a function (got: $OUT)" eq "$OUT" function
    check "$how: systemd-run in claude.slice (got: $(cat "$ROOT/systemd-run.args" 2>/dev/null))" \
      eq "$(cat "$ROOT/systemd-run.args" 2>/dev/null)" "--user --scope --quiet --slice=claude.slice -- claude a b c"
    check "$how: claude ran" eq "$(cat "$ROOT/child.name" 2>/dev/null)" claude
    check "$how: arguments unchanged (got: $(args))" eq "$(args)" "$(printf 'arg %q\n' a "b c")"
    check "$how: vitest cap" has VITEST_MAX_WORKERS 4
    check "$how: pytest cap" has PYTEST_XDIST_AUTO_NUM_WORKERS 4
    check "$how: the token passed" has SONARQUBE_CLI_TOKEN tok-dummy-1
    if [ "$how" = agent-env ]; then
      check "$how: OTHER_TOKEN, exported by .bashrc, not passed" lacks OTHER_TOKEN
    else
      check "$how: the shell's OTHER_TOKEN inherited, as before" has OTHER_TOKEN other-dummy-1
    fi
  done
}

n1_nvim_terminal_cmd() {
  local how
  if ! [ -x "$NVIM_BIN" ]; then
    fail "no nvim found (got '$NVIM_BIN')"
    return
  fi
  cat >"$ROOT/probe.lua" <<'END'
-- Stand-ins for the plugin manager and the plugin; prints terminal_cmd.
vim.pack = { add = function() end }
local seen
package.preload["claudecode"] = function()
  return { setup = function(opts) seen = opts end }
end
dofile(arg[1])
io.write(tostring(seen and seen.terminal_cmd))
END
  for how in agent-env plain; do
    if [ "$how" = agent-env ]; then with_agent_env; else rm "$HOME/.local/bin/agent-env"; fi
    run PATH="$HOME/.local/bin:$ROOT/bin" -- "$NVIM_BIN" --clean --headless -l "$ROOT/probe.lua" "$CLAUDECODE_LUA"
    check "$how: exit 0 (got $RC; stderr: $(err))" eq "$RC" 0
    if [ "$how" = agent-env ]; then
      check "$how: terminal_cmd (got: $OUT)" eq "$OUT" "agent-env claude claude"
    else
      check "$how: terminal_cmd nil (got: $OUT)" eq "$OUT" nil
    fi
  done
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
