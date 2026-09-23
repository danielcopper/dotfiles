---
name: worktree
description: Worktree-based branching workflow. Use when creating a new branch or worktree, or starting a new feature / task / fix / refactor / chore / docs change — covers the sibling `<repo>__worktrees/` location, starting a worker session per worktree (workmux under tmux, herdr, or the no-multiplexer fallback), `mise run worktree-new`, and cleanup.
---

**Guardrail: never `git checkout -b` in place — always create a worktree.**

## Naming and location

- Branch: `<type>/<slug>`. Types: `feature`, `fix`, `refactor`, `chore`, `docs` (plus `test`, `ci` where the repo uses them). With a ticket number (Azure DevOps, GitHub issue), prefix the slug: `<type>/<ticket>-<slug>`.
- Worktree: `<repo-parent>/<repo-name>__worktrees/<type>-<slug>` — a sibling of the main checkout, flat name (the branch with `/` → `-`, workmux's default). Example: branch `feature/123-oauth-login` in `~/Repos/myrepo` → `~/Repos/myrepo__worktrees/feature-123-oauth-login`. That directory name is the worktree's **handle**.
- Why outside the repo: a worktree nested in the main checkout also loads the main checkout's `mise.toml` (its `.venv/bin` lands on PATH as fallback) and CLAUDE.md; a sibling loads only its own. Claude Code's workspace trust, saved permission approvals and the per-repo memory tier key on the main checkout, so nothing is lost.
- Base branch is the current branch unless specified otherwise.
- Worktrees still under `.claude/worktrees/` keep working until removed.

## Start a worker session

Under tmux or herdr, each worktree gets its own Claude session — the **worker** — started in the worktree; without a multiplexer there is none (see Fallback). The session that creates the worktree stays where it is. Pick the start path from the environment variables the multiplexers set:

| Environment | Path |
|---|---|
| `$TMUX` set (also when `$HERDR_PANE_ID` is set — tmux is the inner layer) | tmux + workmux |
| `$HERDR_PANE_ID` set, `$TMUX` not set | herdr |
| neither | fallback, no worker |

### Prompt file

Write the worker's prompt to a file outside the repo (the session scratchpad):

- **Self-contained task text** — the worker has none of the creating session's context: goal, decisions already made, scope and what stays untouched, how to verify, what to report.
- **Paths relative to the repo root** — the worker's cwd is the worktree root; never absolute paths into the main checkout. Exception: reading the repo's untracked agent config (`.claude/agents/`), which only the main checkout has.
- **Work only in its own worktree** — never modify the main checkout or another worktree.

### tmux → workmux

```bash
workmux add <type>/<slug> -b -P <prompt-file> [--base <branch>]
```

workmux creates the worktree at the sibling location, runs its `post_create` hook (`mise trust` + the repo's `setup` task), and opens a tmux session for the worktree with Claude running the prompt — `workmux list` / `workmux status` show it. `-b` keeps your tmux client where it is; `--base` defaults to the current branch. A closed session comes back with `workmux open <handle>` (`-c` resumes the last conversation).

### herdr

```bash
mise run worktree-new <type> <slug> [base]
pane=$(herdr worktree open --path <worktree-path> --no-focus | jq -r '.result.root_pane.pane_id')
herdr agent start <name> --kind claude --pane "$pane" -- "$(cat <prompt-file>)"
```

`worktree open` adds the worktree as a herdr workspace and returns its root shell pane; `agent start` launches Claude there with the prompt as its start argument. `<name>` is the handle, cut to 32 characters (herdr agent names match `[a-z][a-z0-9_-]{0,31}` and are unique among live agents). This recipe is untested end-to-end.

### Fallback (no multiplexer)

```bash
mise run worktree-new <type> <slug> [base]
```

The current session stays in the main checkout and gives its subagents the **absolute** worktree path, with the instruction to use absolute paths in every shell call. LSP diagnostics on worktree files resolve against the main checkout — re-run the real type-checker instead of trusting them. To run a tool inside the worktree by hand: `mise -C <worktree> exec -- <cmd>`.

`worktree-new` does `git worktree add` at the sibling location, then — if the repo uses mise — `mise trust` and the repo's `setup` task, since a fresh worktree starts with an **empty** `.venv` (mise makes per-directory venvs) and its tests/linters/LSP won't run until set up.

## Work and cleanup

- Never modify files outside the assigned worktree.
- Push from inside the worktree — `git push` works normally (same remote/origin).
- The user merges; an agent merges only on the user's explicit grant for the current run (see `implement`). Clean up only after the PR is merged. The repos squash-merge, so the branch never counts as merged for git (`git branch -d` refuses). The PR is merged when:
  - GitHub: `gh pr view <type>/<slug> --json state -q .state` prints `MERGED`.
  - Azure DevOps: `az repos pr list --source-branch <type>/<slug> --status completed` returns the PR.
- Cleanup, per multiplexer:
  - tmux: `git fetch --prune`, then `workmux remove --gone` — removes the worktrees whose upstream branch was deleted after the PR merge, with their branches and tmux sessions. It asks for confirmation before removing; the user answers it (no `-f`: that would also discard uncommitted changes). Never `workmux merge`.
  - herdr: only when the PR is merged: `herdr worktree remove --workspace <workspace-id>`, which should close the workspace together with the checkout (untested; the id is `open_workspace_id` in `herdr worktree list`), then `git branch -D <type>/<slug>`.
  - no multiplexer: only when the PR is merged: `git worktree remove <worktree-path> && git branch -D <type>/<slug>`.
