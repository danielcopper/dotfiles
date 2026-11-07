# Review agents

Which review agents a change gets, how a fix round is reviewed, and where each finding goes. The table and the fix
rounds hold wherever a review starts: `/implement`, `/pr-review`, or a plain session. The routing of findings, the
by-catch classes included, is for a change of our own; someone else's PR goes by its last paragraph.

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

A fix round reviews only the **delta**: what changed since the last reviewed commit, as a tree diff
(`git diff <last-reviewed> HEAD`). That holds across a history rewrite on the same base, such as an autosquash. After a
rebase onto a moved base the tree diff carries the base's changes too, so the lead agrees the range with the user first
(for example with `git range-diff`), as `/pr-review` does. Every agent in a fix round starts fresh.

- `reviewer` — always, with the previous round's findings verbatim, in the re-review shape `agents/reviewer.md`,
  "## Re-review", sets.
- `prose-reviewer` — when the delta changes prose.
- `architecture-reviewer` — when the delta adds a unit: a function, a file, a constant, a section or a rule of an
  instruction file.
- A specialist — when its trigger hits the delta.

A PR re-review (`/pr-review`, after the author pushed fixes) is a fix round too, with the user's earlier threads in
place of the previous round's findings.

## Routing the findings

Merge every agent's findings into one list, each tagged with the agent that raised it, and route each:

- **A Critical or Important finding on the change**, from any agent, goes to the implementer, and a fix round follows.
- **A Minor finding on the change** goes on the user's list, one task each. The user rules on each: fix now, later, or
  drop; a fix now goes to the implementer as an Important finding does.
- **By-catch** — a review agent tags it `pre-existing`; the implementer lists it in its report — goes by its class, as
  [`agents/implementer.md`](agents/implementer.md), "## Scope", defines the classes and the cap:
  - **Small** → the implementer fixes it in this change, as its own commit; the PR body names it in one sentence.
  - **Changes behaviour** → ask the user, recommending a fix here; on yes it becomes a decision of the issue (in a
    convention repo, a new D-line) and goes to the implementer as an Important finding does.
  - **Large** → the user's list: fix here, open an issue, or drop. Nobody proposes an issue by default; a fix here goes
    to the implementer as an Important finding does.
  - **Past the cap** → ask the user before more of it is fixed.

**Someone else's PR** (`/pr-review`) has no implementer, so none of its findings goes to one: every finding,
`pre-existing` included, is a task on the user's list, and a `pre-existing` finding's comment asks the contributor
whether they fix it in their PR.
