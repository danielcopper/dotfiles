#!/usr/bin/env bash
# Put a window's agent sidebar back to @sidebar_width after the window is
# resized. tmux spreads a size change over all panes, so without this the
# sidebar grows or shrinks with the terminal (e.g. when it moves to another
# monitor). Sidebar panes carry the pane option @pane_role=sidebar.
#
# A zoomed window is left alone: resize-pane unzooms it. A sidebar already at
# its width is not touched.
#
# Usage: agent-sidebar-width.sh <window-id>
set -uo pipefail

window="${1:?usage: agent-sidebar-width.sh <window-id>}"
width="$(tmux show -gv @sidebar_width 2>/dev/null)"
[ -n "$width" ] || exit 0

read -r zoomed window_width < <(tmux display -p -t "$window" '#{window_zoomed_flag} #{window_width}' 2>/dev/null) || exit 0
[ "$zoomed" = 1 ] && exit 0

# The width tmux gives `resize-pane -x N%`: N percent of the window, rounded down.
if [[ "$width" == *% ]]; then
  target=$(( window_width * ${width%\%} / 100 ))
else
  target="$width"
fi

tmux list-panes -t "$window" -F '#{pane_id} #{pane_width} #{@pane_role}' 2>/dev/null |
  while read -r pane pane_width role; do
    [ "$role" = sidebar ] || continue
    [ "$pane_width" = "$target" ] && continue
    tmux resize-pane -t "$pane" -x "$width"
  done
exit 0
