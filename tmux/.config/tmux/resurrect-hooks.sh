#!/usr/bin/env bash
# tmux-resurrect hooks for Claude Code panes and agent sidebars.
#
#   save <state-file>          @resurrect-hook-post-save-layout
#   pre-restore                @resurrect-hook-pre-restore-all
#   post-restore <state-file>  @resurrect-hook-post-restore-all
#
# Claude Code: a pane whose foreground process is `claude` and that carries
# @claude_session_id (set by the Claude SessionStart hook) is saved with the
# command `claude-resume <id>`; @resurrect-processes turns that into
# `claude --resume <id>` on restore. A Claude pane without an id keeps its
# plain saved command, which is not on the restore list, so it comes back as
# a shell.
#
# Agent sidebars (tmux-agent-sidebar): their panes stay in the state file (so
# each saved window layout keeps matching its pane count) and come back as
# shell panes. After the restore those panes are killed and every window gets
# a fresh sidebar from agent-sidebar-ensure.sh. While the restore runs,
# @resurrect_restore_running pauses sidebar creation for new windows and
# sessions.

set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tab=$'\t'

# State file columns of a `pane` line (tab-separated, see resurrect's save.sh):
# 1 "pane", 2 session, 3 window index, 6 pane index, 10 pane command,
# 11 ":" + full command.
save() {
  local file="$1" ids
  ids="$(tmux list-panes -a -F "#{session_name}${tab}#{window_index}${tab}#{pane_index}${tab}#{@claude_session_id}")" || return 0
  awk -F '\t' -v OFS='\t' '
    NR == FNR {
      if ($4 ~ /^[0-9A-Za-z-]+$/) id[$1 FS $2 FS $3] = $4
      next
    }
    $1 == "pane" && $10 == "claude" && (($2 FS $3 FS $6) in id) {
      $11 = ":claude-resume " id[$2 FS $3 FS $6]
    }
    { print }
  ' <(printf '%s\n' "$ids") "$file" >"$file.tmp" && mv "$file.tmp" "$file"
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
  # Panes that exist before the restore are never treated as leftovers.
  tmux set-option -g @resurrect_restore_existing \
    " $(tmux list-panes -a -F '#{pane_id}' | tr '\n' ' ')"
}

post_restore() {
  local file="$1" existing leftovers=() session window index pane
  if [ -f "$file" ]; then
    existing="$(tmux show-option -gqv @resurrect_restore_existing)"
    # Resolve every saved sidebar position to a pane id before killing any
    # pane, since a kill renumbers the panes after it.
    while IFS="$tab" read -r session window index; do
      pane="$(tmux display-message -p -t "${session}:${window}.${index}" '#{pane_id}' 2>/dev/null)" || continue
      [[ -n "$pane" && "$existing" != *" $pane "* ]] && leftovers+=("$pane")
    done < <(awk -F '\t' -v OFS='\t' '$1 == "pane" && $10 == "tmux-agent-sidebar" { print $2, $3, $6 }' "$file")
    for pane in "${leftovers[@]}"; do
      tmux kill-pane -t "$pane"
    done
  fi
  tmux set-option -gu @resurrect_restore_existing
  tmux set-option -gu @resurrect_restore_running
  "$here/agent-sidebar-ensure.sh"
}

case "${1:-}" in
  save) [ -f "${2:-}" ] && save "$2" ;;
  pre-restore) pre_restore ;;
  post-restore) post_restore "${2:-}" ;;
esac
exit 0
