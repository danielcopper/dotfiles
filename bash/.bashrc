#
# ~/.bashrc — sourced on every interactive bash startup.
#
# Ordering matters: host-local runs *early* so each host can drop into
# PATH/env (e.g. linuxbrew shellenv on steamdeck) before the
# tool-presence checks below. Greeter runs late and is gated to avoid
# noise in tmux panes and subshells.
#
# shellcheck shell=bash

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Aliases
command -v lsd >/dev/null && alias ls='lsd'
alias grep='grep --color=auto'
alias ip='ip -color=auto'
alias diff='diff --color=auto'
alias cc='command claude --model "claude-opus-4-8[1m]" --effort xhigh'
# Default `claude` to opus xhigh for interactive/print use; pass subcommands
# (mcp, config, doctor, ...) through to the real binary unchanged.
claude() {
    case "$1" in
        agents|auth|auto-mode|doctor|install|mcp|plugin|plugins|project|setup-token|ultrareview|update|upgrade|-h|--help|-v|--version)
            command claude "$@"
            ;;
        *)
            command claude --model "claude-opus-4-8[1m]" --effort xhigh "$@"
            ;;
    esac
}

# Prompt
PS1='\u@\h \W > '

# Editor / terminal env
export EDITOR='nvim'
export VISUAL='nvim'
export TERMINAL="wezterm"

# ssh-agent socket from the user-level systemd unit (see systemd/ pkg).
[ -S "$XDG_RUNTIME_DIR/ssh-agent.socket" ] && \
  export SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/ssh-agent.socket"

# Idempotent PATH prepend — re-sourcing this file shouldn't grow $PATH.
prepend_path() {
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}
prepend_path "$HOME/.local/bin"
prepend_path "$HOME/.dotnet/tools"
export PATH
unset -f prepend_path

# Per-host overrides — sourced EARLY because they contribute to PATH/env
# (e.g. host-steamdeck pulls in linuxbrew). Tool checks below need
# those entries already in $PATH.
[ -f ~/.bashrc.local ] && . ~/.bashrc.local

# Bash completion. Distro path on arch/wsl-arch, brew path on steamdeck.
for f in /usr/share/bash-completion/bash_completion \
         "${HOMEBREW_PREFIX:-/home/linuxbrew/.linuxbrew}/etc/profile.d/bash_completion.sh"; do
  [ -r "$f" ] && . "$f" && break
done
unset f

# Tool integrations — guard each so a missing tool doesn't spam errors.
command -v mise >/dev/null && eval "$(mise activate bash)"
command -v ng >/dev/null && source <(ng completion script)
[ -r /usr/share/git/completion/git-completion.bash ] && \
  . /usr/share/git/completion/git-completion.bash

# Untracked secrets (API keys, SQLCMDPASSWORD, etc.) — file is gitignored.
[ -f ~/.bashrc.secrets ] && . ~/.bashrc.secrets

# Always in tmux via sesh: per-window session, picker when ambiguous.
# Runs only in a real interactive terminal (TTY, not already inside a
# multiplexer) — never in scripts, SSH command runs, or agent/tool shells
# (those are non-interactive or have no TTY, both filtered here). Skipped
# inside a herdr pane (HERDR_PANE_ID, herdr's own pane marker): herdr is itself
# a multiplexer, so autostarting tmux there would nest a tmux in every pane.
# Opt out for any window with NO_TMUX_AUTOSTART=1. Placed after secrets/env so
# the tmux server inherits a fully set-up environment, and before the greeter so
# the brief launcher shell never flashes fastfetch before exec'ing into tmux.
if [[ $- == *i* ]] && [[ -t 0 && -t 1 ]] && [[ -z "${TMUX:-}" ]] \
   && [[ -z "${HERDR_PANE_ID:-}" ]] && [[ -z "${NO_TMUX_AUTOSTART:-}" ]] \
   && command -v sesh >/dev/null 2>&1; then
  # Pick an existing session/dir, or type a new name to create one. `exec`
  # ties this window's lifetime to its tmux session. fzf exit codes: 0 = item
  # chosen, 1 = new name typed (no match), 130 = Esc -> fall through to a
  # plain shell.
  _pick=$(sesh list 2>/dev/null | fzf --print-query --reverse --height=40% \
            --prompt='⚡ ' \
            --header='Enter: attach/create · Name tippen + Enter: neu · Esc: Shell')
  _rc=$?
  if [[ "$_rc" -eq 0 || "$_rc" -eq 1 ]]; then
    _sel=$(printf '%s\n' "$_pick" | tail -n1)
    [[ -n "$_sel" ]] && exec sesh connect "$_sel"
  fi
  unset _pick _rc _sel
fi

# Greeter — fastfetch on a fresh shell, never as repeated noise. Outside
# tmux: any top-level shell. Inside tmux: only the first pane of a brand-new
# single-window/single-pane session, so splits, extra windows, and attaches
# to existing multi-pane sessions stay quiet.
if command -v fastfetch >/dev/null; then
  if [ -z "${TMUX:-}" ]; then
    [ "${SHLVL:-1}" = "1" ] && fastfetch
  elif [ "$(tmux display-message -p '#{session_windows}' 2>/dev/null)" = "1" ] \
    && [ "$(tmux display-message -p '#{window_panes}' 2>/dev/null)" = "1" ]; then
    fastfetch
  fi
fi

# Prompt + cd jumper — must run last
command -v starship >/dev/null && eval "$(starship init bash)"
command -v zoxide >/dev/null && eval "$(zoxide init bash --cmd cd)"
