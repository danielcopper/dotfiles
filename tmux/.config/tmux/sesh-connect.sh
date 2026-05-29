#!/usr/bin/env bash
# Rich sesh session picker, bound to `prefix + T` via tmux display-popup.
# Plain fzf (not fzf-tmux): we're already inside a tmux popup, and nesting a
# second popup collapses the inner one. Inside the popup $TMUX is set, so
# `sesh connect` switches the client instead of nesting tmux.
set -uo pipefail

# The tmux popup inherits the tmux server's environment, which may predate
# sesh's install (a long-lived server has a frozen PATH). Put mise's shim dir
# up front so `sesh` resolves regardless of when the server started.
export PATH="$HOME/.local/share/mise/shims:$PATH"

sel=$(
  sesh list --icons | fzf \
    --reverse --ansi --no-sort --border-label ' sesh ' --prompt '⚡  ' \
    --header '^a all · ^t tmux · ^g configs · ^x zoxide · ^d kill' \
    --bind 'tab:down,btab:up' \
    --bind 'ctrl-a:change-prompt(⚡  )+reload(sesh list --icons)' \
    --bind 'ctrl-t:change-prompt(🪟  )+reload(sesh list -t --icons)' \
    --bind 'ctrl-g:change-prompt(⚙  )+reload(sesh list -c --icons)' \
    --bind 'ctrl-x:change-prompt(📁  )+reload(sesh list -z --icons)' \
    --bind 'ctrl-d:execute(tmux kill-session -t {2..})+change-prompt(⚡  )+reload(sesh list --icons)' \
    --preview-window 'right:55%' \
    --preview 'sesh preview {}'
) || exit 0

[ -n "$sel" ] && exec sesh connect "$sel"
