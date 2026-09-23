#!/usr/bin/env bash
# SessionStart hook: stores the Claude Code session id on the tmux pane the
# session runs in (pane option @claude_session_id). The tmux-resurrect save
# hook (~/.config/tmux/resurrect-hooks.sh) reads it to bring the pane back
# with `claude --resume <id>` after a restore.
#
# SessionStart also fires on resume, /clear and compaction; every run
# overwrites the option with the then-current id. Outside tmux ($TMUX_PANE
# unset) it does nothing, and it always exits 0 so it never fails a session.
#
# Only the pane's own agent records its id. The hook walks its process
# ancestry up to the pane's process (#{pane_pid}); the first Claude process on
# that path is the one that ran the hook. It skips when
#   - a second Claude process sits above that one: a nested Claude, e.g.
#     `claude -p` started from a tool call, which inherits $TMUX_PANE;
#   - that Claude was started with --agent-id: a split-pane agent-team
#     teammate. Claude Code starts those as `<claude binary> --agent-id <id>
#     --agent-name <name> --team-name <team> ...` (the CLI accepts the three
#     only together) and does not bring teammates back on resume, so their
#     panes come back as plain shells;
#   - the path never reaches the pane's process.
# A Claude process is one named `claude`, or one whose executable lies under
# .../claude/versions/ (the native install; teammates run from that path, so
# their process name is the version number).

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

tmux set-option -p -t "$TMUX_PANE" @claude_session_id "$id" 2>/dev/null
exit 0
