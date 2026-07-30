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
alias cc='command claude --model opus --effort xhigh'
# Default `claude` to opus xhigh for interactive/print use; pass subcommands
# (mcp, config, doctor, ...) through to the real binary unchanged.
claude() {
    case "$1" in
        agents|auth|auto-mode|doctor|install|mcp|plugin|plugins|project|setup-token|ultrareview|update|upgrade|-h|--help|-v|--version)
            command claude "$@"
            ;;
        *)
            command claude --model opus --effort xhigh "$@"
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

# Greeter — fastfetch on a fresh top-level shell, never as repeated noise.
# Skipped inside herdr panes (HERDR_PANE_ID, herdr's own pane marker): those are
# working panes, so a greeter in every one is just noise. SHLVL=1 keeps it to
# the outermost shell, not subshells.
if command -v fastfetch >/dev/null && [ -z "${HERDR_PANE_ID:-}" ]; then
  [ "${SHLVL:-1}" = "1" ] && fastfetch
fi

# Prompt + cd jumper — must run last
command -v starship >/dev/null && eval "$(starship init bash)"
command -v zoxide >/dev/null && eval "$(zoxide init bash --cmd cd)"
