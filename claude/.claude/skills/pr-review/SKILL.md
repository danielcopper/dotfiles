---
name: pr-review
description: Review an Azure DevOps or GitHub pull request together with the user, or re-review it after the author pushed fixes. Fetches the PR and its linked work items or issues, runs the reviewer agent plus matching specialists, turns findings into a severity-ordered task list, then validates each finding empirically with the user before deciding to drop it or post a comment on the PR. Use when the user says "review this PR", "lets do a review", "re-review", or sends a PR URL/number and wants to review.
---

# PR Review

Collaborative review workflow. **You do the legwork (fetch, validate empirically, draft). The user decides what gets posted.**

## Platform

The platform comes from the input, nothing else:

- A URL: host `dev.azure.com` or `*.visualstudio.com` -> Azure DevOps; `github.com` -> GitHub.
- A bare PR number: the host in `git remote get-url origin` of the current repo, same mapping - plus `ssh.dev.azure.com` (Azure DevOps SSH remotes such as `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>`) -> Azure DevOps.
- Neither matches: ask the user.

Then read the platform file - [`azure-devops.md`](azure-devops.md) or [`github.md`](github.md). It carries Phase 1 (fetch) and Phase 5 (posting), plus the re-review lookups; everything else is here.

## Phase 1 - Fetch the PR

Follow the platform file's Phase 1. It must leave you with:

- PR metadata: title, author, source -> target, status
- **The spec**: the PR description plus the linked work items (Azure DevOps) or linked issues (GitHub) - title, description, acceptance criteria. In a convention repo (GitHub; the platform file says how to tell) it also includes each linked issue's `## Decisions` and `## Done when`, and the epic's `## Decisions` when an issue says "See epic #N"
- Existing threads/comments, so nobody duplicates what is already on the PR
- The user's identity, and which of those threads are theirs
- `BASE` (the fetched target ref) and `HEAD_SHA` (the PR head commit)
- A passed repo check: the current checkout's `origin` is the PR's repository

**Re-review.** When the user asks for a re-review, or the existing threads include the user's own earlier ones, ask whether this is a second round after the author pushed fixes. If yes, the platform file's re-review section derives `LAST_SHA` (the last reviewed commit) and the per-thread details; confirm `LAST_SHA` with the user.

Do **not** fetch the diff yourself, slice it, or skim it - the agents in Phase 2 read it. **Do not create a review worktree yet.** Defer until a task actually needs to run PR code.

### Fail fast

Before any agent starts, all of these hold - otherwise stop and tell the user what failed. First, the platform file's repo check passed. Then:

```bash
git rev-parse --verify "$BASE"                       # target ref fetched
git cat-file -e "$HEAD_SHA^{commit}"                 # source/head commit fetched
MB=$(git merge-base "$BASE" "$HEAD_SHA")             # merge-base found
! git diff --quiet "$MB" "$HEAD_SHA"                 # diff non-empty
```

The review range is `$MB..$HEAD_SHA`. In a re-review it is `$LAST_SHA..$HEAD_SHA`, and additionally `LAST_SHA` exists locally and that delta is non-empty. The delta must also be the author's fixes alone:

```bash
git merge-base --is-ancestor "$LAST_SHA" "$HEAD_SHA"                            # no rebase / force-push
[ "$(git merge-base "$BASE" "$LAST_SHA")" = "$MB" ]                            # same fork point
[ -z "$(git rev-list --merges "$LAST_SHA..$HEAD_SHA")" ]                        # target not merged in
```

If any of these fails - or `LAST_SHA` is missing - the author rebased, force-pushed or merged the target in, and the delta would mix in target-branch changes. Stop and agree the range with the user (e.g. `git range-diff`) before going on.

Once the checks pass, summarise to the user in one short block: title, author, source -> target, status, file count (`git diff --shortstat <range>`), linked items, what it does. Keep it tight.

## Phase 2 - Run the reviewer agents

Always run `reviewer` (the custom agent in `~/.claude/agents/reviewer.md`, in its PR-review mode). In addition, scan the changed files (`git diff --name-status <range>`) and run any specialist sub-agents whose triggers apply. **All applicable agents run in parallel** - single message, multiple `Agent` tool uses. Don't re-analyse the diff yourself.

| Sub-agent | Run when | Why |
|---|---|---|
| `reviewer` | always | does the diff deliver what the spec asks and the PR claims, correctness, project-guideline violations |
| `pr-review-toolkit:pr-test-analyzer` | test files changed (`*Tests*`, `*.test.*`, `*.spec.*`, `tests/**`) | are new tests pinning the claimed behaviour, or vacuous? |
| `pr-review-toolkit:silent-failure-hunter` | error-handling changed (`try`/`catch`, `Result<>`, `.catch(`, fallback branches added in the diff) | swallowed exceptions, silent fallbacks, missing logs |
| `pr-review-toolkit:type-design-analyzer` | new types added or existing types' shapes changed (records, classes, interfaces, type aliases) | encapsulation, invariants, useful vs anaemic types |
| `pr-review-toolkit:comment-analyzer` | comments/docstrings added or changed | accuracy vs code, comment rot, refs to removed code |

For each agent, the prompt must include:

