#!/usr/bin/env bash
# Keeps tmux from handing keyboard focus to the agent sidebar
# (@pane_role=sidebar) by itself; the user still selects it inside its window
# (click, prefix h), which changes no window and runs none of the hooks below.
# When the window's active pane is its sidebar and the window has another pane,
# this selects the window's last active pane if that is not a sidebar, and
# otherwise the pane next to the sidebar: to its right, or to its left with
# @sidebar_position right.
#
# Two ways leave a sidebar focused without the user choosing it there:
# - A window becomes current again (next-window, select-window, switch-client)
#   after the user left it from its sidebar, e.g. by jumping from the sidebar to
#   an agent in another window. Hooks session-window-changed and
#   client-session-changed pass #{window_id}, the window that became current.
# - A pane closes and tmux hands its focus to the pane active before it, which
#   is the sidebar after a click into it. Hook pane-exited (a shell exits, a
#   process is killed) passes #{hook_window}, the window of the pane that
#   closed; after-kill-pane (kill-pane, prefix x) passes #{window_id}, the
#   session's current window, since tmux names no window of the killed pane
#   there.
#
# Check and selection are one tmux command, so a select-pane from elsewhere
# (the sidebar's own jump selects its target pane right after the window) is
# never undone: it lands either before the check, which then finds no sidebar
# focused, or after the selection, which it replaces.
#
# The script cannot tell a focus tmux handed over from one the user chose: when
# the user is in the sidebar on purpose and another pane of that window closes,
# focus leaves the sidebar all the same. A kill-pane of a pane in a background
# window checks the current window instead of that one, so it also moves focus
# out of a sidebar the user chose in the current window.
#
# Usage: agent-sidebar-focus.sh <window>
set -u

window="${1:-}"
[ -n "$window" ] || exit 0
direction=-R
[ "$(tmux show-option -gqv @sidebar_position 2>/dev/null)" = right ] && direction=-L
tmux if-shell -F -t "$window" '#{&&:#{==:#{@pane_role},sidebar},#{!=:#{window_panes},1}}' \
  "if-shell -F -t '$window' '#{P:#{?pane_last,#{!=:#{@pane_role},sidebar},}}' 'select-pane -t $window -l' 'select-pane -t $window $direction'" \
  2>/dev/null
exit 0
