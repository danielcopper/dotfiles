#!/usr/bin/env bash
# One-line input prompt in a tmux popup, in place of command-prompt's status-line
# prompt for the name prompts (rename window/session, new session).
#
# Usage: prompt-popup.sh <initial-text> <tmux-arg>...
#   The initial text and the tmux args may hold formats (#{window_id}, …): the
#   popup's own command is not format-expanded, so they are resolved here, against
#   the client the popup belongs to. Then every "%%" in the tmux args is replaced
#   by the entered text; a lone ";" arg separates tmux commands as usual. Esc,
#   Ctrl-C or empty input cancels; a failing command reports its error via
#   display-message.
set -uo pipefail

expand() {
  case $1 in
    *'#{'*) tmux display-message -p -- "$1" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

initial=$(expand "$1")
shift

input=$(: | FZF_DEFAULT_OPTS='' fzf --print-query --query "$initial" --prompt ' ❯ ' \
  --no-info --no-separator --layout reverse --height 1 \
  --color 'prompt:#cba6f7:bold,query:#cdd6f4')
[ $? -eq 130 ] && exit 0
[ -n "$input" ] || exit 0

args=()
for arg in "$@"; do
  arg=$(expand "$arg")
  args+=("${arg//%%/$input}")
done

err=$(tmux "${args[@]}" 2>&1) || tmux display-message "$err"
