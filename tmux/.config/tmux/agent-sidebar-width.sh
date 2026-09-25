#!/usr/bin/env bash
# Keep the agent sidebars at @sidebar_width. tmux gives a closed pane's space to
# its neighbour and spreads a window resize over all panes, so without this a
# sidebar grows or shrinks by itself (e.g. when the pane next to it closes, or
# the terminal moves to another monitor). Sidebar panes carry the pane option
# @pane_role=sidebar. Runs from the window-layout-changed hook.
#
# Each window remembers "<pane count>:<window width>:<sidebar width>" in the
# window option @sidebar_layout_state, as this script last left it. A layout
# change that keeps the pane count and the window width but changes the
# sidebar's width is the user resizing it (mouse drag, resize-pane): that width
# becomes @sidebar_width in columns, for the sidebars of all windows and for new
# ones (the plugin reads @sidebar_width when it creates a sidebar). Any other
# change (a pane closed or split, the window resized) puts the sidebar back to
# @sidebar_width. N% there means N percent of the window, rounded down, as
# `resize-pane -x N%` does. The width lives in a tmux option only, so a server
# restart brings back the default.
#
# Runs one at a time (a lock next to the server socket): the hook fires again
# for every resize, this script's own included, and overlapping runs would read
# each other's half-done widths. A sidebar tmux cannot make wide enough keeps
# the width it got, and since that is what the state records, the resize is not
# taken for the user's.
#
# A zoomed window is left alone (resize-pane unzooms it) and forgets its state,
# so it is fitted once it is unzoomed. Nothing happens while a tmux-resurrect
# restore runs (@resurrect_restore_running): the restored layouts keep pane
# count and window width, so they would pass for the user's. The restore calls
# this script without an argument when it is done, which fits every window.
#
# Usage: agent-sidebar-width.sh [<window-id>]
set -uo pipefail

socket="$(tmux display -p '#{socket_path}' 2>/dev/null)"
[ -n "$socket" ] || exit 0
exec 9>"$socket.sidebar-width.lock" || exit 0
flock -w 5 9 || exit 0

[ "$(tmux show -gqv @resurrect_restore_running)" = 1 ] && exit 0
width="$(tmux show -gqv @sidebar_width)"
[ -n "$width" ] || exit 0

# Prints "<zoomed flag> <window width> <pane count>" of window $1.
window_info() {
  tmux display -p -t "$1" '#{window_zoomed_flag} #{window_width} #{window_panes}' 2>/dev/null
}

# Prints "<pane id> <pane width>" of window $1's sidebar; fails without one.
sidebar() {
  tmux list-panes -t "$1" -F '#{pane_id} #{pane_width} #{@pane_role}' 2>/dev/null |
    awk '$3 == "sidebar" { print $1, $2; found = 1; exit } END { exit !found }'
}

# The sidebar width @sidebar_width gives in a window $1 columns wide.
target() {
  if [[ "$width" == *% ]]; then
    echo $(( $1 * ${width%\%} / 100 ))
  else
    echo "$width"
  fi
}

# Records window $1's current layout as @sidebar_layout_state.
record() {
  local window_width panes pane_width=""
  read -r _ window_width panes < <(window_info "$1") || return 0
  read -r _ pane_width < <(sidebar "$1")
  tmux set -w -t "$1" @sidebar_layout_state "$panes:$window_width:$pane_width"
}

# Puts window $1's sidebar back to @sidebar_width and records the result.
fit() {
  local zoomed window_width pane pane_width
  read -r zoomed window_width _ < <(window_info "$1") || return 0
  if [ "$zoomed" = 1 ]; then
    tmux set -wu -t "$1" @sidebar_layout_state
    return 0
  fi
  if read -r pane pane_width < <(sidebar "$1") &&
    [ "$pane_width" != "$(target "$window_width")" ]; then
    tmux resize-pane -t "$pane" -x "$width"
  fi
  record "$1"
}

if [ -z "${1:-}" ]; then
  tmux list-windows -a -F '#{window_id}' | while read -r window; do fit "$window"; done
  exit 0
fi

window="$1"
read -r zoomed window_width panes < <(window_info "$window") || exit 0
[ "$zoomed" = 1 ] && exit 0
pane_width=""
read -r _ pane_width < <(sidebar "$window")
state="$panes:$window_width:$pane_width"
last="$(tmux show -wqv -t "$window" @sidebar_layout_state)"
[ "$state" = "$last" ] && exit 0

if [ "${last%:*}" != "$panes:$window_width" ] || [ -z "$pane_width" ]; then
  fit "$window"
  exit 0
fi

# Same panes, same window, another sidebar width: the user resized it. The
# state records the width read above, not a fresh one: a drag still going on
# makes the next run take up the width it has reached by then.
tmux set -w -t "$window" @sidebar_layout_state "$state"
if [ "$pane_width" != "$(target "$window_width")" ]; then
  tmux set -g @sidebar_width "$pane_width"
  width="$pane_width"
  tmux list-windows -a -F '#{window_id}' |
    while read -r other; do
      [ "$other" = "$window" ] || fit "$other"
    done
fi
exit 0
