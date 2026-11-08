# Dispatching the implementer and the review agents

Templates and routing rules for the pipeline's agents. The agent definitions under `~/.claude/agents/` carry the working rules, the test and commit discipline, escalation, the confidence rubric and the report contracts; a dispatch supplies only the task facts below and restates none of those rules, in the brief or in the prompt. Default models come from the agent definitions; a pipeline agent runs on another model only on the user's yes.

## Brief file

The lead writes the brief to `~/Memory/<repo>/brief-<N>.md` before dispatching (file handoffs keep the lead's context clean — paste nothing an agent can read). It contains:

- **Issue** — `#<N>`, plus the epic `#<E>` when the issue says "See epic #E"
- **Worktree** — the absolute path
- **Base SHA** — the commit the branch starts from
- **Gate** — the battery commands from the workflow config, verbatim
- **Agent rules** — the config's `agent_rules`, verbatim, when set
- **Extras** — task-specific only: files to read first, an exemplar file whose patterns to match, verification specifics, an ADR to write

In a convention repo the issue is the spec, so the brief holds nothing else: a decision lives in the issue's `## Decisions`, never in the brief. In any other repo the brief also names the spec the issue does not settle:

- **Goal** — the issue's intent in two or three sentences
- **Done criteria** — the checkable outcomes, from the issue and the align step
- **In scope** — the files/areas expected to change
- **Out of scope** — what stays untouched; by-catch follows the implementer's own rule and is not listed here

## Implementer dispatch

Spawn the `implementer` agent with the brief file path, and name any session-level constraint the user added on top (the project's CLAUDE.md loads automatically).

Report delivery: each agent sends its full report as a message, and the lead saves it next to the brief in `~/Memory/<repo>/`, because the harness has a subagent return its report as text rather than write a report file. The implementer's report is saved whole to `report-<N>.md`, a fix round's appended to it; it is also the saved file of the by-catch it lists. A review agent's is saved as an extract to `review-<N>-<round>-<agent>.md`: per finding its file:line, severity, score (where the agent gives one), what is wrong, the **evidence** (the quoted text, the contradicting site as file:line, or the command that showed it) and the suggested fix; from every `reviewer` report also its ⚠️ items; from every fix-round report, whichever agent wrote it, each verdict on an earlier finding that is not "addressed", with its anchor and evidence; and from a verify-only report its `### Noticed` items. The single verify-only pass after the round cap is saved as `review-<N>-post-cap-reviewer.md`. The fix dispatch works from these files, and so does the next round's review as `review-agents.md`, "Fix rounds", sets.

### Status routing

| Status | Lead action |
|---|---|
| `DONE` | Proceed to review |
| `DONE_WITH_CONCERNS` | Read the concerns; resolve with the user before review when they touch correctness or scope, otherwise pass them to the reviewer as named risks |
| `BLOCKED` / `NEEDS_CONTEXT` | Take the specifics to the user. A decision goes into the issue's `## Decisions` (convention repo) or the brief (any other repo); then re-dispatch |

Questions an agent asks mid-run are relayed to the user verbatim — the lead answers only what the issue text or config already answers.

## Review dispatch

Start the agents [`~/.claude/review-agents.md`](../../review-agents.md) names for the diff. Each gets the range as two commit SHAs, `<base>` and the head commit, and fetches the diff itself. `<base>` is the newest base SHA any implementer report names (it changes when the implementer rebased onto a moved main), else the brief's; in a fix round it is the last reviewed commit, and the diff is the tree diff `review-agents.md`, "Fix rounds", sets, which also says what each agent gets from the previous round. Beyond that:

- `reviewer` — the brief file path (it names the issue and the worktree), the saved implementer report path, and the repo's lint/type commands for changed files (from the workflow config)
- `architecture-reviewer` — the worktree path, the brief file path, and per decision the old behaviour it replaces, which the lead names
- `prose-reviewer` — the worktree path and the brief file path
- a specialist — the change's intent in one or two sentences

Give every agent the scope and the earlier findings without judging them first — a dispatch that pre-judges ("don't flag X", "treat Y as minor") corrupts the review. The agents decide severity and the user decides what happens to every finding on their list; the lead checks only whether a Critical or Important finding's facts hold, before it goes to a fix round (`review-agents.md`, "Routing the findings").

## Fix dispatch

Whenever the routing in `review-agents.md` sends findings to the implementer, after the check of facts it sets — small by-catch and the user's fix-now rulings included, after an Approved verdict too, and where no `reviewer` ran — dispatch the implementer again (same brief) with the paths of the saved review files and the saved report, the findings in them it is to fix (the fix-round task names them), and the branch tip it should find as HEAD. The implementer fixes, re-runs the focused tests for the amended code, and sends a new report. Then review the delta as `review-agents.md`, "Fix rounds", sets: as a fix round, or after the round cap as its single verify-only pass.
