# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

> **Migration in progress** (yadm → stow). The old yadm layout (`##class.*` alternates, ESH templates) still sits in-tree on `main` and is being translated per-app on branch `refactor/stow-migration`.

## Install on a fresh machine

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `steamdeck`, `wsl`.

## Layout

| path | purpose |
|---|---|
| `bash/`, `git/`, `tmux/`, … | Stow packages — one per app. Each mirrors the target tree under `$HOME`. |
| `host-<class>/` | Per-host packages holding `.local` addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. Claude `settings.json`). |
| `packages/<class>.pkglist` | Pacman package lists consumed by `install-packages.sh`. Blank lines and `#` comments are ignored. |
| `install-packages.sh <class>` | Install OS packages for the class. |
| `install-dotfiles.sh <class>` | Symlink the relevant stow packages into `$HOME`. |
| `bootstrap.sh <class>` | Convenience wrapper that runs both. |
| `.stowrc` | Default stow flags (`--target=~`, verbose, ignores for scripts / `packages/` / `host-*`). |

## Adding or changing a file

**Shared across all hosts:**

```bash
mv ~/.config/<app>/<file> <app>/.config/<app>/<file>
cd ~/dotfiles
stow -R <app>
```

**Class-specific addition** (e.g. hypr config, only arch):

```bash
# put it in the relevant app package (hypr/, waybar/, …)
# include that package in install-dotfiles.sh's arch class_pkgs list if new
stow -R <app>
```

**Class-specific tweak to a mostly-shared file** (e.g. PATH export only on arch):

```bash
printf '\nexport PATH="$HOME/extra:$PATH"\n' >> host-arch/.bashrc.local
stow -R host-arch
```

## Experiments / Todo

- Test tools borrowed from [omerxx/dotfiles](https://github.com/omerxx/dotfiles): `television` (TUI fuzzy finder), `gh-dash` (GitHub dashboard TUI).
- Compare my own `nvim/`, `tmux/`, `wezterm/` configs against omerxx's pendants later; adopt whatever is worth keeping.

## Recovery

- **Pre-stow snapshot of the WSL machine**: branch `archive/wsl-2026-04-24` on origin.
- **Pre-yadm per-machine history**: tags `archive/pre-yadm/{main,arch,wsl,steamdeck,windows}`.

Pull a single file from an archive tag:

```bash
git show archive/pre-yadm/windows:Microsoft.PowerShell_profile.ps1 \
  > ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
```
