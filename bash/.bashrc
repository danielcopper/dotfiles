#
# ~/.bashrc
#

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
export PATH="$HOME/.local/bin:$HOME/.dotnet/tools:$PATH"

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

# Greeter — installed on every host via package lists, but guard anyway.
command -v fastfetch >/dev/null && fastfetch

# Per-host overrides (package-manager tweaks, host-specific env)
[ -f ~/.bashrc.local ] && . ~/.bashrc.local

# Untracked secrets (API keys, SQLCMDPASSWORD, etc.) — file is gitignored.
[ -f ~/.bashrc.secrets ] && . ~/.bashrc.secrets

# Prompt + cd jumper — must run last
command -v starship >/dev/null && eval "$(starship init bash)"
command -v zoxide >/dev/null && eval "$(zoxide init bash --cmd cd)"
