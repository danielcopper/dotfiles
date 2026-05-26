---
name: memory-consolidate
description: Full memory sweep. Runs /memory-dream first, then dedupes/merges/splits durables and refreshes the index. Three approval gates. Pass --all to extend the durable sweep across every discovered repo with team-shared memory.
argument-hint: "[--all]"
---

# /memory-consolidate - Full memory sweep

You are running the `/memory-consolidate` command — a superset of `/memory-dream`. Three phases, each gated by user approval before applying.

Read the routing rules at `~/.claude/memory/README.md` first if not already in context.

## Scope

Default scope (no flag): the user's global personal memory (`~/.claude/memory/`) plus the current repo's memory if cwd is inside a git repo (`<cwd-repo>/.claude/memory/`).

With `--all`: in addition, discover every other repo on the machine that has team-shared memory and include them in Phase 2 and Phase 3. Discovery:

- Roots to scan: `~/Projects/`, `~/repos/`, `~/Repos/`, and direct subdirs of `~` (skip dotfiles already covered as part of global memory).
- For each root, search up to depth 3. A directory qualifies as a Tier-3 repo iff it contains **both** `.git/` (or `.git` file in a worktree) **and** `.claude/memory/`.
- De-dup found repos by their git-common-dir so worktrees of the same repo aren't processed twice.
- Phase 1 (dream pass) is unchanged in `--all` mode — dailies live only in the global Tier-1 store, there's nothing repo-local to dream over.

## Phase 1 — Dream pass (dailies → durable, plus archive)

Do everything `/memory-dream` does — see `~/.claude/commands/memory-dream.md` for full behaviour. Briefly:
- Read dailies as source; read durables (global + repo) as reference.
- Plan: promote recurring/durable bullets, archive old dailies (>30d default), skip not-yet-durable.
- **Wait for approval.**
- Apply (promote, archive, refresh `MEMORY.md` daily summary).

## Phase 2 — Durable sweep

Read the durable layer in scope:
- `~/.claude/memory/*.md` (top-level rule files, one concept per file)
- `~/.claude/memory/tools/*.md`
- `~/.claude/memory/domain/*.md`
- For each in-scope repo: `<repo>/.claude/memory/*.md`, `<repo>/.claude/memory/tools/*.md`, `<repo>/.claude/memory/domain/*.md`

(Scope = current repo only by default; all discovered repos with `--all`.)

Propose, **per scope**:
- **Dedupe** overlapping entries (same fact in two files within the same scope → merge into the better-fit one). Do **not** dedupe across scopes — a fact in global vs. a fact in a repo can legitimately differ.
- **Merge** related entries within a file (consolidate sections).
- **Split** files that exceed ~200 lines into topic-specific siblings (e.g. `tools/git.md` becomes `tools/git.md` + `tools/git-worktree.md`).

Group the plan by scope (Global / `<repo-a>` / `<repo-b>` / …) so the user can approve scopes independently. **Wait for approval.** Apply.

## Phase 3 — Index refresh

Rewrite the `MEMORY.md` index in each scope touched by Phase 2 to reflect current state:
- `~/.claude/memory/MEMORY.md` for the global scope
- `<repo>/.claude/memory/MEMORY.md` for each in-scope repo

For each `MEMORY.md`:
- One section per topic file with a rich, keyword-dense description and a last-updated date. Sections give space for descriptions that match how the user phrases topics in conversation.
- Daily files are not indexed.
- Note last-consolidated date at the top.

If a `MEMORY.md` doesn't exist yet in a scope that has topic files, create it.

Present the proposed indexes grouped by scope. **Wait for approval.** Apply.

## Constraints

- Three approval gates — do not skip any.
- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/` — Anthropic's auto-memory, hands off.
- Do **not** delete daily files even if they look stale.
- If a phase has nothing to do, report "no changes" and move to the next phase.
