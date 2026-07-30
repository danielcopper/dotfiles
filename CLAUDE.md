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

The `claude/` package stows `~/.claude/` (`CLAUDE.md`, `settings.json`, `skills/`, `memory/`, `hooks/`). So editing `~/.claude/…` edits this repo; commit those changes here. Context-specific guidance is kept out of the always-loaded `claude/.claude/CLAUDE.md` and lives in skills instead (`worktree`, `azure-devops-boards`, `local-sql-server`, …).
