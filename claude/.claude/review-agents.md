# Review agents

Which review agents a change gets, how a fix round is reviewed, and where each finding goes. The table, the fix rounds,
the merging of findings and the reading of each specialist's scale hold wherever a review starts: `/implement`,
`/pr-review`, or a plain session. The routing list, by-catch classes included, and the grouping into tasks are for a
change of our own; someone else's PR goes by the last paragraph of "Routing the findings".

## Which agents run

Read the range's diff (`git diff --name-status <range>` for the files, `git diff <range>` for the triggers that turn on
content, such as error handling or a type's shape) and start every agent whose trigger hits, all in parallel: one
message, several `Agent` calls. The table alone decides; there are no size tiers.

- **Code** — production code or a changed test file.
- **Production code** — a changed source file outside tests, docs and config, and every changed instruction file: an
  agent definition, a skill, a `CLAUDE.md`, a rule file (`.claude/rules/*.md`), this file.
- **Prose** — a comment, docstring, doc page, README, ADR, instruction file, or invariant register the diff adds or
  changes. Docs written for humans (READMEs, `docs/`, ADRs) are prose only.

| Agent | Run when | Why |
|---|---|---|
| `reviewer` | code changed | does the diff deliver what the spec asks and a PR claims; correctness; project-guideline violations |
| `architecture-reviewer` | production code changed | does it fit the tree: existing helpers reused, logic and facts in code kept in one home, sibling patterns and written architecture rules followed, the same behaviour with less code, no site left doing the old behaviour |
| `prose-reviewer` | prose changed, or production code changed | is every sentence the diff writes true at head, and does it belong; are the comments already in the units it touches still true and still needed |
| `pr-review-toolkit:pr-test-analyzer` | test files changed (`*Tests*`, `*.test.*`, `*.spec.*`, `tests/**`) | are new tests pinning the claimed behaviour, or vacuous? |
| `pr-review-toolkit:silent-failure-hunter` | error handling changed (`try`/`catch`, `Result<>`, `.catch(`, fallback branches added in the diff) | swallowed exceptions, silent fallbacks, missing logs |
| `pr-review-toolkit:type-design-analyzer` | new types added or existing types' shapes changed (records, classes, interfaces, type aliases) | encapsulation, invariants, useful vs anaemic types |

One exception to the table: a single-file edit the lead writes itself that changes only docs written for humans or only
comments gets `prose-reviewer` alone, also where the comments sit in a production-code file. An edit to an instruction
file is no such edit; it gets the table.

For an unusually complex or critical change, the lead offers the user a Fable-model reviewer and starts it only on their
yes.

## Fix rounds

A change's first review is no fix round. Fix round N is the review after the implementer's N-th fix dispatch, and a
change gets at most five.

A fix round reviews only the **delta**: what changed since the last reviewed commit, as a tree diff
(`git diff <last-reviewed> HEAD`). That holds across a history rewrite on the same base, such as an autosquash. After a
rebase onto a moved base the tree diff carries the base's changes too, so the lead agrees the range with the user first
(for example with `git range-diff`), as `/pr-review` does. Every agent in a fix round starts fresh.

The **findings to judge** are every finding the fix-round task sent to the implementer, plus every earlier finding a fix
round's verdict left not addressed or partially. A finding the user ruled later or drop, or one still awaiting the
user's ruling, is not judged.

In fix rounds 1 and 2:

- `reviewer` — always, in the re-review shape `agents/reviewer.md`, "## Re-review", sets. Its prompt names the
  previous round's saved files and the findings to judge.
- `prose-reviewer` — when the delta changes prose.
- `architecture-reviewer` — when the delta adds a unit: a function, a file, a constant, a section or a rule of an
  instruction file.
- A specialist — when its trigger hits the delta.

`architecture-reviewer` and `prose-reviewer` also get the previous round's saved review files, so a topic the previous
round raised stays no new finding.

From fix round 3 on, a fix round only verifies, and each prompt says **verify only**: an agent gives a verdict on each
finding to judge that is its own to verify and reports any Critical or Important breakage in the lines the fix itself
wrote. It raises no other new finding; whatever else it notices goes on the user's list.

- `reviewer` — always; it verifies the findings it or a specialist raised.
- `architecture-reviewer`, `prose-reviewer` — only when a finding to judge is one it raised; it verifies those.
- Specialists do not run.

After fix round 5's review the lead stops the loop: every finding still open goes on the user's list, one line each,
for the user to rule on.

A PR re-review (`/pr-review`, after the author pushed fixes) is a fix round too, its N-th re-review fix round N, with
the user's earlier threads as the findings to judge.

## Routing the findings

Merge every agent's findings into one list, each tagged with the agent that raised it. A plugin specialist keeps its own
scale, and no dispatch asks it for another; it reads as:

- `silent-failure-hunter` — CRITICAL → Critical, HIGH → Important, MEDIUM → Minor.
- `pr-test-analyzer` — 9–10 → Critical, 7–8 → Important, 5–6 → Minor; 1–4 is not reported.
- `type-design-analyzer` — rates no finding: everything under Concerns and Recommended Improvements → Minor.

For `pr-test-analyzer` the rating decides, not the section heading: a finding it lists without one, such as under "Test
Quality Issues", is Minor.

Each finding is routed:

- **A Critical or Important finding on the change**, from any agent, goes to the implementer, and a fix round follows,
  once the lead has checked it at the artifact: the cited file:line, the quoted text, the named command. A finding that
  does not hold there, or cannot be confirmed, goes on the user's list instead, marked "not confirmed".
- **A Minor finding on the change** goes on the user's list: fix now, later, or drop.
- **By-catch** — a review agent tags it `pre-existing`; the implementer lists it in its report — goes by its class, as
  [`agents/implementer.md`](agents/implementer.md), "## Scope", defines the classes and the cap:
  - **Small** → the implementer fixes it in this change, as its own commit; the PR body names it in one sentence.
  - **Changes behaviour** → ask the user, recommending a fix here; on yes it becomes a decision of the issue (in a
    convention repo, a new D-line).
  - **Large** → the user's list: fix here, open an issue, or drop. Nobody proposes an issue by default.
  - **Past the cap** → ask the user before more of it is fixed.

A Minor finding ruled fix now, a behaviour change the user said yes to, and a large by-catch ruled fix here go to the
implementer as an Important finding does.

Findings become tasks in groups. The findings that go straight to the implementer are one task per fix round. Plain
Minor findings go into one task per theme, deduplicated across agents, which the user rules on as a whole (fix now,
later, or drop) or splits. Large, behaviour-changing and past-cap by-catch each go into groups of their own class, so a
group's ruling offers that class's own choices above. Findings marked "not confirmed" go into a group of their own. Each
group names each finding it holds in a line of its own, and every finding stays in its saved file: a review agent's in
the form `skills/implement/dispatch.md`, "Report delivery", sets; a by-catch the implementer lists in its report. None
is dropped.

**Someone else's PR** (`/pr-review`) has no implementer: every finding, `pre-existing` included, is a task on the user's
list, and a `pre-existing` finding's comment asks the contributor whether they fix it in their PR.
