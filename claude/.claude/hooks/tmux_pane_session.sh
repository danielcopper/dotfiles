#!/usr/bin/env bash
# Keeps the Claude Code session id on the tmux pane the session runs in (pane
# option @claude_session_id). The tmux-resurrect save hook
# (~/.config/tmux/resurrect-hooks.sh) reads it to bring the pane back with
# `claude --resume <id>` after a restore.
#
#   tmux_pane_session.sh [start]   SessionStart: store the id
#   tmux_pane_session.sh end       SessionEnd: clear the option, but only while
#                                  it still holds the ending session's id
#
# SessionStart also fires on resume, /clear and compaction; every run
# overwrites the option with the then-current id. On /clear and resume,
# SessionEnd for the old id fires first. Outside tmux ($TMUX_PANE unset) the
# hook does nothing, and it always exits 0 so it never fails a session.
#
# Only the pane's own agent writes the option. The hook walks its process
# ancestry up to the pane's process (#{pane_pid}); the first Claude process on
# that path is the one that ran the hook. It does nothing when
#   - a second Claude process sits above that one: a nested Claude, e.g.
#     `claude -p` started from a tool call, which inherits $TMUX_PANE;
#   - that Claude has --agent-id among its arguments: a split-pane agent-team
#     teammate (Claude Code 2.1.281 starts split-pane teammates as
#     `<claude binary> --agent-id <id> --agent-name <name> --team-name <team>
#     ...`). Claude Code does not bring teammates back on resume, so their
#     panes come back as plain shells;
#   - the path never reaches the pane's process.
# A Claude process is one named `claude`, or one whose executable lies under
# .../claude/versions/ (the native install; teammates run from that path, so
# their process name is the version number).

mode="${1:-start}"
input="$(cat)"
[ -n "${TMUX_PANE:-}" ] || exit 0

id="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)"
# The id ends up typed into a shell on restore: accept only id characters.
[[ "$id" =~ ^[0-9A-Za-z-]+$ ]] || exit 0

pane_pid="$(tmux display-message -p -t "$TMUX_PANE" '#{pane_pid}' 2>/dev/null)"
[[ "$pane_pid" =~ ^[0-9]+$ ]] || exit 0

is_claude() {
  [ "$(cat "/proc/$1/comm" 2>/dev/null)" = claude ] ||
    [[ "$(readlink "/proc/$1/exe" 2>/dev/null)" == */claude/versions/* ]]
}

agent=""
pid=$$
while :; do
  if is_claude "$pid"; then
    [ -z "$agent" ] || exit 0
    agent="$pid"
  fi
  [ "$pid" = "$pane_pid" ] && break
  pid="$(awk '/^PPid:/ { print $2 }' "/proc/$pid/status" 2>/dev/null)"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 1 ] || exit 0
done
[ -n "$agent" ] || exit 0
tr '\0' '\n' <"/proc/$agent/cmdline" | grep -qx -- --agent-id && exit 0

case "$mode" in
  start)
    tmux set-option -p -t "$TMUX_PANE" @claude_session_id "$id" 2>/dev/null
    ;;
  end)
    [ "$(tmux show-option -pqv -t "$TMUX_PANE" @claude_session_id 2>/dev/null)" = "$id" ] &&
      tmux set-option -pu -t "$TMUX_PANE" @claude_session_id 2>/dev/null
    ;;
esac
exit 0
