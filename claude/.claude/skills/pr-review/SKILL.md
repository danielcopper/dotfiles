---
name: pr-review
description: Review an Azure DevOps pull request together with the user. Fetches the PR, runs a code-reviewer agent, turns findings into a severity-ordered task list, then validates each finding empirically with the user before deciding to drop it or post a comment on the PR. Use when the user says "review this PR", "lets do a review", or sends an Azure DevOps PR URL/number and wants to review.
---

# PR Review (Azure DevOps)

Collaborative review workflow. **You do the legwork (fetch, validate empirically, draft). The user decides what gets posted.**

This skill is scoped to Azure DevOps PRs. The org/project/repo are encoded in the PR URL (`https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>`). For AAD-token mechanics and REST quirks, see `~/.claude/memory/tools/azure-devops.md`.

## Phase 1 — Fetch the PR

1. Resolve the PR id and repo from the user's input (URL or just `<id>`; assume the current repo if only `<id>`).
2. Get an AAD bearer token. If the token has expired (`AADSTS70043` or similar), ask the user to run `! az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default` and wait. **Do not** suggest `--use-device-code`.
3. Pull these via REST in parallel:
   - PR metadata (`pullRequests/{id}`)
   - PR iterations + changes (file list with change type)
   - Existing threads (`pullRequests/{id}/threads`) so you don't duplicate comments already on the PR
4. Summarise to the user in one short block: title, author, source→target, status, file count, what it does. Keep it tight.

Do **not** fetch the diff yourself, slice it, or skim it. The reviewer agents in Phase 2 will pull the diff via `git diff origin/<target>...origin/<source>`.

**Do not create a review worktree yet.** Defer until a task actually needs to run PR code.

## Phase 2 — Run the reviewer agents

Always run `pr-review-toolkit:code-reviewer`. In addition, scan the list of changed files from Phase 1 and run any specialist sub-agents whose triggers apply. **All applicable agents run in parallel** — single message, multiple `Agent` tool uses. Don't re-analyse the diff yourself.

| Sub-agent | Run when | Why |
|---|---|---|
| `pr-review-toolkit:code-reviewer` | always | general bugs, logic errors, project-guideline violations |
| `pr-review-toolkit:pr-test-analyzer` | test files changed (`*Tests*`, `*.test.*`, `*.spec.*`, `tests/**`) | are new tests pinning the claimed behaviour, or vacuous? |
| `pr-review-toolkit:silent-failure-hunter` | error-handling changed (`try`/`catch`, `Result<>`, `.catch(`, fallback branches added in the diff) | swallowed exceptions, silent fallbacks, missing logs |
| `pr-review-toolkit:type-design-analyzer` | new types added or existing types' shapes changed (records, classes, interfaces, type aliases) | encapsulation, invariants, useful vs anaemic types |
| `pr-review-toolkit:comment-analyzer` | comments/docstrings added or changed | accuracy vs code, comment rot, refs to removed code |

For each agent, the prompt must include:

- The PR's intent (1–2 sentences from the PR description)
- The diff range to review (e.g. `git diff origin/<target>...origin/<source>`) or the relevant slice for that specialist
- Existing PR thread topics to **avoid duplicating** (Sonar warnings already posted, reviewer comments still open)
- A request to return findings as a flat list with: **severity** (blocker / major / minor / nit), **file:line**, **claim**, **suggested fix**, **confidence**
- An instruction to skip cosmetic nits unless they actively harm reviewability

Do **not** run `code-simplifier` — this skill posts comments on someone else's PR, not refactors our own code.

When all agents return, merge their findings into a single severity-ordered list for Phase 3, tagging each finding with the agent that raised it (helps triage when two agents flag the same line).

## Phase 3 — Build the task list

Use `TaskCreate` to register one task per finding, ordered **severity desc** (blocker → major → minor → nit). Each task content should include:

