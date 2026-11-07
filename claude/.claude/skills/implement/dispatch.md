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

Report delivery: each agent sends its full report as a message. Save it next to the brief — `~/Memory/<repo>/report-<N>.md` for the implementer, `review-<N>-<round>-<agent>.md` for each review agent's (agents cannot write into `~/Memory`) — so the review and fix dispatches have a stable path.

### Status routing

| Status | Lead action |
|---|---|
| `DONE` | Proceed to review |
| `DONE_WITH_CONCERNS` | Read the concerns; resolve with the user before review when they touch correctness or scope, otherwise pass them to the reviewer as named risks |
| `BLOCKED` / `NEEDS_CONTEXT` | Take the specifics to the user. A decision goes into the issue's `## Decisions` (convention repo) or the brief (any other repo); then re-dispatch |

Questions an agent asks mid-run are relayed to the user verbatim — the lead answers only what the issue text or config already answers.

## Review dispatch

First produce the diff artifact from the worktree, into the lead's scratchpad:

```bash
{ git -C <wt> log --oneline <base>..HEAD; git -C <wt> diff --stat <base>...HEAD; git -C <wt> diff <base>...HEAD; } > <diff-file>
```

`<base>` is the newest base SHA any implementer report names (it changes when the implementer rebased onto a moved main), else the brief's. In a fix round `<base>` is the last reviewed commit and the artifact is the tree diff `review-agents.md`, "Fix rounds", sets, without the log line:

```bash
{ git -C <wt> diff --stat <base> HEAD; git -C <wt> diff <base> HEAD; } > <diff-file>
```

Start the agents [`~/.claude/review-agents.md`](../../review-agents.md) names for the diff. Each gets the diff file path (and the range as fallback), plus:

- `reviewer` — the brief file path (it names the issue), the saved implementer report path, and the repo's lint/type commands for changed files (from the workflow config)
- `architecture-reviewer` — the worktree path, the brief file path, and per decision the old behaviour it replaces, which the lead names
- `prose-reviewer` — the worktree path and the brief file path
- a specialist — the change's intent in one or two sentences

Pass review findings and scope to every agent **unfiltered** — a dispatch that pre-judges ("don't flag X", "treat Y as minor") corrupts the review. The agents decide severity; the user decides what happens to every finding on their list.

## Fix dispatch

Whenever the routing in `review-agents.md` sends findings to the implementer — small by-catch and the user's fix-now rulings included, after an Approved verdict too, and where no `reviewer` ran — dispatch the implementer again (same brief) with those findings **verbatim** (severity, file:line, reasoning intact) and the branch tip it should find as HEAD. The implementer fixes, re-runs the focused tests for the amended code, and sends a new report; append it to the saved report. Then review the delta as a fix round, per `review-agents.md`, "Fix rounds": the `reviewer` prompt lists the previous round's findings for a verdict each.
