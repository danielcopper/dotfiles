---
name: worktree
description: Worktree-based branching workflow. Use when creating a new branch or worktree, or starting a new feature / task / fix / refactor / chore / docs change — covers `git worktree add` under `.claude/worktrees/`, `EnterWorktree`, `mise run worktree-new`, and cleanup.
---

**Guardrail: never `git checkout -b` in place — always create a worktree.**

When asked to create a new branch or work on a new feature/task:

1. **Never use `git checkout -b` in place** — always create a worktree.
2. **Create:** `git worktree add .claude/worktrees/<type>/<slug> -b <type>/<slug> <base-branch>`
   - Types: `feature/`, `fix/`, `refactor/`, `chore/`, `docs/`
   - If a ticket number exists (Azure DevOps, GitHub issue), prefix the slug: `<type>/<ticket>-<slug>`
   - Examples:
     - `git worktree add .claude/worktrees/feature/oauth-login -b feature/oauth-login main`
     - `git worktree add .claude/worktrees/feature/123-oauth-login -b feature/123-oauth-login main`
3. **Enter** (re-root the session): `EnterWorktree({ path: ".claude/worktrees/<type>/<slug>" })` — switches the session's cwd into the worktree so the LSP and tooling resolve against the worktree's own files and config. Because `.claude/worktrees/` is Claude Code's native worktree location, entering it triggers **no** permission-root relocation prompt. **Verified** to clear the false "import could not be resolved" diagnostics that otherwise appear when the session stays rooted in the main repo (the LSP root is locked to the session cwd). Skip this for a multi-worktree fan-out (lead stays in main, agents get absolute worktree paths) — there, re-run the real type-checker instead of trusting the harness diagnostics on worktree files.
4. **Work** inside the worktree for all changes on that branch.
5. **Cleanup:** `ExitWorktree({ action: "keep" })` to return the session to the main repo (worktree left intact), then `git worktree remove .claude/worktrees/<type>/<slug> && git branch -d <type>/<slug>` once the branch is merged/done.

Rules:

- Worktrees live in `.claude/worktrees/` inside the repo root (globally gitignored; Claude Code's native worktree location, so entering one triggers no permission-root relocation prompt). `.worktrees/` (the pre-migration location) stays gitignored too until its last old worktree is removed.
- Base branch is the current branch unless specified otherwise.
- Never modify files outside the assigned worktree.
- Push from inside the worktree — `git push` works normally (same remote/origin).
- **If the repo uses `mise`** (a fresh worktree gets its own **empty** `.venv` — mise makes per-directory venvs, so the worktree's tests/linters/LSP won't run until set up): use the global **`mise run worktree-new <type> <slug> [base]`** task for step 2 — it does `git worktree add` + `mise trust` + the repo's `setup` in one shot (then still do step 3, `EnterWorktree`). To run a tool inside a worktree by hand: `mise -C <worktree> exec -- <cmd>`.
