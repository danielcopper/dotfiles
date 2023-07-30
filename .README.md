# My dotfiles

Using the git bare method to track dotfiles.

## Setup

```bash
git init --bare ~/.dotfiles
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles config status.showUntrackedFiles no
```

Add the alias to .bashrc if not present.

Install bash-complete-alias to get git completions and add the following to .bashrc

```bash
complete -F _complete_alias dotfiles
```

Add the ~/.dotfiles/ directory to the gitignore as a security measure.

```bash
echo '.dotfiles' >> ~/.gitignore
```

Set upstream and push:

```bash
dotfiles remote add origin git@github.com:danielcopper/dotfiles.git
dotfiles push --set-upstream origin main
```

