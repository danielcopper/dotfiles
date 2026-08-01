# Memory System

The always-true slices load natively via `~/.claude/CLAUDE.md`: the routing rules live inline there, the global `MEMORY.md` index arrives through an `@import` — both reach every session **and every subagent**. `~/.claude/hooks/memory_inject.py` injects only the time- and place-bound slices at the first tool call: today's + yesterday's dailies and the per-repo index (worktree-safe via `--git-common-dir`). This file is the canonical structure/routing reference, read on demand when that isn't enough (typically inside `/memory-dream`, `/memory-consolidate`, `/memory-promote` workflows).

## Stores

| # | Path | Owner | Visibility |
|---|---|---|---|
| 1 | `~/Memory/global/` | Us — global personal | Private; Nextcloud-synced (`~/.claude/memory` is a compat symlink here) |
| 2 | `~/.claude/projects/<mapped-cwd>/memory/` | Anthropic auto-memory (**disabled**) | Merged read-only archive; **never write here** |
| 3 | `~/Memory/<repo-name>/` | Us — per repo | Private; Nextcloud-synced; never committed to the repo |

Anthropic's auto memory is disabled in settings (`autoMemoryEnabled: false`) — this system is the only writer. This
README stays version-tracked in the dotfiles repo and is symlinked into `~/Memory/global/`.

Above the stores sits the **canon**: the Obsidian wiki at `~/Notes/wiki/`, maintained per `~/Notes/CLAUDE.md`. Memory
is the working set — provisional until proven; the wiki is where proven reference knowledge gets promoted to (see
"Promotion & provenance" below).

## Routing rule

When you (Claude) learn a fact and want to record it, decide where it belongs:

1. **Would this still be true and useful in a different project tomorrow?**
   - Yes → **store #1 global** (this folder)
   - No → step 2
2. **Would future work on this codebase benefit?**
   - Yes → **store #3 repo tier** (`~/Memory/<repo-name>/<file>.md`; repo-name = basename of the main repo root)
   - No (WIP/personal observation about the codebase) → **store #1 global daily** (`daily/<YYYY-MM-DD>.md`)

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
- Links may cross tiers. Repo → global always resolves (the global tier is loaded everywhere); global → repo resolves
  only in sessions inside that repo — elsewhere such a link is an inert pointer, which is acceptable.

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

## Promotion & provenance

The tiers form a ladder of proof: **daily** (observed once) → **durable memory** (confirmed / recurring) → **wiki
canon** (`~/Notes/wiki/`, curated by the user). Rules:

- **Trust ladder**: promote only what the user confirmed or what was observed repeatedly — a single observation stays
  in the daily. (User-stated > repeatedly observed > observed once > inferred.)
- **Conflict rule**: an explicit user statement beats an observation; newer evidence with a source beats older. Record
  the correction in place — don't keep both versions.
- **TTL marker**: time-bound facts carry `TIME-BOUND, delete when <condition>` in their index entry; `/memory-dream`
  checks the condition each pass.
- **Wiki promotion**: durable *reference* knowledge (typically `domain/`) graduates out of memory into
  `~/Notes/wiki/`, translated to the wiki's own format (German, its page format and index/log discipline per
  `~/Notes/CLAUDE.md`). Like every promotion, the memory source entry is removed — facts live in exactly one place.
  Agent operating rules (`feedback`/`user`/`tools`) never go to the wiki.

Store #3 is created lazily. The first time you write a project fact, create `~/Memory/<repo-name>/` with a `MEMORY.md`
index. No secret values in any tier — reference by location, never by value.

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
