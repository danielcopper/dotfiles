---
name: memory-consolidate
description: Full memory sweep. Runs /memory-dream first, then dedupes/merges/splits durables (incl. wiki graduation) and refreshes the indexes. Three approval gates. Pass --all to sweep every repo tier under ~/Memory/.
argument-hint: "[--all]"
---

# /memory-consolidate - Full memory sweep

You are running the `/memory-consolidate` command — a superset of `/memory-dream`. Three phases, each gated by user approval before applying.

Read the routing rules at `~/Memory/global/README.md` first if not already in context.

## Scope

Default scope (no flag): the user's global personal memory (`~/Memory/global/`) plus the current repo's tier if cwd is
inside a git repo (`~/Memory/<repo-name>/`, repo-name = basename of the main repo root via
`git rev-parse --path-format=absolute --git-common-dir`, parent dir).

With `--all`: every subdirectory of `~/Memory/` except `global/` joins Phase 2 and Phase 3 — that IS the full repo-tier
inventory, no filesystem scan needed. Phase 1 (dream pass) is unchanged in `--all` mode — dailies live only in the
global store, there's nothing repo-local to dream over.

## Phase 1 — Dream pass (dailies → durable, plus archive)

Do everything `/memory-dream` does — see the `memory-dream` skill for full behaviour. Briefly:
- Read dailies as source; read durables (global + repo) as reference.
- Plan: promote recurring/durable bullets, archive old dailies (>30d default), skip not-yet-durable.
- **Wait for approval.**
- Apply (promote, archive, refresh `MEMORY.md` daily summary).

## Phase 2 — Durable sweep

Read the durable layer in scope:
- `~/Memory/global/*.md` (top-level rule files, one concept per file)
- `~/Memory/global/tools/*.md`
- `~/Memory/global/domain/*.md`
- For each in-scope repo tier: `~/Memory/<repo-name>/*.md` (plus its `tools/`, `domain/` if present)

(Scope = current repo only by default; every repo tier with `--all`.)

Propose, **per scope**:
- **Dedupe** overlapping entries (same fact in two files within the same scope → merge into the better-fit one). Do **not** dedupe across scopes — a fact in global vs. a fact in a repo can legitimately differ.
- **Conflict rule** when merging: an explicit user statement beats an observation; newer evidence with a source beats
  older. Record the correction in place — never keep both versions side by side.
- **Merge** related entries within a file (consolidate sections).
- **Split** files that exceed ~200 lines into topic-specific siblings (e.g. `tools/git.md` becomes `tools/git.md` + `tools/git-worktree.md`).
- **Wiki graduation**: `domain/` entries that have proven durable are candidates to leave memory for `~/Notes/wiki/`
  (translated per `~/Notes/CLAUDE.md`, indexes + log updated there, source entry removed here).

Group the plan by scope (Global / `<repo-a>` / `<repo-b>` / …) so the user can approve scopes independently. **Wait for approval.** Apply.

## Phase 3 — Index refresh

Rewrite the `MEMORY.md` index in each scope touched by Phase 2 to reflect current state:
- `~/Memory/global/MEMORY.md` for the global scope
- `~/Memory/<repo-name>/MEMORY.md` for each in-scope repo tier

For each `MEMORY.md`:
- One section per topic file with a keyword-dense description of **at most ~3 lines** and a last-updated date — dense enough to match how the user phrases topics, short enough that the eager-loaded index stays cheap.
- Daily files are not indexed.
- Note last-consolidated date at the top.

If a `MEMORY.md` doesn't exist yet in a scope that has topic files, create it.

Present the proposed indexes grouped by scope. **Wait for approval.** Apply.

## Constraints

- Three approval gates — do not skip any.
- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/` — Anthropic's auto-memory, hands off.
- Do **not** delete daily files even if they look stale.
- If a phase has nothing to do, report "no changes" and move to the next phase.
