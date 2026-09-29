#!/usr/bin/env bash
# Toggles the tmux-agent-sidebar pane from the which-key root menu (a, A):
# without an argument in the current window, as the plugin's prefix binding
# @sidebar_key does; with `all` in every window, as @sidebar_key_all does.
# The menu cannot pass the window and path the way that binding does
# (toggle "#{window_id}" "#{pane_current_path}"): the which-key build escapes a
# command's quotes one level deep only, so this script asks tmux for both.
#
# Usage: agent-sidebar-toggle.sh [all]
set -u

bin="$(tmux show-option -gqv @agent_sidebar_bin)"
[ -n "$bin" ] || exit 0

if [ "${1:-}" = all ]; then
  exec "$bin" toggle-all
fi
# Tab-separated, so a path with spaces stays one field.
IFS=$'\t' read -r window path < <(tmux display-message -p '#{window_id}	#{pane_current_path}')
exec "$bin" toggle "$window" "$path"
