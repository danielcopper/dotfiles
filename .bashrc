#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
alias grep='grep --color=auto'
#PS1='[\u@\h \W]\$ '
PS1='\u@\h \W > '
#PS1='> '

# Fix color compatibility
#alias tmux="TERM=screen-256color-bce tmux"
# Path Variables
# These help to display the correct color when
# using nvim inside of tmux with Alacritty
export TERM='xterm-256color'
export EDITOR='nvim'
export VISUAL='nvim'

# Bash
# complete commmands
#complete -c man which
source /usr/share/bash-completion/bash_completion

# Set up Node Version Manager
source /usr/share/nvm/init-nvm.sh

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

# Starship command prompt. Needs to be at the end of bashrc
eval "$(starship init bash)"
