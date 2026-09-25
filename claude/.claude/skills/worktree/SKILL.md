---
name: worktree
description: Worktree-based branching workflow. Use when creating a new branch or worktree, or starting a new feature / task / fix / refactor / chore / docs change — covers the sibling `<repo>.worktrees/<type>/<slug>` location, `mise run worktree-new`, subagents working in the worktree by absolute path, entering it with EnterWorktree, and cleanup after the merge.
---

**Guardrail: never `git checkout -b` in place — always create a worktree.**

## Naming and location

- Branch: `<type>/<slug>`. Types: `feature`, `fix`, `refactor`, `chore`, `docs` (plus `test`, `ci` where the repo uses them). With a ticket number (Azure DevOps, GitHub issue), prefix the slug: `<type>/<ticket>-<slug>`.
- Worktree: `<repo-parent>/<repo-name>.worktrees/<type>/<slug>` — a sibling directory of the main checkout, one subfolder per type. Example: branch `feature/123-oauth` in `~/Repos/decky-romm-sync` → `~/Repos/decky-romm-sync.worktrees/feature/123-oauth`.
- Why outside the repo: a worktree nested in the main checkout also loads the main checkout's `mise.toml` (its `.venv/bin` lands on PATH as fallback), Claude pulls the worktree's copy of CLAUDE.md in on top of the main checkout's when it reads files there (two versions of the same instructions), and linters/watchers need per-repo excludes; a sibling has none of that.
- Base branch is the current branch unless specified otherwise.
- Worktrees Claude Code creates under an auto-generated name (`claude --worktree`, `isolation: "worktree"` agents) go through the same `WorktreeCreate` hook and land flat at `<repo-parent>/<repo-name>.worktrees/<name>`.
- Older worktrees under `.claude/worktrees/`, `<repo>__worktrees/` or `.worktrees/` keep working until removed.

## Create

```bash
mise run worktree-new <type> <slug> [base]
```

`worktree-new` does `git worktree add` at the convention path on a new branch `<type>/<slug>`, then — if the repo uses mise — `mise trust` and the repo's `setup` task, since a fresh worktree starts with an **empty** `.venv` (mise makes per-directory venvs) and its tests/linters/LSP won't run until set up. It prints the worktree's absolute path.

## Work in the worktree

The main session stays in the main checkout. It dispatches implementer and reviewer **subagents** that work in the worktree:

- Give each subagent the worktree's **absolute** path, with the instruction to use absolute paths or `cd <worktree> &&` in every shell call (the shell cwd resets between calls).
- LSP diagnostics on worktree files resolve against the main checkout — subagents run the real type checker in the worktree instead of trusting them.
- Tell them to work only in the assigned worktree — never modify the main checkout or another worktree.
- To run a tool inside the worktree by hand: `mise -C <worktree> exec -- <cmd>`.

Occasionally the main session works in a worktree itself. To work in a **new** worktree from the start, call `EnterWorktree` with `name: "<type>/<slug>"`: the `WorktreeCreate` hook (`hooks/worktree_create.sh`) creates it at the convention path through `worktree-new` (branch and setup included), and the session enters it without an approval prompt. To enter an **existing** worktree, call `EnterWorktree` with `path` set to its absolute path — a path outside `.claude/worktrees/` asks the user for approval on every entry; neither a permission rule nor "don't ask again" suppresses it (only `bypassPermissions` mode skips it). From inside a worktree, `EnterWorktree` only reaches `.claude/worktrees/`, so switching to another sibling worktree goes through `ExitWorktree` first. `ExitWorktree` with `action: "keep"` returns to the main checkout and leaves the worktree in place.

Push with `git -C <worktree> push -u origin <type>/<slug>` — the new branch has no upstream yet; later pushes need only `git -C <worktree> push`.

## Merge and cleanup

- The user merges, unless they explicitly ask for that merge in the conversation or grant full-auto for the current run (see `implement`); `gh pr merge` then goes through a permission prompt.
- Cleanup is the main session's job, and only after the PR is merged. The PR is merged when:
  - GitHub: `gh pr view <type>/<slug> --json state -q .state` prints `MERGED`.
  - Azure DevOps: `az repos pr list --source-branch <type>/<slug> --status completed` returns the PR.
- Then, from the main checkout:

  ```bash
  git worktree remove <worktree-path>
  git branch -D <type>/<slug>
  ```

  The repos squash-merge, so the branch never counts as merged for git and `git branch -d` refuses. Remove the `<type>` and `<repo>.worktrees` directories when nothing is left in them (`rmdir` refuses a non-empty one).
