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

# Prompt
PS1='\u@\h \W > '

# Editor / terminal env
export EDITOR='nvim'
export VISUAL='nvim'
export TERMINAL="wezterm"

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

# Greeter — only on a top-level shell that's not inside tmux. Skips
# subshells (`bash` inside an existing shell) and tmux panes where the
# fastfetch art is just noise.
if [ -z "${TMUX:-}" ] && [ "${SHLVL:-1}" = "1" ] && command -v fastfetch >/dev/null; then
  fastfetch
fi

# Prompt + cd jumper — must run last
command -v starship >/dev/null && eval "$(starship init bash)"
command -v zoxide >/dev/null && eval "$(zoxide init bash --cmd cd)"
