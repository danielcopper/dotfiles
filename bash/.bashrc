#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Aliases
alias ls='lsd'
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

# Bash completion
source /usr/share/bash-completion/bash_completion

# Tool integrations
eval "$(mise activate bash)"
source <(ng completion script)
source /usr/share/git/completion/git-completion.bash

# Per-host overrides (greeter, package-manager tweaks, host-specific env)
[ -f ~/.bashrc.local ] && . ~/.bashrc.local

# Untracked secrets (API keys, SQLCMDPASSWORD, etc.) — file is gitignored.
[ -f ~/.bashrc.secrets ] && . ~/.bashrc.secrets

# Prompt + cd jumper — must run last
eval "$(starship init bash)"
eval "$(zoxide init bash --cmd cd)"
