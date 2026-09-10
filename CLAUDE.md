# dotfiles — GNU Stow config repo

Personal dotfiles, managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Layout

- Regular git repo at `~/dotfiles/`. Remote: `origin` (`git remote get-url origin` to check).
- **Single-branch workflow** — commit directly on `main`; per-host differences live in `host-<class>/` packages. (This is the one repo where the global "always use a worktree" rule does not apply.)
- Top-level dirs are stow packages, one per app: `bash/`, `git/`, `tmux/`, `claude/`, `nvim/`, `starship/`, … .
- `host-<class>/` packages carry per-host addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. Claude `settings.json`).
- Files in `$HOME` are symlinks into the repo — edit anywhere; `cd ~/dotfiles && git diff` surfaces the change.
- Re-link after structural changes: `cd ~/dotfiles && stow -R <pkg>`.
- Bootstrap a fresh machine: `cd ~/dotfiles && ./bootstrap.sh <arch|steamdeck|wsl-arch>` (installs OS packages from `packages/<class>.pkglist`, then stows the right set).

## Secrets

- Secrets (API keys, `SQLCMDPASSWORD`) live in untracked `~/.bashrc.secrets`, sourced at the end of shared `.bashrc` — **never commit them**.

## Claude config lives here

The `claude/` package stows `~/.claude/` (`CLAUDE.md`, `skills/`, `memory/`, `hooks/`). So editing `~/.claude/…` edits this repo; commit those changes here.

- **`settings.json` is the exception: it is not stowed.** `claude/.claude/settings.json` is a *reference copy* — "this is roughly how it should look" — excluded from stow in `claude/.stow-local-ignore`. The file Claude Code actually reads is `~/.claude/settings.json`, an ordinary local file outside this repo and outside git.
- **Why.** Claude Code writes into the live file by itself: `/model`, `/effort`, and the auto-mode environment description that `/auto-mode-setup` generates. That description names internal hosts and addresses, and this repo is public — it was published once that way. The classifier reads `autoMode` only from `~/.claude/settings.json`, never from a project settings file, so keeping the live file out of the repo is the only arrangement where the description both works and stays private.
- **Carrying something over.** The two drift on purpose. `diff ~/.claude/settings.json claude/.claude/settings.json` shows what each has; copy across in either direction by hand and commit the reference when you want to keep a change. On a fresh machine `install-dotfiles.sh` seeds the live file from the reference if none exists.
- **After a pull that touched this repo, run `mise run dotfiles-relink`.** A new hook script has no symlink yet while the live `settings.json` may already wire it, which breaks *every* Bash call until stow runs — including the stow that would fix it. Pass package names to relink others: `mise run dotfiles-relink nvim tmux`.

Context-specific guidance is kept out of the always-loaded `claude/.claude/CLAUDE.md` and lives in skills instead (`worktree`, `azure-devops-boards`, `local-sql-server`, …).
