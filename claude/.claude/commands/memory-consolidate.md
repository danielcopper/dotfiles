---
description: Full memory sweep. Runs /memory-dream first, then dedupes/merges/splits durables and refreshes the index. Three approval gates.
---

# /memory-consolidate - Full memory sweep

You are running the `/memory-consolidate` command — a superset of `/memory-dream`. Three phases, each gated by user approval before applying.

Read the routing rules at `~/.claude/memory/README.md` first if not already in context.

## Phase 1 — Dream pass (dailies → durable, plus archive)

Do everything `/memory-dream` does — see `~/.claude/commands/memory-dream.md` for full behaviour. Briefly:
- Read dailies as source; read durables (global + repo) as reference.
- Plan: promote recurring/durable bullets, archive old dailies (>30d default), skip not-yet-durable.
- **Wait for approval.**
- Apply (promote, archive, refresh `MEMORY.md` daily summary).

## Phase 2 — Durable sweep

Now read the durable layer:
- `~/.claude/memory/general.md`
- `~/.claude/memory/tools/*.md`
- `~/.claude/memory/domain/*.md`
- `<repo>/.claude/memory/general.md`, `<repo>/.claude/memory/tools/*.md`, `<repo>/.claude/memory/domain/*.md` if cwd is in a repo

Propose:
- **Dedupe** overlapping entries (same fact in two files → merge into the better-fit one).
- **Merge** related entries within a file (consolidate sections).
- **Split** files that exceed ~200 lines into topic-specific siblings (e.g. `tools/git.md` becomes `tools/git.md` + `tools/git-worktree.md`).

Present the plan. **Wait for approval.** Apply.

## Phase 3 — Index refresh

Rewrite `~/.claude/memory/MEMORY.md` (and `<repo>/.claude/memory/MEMORY.md` if applicable) to reflect current state:
- Table listing each topic file with one-line description and last-updated date.
- Note last-consolidated date at the top.

If `MEMORY.md` doesn't exist yet, create it.

Present the proposed index. **Wait for approval.** Apply.

## Constraints

- Three approval gates — do not skip any.
- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/` — Anthropic's auto-memory, hands off.
- Do **not** delete daily files even if they look stale.
- If a phase has nothing to do, report "no changes" and move to the next phase.
