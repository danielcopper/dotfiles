# Memory System

The always-true slices load natively via `~/.claude/CLAUDE.md`: the routing rules live inline there, the global `MEMORY.md` index arrives through an `@import` — both reach every session **and every subagent**. `~/.claude/hooks/memory_inject.py` injects only the time- and place-bound slices at the first tool call: today's + yesterday's dailies and the per-repo index (worktree-safe via `--git-common-dir`). This file is the canonical structure/routing reference, read on demand when that isn't enough (typically inside `/memory-dream`, `/memory-consolidate`, `/memory-promote` workflows).

## Stores

| # | Path | Owner | Visibility |
|---|---|---|---|
| 1 | `~/.claude/memory/` | Us — global personal | Personal; gitignored content, machinery tracked |
| 2 | `~/.claude/projects/<mapped-cwd>/memory/` | Anthropic auto-memory (**disabled**) | Read-only archive; **never write here** |
| 3 | `<repo-root>/.claude/memory/` | Us — project-shared | Committed; **may be public** |

Anthropic's auto memory is disabled in settings (`autoMemoryEnabled: false`) — this system is the only writer. Store #2 is a frozen archive awaiting its one-time merge into stores #1/#3; until then the hook still reads its `MEMORY.md` for continuity.

## Routing rule

When you (Claude) learn a fact and want to record it, decide where it belongs:

1. **Would this still be true and useful in a different project tomorrow?**
   - Yes → **store #1 global** (this folder)
   - No → step 2
2. **Would teammates working on this codebase benefit — and is it public-safe?** (the repo may be public: no secrets or credential recipes, no game/ROM names, no personal device details)
   - Yes to both → **store #3 project-shared** (`<repo>/.claude/memory/<file>.md`, committed)
   - Repo-specific but **private** → **store #1 global**, with a `<repo>-` filename prefix
   - No (WIP/personal observation about the codebase) → **store #1 global daily** (`daily/<YYYY-MM-DD>.md`, gitignored)

## Layout (stores #1 and #3 use the same shape)

- `MEMORY.md` — index of topic files in this dir
- `<rule-name>.md` — one rule / observation / preference per file at the top level
- `tools/<tool>.md` — quirks/configs/workarounds for a specific tool
- `domain/<topic>.md` — durable conceptual knowledge per topic

**Store #1 only** also has:

- `daily/<YYYY-MM-DD>.md` — time-bound running log; today + yesterday auto-injected by the hook
- `daily/archive/<YYYY>/<YYYY-MM-DD>.md` — older dailies moved here by `/memory-dream`. Not injected, kept on disk.
- `README.md` — this file (system docs)

Keep individual files under ~200 lines; split when they grow past that.

### Filename and frontmatter convention

- **Filename**: kebab-case, no type prefix. `validate-runtime-claims.md` ✓, not `feedback_validate_runtime_claims.md`. The type lives in frontmatter, not the filename.
- **Frontmatter**: top-level `type:` (one of `feedback`, `user`, `project`, `reference`, `tools`, `domain`). Not nested under `metadata:`.
- **`name:` must equal the filename slug** (without `.md`). So a file named `commit-per-task.md` has `name: commit-per-task`. This is what `[[wiki-links]]` and grep both resolve against.
- **Wiki-links** `[[other-name]]` use the target file's `name:` slug — which by the rule above equals its filename slug.

Example:

```yaml
---
name: no-bulk-sed
description: Avoid bulk sed -i loops; use Edit per file or a guarded Python script
type: feedback
---
```

Stored as `no-bulk-sed.md`, referenced from other files as `[[no-bulk-sed]]`.

### What goes at the top level vs `tools/` vs `domain/`

- About *you* or a cross-project rule → top-level `<rule-name>.md` (e.g. `challenge-pushback.md`, `commit-per-task.md`, `no-inline-comments.md`). One concept per file.
- About a specific tool's behaviour → `tools/<tool>.md` (e.g. `tools/sql-server.md`, `tools/yt-dlp.md`)
- Conceptual reference knowledge spanning tools → `domain/<topic>.md` (e.g. `domain/oauth.md`)

At the repo level (store #3), the same shape applies: one rule per top-level file, `tools/` and `domain/` for the same purposes as in the global store, scoped to that codebase.

## Updating the index

Golden rule: **eager-load the index, lazy-load the details.** `MEMORY.md` is the index for topic files; details live in `<rule-name>.md`, `tools/<tool>.md`, `domain/<topic>.md` and are read on demand based on the index.

When you create or modify a topic file:

1. Bump the file's last-updated date in its `MEMORY.md` section.
2. If it's a new file, add a new section with a *rich, keyword-dense* description so future sessions can match user prompts to the right file.

Daily files don't go in the index. Today + yesterday auto-inject directly; older dailies eventually graduate to topic files via `/memory-promote` or `/memory-dream`, and *then* they're indexed via their topic file.

## Treat store #3 like committed code

No secrets, no in-flight personal thinking, no "I'm confused" entries — those go to store #1 `daily/`.

Store #3 is created lazily. The first time you write a project fact, create `<repo>/.claude/memory/` and a `MEMORY.md` index inside that repo.

## Daily entries

Format:

```
## HH:MM — short-topic-slug
- bullet 1
- bullet 2
- bullet 3 (3–5 bullets max per session)
```

Multiple sessions per day OK. Append-only. When the user says "note in today's daily that …" or similar, append immediately using the format above.

## Slash commands

- `/memory-dream` — triage dailies: propose promotions to durable memory (top-level rule files / tools / domain or repo memory), and archive of older dailies (>30d default) to `daily/archive/<year>/`. Plan-then-apply. Never deletes daily content.
- `/memory-consolidate` — full sweep: runs dream first, then dedup/merge/split durables, refresh `MEMORY.md` index. Plan-then-apply, three approval gates.
- `/memory-promote <from> <to>` — explicit single-item move. Validates destination against routing rules.
