# Global Claude Configuration

## Behavior

- When a tool call is rejected/cancelled, **stop immediately**. Do not retry the same or similar command. Wait for the user to tell you how to proceed.

## Environment

- OS: Linux
- **Line endings:** New files use LF. Existing files keep their current line endings (CRLF or LF) — never bulk-convert.

## Git

- Never include "Co-authored by", "Generated with", or any similar AI/Claude mentions in commit messages
- `git add .` is forbidden — always add files individually

## Worktree Workflow

When asked to create a new branch or work on a new feature/task:

1. **Never use `git checkout -b` in place** — always create a worktree
2. **Create:** `git worktree add .worktrees/<name> -b <name> <base-branch>`
3. **Work** inside the new worktree for all changes on that branch
4. **Cleanup:** `git worktree remove .worktrees/<name> && git branch -d <name>`

Rules:

- Worktrees live in `.worktrees/` inside the repo root (globally gitignored)
- Base branch is the current branch unless specified otherwise
- Never modify files outside the assigned worktree
- Push from inside the worktree — `git push` works normally (same remote/origin)

## Infrastructure

### SQL Server

Container: `sqlserver2022` · Host: `localhost:1433` · User: `sa` · Password: `Admin123!`

- History expansion is disabled (`set +H` in `.bashrc`) — `!` in password is safe
- Always quote the password with double quotes: `-P "Admin123!"`
- **CRITICAL — `docker exec` shell quoting:** Never use single quotes `'` inside SQL passed to `docker exec`. They get consumed across shell layers (bash → docker exec → sqlcmd). Use escaped double quotes `\"` for all SQL string literals:
  - ✅ `-Q "SELECT * FROM t WHERE name = \"alice\""`
  - ❌ `-Q "SELECT * FROM t WHERE name = 'alice'"`
  - Applies to **all** string literals, `LIKE` patterns, and any SQL that would normally use single quotes
