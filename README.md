# Dotfiles

<!--toc:start-->
- [Dotfiles](#dotfiles)
  - [Bare Repository Approach](#bare-repository-approach)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Using this Repository](#using-this-repository)
      - [Manually](#manually)
        - [Clone the Repository](#clone-the-repository)
        - [Add Alias to Shell Configuration](#add-alias-to-shell-configuration)
        - [Apply the Alias](#apply-the-alias)
        - [Hide Untracked Files (Optional)](#hide-untracked-files-optional)
        - [Checkout Files:](#checkout-files)
        - [Switch to the correct branch](#switch-to-the-correct-branch)
      - [Automatically](#automatically)
    - [Setting up a similar repo from scratch](#setting-up-a-similar-repo-from-scratch)
<!--toc:end-->

This repository contains my personal dotfiles, managed using a bare Git
repository approach.
This approach allows for easy management and synchronization of dotfiles
across multiple machines
without the need for symbolic links or separate directory structures.

## Bare Repository Approach

A bare repository in Git contains the version history of a project, without a
working directory for staging files. This is particularly useful for managing
dotfiles as it avoids potential conflicts and keeps the home directory clean.
To manage the dotfiles, an alias is created which refers to a Git bare
repository. This alias is used for all Git commands, making it a seamless
process to manage and track dotfiles.

## Getting Started

### Prerequisites

- Git

### Using this Repository

#### Manually

1. Ensure you have Git installed on your machine.
2. Before cloning the repo, you should backup any existing dotfiles in your HOME
directory that may conflict with the files in this repository.

##### Clone the Repository

Clone this repository to your machine. You might choose to clone it to a hidden
directory in your home directory for tidiness.

```bash
git clone --bare <your-repo-url> $HOME/.dotfiles
```

##### Add Alias to Shell Configuration

Add the following alias command to your shell's configuration file
(e.g., ~/.bashrc, ~/.zshrc, etc.). This alias allows you to use the dotfiles
command to interact with your repository.

```bash
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
```

##### Apply the Alias

Source your shell's configuration file to apply the alias.

```bash
source ~/.bashrc  # Or the appropriate file for your shell, e.g., ~/.zshrc
```

##### Hide Untracked Files (Optional)

By default, git status will show all untracked files in your home directory.
To hide untracked files, you can configure Git with the following command:

```bash
dotfiles config status.showUntrackedFiles no
```

##### Checkout Files

Now, checkout the files from the repository into your home directory.

```bash
dotfiles checkout
```

##### Switch to the correct branch

Switch to the branch you need, e.g. arch, to pull the config files. This will
fail if one of these files already exist.
In this case remove or better backup those files and checkout again.

#### Automatically

To automate the setup of your dotfiles on a new machine, use the
init-dotfiles.sh script from the main branch.

This script will handle configuring Git to hide untracked files, and checking
out the files from the repository into your home directory.

Here's a brief overview of how the script works:

Configure Git:
The script configures Git to hide untracked files when you run git status with
the dotfiles alias.

Branch Selection:
The script prompts you to choose the branch that you want to checkout.

Checkout Files:
Based on your branch selection, the script checks out the files from that branch
into your home directory.
It will replace the existing shell configuration file (e.g., ~/.bashrc) with the
one from the repository, which includes the dotfiles alias, among other configurations.

Before running the script, ensure you have cloned the repository, checked out
the main branch and made any backup you need:

```bash
git clone --bare <repository-url> $HOME/.dotfiles
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles checkout main
```

Now you can run the init-dotfiles.sh script to automate the rest of the setup:

```bash
chmod +x $HOME/.dotfiles/init-dotfiles.sh
$HOME/.dotfiles/init-dotfiles.sh
```

Now your dotfiles should be set up on your new machine, and you can manage them
using the dotfiles command.

Use at your own risk =)

### Setting up a similar repo from scratch

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
dotfiles remote add origin <your-github-url>/dotfiles.git
dotfiles push --set-upstream origin main
```

Start managing your dotfiles with the new alias like your used to with the
normal git command.
