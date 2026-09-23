#!/usr/bin/env bash
# Actions behind the workmux menu (prefix + w in tmux.conf). Each action runs
# inside a tmux display-popup whose working directory is the calling pane's, so
# workmux resolves the repository from there.
#
# Usage: workmux-menu.sh <add|add-branch|add-prompt|open|remove|close> <session>
#
# <session> is the caller's tmux session. A popup is not a pane, so workmux
# cannot find the session from TMUX_PANE; --parent-session names it instead.
set -uo pipefail

# The popup inherits the tmux server's environment, which may predate the mise
# install of workmux (a long-lived server has a frozen PATH).
export PATH="$HOME/.local/share/mise/shims:$PATH"

action="${1:?action}"
session="${2:?session}"

# Pick a worktree of this repository (never the main checkout) with fzf and
# print its handle. $1: "open" lists only worktrees with an open window, "all"
# lists every one. $2: the fzf prompt label.
pick_worktree() {
  local filter='.[] | select(.is_main | not)'
  [ "${1:-}" = "open" ] && filter="$filter | select(.is_open)"
  workmux list --json \
    | jq -r "$filter | [.handle, .branch, (if .is_open then \"●\" else \"\" end)] | @tsv" \
    | fzf --reverse --delimiter '\t' --with-nth 1,2,3 --prompt "$2 > " \
    | cut -f1
}

# Run a workmux command; on failure keep the popup open so the error is readable.
run() {
  "$@" && return 0
  local rc=$?
  read -rp "exit $rc — Enter to close" _
  return "$rc"
}

case "$action" in
  add)
    read -rep "branch: " branch
    [ -n "$branch" ] || exit 0
    run workmux add --parent-session "$session" "$branch"
    ;;
  add-branch)
    branch=$(
      git for-each-ref --format='%(refname:short)' refs/heads refs/remotes \
        | grep -v -E '(^|/)HEAD$' \
        | fzf --reverse --prompt 'branch > '
    )
    [ -n "$branch" ] || exit 0
    run workmux add --parent-session "$session" "$branch"
    ;;
  add-prompt)
    read -rep "branch: " branch
    [ -n "$branch" ] || exit 0
    run workmux add --parent-session "$session" --prompt-editor "$branch"
    ;;
  open)
    handle=$(pick_worktree all open)
    [ -n "$handle" ] || exit 0
    run workmux open --parent-session "$session" "$handle"
    ;;
  remove)
    handle=$(pick_worktree all remove)
    [ -n "$handle" ] || exit 0
    run workmux remove "$handle"
    ;;
  close)
    handle=$(pick_worktree open close)
    [ -n "$handle" ] || exit 0
    run workmux close "$handle"
    ;;
  *)
    echo "unknown action: $action" >&2
    exit 2
    ;;
esac
