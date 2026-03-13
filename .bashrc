#
# ~/.bashrc
#

# Disable history expansion (! triggers). Prevents bash from interpreting ! as
# a history command (e.g. "Admin123!" in passwords, SQL strings with 'value').
# Use Ctrl+R or arrow keys instead of !! for command recall.
# Placed before the interactive guard so it applies to all shell contexts.
set +H

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='lsd'
alias grep='grep --color=auto'
#PS1='[\u@\h \W]\$ '
PS1='\u@\h \W > '
#PS1='> '

# Vars
export XDG_CONFIG_HOME="$HOME/.config"
export DBT_PROFILES_DIR="$HOME/.config/dbt"
export PATH="$HOME/.local/bin:$HOME/.dotnet/tools:$PATH"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
# Prevent Claude Code from spawning powershell.exe ~38x on startup to resolve
# this variable. Each call takes ~700ms on WSL2, causing 30-60s input freeze.
# See: https://github.com/anthropics/claude-code/issues/29672
export USERPROFILE="/mnt/c/Users/KueppermannD"

# Auto-start gnome-keyring for MSAL token storage
if [ -z "$GNOME_KEYRING_CONTROL" ]; then
    # Create keyring directory if it doesn't exist (WSL fix)
    mkdir -p /run/user/$UID/keyring 2>/dev/null
    eval $(gnome-keyring-daemon --start --components=secrets 2>/dev/null)
    export GNOME_KEYRING_CONTROL
fi

# Bash
# complete commmands
#complete -c man which
source /usr/share/bash-completion/bash_completion

# mise - runtime version manager (Java, Node, Python, etc.)
eval "$(mise activate bash)"

# Load Angular CLI autocompletion.
source <(ng completion script)

# Git completion
source /usr/share/git/completion/git-completion.bash

# Command not found
# Automatically search the official repositories when entering an unrecognized command
# Need pkgfile to be installed
# Update the pkgfile database with 'pkgfile -u'
source /usr/share/doc/pkgfile/command-not-found.bash

# Aliases
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'

# complete dotfiles alias git commands
source /usr/share/bash-completion/completions/git
__git_complete dotfiles __git_main
# complete -F _complete_alias dotfiles

# Source local environment variables and secrets (not in dotfiles repo)
if [ -f ~/.bashrc.local ]; then
    source ~/.bashrc.local
fi

# Auto-start wsl-screenshot-cli (clipboard screenshot → WSL path)
if command -v wsl-screenshot-cli &>/dev/null && wsl-screenshot-cli status 2>/dev/null | grep -q "not running"; then
    wsl-screenshot-cli start --daemon &>/dev/null
fi

# Starship command prompt. Needs to be at the end of bashrc
eval "$(starship init bash)"

eval "$(zoxide init bash --cmd cd)"

# opencode
export PATH=/home/daniel/.opencode/bin:$PATH
