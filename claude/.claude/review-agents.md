# Review agents

Which agents review a change, how a fix round is reviewed, and where each finding goes — for `/implement`, `/pr-review`
and a plain session alike. The scale holds everywhere; routing and grouping are for a change of our own, and someone
else's PR goes by the last paragraph.

## Which agents run

Read the diff (`git diff --name-status <range>`, and `git diff <range>` for content triggers such as error handling)
and start every agent whose trigger hits, in parallel in one message. The table alone decides; there are no size tiers.

- **Code** — production code or a changed test file.
- **Production code** — a changed source file outside tests, docs and config, and every changed instruction file (agent
  definition, skill, `CLAUDE.md`, `.claude/rules/`, this file).
- **Prose** — a comment, docstring, doc page, README, ADR, instruction file or invariant register the diff adds or
  changes. Docs written for humans (READMEs, `docs/`, ADRs) are prose only.

| Agent | Run when | Why |
|---|---|---|
| `reviewer` | code changed | does the diff deliver the spec; correctness; project-guideline violations |
| `architecture-reviewer` | production code changed | fit with the tree: reuse, one home per fact, sibling patterns, written rules and design practice, less code, no site left doing the old behaviour |
| `prose-reviewer` | prose changed, or production code changed | is every sentence true at head and needed; in a first review, the comments already in the touched units too |
| `test-reviewer` | test files changed (`*Tests*`, `*.test.*`, `*.spec.*`, `tests/**`) | do new tests pin the claimed behaviour? At most one mutation probe per new "Done when" test |
| `failure-reviewer` | error handling changed (`try`/`catch`/`except`, `Result<>`, `.catch(`, fallback branches and defaults, retries, discarded exit codes) | swallowed failures, unasked fallbacks, fail-open paths, messages for the wrong audience |
| `type-reviewer` | types added or their shapes changed | invariants stated, constructed, encapsulated and enforced; swappable parameters, overloaded empty values |
| `security-reviewer` | the diff touches a shell or subprocess call, a delete, move or write on a path derived at runtime, an outbound URL, tokens or credentials, deserialising outside data, or model output used as input | exploitable paths from an untrusted source to a sink |

The last four rows are the **specialists**. Exception: a single-file edit the lead writes itself that changes only docs written for humans or only comments gets
`prose-reviewer` alone; an edit to an instruction file gets the table. For an unusually complex or critical change, the
lead offers the user a Fable-model reviewer and starts it only on their yes.

## Fix rounds

The first review is no fix round, nor is the single pass after the cap. Fix round N is the review after the
implementer's N-th fix dispatch; a change gets at most five. A fix round reviews only the delta,
`git diff <last-reviewed> HEAD`, also across an autosquash; after a rebase onto a moved base the lead agrees the range
with the user first (`git range-diff`). Every agent starts fresh.

The **findings to judge** are those the fix-round task sent to the implementer, plus earlier ones a verdict left not or
partially addressed — not those waiting on the user's list.

Rounds 1 and 2:

- `reviewer` — always, in the re-review shape of `agents/reviewer.md`, with the previous round's saved files and the
  findings to judge.
- `prose-reviewer` — when the delta changes prose; `architecture-reviewer` — when it adds a unit (a function, file,
  constant, section, or rule of an instruction file). Both get the previous round's saved files, so an earlier topic is
  no new finding.
- A specialist — when its trigger hits the delta.

From round 3 each prompt says **verify only**: an agent gives a verdict on the findings to judge that are its own to
verify and reports Critical or Important breakage in the lines the fix wrote; anything else it notices goes under
`### Noticed` and is routed like any finding. `reviewer` always runs and verifies every finding `architecture-reviewer`
and `prose-reviewer` did not raise; those two run only for their own findings; specialists do not run.

After round 5 the loop stops: every open finding goes on the user's list with the lead's recommendation. One the user
rules fix now gets one fix dispatch and one verify-only pass by `reviewer` alone; whatever that leaves open goes back on
the list, and no round follows.

A PR re-review (`/pr-review`, after the author pushed fixes) is a fix round with the user's earlier threads as the
findings to judge; N counts the user's earlier rounds on the PR (ask when unclear). After re-review 5 every open thread
is a task with the lead's recommendation, and no re-review runs unless the user asks.

## Routing the findings

Merge all findings into one list, each tagged with its agent. Every agent grades on one scale — Critical, Important
or Minor, with a score from 0 to 100 and nothing below 50 reported — as its definition under `agents/` sets.

On a change of our own, the lead checks each finding at its artifact — the cited file:line, quoted text or command —
and it is fixed as recommended, without asking the user; fix rounds run without a go. Only what needs the user goes on
**the user's list**:

- **On the change** (Critical, Important or Minor) → the implementer and the next fix round (after the cap, the user's
  list). It goes on the user's list instead when its fix changes behaviour or touches a decision recorded in the issue,
  or when the lead recommends deferring or dropping it, with the reason; one that does not hold at its artifact, or
  cannot be confirmed, is listed marked "not confirmed".
- **By-catch** (tagged `pre-existing`, or listed by the implementer) goes by its class, as
  [`agents/implementer.md`](agents/implementer.md), "## Scope", defines small:
  - **Small** → fixed in this change as its own commit; the PR body names it in one sentence.
  - **Changes behaviour** → the user's list, recommending a fix here; a yes becomes a decision of the issue.
  - **Large** → the user's list: fix here, open an issue, or drop. Nobody proposes an issue by default.

The user's list is one list, each entry with the lead's recommendation, handed to the user when the review loop ends;
it stops the run earlier only when the work cannot go on without an answer. Whatever the user rules fix now goes to the
implementer as a fix dispatch, and its delta is reviewed as the next fix round, or after the cap as "Fix rounds" says.

Findings become tasks in groups: those sent to the implementer, one task per fix round; on the user's list, findings
the lead recommends deferring or dropping, one task per theme, deduplicated, ruled as a whole or split; findings whose
fix changes behaviour or touches a decision, not-confirmed findings, behaviour-changing by-catch, large by-catch and the
cap's leftovers, each a group of its own with its own choices. A group names each finding on a line of its own; every
finding stays in its saved file (`skills/implement/dispatch.md`). None is dropped.

**Someone else's PR** (`/pr-review`) has no implementer: every finding, `pre-existing` included, is a task on the
user's list, and a `pre-existing` finding's comment asks the contributor whether they fix it in their PR.