- The PR's intent (1-2 sentences from the PR description)
- The diff range to review (`git diff <range>`) or the relevant slice for that specialist
- Existing PR thread topics to **avoid duplicating** (Sonar warnings already posted, reviewer comments still open)
- A request to return findings as a flat list with: **severity** (blocker / major / minor / nit), **file:line**, **claim**, **suggested fix**, **confidence**
- An instruction to skip cosmetic nits unless they actively harm reviewability
- This line, verbatim: **"Do not spawn further agents and do not invoke any review skill."**

The `reviewer` prompt additionally opens with **"This is a PR review."** so it switches to its PR-review mode, and passes the full spec: the PR description plus each linked work item or issue (title, description, acceptance criteria). Together they are the brief, and the description's claims are what the reviewer verifies. In a convention repo the prompt also carries the issues' and the epic's `## Decisions` and `## Done when`.

In a re-review, every agent reviews only the delta, and the specialist triggers apply to the delta's files. The `reviewer` prompt also carries the user's earlier threads (anchor, text, replies, thread status) and asks for a verdict per thread - **addressed / not addressed / partially** - each with evidence (file:line in the delta, or the check it ran).

Do **not** run `code-simplifier` - this skill posts comments on someone else's PR, not refactors our own code.

When all agents return, merge their findings into a single severity-ordered list for Phase 3, tagging each finding with the agent that raised it (helps triage when two agents flag the same line).

## Phase 3 - Build the task list

Use `TaskCreate` to register one task per finding, ordered **severity desc** (blocker -> major -> minor -> nit). Each task content should include:

- The finding (file:line, claim, suggested fix)
- The **agent** that raised it (`reviewer` / `pr-test-analyzer` / `silent-failure-hunter` / `type-design-analyzer` / `comment-analyzer`)
- An **"Empirical check"** section - exactly what command/probe/source-read proves or refutes the claim
- An **"Outcome"** section left blank until validated

In a re-review, the earlier threads come first: one task per thread with the reviewer's verdict and evidence, ahead of the new findings.

If you triage a finding as not worth a task (clear duplicate of an existing thread on the PR, obvious agent hallucination), say so explicitly in the summary message - don't silently drop it.

Then present the task list summary and **stop**. Ask the user where to start.

## Phase 4 - Per-task validation loop

For each task, **in the order the user picks** (or sequential if they say "go from one to the next"):

1. **Set up what you need.** If validating requires running PR code and the review worktree doesn't exist yet, create it now from the PR head commit, detached: `git worktree add --detach <repo-parent>/<repo>.worktrees/review/<PR#>-<short-slug> "$HEAD_SHA"`. Run `npm ci` / `dotnet restore` / etc. once, reuse across tasks.
2. **Validate empirically.** Don't argue from training-data knowledge - run, mutate, probe. Cite source lines or capture exit codes. Watch for traps:
   - `cmd | tail` returns `tail`'s exit code, not `cmd`'s. Capture `${PIPESTATUS[0]}` or redirect to a file.
   - Flaky tests aren't deterministic - use forced timeouts (`--testTimeout=1`) for repeatable failures.
   - Training cutoff matters: spy-library behaviour, ESM internals, framework defaults all drift. Read the installed source.
   - See `~/.claude/memory/verification-reachability.md`.
3. **Report findings** to the user with the empirical evidence. State your lean (post / skip), but **the user decides**.
4. **Wait for the user's call.** "Post" / "skip" / "shorter" / "more proof" / "draft it differently". If they want a draft, write the comment text and show it before posting.
5. **Post or drop** based on their decision, per the platform file's Phase 5 - it says whether an approved comment goes out now or with the final batch. Update the task with the outcome.

### Hard rules

- **You never decide to close a task.** Only the user does. If a finding looks resolved to you, say so and wait.
- **You never auto-post** even when the user said "go one to the next". That phrase means *validate* one after the other, not *post* one after the other.
- **You never decide what to skip** beyond clear agent hallucinations / duplicates flagged in Phase 3. Marginal nits go in the task list; the user calls skip.
- **No `git add .`**, no `--no-verify`, no destructive commands without explicit OK (per global rules).
- If the user pushes back on a claim, **don't capitulate** - re-verify and either correct yourself or hold the line with evidence.

## Phase 5 - Posting comments

Follow the platform file's Phase 5. Comment style, on both platforms:

- Short. The user often reduces a long draft to one sentence ("please align the versions of X and Y so the peer requirement matches").
- One concrete ask per comment. Don't bundle.
- One line of empirical evidence ("verified locally: `npm ls` errors with ELSPROBLEMS") helps the author trust the fix without being preachy.
- No "thanks for the PR" / "consider perhaps" filler.
- No AI mentions, no Co-authored-by.

## Phase 6 - Wrap up

When all tasks are closed by the user (and, on GitHub, the batch from Phase 5 is submitted), print a final summary table: `# | outcome | comment link (if posted)`. Don't tear down the review worktree - the user may want to revisit. Mention that it lives at `<repo-parent>/<repo>.worktrees/review/<PR#>-<short-slug>`.

## Inputs

The user may invoke this skill with:
- Full PR URL (Azure DevOps `.../_git/<repo>/pullrequest/<id>`, GitHub `github.com/<owner>/<repo>/pull/<n>`)
- Bare PR number (`76600`) - current repo
- Either of these plus "re-review" / "second round"
- Nothing - ask for the URL or number

## What this skill is NOT

- Not an autonomous reviewer - the user is the second pair of eyes, not a rubber-stamp.
- Not for voting, approving, requesting changes, status checks, or merging - comments only.