- The finding (file:line, claim, suggested fix)
- The **agent** that raised it (`code-reviewer` / `pr-test-analyzer` / `silent-failure-hunter` / `type-design-analyzer` / `comment-analyzer`)
- An **"Empirical check"** section — exactly what command/probe/source-read proves or refutes the claim
- An **"Outcome"** section left blank until validated

If you triage a finding as not worth a task (clear duplicate of an existing thread on the PR, obvious agent hallucination), say so explicitly in the summary message — don't silently drop it.

Then present the task list summary and **stop**. Ask the user where to start.

## Phase 4 — Per-task validation loop

For each task, **in the order the user picks** (or sequential if they say "go from one to the next"):

1. **Set up what you need.** If validating requires running PR code and the review worktree doesn't exist yet, create it now: `git worktree add .worktrees/review/<PR#>-<short-slug> <PR-head-sha>` (detached HEAD). Use the PR head commit, not the branch name. Run `npm ci` / `dotnet restore` / etc. once, reuse across tasks.
2. **Validate empirically.** Don't argue from training-data knowledge — run, mutate, probe. Cite source lines or capture exit codes. Watch for traps:
   - `cmd | tail` returns `tail`'s exit code, not `cmd`'s. Capture `${PIPESTATUS[0]}` or redirect to a file.
   - Flaky tests aren't deterministic — use forced timeouts (`--testTimeout=1`) for repeatable failures.
   - Training cutoff matters: spy-library behaviour, ESM internals, framework defaults all drift. Read the installed source.
   - See `~/.claude/memory/validate-runtime-claims.md`.
3. **Report findings** to the user with the empirical evidence. State your lean (post / skip), but **the user decides**.
4. **Wait for the user's call.** "Post" / "skip" / "shorter" / "more proof" / "draft it differently". If they want a draft, write the comment text and show it before posting.
5. **Post or drop** based on their decision. Update the task with the outcome.

### Hard rules

- **You never decide to close a task.** Only the user does. If a finding looks resolved to you, say so and wait.
- **You never auto-post** even when the user said "go one to the next". That phrase means *validate* one after the other, not *post* one after the other.
- **You never decide what to skip** beyond clear agent hallucinations / duplicates flagged in Phase 3. Marginal nits go in the task list; the user calls skip.
- **No `git add .`**, no `--no-verify`, no destructive commands without explicit OK (per global rules).
- If the user pushes back on a claim, **don't capitulate** — re-verify and either correct yourself or hold the line with evidence.

## Phase 5 — Posting comments

Comments are PR threads anchored on `file:line` (right side). REST endpoint:

```
POST https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repoId>/pullRequests/<id>/threads?api-version=7.1
```

Body shape: `comments[0].content` is the markdown, `threadContext.filePath` is `/abs/repo/path`, `threadContext.rightFileStart` and `rightFileEnd` carry `line` and `offset`. Status `1` = active.

After posting, report **Thread ID**, **anchor** (`file:line`), and a direct link:
`https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>?_a=files&discussionId=<threadId>`

Comment style:

- Short. The user often reduces a long draft to one sentence ("please align the versions of X and Y so the peer requirement matches").
- One concrete ask per comment. Don't bundle.
- One line of empirical evidence ("verified locally: `npm ls` errors with ELSPROBLEMS") helps the author trust the fix without being preachy.
- No "thanks for the PR" / "consider perhaps" filler.
- No AI mentions, no Co-authored-by.

## Phase 6 — Wrap up

When all tasks are closed by the user, print a final summary table: `# | outcome | thread ID (if posted)`. Don't tear down the review worktree — the user may want to revisit. Mention that it lives at `.worktrees/review/<PR#>-<slug>`.

## Inputs

The user may invoke this skill with:
- Full PR URL (`https://dev.azure.com/.../_git/.../pullrequest/<id>`)
- Bare PR number (`76600`) — assume current repo
- Nothing — ask for the URL or number

## What this skill is NOT

- Not for GitHub PRs (use `gh pr` flow / `/review` for that).
- Not an autonomous reviewer — the user is the second pair of eyes, not a rubber-stamp.
- Not for posting status checks, approving, or merging — comment threads only.
