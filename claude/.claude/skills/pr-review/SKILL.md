---
name: pr-review
description: Review an Azure DevOps or GitHub pull request together with the user, or re-review it after the author pushed fixes. Fetches the PR and its linked work items or issues, runs the review agents the shared review table names, turns findings into a severity-ordered task list, then validates each finding empirically with the user before deciding to drop it or post a comment on the PR. Use when the user says "review this PR", "lets do a review", "re-review", or sends a PR URL/number and wants to review.
---

# PR Review

Collaborative review of someone else's pull request. **You do the legwork — fetch, validate empirically, draft; the
user decides what gets posted.** Comments only: no votes, approvals, status checks or merges.

## Platform

From the input alone: a URL on `dev.azure.com` or `*.visualstudio.com` → Azure DevOps, on `github.com` → GitHub; a bare
PR number → the host of `git remote get-url origin`, the same mapping plus `ssh.dev.azure.com` → Azure DevOps; neither
→ ask. No input → ask for the URL or number. Then read [`azure-devops.md`](azure-devops.md) or [`github.md`](github.md):
it carries Phase 1 (fetch), Phase 5 (posting) and the re-review lookups.

## Phase 1 - Fetch the PR

The platform file's Phase 1 leaves you with: the PR metadata (title, author, source → target, status); **the spec** —
the description plus the linked work items or issues (title, description, acceptance criteria), and in a convention
repo the issue and epic sections the platform file names; the
existing threads and which are the user's; `BASE` and `HEAD_SHA`; and a passed check that `origin` is the PR's repo.

**Re-review.** When the user asks for one, or the threads include the user's earlier ones, ask whether this is a round
after the author pushed fixes; if so, the platform file derives `LAST_SHA` and the per-thread details — confirm
`LAST_SHA` with the user.

Don't read the diff yourself — the agents do — and create no worktree until a task needs to run PR code.

### Fail fast

Before any agent starts, the repo check passed and all of these hold; otherwise stop and tell the user:

```bash
git rev-parse --verify "$BASE"                       # target ref fetched
git cat-file -e "$HEAD_SHA^{commit}"                 # source/head commit fetched
MB=$(git merge-base "$BASE" "$HEAD_SHA")             # merge-base found
! git diff --quiet "$MB" "$HEAD_SHA"                 # diff non-empty
```

The range is `$MB..$HEAD_SHA`; in a re-review `$LAST_SHA..$HEAD_SHA`, with `LAST_SHA` present locally, a non-empty
delta, and the delta the author's fixes alone:

```bash
git merge-base --is-ancestor "$LAST_SHA" "$HEAD_SHA"                            # no rebase / force-push
[ "$(git merge-base "$BASE" "$LAST_SHA")" = "$MB" ]                            # same fork point
[ -z "$(git rev-list --merges "$LAST_SHA..$HEAD_SHA")" ]                        # target not merged in
```

If one fails, agree the range with the user (e.g. `git range-diff`) first. Then summarise in one short block: title,
author, source → target, status, file count (`git diff --shortstat <range>`), linked items, what it does.

## Phase 2 - Run the review agents

Run the agents [`review-agents.md`](../../review-agents.md) names for the range; a re-review follows its fix-round rule
(which agents, which range, **verify only**, who judges which thread). Each
prompt carries:

- the PR's intent in one or two sentences, and the range as two SHAs (the agent fetches the diff)
- the existing thread topics, so nothing is raised twice
- findings as a flat list — file:line, claim, suggested fix, severity and score
- no cosmetic nits unless they harm reviewability, and verbatim: **"Do not spawn further agents and do not invoke any
  review skill."**

`reviewer`'s prompt opens with **"This is a PR review."**; it and every specialist's prompt carry the full spec. Every
agent gets the repo path; `architecture-reviewer` and `prose-reviewer` also get the spec's decisions, and
`architecture-reviewer` per decision the old behaviour it replaces; `test-reviewer` also gets the repo's test command
where the repo's `CLAUDE.md` `## Pipeline`, or a foreign repo's profile, names one (`implement/repo-config.md`). A
judging agent gets its threads (anchor, text, replies, status) and gives a
verdict per thread in the shape of `reviewer.md`, "## Re-review". `code-simplifier` does not run: simplification
reaches the PR as `architecture-reviewer` findings.

**The PR's code runs only on the user's yes.** The first pass is read-only: every prompt says the user has not allowed
running the PR's code, so `reviewer`, `test-reviewer` and `failure-reviewer` report their runs as not run. Once the
user has seen the diff, offer those runs, naming what each would run (`reviewer`'s linter and type checker, the test
command, the mutation probes, the reviewed tool's checks); on the user's yes, dispatch them with that permission in
the prompt.

## Phase 3 - Build the task list

Merge the findings as `review-agents.md` says and register one task per finding with `TaskCreate`: earlier threads
first in a re-review, each with its judging agent's verdict and evidence, then Critical → Important → Minor, `pre-existing` last. Each task holds the finding, the agent,
an **Empirical check** (the command, probe or source read that proves or refutes it) and an empty **Outcome**. A
finding you drop as a clear duplicate of an existing thread or an agent hallucination is named in the summary, never
dropped silently. Present the list and **stop**, offering both ways through Phase 4: **one at a time** (the user picks
where to start) or **batch** (you validate every task, then hand over one list). The user picks.

## Phase 4 - Validate

**One at a time** runs steps 1–4 per task, in the user's order (or one after another when they say so). **Batch** asks
step 1's yes when the user picks it, then runs steps 1–2 for every task without waiting, records each Outcome with
your lean, then presents one list: every recommended comment as a draft with its anchor, and every finding you
recommend dropping with its reason. The user's ruling on that list replaces step 3 for all tasks.

1. Running PR code needs the user's yes, asked once before the review worktree exists: name the install command and
   the test or probe commands, and say that the install runs the PR's own scripts. On the yes, create the worktree
   once from the head commit, detached —
   `git worktree add --detach <repo-parent>/<repo>.worktrees/review/<PR#>-<short-slug> "$HEAD_SHA"` — and install
   dependencies once. Without the yes, validate by reading.
2. **Validate empirically**: run, mutate and probe (with step 1's yes), cite source lines and exit codes; read the
   installed library source rather than trusting memory — without the yes, the version the lockfile pins, read from
   the upstream source. `cmd | tail` returns `tail`'s exit code (use
   `${PIPESTATUS[0]}`); force flaky failures to repeat (e.g. `--testTimeout=1`). A real code path is not a reachable one
   (`~/Memory/global/verification-reachability.md`).
3. Report the evidence with your lean (post / skip), then wait: post, skip, shorter, more proof, or a draft to show
   first.
4. Post or drop per the platform file's Phase 5, and record the outcome.

The user alone closes a task and decides what is skipped beyond Phase 3's duplicates and hallucinations. "Go one to the
next" means validate in turn, never post in turn. When the user pushes back, re-verify and correct yourself or hold the
line with evidence.

## Phase 5 - Posting comments

Per the platform file. Short, one concrete ask per comment, one line of evidence ("verified locally: `npm ls` errors
with ELSPROBLEMS"), no filler, no AI mention.

## Phase 6 - Wrap up

Once the user has closed every task (on GitHub, with the batch submitted), print `# | outcome | comment link`. Leave
the review worktree in place, where one was created, and name its path.
