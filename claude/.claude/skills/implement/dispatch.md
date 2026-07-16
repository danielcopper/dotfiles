# Dispatching the implementer and reviewer agents

Templates and routing rules for the pipeline's two agents. Both agent definitions (`~/.claude/agents/implementer.md`, `~/.claude/agents/reviewer.md`) already carry the discipline — commit rules, escalation, confidence rubric, report contracts — so a dispatch supplies only the task-specific facts below. Default models come from the agent definitions; a Fable override happens only after the user confirmed it.

## Brief file

Write the brief to a file before dispatching (file handoffs keep the lead's context clean — paste nothing an agent can read). It contains:

- **Goal** — the issue's intent in two or three sentences, plus the issue number
- **Acceptance criteria** — the checkable outcomes, from the issue and the align step
- **In scope** — the files/areas expected to change
- **Out of scope** — what stays untouched (adjacent cleanups the user didn't ask for, known follow-ups)
- **Exemplar** — the file(s) whose patterns to match
- **Gate** — the battery commands from the workflow config, verbatim
- **Report file** — where the agent writes its full report

## Implementer dispatch

Spawn the `implementer` agent with:

- The brief file path
- The **absolute** worktree path, with the instruction to use absolute paths in every shell call (a subagent's cwd does not persist between calls)
- Repo constraints the brief doesn't carry: the project's CLAUDE.md is loaded automatically; name any session-level constraint the user added on top
- The report file path

Report delivery: both agents send their report as a message to the lead (their definitions instruct this). If the harness blocked an agent's report file, the full report arrives in the message — save it to the report file yourself so the reviewer/fix dispatches keep a stable path.

### Status routing

| Status | Lead action |
|---|---|
| `DONE` | Proceed to review |
| `DONE_WITH_CONCERNS` | Read the concerns; resolve with the user before review when they touch correctness or scope, otherwise pass them to the reviewer as named risks |
| `BLOCKED` / `NEEDS_CONTEXT` | Take the specifics to the user, then re-dispatch with the answer (same brief, amended) |

Questions an agent asks mid-run are relayed to the user verbatim — the lead answers only what the issue text or config already answers.

## Reviewer dispatch

First produce the diff artifact from the worktree:

```bash
{ git log --oneline <base>..HEAD; git diff --stat <base>...HEAD; git diff <base>...HEAD; } > <diff-file>
```

Spawn the `reviewer` agent with:

- The brief file path (same file the implementer worked from)
- The implementer's report file path
- The diff file path (and the base..HEAD range as fallback)
- The repo's lint/type commands for changed files (from the workflow config)

Pass review findings and scope to the reviewer **unfiltered** — a dispatch that pre-judges ("don't flag X", "treat Y as minor") corrupts the review. The reviewer decides severity; the user decides what happens to Minor findings.

## Fix dispatch

After a **Needs fixes** verdict, dispatch the implementer again (same brief) with the reviewer's findings **verbatim** — severity, file:line, reasoning intact. The implementer fixes, re-runs the focused tests for the amended code, appends results to its report file, and reports. Then re-review with a fresh reviewer: same dispatch shape, updated diff, previous round's findings listed as "addressed claims" for verification.
