# Sourced by agent-sidebar-ensure.sh and resurrect-hooks.sh: one line per call
# into ~/.local/state/tmux/sidebar-restore.log, to trace which call creates or
# removes sidebars while a tmux-resurrect restore runs. Each line carries the
# time, the caller, the restore pause flag and the panes per window.
# Kept to its last 2000 lines.

sidebar_log() {
  local dir="${XDG_STATE_HOME:-$HOME/.local/state}/tmux" file panes
  file="$dir/sidebar-restore.log"
  mkdir -p "$dir" 2>/dev/null || return 0
  panes="$(tmux list-windows -a -F '#{session_name}:#{window_index}=#{window_panes}' 2>/dev/null | tr '\n' ' ')"
  printf '%s %-28s paused=%s windows: %s\n' \
    "$(date '+%F %T.%3N')" "$*" \
    "$(tmux show-option -gqv @resurrect_restore_running)" "$panes" >>"$file"
  if [ "$(wc -l <"$file")" -gt 2500 ]; then
    tail -n 2000 "$file" >"$file.tmp" && mv "$file.tmp" "$file"
  fi
}
