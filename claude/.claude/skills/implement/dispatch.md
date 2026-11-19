# Dispatching the implementer and the review agents

The agent definitions under `~/.claude/agents/` carry the working rules, test and commit discipline, escalation,
scoring and report contracts. A dispatch supplies only the task facts below and restates none of those rules, except
the one sentence "Implementer dispatch" names. Models come from the definitions; another model only on the user's yes.

## Brief file

The lead writes `~/Memory/<repo>/brief-<N>.md` before dispatching — paste nothing an agent can read. It holds:

- **Issue** — `#<N>`, plus the epic `#<E>` when the issue says "See epic #E"
- **Worktree** — the absolute path, and the **base SHA**
- **Gate** and **agent rules** — verbatim from the `CLAUDE.md`'s `## Pipeline`, or the profile in a foreign repo
  ([`repo-config.md`](repo-config.md))
- **Extras** — task-specific only: files to read first, an exemplar to match, verification specifics, an ADR to write

In a convention repo the issue is the spec (`## Wanted`, `## Decisions`, `## Done when`, `## Out of scope`, and the
epic's `## Decisions`), so the brief holds nothing else and a decision never lives in the brief. An issue with an open
question or without `## Decisions` is not dispatched. In any other repo the brief adds **Goal** (two or three
sentences), **Done criteria**, **In scope** and **Out of scope**.

## Implementer dispatch

Spawn `implementer` with the brief path and any session constraint the user added. End the prompt with: *"Send your
full report as a message. Your final answer is then one sentence: status and head."*

Save every report next to the brief: the implementer's whole to `report-<N>.md`, a fix round's appended; a review
agent's as an extract to `review-<N>-<round>-<agent>.md` — per finding its file:line, severity, score, what is wrong,
the evidence and the suggested fix, plus the `reviewer`'s ⚠️ items, a fix round's or the post-cap pass's verdicts that
are not "addressed", and a verify-only pass's `### Noticed` items (the post-cap pass:
`review-<N>-post-cap-reviewer.md`). Fix dispatches and later rounds work from these files.

### Status routing

| Status | Lead action |
|---|---|
| `DONE` | Proceed to review |
| `DONE_WITH_CONCERNS` | Concerns that touch correctness or scope go to the user before review; others go to the reviewer as named risks |
| `BLOCKED` / `NEEDS_CONTEXT` | Take the specifics to the user; a decision goes into the issue (convention repo) or the brief; then re-dispatch |

A question an agent asks mid-run goes to the user verbatim; the lead answers only what the issue or the repo's facts
already answer.

## Review dispatch

Start the agents [`review-agents.md`](../../review-agents.md) names. Each gets the range as two SHAs and fetches the
diff itself: `<base>` is the merge base with main (`git -C <wt> merge-base HEAD origin/main`), in a fix round the last
reviewed commit as `review-agents.md`, "Fix rounds", sets. Beyond that:

- `reviewer` — the brief path, the saved report path and the repo's review checks
- `architecture-reviewer` — the worktree, the brief path, and per decision the old behaviour it replaces
- `prose-reviewer` — the worktree and the brief path; on the drafted PR body (`SKILL.md`, step 8), the worktree,
  `<base SHA>..HEAD` and the body's path `~/Memory/<repo>/pr-body-<N>.md`
- `test-reviewer` — the worktree, the brief path, the saved report path and the gate's test command
- `failure-reviewer`, `type-reviewer`, `security-reviewer` — the worktree and the brief path

Pass the scope and earlier findings without judging them — "don't flag X" or "treat Y as minor" corrupts the review.
The lead checks only a finding's facts, as `review-agents.md`, "Routing the findings", says.

## Fix dispatch

When the routing in `review-agents.md` sends findings to the implementer, re-dispatch it with the same brief, the saved
report and review files, and the findings to fix, ending the prompt as above. It fixes and reports; then the delta is
reviewed as a fix round, or after the round cap as the single verify-only pass.
