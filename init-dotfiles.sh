#!/bin/bash

# Define lists of files to be deleted for each branch
declare -A files_to_delete
files_to_delete[arch]=(".inputrc" ".bashrc" "starship.toml" ".config/alacritty/alacritty.yml" ".config/lazygit/config.yml" ".config/tmux/tmux.conf")
files_to_delete[arch-wsl]=(".inputrc" ".bashrc")

# Ask user for the branch they want to checkout
echo "Enter the branch you want to checkout:"
read branch

# If branch does not exist in our defined list, exit
if [[ ! ${files_to_delete[$branch]} ]]; then
    echo "Invalid branch. Exiting."
    exit 1
fi

# Confirm with the user
echo "The following files will be deleted:"
echo "${files_to_delete[$branch]}"
echo "Are you sure you want to proceed? (yes/no)"
read proceed

if [[ $proceed != "yes" ]]; then
    echo "Aborted. Exiting."
    exit 1
fi

# Delete the files
for file in "${files_to_delete[$branch]}"; do
    rm -rf "$HOME/$file"
done

# Confirm checkout
echo "Do you want to checkout the $branch branch and pull the files from the repo? (yes/no)"
read checkout

if [[ $checkout != "yes" ]]; then
    echo "Aborted. Exiting."
    exit 1
fi

# Perform checkout
alias dotfiles='/usr/bin/git --git-dir=$HOME/.cfg/ --work-tree=$HOME'
dotfiles checkout $branch
dotfiles pull origin $branch

echo "Checkout and pull successful."
