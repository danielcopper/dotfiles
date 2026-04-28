---
description: Triage daily logs - propose promotions to durable memory and archive of older dailies. Plan-then-apply.
---

# /memory-dream - Daily triage, promotion, and archive

You are running the `/memory-dream` command. Three things happen, all gated by user approval:
1. Recurring or important themes from dailies are proposed for promotion to durable memory.
2. Older dailies that aren't worth promoting are proposed for archival under `daily/archive/<year>/`.
3. Daily index in `MEMORY.md` is refreshed.

Read the routing rules at `~/.claude/memory/README.md` first if not already in context.

## Reads

Two distinct reads — different roles:

- **Source material** (what we triage): all files under `~/.claude/memory/daily/` (excluding `daily/archive/`).
- **Reference material** (so we know what already exists, avoid duplicates, pick correct destinations):
  - `~/.claude/memory/general.md`, `tools/*.md`, `domain/*.md` (global durables)
  - If cwd is inside a git repo (`git rev-parse --show-toplevel`), also `<repo>/.claude/memory/general.md`, `<repo>/.claude/memory/tools/*.md`, `<repo>/.claude/memory/domain/*.md` (repo durables)

## Plan groups

Present a plan organized as four groups:

1. **Promote → durable memory**: recurring themes, durable decisions, codebase facts that benefit teammates.
   - "Promote → `general.md`: …"
   - "Promote → `tools/sql-server.md` (NEW): …"
   - "Promote → `<repo>/.claude/memory/general.md`: …"
   - Validate destination against the routing rules in `README.md` and check reference material to avoid dupes.

2. **Skip (not durable yet — leave in daily for context)**: bullets that aren't worth promoting today but might recur. They stay in their daily file. No movement.

3. **Archive → `daily/archive/<year>/`**: older daily files (>30 days old by default) whose contents have either been promoted or have no further signal. Archiving moves the whole `daily/<YYYY-MM-DD>.md` file to `daily/archive/<YYYY>/<YYYY-MM-DD>.md`. The hook stops injecting them, but the file is preserved on disk.

4. **Already in durable memory** (informational): daily entries that already correspond to durable bullets — no action needed.

## Apply (after approval)

For each approved item:

- **Promote**: append/merge into the destination file. Don't blindly duplicate — check for existing entries first. Optionally leave a one-line marker in the source daily entry like `→ promoted to general.md` so it's clear the bullet has graduated. Keep the original daily text intact (it's history).
- **Archive**: `mkdir -p ~/.claude/memory/daily/archive/<year>/` and `mv` the daily file there. Use plain `mv` — daily files are gitignored, no git history involvement.
- **Refresh `~/.claude/memory/MEMORY.md`** index: list active topic files with last-updated dates. (Don't list every individual daily, that's noise — just `daily/` as a folder with a count or date range.)

## Constraints

- Never delete daily content — only promote or archive.
- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/` — that's Anthropic's auto-memory.
- The 30-day archive heuristic is a default; user can override on any pass ("don't archive yet", "archive everything older than 7 days", etc.).
- If a phase has nothing to do, report "no candidates" and continue.
