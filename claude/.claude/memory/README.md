# Memory System

This file is auto-injected into every Claude Code session and subagent (first tool call) by `~/.claude/hooks/pre-tool-memory.py`. It defines the structure and routing rules for the memory system.

## Three stores

| # | Path | Owner | Visibility |
|---|---|---|---|
| 1 | `~/.claude/memory/` | Us — global personal | Personal; gitignored content, machinery tracked |
| 2 | `~/.claude/projects/<mapped-cwd>/memory/` | Anthropic auto-memory | Personal; **never write here** |
| 3 | `<repo-root>/.claude/memory/` | Us — project-shared | Committed; team-visible |

Anthropic's auto-memory (store #2) keeps writing to its own location. We never write there. The hook reads its `MEMORY.md` for continuity at session start, that's it.

## Routing rule

When you (Claude) learn a fact and want to record it, decide where it belongs:

1. **Would this still be true and useful in a different project tomorrow?**
   - Yes → **store #1 global** (this folder)
   - No → step 2
2. **Would teammates working on this codebase benefit?**
   - Yes → **store #3 project-shared** (`<repo>/.claude/memory/<file>.md`, committed)
   - No (private/WIP/personal observation about the codebase) → **store #1 global daily** (`daily/<YYYY-MM-DD>.md`, gitignored)

## Layout (stores #1 and #3 use the same shape)

- `MEMORY.md` — index of topic files in this dir
- `general.md` — cross-cutting conventions and preferences
- `tools/<tool>.md` — quirks/configs/workarounds for a specific tool
- `domain/<topic>.md` — durable conceptual knowledge per topic

**Store #1 only** also has:

- `daily/<YYYY-MM-DD>.md` — time-bound running log; today + yesterday auto-injected by the hook
- `README.md` — this file (system docs)

Keep individual files under ~200 lines; split when they grow past that.

### What goes in `general.md` vs `tools/` vs `domain/`

- About *you* or a cross-project rule → `general.md` (e.g. "prefers terse commits", "Conventional Commits everywhere")
- About a specific tool's behaviour → `tools/<tool>.md` (e.g. `tools/sql-server.md`, `tools/yt-dlp.md`)
- Conceptual reference knowledge spanning tools → `domain/<topic>.md` (e.g. `domain/oauth.md`)

At the repo level (store #3), `general.md` holds repo-wide conventions (test runner, build, deploy, code style); `tools/` and `domain/` work the same way but scoped to that codebase.

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

Multiple sessions per day OK. Append-only. Two write mechanisms:

- **Ad-hoc** — when the user says "note in today's daily that …", append immediately.
- **Auto-summary** — `PreCompact` and `Stop` hooks invoke `memory-summarize.py` to extract key bullets from the session and append. Idempotent: only adds what isn't already there.

## Slash commands

- `/memory-dream` — review dailies, propose promotions to durable memory (general/tools/domain or repo memory), archive stale dailies. Plan-then-apply.
- `/memory-consolidate` — full sweep: runs dream first, then dedup/merge/split durables, refresh `MEMORY.md` index. Plan-then-apply, three approval gates.
- `/memory-promote <from> <to>` — explicit single-item move. Validates destination against routing rules.
