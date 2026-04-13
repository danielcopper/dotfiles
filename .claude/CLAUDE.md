# Global Claude Configuration

## Behavior

- When a tool call is rejected/cancelled, **stop immediately**. Do not retry the same or similar command. Wait for the user to tell you how to proceed.
- **Asking is better than guessing.** Don't produce content for the sake of producing content. If uncertain, ask — Daniel can usually answer. Never invent fixes or implementations to fill silence.

## Environment

- **Line endings:** New files use LF. Existing files keep their current line endings (CRLF or LF) — never bulk-convert.

## Git

- Never include "Co-authored by", "Generated with", or any similar AI/Claude mentions in commit messages
- `git add .` is forbidden — always add files individually

## Worktree Workflow

When asked to create a new branch or work on a new feature/task:

1. **Never use `git checkout -b` in place** — always create a worktree
2. **Create:** `git worktree add .worktrees/<type>/<slug> -b <type>/<slug> <base-branch>`
   - Types: `feature/`, `fix/`, `refactor/`, `chore/`, `docs/`
   - If a ticket number exists (Azure DevOps, GitHub issue), prefix the slug: `<type>/<ticket>-<slug>`
   - Examples:
     - `git worktree add .worktrees/feature/oauth-login -b feature/oauth-login main`
     - `git worktree add .worktrees/feature/123-oauth-login -b feature/123-oauth-login main`
3. **Work** inside the new worktree for all changes on that branch
4. **Cleanup:** `git worktree remove .worktrees/<type>/<slug> && git branch -d <type>/<slug>`

Rules:

- Worktrees live in `.worktrees/` inside the repo root (globally gitignored)
- Base branch is the current branch unless specified otherwise
- Never modify files outside the assigned worktree
- Push from inside the worktree — `git push` works normally (same remote/origin)

## Dotfiles

Managed with [yadm](https://yadm.io) (Yet Another Dotfiles Manager).

- All dotfiles commands: `yadm <command>` — behaves like git (`yadm status`, `yadm add`, `yadm commit`, `yadm push`, `yadm diff`)
- Files can be added with relative or absolute paths
- Bare repo at `~/.local/share/yadm/repo.git`
- Remote: `origin` (use `yadm remote get-url origin` to check)
- **Single `main` branch** — no more branch-per-machine drift
- Platform-specific files use **yadm alternates** (`##class.<name>` suffix, e.g. `~/.ssh/config##class.steamdeck`) or **esh/j2 templates** (`##template.esh` suffix with class-conditional blocks via `$YADM_CLASS`)
- Machine class is set once via `yadm config local.class <name>` (e.g. `arch`, `wsl`, `steamdeck`)
- Run `yadm alt` after class change or template edit to re-resolve alternates/templates
- Old branch-per-machine history preserved under `archive/pre-yadm/<name>` tags

## Infrastructure

### SQL Server

Container: `sqlserver2022` · Host: `localhost:1433` · User: `sa`

- Password is set via `SQLCMDPASSWORD` env var (in settings.json) — no `-P` flag needed
- Use `sqlcmd` directly: `sqlcmd -S localhost -U sa -C`
- Single quotes in `-Q` work normally: `-Q "SELECT * FROM t WHERE name = 'alice'"`
