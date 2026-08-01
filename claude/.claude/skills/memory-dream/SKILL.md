---
name: memory-dream
description: Triage daily logs - propose promotions to durable memory and archive of older dailies. Plan-then-apply.
---

# /memory-dream - Daily triage, promotion, and archive

You are running the `/memory-dream` command. Three things happen, all gated by user approval:
1. Recurring or important themes from dailies are proposed for promotion to durable memory — or, for proven reference
   knowledge, to the wiki canon (`~/Notes/wiki/`).
2. Older dailies that aren't worth promoting are proposed for archival under `daily/archive/<year>/`.
3. Daily index in `MEMORY.md` is refreshed, and `TIME-BOUND` index markers are checked against their conditions.

Read the routing rules at `~/Memory/global/README.md` first if not already in context.

## Reads

Two distinct reads — different roles:

- **Source material** (what we triage): all files under `~/Memory/global/daily/` (excluding `daily/archive/`).
- **Reference material** (so we know what already exists, avoid duplicates, pick correct destinations):
  - `~/Memory/global/*.md` (top-level rule files, one concept per file), `tools/*.md`, `domain/*.md` (global durables)
  - If cwd is inside a git repo, also `~/Memory/<repo-name>/` (repo durables) — repo-name is the basename of the MAIN
    repo root (`git rev-parse --path-format=absolute --git-common-dir`, parent dir — worktree-safe)

## Plan groups

Present a plan organized as four groups:

1. **Promote → durable memory or wiki**: recurring themes, durable decisions, codebase facts useful for future work.
   - "Promote → `<rule-name>.md` (NEW top-level rule file): …"
   - "Promote → `tools/sql-server.md` (NEW): …"
   - "Promote → `~/Memory/<repo-name>/<rule-name>.md` (NEW): …"
   - "Promote → wiki `~/Notes/wiki/<area>/<page>.md`: …" — for **proven reference knowledge** only (typically
     `domain/` material); translated to the wiki's format per `~/Notes/CLAUDE.md`, its `_index.md` /
     `_master-index.md` / `log.md` updated. Agent operating rules never go to the wiki.
   - **Trust ladder**: propose promotion only for user-confirmed or repeatedly-observed facts; single observations
     stay in the daily (group 2).
   - Validate destination against the routing rules in `README.md` and check reference material to avoid dupes.

2. **Skip (not durable yet — leave in daily for context)**: bullets that aren't worth promoting today but might recur. They stay in their daily file. No movement.

3. **Archive → `daily/archive/<year>/`**: older daily files (>30 days old by default) whose contents have either been promoted or have no further signal. Archiving moves the whole `daily/<YYYY-MM-DD>.md` file to `daily/archive/<YYYY>/<YYYY-MM-DD>.md`. The hook stops injecting them, but the file is preserved on disk.

4. **Already in durable memory** (informational): daily entries that already correspond to durable bullets — no action needed.

## Apply (after approval)

For each approved item:

- **Promote**: append/merge into the destination file. Don't blindly duplicate — check for existing entries first. **Then remove the source entry from the daily** (the whole `## HH:MM — topic` section). Content now lives in the topic file; leaving it in the daily is duplication. Skipped (not-promoted) entries stay in the daily for pattern detection over time.
- **Archive**: `mkdir -p ~/Memory/global/daily/archive/<year>/` and `mv` the daily file there. Plain `mv` — no git involved.
- **Refresh `~/Memory/global/MEMORY.md`** index: bump last-updated dates for topic files touched. Daily files are not indexed; promoted bullets land in topic files which already have their own index sections.
- **TTL check**: for every index entry marked `TIME-BOUND, delete when <condition>`, check the condition (e.g. via `gh`); if met, propose deleting file + entry.

## Constraints

- Never delete daily content — only promote or archive.
- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/` — that's Anthropic's auto-memory.
- The 30-day archive heuristic is a default; user can override on any pass ("don't archive yet", "archive everything older than 7 days", etc.).
- If a phase has nothing to do, report "no candidates" and continue.
