---
name: find-session
description: Find past Claude Code sessions by issue number or topic — searches the transcript history and lists session IDs with dates so the right one can be resumed. Argument: an issue number or search term.
disable-model-invocation: true
---

Answer "which session was that?" — locate past sessions whose conversation matches the given term, so the user can resume the right one.

## 1. Scope the search

Sessions live in `~/.claude/projects/<sanitized-cwd>/*.jsonl`, one file per session, one directory per working directory — a repo worked on via worktrees has **many** directories sharing the repo's slug. Derive the slug from the current repo path and search every matching directory (e.g. `~/.claude/projects/*<repo-slug>*/`).

## 2. Search

Transcripts are large — search cheap, extract late:

- `grep -l` the term across the `.jsonl` files first (for an issue number, match its variants: `#1234`, `issue 1234`, `1234-`)
- For each hit, pull the session's date range — the first and last `"timestamp":"…"` occurrence in the file (`grep -o -m1` from the top, same on `tac` for the end; the first line isn't guaranteed to carry one) — and one or two matching user-message snippets for recognition. Never read whole files.

*Done when:* every matching session file across all matching project dirs has been found — not just the current cwd's dir.

## 3. Present

Newest first, one row per session: session ID (the filename stem), date range, project dir (main repo vs which worktree), and the recognition snippet. For the likely candidate, give the resume command: `claude --resume <session-id>` — run from the directory the session belongs to. No match: say so and offer the nearest-date sessions instead.
