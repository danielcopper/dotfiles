# dotfiles

Personal configuration files, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Install / update

```bash
git clone git@github.com:danielcopper/dotfiles.git ~/dotfiles
cd ~/dotfiles
./bootstrap.sh <class>
```

Where `<class>` is one of `arch`, `steamdeck`, `wsl-arch`.

`bootstrap.sh` is the only command needed — same call on a fresh machine and after pulling changes. The whole pipeline is idempotent: pacman runs with `--needed`, brew skips already-installed packages and `upgrade`s new versions, flatpak's `--noninteractive` is a no-op on installed apps, and stow re-links while moving any genuinely conflicting `$HOME` files into a timestamped backup under `~/.dotfiles-pre-stow.<ts>/`.

## Layout

| path | purpose |
|---|---|
| `bash/`, `git/`, `nvim/`, `tmux/`, `wezterm/`, … | Stow packages — one per app. Each mirrors the target tree under `$HOME`. |
| `host-<class>/` | Per-host packages holding `.local` addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. Claude `settings.json`, the NVIDIA wireplumber tweak on arch). |
| `packages/common.pkglist`, `packages/<class>.pkglist` | Pacman lists for the arch and wsl-arch classes. Blank lines and `#` comments ignored. |
| `packages/steamdeck.brewlist` | Linuxbrew list — SteamOS root is read-only, so steamdeck uses brew instead of pacman. `install-packages.sh` bootstraps brew if missing. |
| `packages/steamdeck.flatpaklist` | Flatpak app list for steamdeck — for apps that ship as macOS-only Homebrew Casks (wezterm) and need a Linux install path. Installed user-scope from flathub. |
| `install-packages.sh <class>` | Install / update OS packages (pacman on arch / wsl-arch, brew + flatpak on steamdeck). |
| `install-dotfiles.sh <class>` | Symlink the relevant stow packages into `$HOME`. Worktree-aware; backs up real conflicts. |
| `bootstrap.sh <class>` | Wrapper that runs both `install-packages.sh` and `install-dotfiles.sh`. |
| `samples/` | Snapshots that aren't dotfiles and aren't stow-managed (SDDM theme + login wallpapers — they live under `/usr/share/sddm/`, manual root deploy). Kept in repo as a record. |
| `.stowrc` | Default stow flags (`--target=~`, ignores `install-*.sh`, `bootstrap.sh`, `packages/`, `samples/`, `host-*/`). |

## Adding or changing a file

**Shared across all hosts:**

```bash
mv ~/.config/<app>/<file> <app>/.config/<app>/<file>
cd ~/dotfiles && stow -R <app>
```

**New stow package:**

1. Create the package directory at repo root, mirroring the target path: `<pkg>/.config/<pkg>/…` (or `<pkg>/.<file>` for `$HOME`-level dotfiles).
2. Add `<pkg>` to `install-dotfiles.sh`'s `common_pkgs` array, or to a class-specific `class_pkgs` if it should only land on certain hosts.
3. `cd ~/dotfiles && stow -R <pkg>` to symlink it immediately.

**Class-specific tweak to a mostly-shared file:**

```bash
printf '\nexport PATH="$HOME/extra:$PATH"\n' >> host-arch/.bashrc.local
stow -R host-arch
```

## Recovery

- **Pre-stow conflict backups** are created at `~/.dotfiles-pre-stow.<timestamp>/` whenever `install-dotfiles.sh` finds existing `$HOME` files that would clash with the stow run.
- **Pre-stow snapshot of the WSL machine**: branch `archive/wsl-2026-04-24` on origin.
- **Pre-yadm per-machine history**: tags `archive/pre-yadm/{main,arch,wsl,steamdeck,windows}`.

Pull a single file from an archive tag:

```bash
git show archive/pre-yadm/windows:Microsoft.PowerShell_profile.ps1 \
  > ~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
```
