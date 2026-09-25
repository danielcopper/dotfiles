#!/usr/bin/env bash
# Creates the tmux-agent-sidebar pane in the given window (window id or target),
# or in every window when called without an argument. `toggle --create-only`
# never removes a sidebar, so repeated runs are safe.
#
# Does nothing while a tmux-resurrect restore runs (@resurrect_restore_running,
# set by resurrect-hooks.sh): a sidebar split into a window that resurrect is
# still building shifts its pane indexes. The restore calls this script again
# once it is done.

. "$(dirname "${BASH_SOURCE[0]}")/sidebar-log.sh"

bin="$(tmux show-option -gqv @agent_sidebar_bin)"
[ -n "$bin" ] || exit 0
sidebar_log "ensure ${1:-all}"
[ "$(tmux show-option -gqv @resurrect_restore_running)" = 1 ] && exit 0

if [ -n "${1:-}" ]; then
  tmux display-message -p -t "$1" '#{window_id} #{pane_current_path}'
else
  tmux list-windows -a -F '#{window_id} #{pane_current_path}'
fi | while read -r window path; do
  before="$(tmux display-message -p -t "$window" '#{window_panes}' 2>/dev/null)"
  "$bin" toggle --create-only "$window" "$path"
  after="$(tmux display-message -p -t "$window" '#{window_panes}' 2>/dev/null)"
  if [ "$before" != "$after" ]; then sidebar_log "ensure created in $window"; fi
done
