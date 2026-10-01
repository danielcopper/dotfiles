# Dispatching the implementer and reviewer agents

Templates and routing rules for the pipeline's two agents. Both agent definitions (`~/.claude/agents/implementer.md`, `~/.claude/agents/reviewer.md`) carry the working rules, the test and commit discipline, escalation, the confidence rubric and the report contracts; a dispatch supplies only the task facts below and restates none of those rules, in the brief or in the prompt. Default models come from the agent definitions; a Fable override happens only after the user confirmed it.

## Brief file

The lead writes the brief to `~/Memory/<repo>/brief-<N>.md` before dispatching (file handoffs keep the lead's context clean — paste nothing an agent can read). It contains:

- **Issue** — `#<N>`, plus the epic `#<E>` when the issue says "See epic #E"
- **Worktree** — the absolute path
- **Base SHA** — the commit the branch starts from
- **Gate** — the battery commands from the workflow config, verbatim
- **Agent rules** — the config's `agent_rules`, verbatim, when set
- **Extras** — task-specific only: files to read first, an exemplar file whose patterns to match, verification specifics

In a convention repo the issue is the spec, so the brief holds nothing else: a decision lives in the issue's `## Decisions`, never in the brief. In any other repo the brief also names the spec the issue does not settle:

- **Goal** — the issue's intent in two or three sentences
- **Done criteria** — the checkable outcomes, from the issue and the align step
- **In scope** — the files/areas expected to change
- **Out of scope** — what stays untouched (adjacent cleanups the user didn't ask for, known follow-ups)

## Implementer dispatch

Spawn the `implementer` agent with the brief file path, and name any session-level constraint the user added on top (the project's CLAUDE.md loads automatically).

Report delivery: each agent sends its full report as a message. Save it next to the brief — `~/Memory/<repo>/report-<N>.md` for the implementer, `review-<N>-<round>.md` for each review (agents cannot write into `~/Memory`) — so the reviewer and fix dispatches have a stable path.

### Status routing

| Status | Lead action |
|---|---|
| `DONE` | Proceed to review |
| `DONE_WITH_CONCERNS` | Read the concerns; resolve with the user before review when they touch correctness or scope, otherwise pass them to the reviewer as named risks |
| `BLOCKED` / `NEEDS_CONTEXT` | Take the specifics to the user. A decision goes into the issue's `## Decisions` (convention repo) or the brief (any other repo); then re-dispatch |

Questions an agent asks mid-run are relayed to the user verbatim — the lead answers only what the issue text or config already answers.

## Reviewer dispatch

First produce the diff artifact from the worktree, into the lead's scratchpad:

```bash
{ git -C <wt> log --oneline <base>..HEAD; git -C <wt> diff --stat <base>...HEAD; git -C <wt> diff <base>...HEAD; } > <diff-file>
```

Spawn the `reviewer` agent with:

- The brief file path (same file the implementer worked from; it names the issue)
- The saved implementer report path
- The diff file path (and the base..HEAD range as fallback)
- The repo's lint/type commands for changed files (from the workflow config)

Pass review findings and scope to the reviewer **unfiltered** — a dispatch that pre-judges ("don't flag X", "treat Y as minor") corrupts the review. The reviewer decides severity; the user decides what happens to Minor findings.

## Fix dispatch

After a **Needs fixes** verdict, dispatch the implementer again (same brief) with the reviewer's findings **verbatim** — severity, file:line, reasoning intact. The implementer fixes, re-runs the focused tests for the amended code, and sends a new report; append it to the saved report. Then re-review with a fresh reviewer: same dispatch shape, updated diff, previous round's findings listed as "addressed claims" for verification.
