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
# A run looks at every window, from one listing of all panes, and sends its
# changes to tmux in one command, so a run normally makes the same few tmux
# calls whatever the window count. Runs take turns (a lock next to the server
# socket): the hook fires again for every resize, this script's own included,
# and overlapping runs would read each other's half-done widths. A run leaves a
# marker file before it asks for the lock; one that finds the lock taken exits,
# and the run holding it goes round again while a marker is left. After its
# resizes a run records the windows from a fresh listing, but only those whose
# pane count and width are still the ones it acted on; a window changed in
# between forgets its state, so the next pass fits it. Changes landing in that
# gap can still be taken for the script's own, for example a split and a close
# together that leave the pane count as it was, or a drag of a sidebar the run
# is fitting at that moment. A sidebar tmux cannot make wide enough keeps the
# width it got, and since that is what the state records, the resize is not
# taken for the user's.
#
# A zoomed window is left alone (resize-pane unzooms it). When a fit meets it
# zoomed, it forgets its state, so it is fitted once it is unzoomed. Nothing
# happens while a tmux-resurrect restore runs (@resurrect_restore_running): the
# restored layouts keep pane count and window width, so they would pass for the
# user's. The restore calls this script with `fit` when it is done, which fits
# every window.
#
# Usage: agent-sidebar-width.sh [fit]
set -uo pipefail

# Any other argument counts as a check (a hook from before a config reload
# still passes the window id).
mode=check
[ "${1:-}" = fit ] && mode=fit

# run-shell passes the server in $TMUX: "<socket path>,<pid>,<session>".
socket="${TMUX:-}"
socket="${socket%%,*}"
[ -n "$socket" ] || socket="$(tmux display -p '#{socket_path}' 2>/dev/null)"
[ -n "$socket" ] || exit 0
lock="$socket.sidebar-width.lock"

tab=$'\t'
panes_format="#{window_id}${tab}#{window_zoomed_flag}${tab}#{window_width}${tab}#{window_panes}${tab}#{pane_id}${tab}#{pane_width}${tab}#{@pane_role}${tab}#{@sidebar_width}${tab}#{@resurrect_restore_running}${tab}#{@sidebar_layout_state}"

# Prints what a pass has to do, one step per line, from a listing of all panes
# in panes_format on stdin ($1 = check or fit):
#   width <w>           set @sidebar_width to <w>
#   resize <pane> <w>   resize the sidebar pane to <w>
#   state <win> <s>     set the window's @sidebar_layout_state to <s>
#   forget <win>        unset it
#   record <win> <p:w>  set it from the layout after the resizes, if the window
#                       still has the pane count and width <p:w> seen here
decide() {
  awk -F '\t' -v mode="$1" '
    function target(ww) {
      return width ~ /%$/ ? int(ww * substr(width, 1, length(width) - 1) / 100) : width
    }
    function fit(w) {
      if (zoomed[w]) { print "forget", w; return }
      if (w in sidebar && sidebar_width[w] != target(ww[w])) print "resize", sidebar[w], width
      print "record", w, panes[w] ":" ww[w]
    }
    {
      w = $1
      if (!(w in zoomed)) {
        windows[++n] = w; zoomed[w] = $2 == 1; ww[w] = $3; panes[w] = $4; last[w] = $10
      }
      if ($7 == "sidebar" && !(w in sidebar)) { sidebar[w] = $5; sidebar_width[w] = $6 }
      width = $8; restore = $9
    }
    END {
      if (width == "" || restore == 1) exit
      if (mode == "fit") { for (i = 1; i <= n; i++) fit(windows[i]); exit }
      for (i = 1; i <= n; i++) {
        w = windows[i]
        if (zoomed[w]) continue
        now[w] = panes[w] ":" ww[w] ":" sidebar_width[w]
        if (now[w] == last[w]) continue
        prefix = last[w]; sub(/:[^:]*$/, "", prefix)
        if (prefix != panes[w] ":" ww[w] || !(w in sidebar)) { pending[w] = 1; continue }
        # Same panes, same window, another sidebar width: the user resized it.
        # The state records the width read here, not a fresh one: a drag still
        # going on makes the next pass take up the width it has reached by then.
        print "state", w, now[w]
        if (user == "" && sidebar_width[w] != target(ww[w])) user = w
      }
      if (user == "") {
        for (i = 1; i <= n; i++) if (windows[i] in pending) fit(windows[i])
        exit
      }
      width = sidebar_width[user]
      print "width", width
      for (i = 1; i <= n; i++) if (windows[i] != user) fit(windows[i])
    }'
}

# Prints the current @sidebar_layout_state of the windows named in $1 (space
# separated "<win>=<pane count>:<window width>" items), as "state <win> <s>"
# lines, from a listing on stdin. A window whose pane count or width is no
# longer the one named was changed after the pass read it (a pane closed or
# split, the window resized); a "forget <win>" line makes it forget its state,
# so the next pass, which its hook has asked for, fits it.
current_states() {
  awk -F '\t' -v list="$1" '
    BEGIN { m = split(list, items, " "); for (i = 1; i <= m; i++) { split(items[i], kv, "="); want[kv[1]] = kv[2] } }
    ($1 in want) && !($1 in seen) { seen[$1] = 1; order[++n] = $1; same[$1] = want[$1] == $4 ":" $3; panes[$1] = $4; ww[$1] = $3 }
    $7 == "sidebar" && !($1 in width) { width[$1] = $6 }
    END {
      for (i = 1; i <= n; i++) {
        w = order[i]
        if (same[w]) print "state", w, panes[w] ":" ww[w] ":" width[w]
        else print "forget", w
      }
    }'
}

# Sends the steps on stdin to tmux as one command; prints the windows to record.
# tmux drops the rest of a command list at the first failing command (a pane or
# window closed since the listing), so then each command is sent on its own.
apply() {
  local commands=() args=() records="" step a b command words
  while read -r step a b; do
    case "$step" in
      record) records+=" $a=$b" ;;
      width) commands+=("set -g @sidebar_width $a") ;;
      resize) commands+=("resize-pane -t $a -x $b") ;;
      state) commands+=("set -w -t $a @sidebar_layout_state $b") ;;
      forget) commands+=("set -wu -t $a @sidebar_layout_state") ;;
    esac
  done
  for command in "${commands[@]}"; do
    read -ra words <<<"$command"
    [ ${#args[@]} -eq 0 ] || args+=(';')
    args+=("${words[@]}")
  done
  if [ ${#args[@]} -gt 0 ] && ! tmux "${args[@]}" 2>/dev/null; then
    for command in "${commands[@]}"; do
      read -ra words <<<"$command"
      tmux "${words[@]}" 2>/dev/null
    done
  fi
  echo "$records"
}

pass() {
  local records
  records="$(tmux list-panes -a -F "$panes_format" | decide "$1" | apply)"
  [ -n "$records" ] || return 0
  tmux list-panes -a -F "$panes_format" | current_states "$records" | apply >/dev/null
}

touch "$lock.$mode" || exit 0
exec 9>"$lock" || exit 0
while :; do
  flock -n 9 || exit 0
  while [ -e "$lock.fit" ] || [ -e "$lock.check" ]; do
    if [ -e "$lock.fit" ]; then
      rm -f "$lock.fit" "$lock.check"
      pass fit
    else
      rm -f "$lock.check"
      pass check
    fi
  done
  flock -u 9
  # A run that found the lock taken after the last look above left a marker.
  [ -e "$lock.fit" ] || [ -e "$lock.check" ] || exit 0
done
