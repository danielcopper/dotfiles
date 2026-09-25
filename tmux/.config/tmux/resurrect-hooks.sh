#!/usr/bin/env bash
# tmux-resurrect hooks for Claude Code panes and agent sidebars.
#
#   save <state-file>          @resurrect-hook-post-save-layout
#   pre-restore                @resurrect-hook-pre-restore-all
#   post-restore <state-file>  @resurrect-hook-post-restore-all
#
# Claude Code: a pane whose foreground process is `claude` and that carries
# @claude_session_id (kept by the Claude SessionStart/SessionEnd hook) is
# saved with the command `claude-resume <id>`; @resurrect-processes turns
# that into `claude --resume <id>` on restore. A Claude pane without an id
# keeps its plain saved command, which is not on the restore list, so it comes
# back as a shell.
#
# Agent sidebars (tmux-agent-sidebar): their panes stay in the state file and
# come back as shell panes in the saved layout. After the restore each of
# them is restarted in place as a sidebar (the sidebar binary plus the pane
# option @pane_role=sidebar, as the plugin creates one), so the layout stays
# as saved. Where the window already has a sidebar, the stray shell is removed
# instead (never a window's only pane); windows without one get a sidebar from
# agent-sidebar-ensure.sh.
# While the restore runs, @resurrect_restore_running pauses sidebar creation
# for new windows and sessions, and agent-sidebar-width.sh; afterwards every
# sidebar is put back to @sidebar_width.

set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tab=$'\t'

# State file columns of a `pane` line (tab-separated, see resurrect's save.sh):
# 1 "pane", 2 session, 3 window index, 6 pane index, 8 ":" + directory (first
# space escaped as "\ "), 10 pane command, 11 ":" + full command.
#
# The ids come from a second pane listing taken after resurrect wrote the
# file. A window gets ids only if its panes in that listing (index, command,
# directory, in order) are exactly the ones resurrect saved; otherwise panes
# may have closed or moved in between, and its Claude panes keep their plain
# command (a shell on restore beats a wrong conversation).
save() {
  local file="$1" live
  live="$(tmux list-panes -a -F "#{session_name}${tab}#{window_index}${tab}#{pane_index}${tab}#{pane_current_command}${tab}#{pane_current_path}${tab}#{@claude_session_id}")" || return 0
  awk -F '\t' -v OFS='\t' '
    FILENAME == ARGV[1] {
      w = $1 FS $2
      dir = $5
      i = index(dir, " ")
      if (i) dir = substr(dir, 1, i - 1) "\\" substr(dir, i)
      live[w] = live[w] "|" $3 ":" $4 ":" dir
      if ($6 ~ /^[0-9A-Za-z-]+$/) id[w FS $3] = $6
      next
    }
    FNR == 1 { pass++ }
    pass == 1 {
      if ($1 == "pane") saved[$2 FS $3] = saved[$2 FS $3] "|" $6 ":" $10 ":" substr($8, 2)
      next
    }
    $1 == "pane" && $10 == "claude" && saved[$2 FS $3] == live[$2 FS $3] && (($2 FS $3 FS $6) in id) {
      $11 = ":claude-resume " id[$2 FS $3 FS $6]
    }
    { print }
  ' <(printf '%s\n' "$live") "$file" "$file" >"$file.tmp" && mv "$file.tmp" "$file"
  rm -f "$file.tmp"
}

pre_restore() {
  tmux set-option -g @resurrect_restore_running 1
  # resurrect restores "from scratch" (it replaces the only pane and drops a
  # session named 0) only when the server has exactly one pane; the sidebar
  # tmux.conf adds to a freshly started session must not count as a second.
  local panes others
  panes="$(tmux list-panes -a -F "#{pane_id}${tab}#{@pane_role}")"
  others="$(awk -F '\t' '$2 != "sidebar"' <<<"$panes" | wc -l)"
  if [ "$others" -eq 1 ]; then
    awk -F '\t' '$2 == "sidebar" { print $1 }' <<<"$panes" |
      while read -r pane; do tmux kill-pane -t "$pane"; done
  fi
  # Panes that exist before the restore are never touched afterwards.
  tmux set-option -g @resurrect_restore_existing \
    " $(tmux list-panes -a -F '#{pane_id}' | tr '\n' ' ')"
}

post_restore() {
  local file="$1" bin existing restored=() session window index pane
  if [ -f "$file" ]; then
    bin="$(tmux show-option -gqv @agent_sidebar_bin)"
    existing="$(tmux show-option -gqv @resurrect_restore_existing)"
    # Saved sidebar positions whose pane the restore created.
    while IFS="$tab" read -r session window index; do
      pane="$(tmux display-message -p -t "${session}:${window}.${index}" '#{pane_id}' 2>/dev/null)" || continue
      [[ -n "$pane" && "$existing" != *" $pane "* ]] && restored+=("$pane")
    done < <(awk -F '\t' -v OFS='\t' '$1 == "pane" && $10 == "tmux-agent-sidebar" { print $2, $3, $6 }' "$file")
    for pane in "${restored[@]}"; do
      if [ -n "$bin" ] && ! tmux list-panes -t "$pane" -F '#{@pane_role}' | grep -qx sidebar; then
        tmux respawn-pane -k -t "$pane" \
          -c "$(tmux display-message -p -t "$pane" '#{pane_current_path}')" "$bin"
        tmux set-option -p -t "$pane" @pane_role sidebar
      elif [ "$(tmux display-message -p -t "$pane" '#{window_panes}')" -gt 1 ]; then
        # The window has a sidebar already (or the plugin is missing): drop the
        # restored shell, unless it is the window's only pane.
        tmux kill-pane -t "$pane"
      fi
    done
  fi
  tmux set-option -gu @resurrect_restore_existing
  tmux set-option -gu @resurrect_restore_running
  "$here/agent-sidebar-ensure.sh"
  "$here/agent-sidebar-width.sh" fit
}

case "${1:-}" in
  save) [ -f "${2:-}" ] && save "$2" ;;
  pre-restore) pre_restore ;;
  post-restore) post_restore "${2:-}" ;;
esac
exit 0
