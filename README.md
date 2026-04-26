# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Install / update

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `steamdeck`, `wsl-arch`.

`bootstrap.sh` is the only command you need: same call on a fresh machine and after pulling dotfile changes. It is idempotent — pacman runs with `--needed`, brew skips already-installed packages and runs `upgrade` for new versions, stow re-links and only backs up files when there is a real conflict.

## Layout

| path | purpose |
|---|---|
| `bash/`, `git/`, `tmux/`, … | Stow packages — one per app. Each mirrors the target tree under `$HOME`. |
| `host-<class>/` | Per-host packages holding `.local` addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. Claude `settings.json`). |
| `packages/common.pkglist`, `packages/<class>.pkglist` | Per-class pacman lists consumed by `install-packages.sh` for the `arch` and `wsl-arch` classes. Blank lines and `#` comments are ignored. |
| `packages/steamdeck.brewlist` | Per-class brew list. SteamOS root is read-only, so the steamdeck class uses linuxbrew instead of pacman; `install-packages.sh` bootstraps brew if missing. |
| `packages/steamdeck.flatpaklist` | Per-class flatpak list. Used for apps that ship as macOS-only Casks on Homebrew (e.g. wezterm) and need a Linux install path. Installed user-scope from flathub. |
| `install-packages.sh <class>` | Install / update OS packages for the class (pacman on arch / wsl-arch, brew + flatpak on steamdeck). |
| `install-dotfiles.sh <class>` | Symlink the relevant stow packages into `$HOME`. |
| `bootstrap.sh <class>` | Convenience wrapper that runs both. |
| `samples/` | Snapshots that are *not* user dotfiles and aren't stow-managed (e.g. SDDM theme + login wallpapers — they live under `/usr/share/sddm/` and need manual root deploy). Kept in repo as a record. |
| `.stowrc` | Default stow flags (`--target=~`, ignores for scripts / `packages/` / `samples/` / `host-*`). |

## Adding or changing a file

**Shared across all hosts:**

```bash
mv ~/.config/<app>/<file> <app>/.config/<app>/<file>
cd ~/dotfiles
stow -R <app>
```

**Class-specific addition** (e.g. konsole tweak, only on arch):

```bash
# put it in the relevant app package (konsole/, …)
# add the package to install-dotfiles.sh's arch class_pkgs list if new
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
