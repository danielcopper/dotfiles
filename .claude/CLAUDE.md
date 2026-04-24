# Global Claude Configuration

## Behavior

- When a tool call is rejected/cancelled, **stop immediately**. Do not retry the same or similar command. Wait for the user to tell you how to proceed.

- **Planning vs. implementation — scope is the user's decision, not mine.** During planning/ideation, stay in discussion mode. Do not:
  - Start implementing just because several discussion turns have passed
  - Declare things "explicitly not in scope", "separate refactor", or similar — scope is the user's call
  - Skip research or user instructions to save effort
  - Enforce production-code discipline (minimal diffs, tight scope) on personal configs or projects where the user has not asked for it

  Only move to implementation on an explicit green-light verb ("leg los", "mach", "implementier", "schreib", "go"). Treat open questions about the user's own project ("is X inconsistent?", "why is Y like this?") as invitations to discuss options and tradeoffs, not requests for guardrails from me. Even a short "ok" after a question needs a check — does it mean "ok implementiere" or "ok verstanden, weiter diskutieren"?

- **Don't ask about stopping.** Never ask "willst du weitermachen?", "genug für heute?", "Pause?" or similar. Just keep working. The user will say when to stop.

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

Bare git repo setup. Alias: `dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'`

- All dotfiles commands use: `/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME <command>`
- Files must be added with **absolute paths** (not relative)
- Remote: `origin` (use `git remote get-url origin` to check)
- Each machine has its own branch (use `git branch --show-current` to check)

## Infrastructure

### SQL Server

Container: `sqlserver2022` · Host: `localhost:1433` · User: `sa`

- Password is set via `SQLCMDPASSWORD` env var (in settings.json) — no `-P` flag needed
- Use `sqlcmd` directly: `sqlcmd -S localhost -U sa -C`
- Single quotes in `-Q` work normally: `-Q "SELECT * FROM t WHERE name = 'alice'"`
