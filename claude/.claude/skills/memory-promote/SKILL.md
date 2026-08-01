---
name: memory-promote
description: Move a specific memory entry to a durable destination. Validates against routing rules in memory/README.md.
argument-hint: "<from-description> <to-destination>  (e.g. 'sqlcmd quoting trick' tools/sql-server)"
---

# /memory-promote - Single-item promotion

You are running the `/memory-promote` command. The user wants to move one specific memory entry to one specific destination. Granular alternative to `/memory-dream`.

Read the routing rules at `~/Memory/global/README.md` first if not already in context.

## Argument shape

Expected form: `/memory-promote <from-description> <to-destination>`

- **`<from-description>`**: a phrase identifying the source entry. Could be a quote, a topic name, or a date+timestamp (e.g. "today's 14:30 sql-server bullet"). If unclear, ask for clarification.
- **`<to-destination>`**: one of:
  - `<rule-name>` → `~/Memory/global/<rule-name>.md` (top-level rule file; one rule per file, kebab-case)
  - `tools/<X>` → `~/Memory/global/tools/<X>.md`
  - `domain/<X>` → `~/Memory/global/domain/<X>.md`
  - `repo/<rule-name>`, `repo/tools/<X>`, `repo/domain/<X>` → expands to `~/Memory/<repo-name>/...` where repo-name is
    the basename of the MAIN repo root (`git rev-parse --path-format=absolute --git-common-dir`, parent dir — worktree-safe).
    Requires cwd inside a git repo.
  - `wiki/<area>/<page>` → `~/Notes/wiki/<area>/<page>.md` — the curated canon. Promotion here means **translating**,
    not copying: German, the wiki's page format and rules per `~/Notes/CLAUDE.md`, and updating that area's `_index.md`,
    `_master-index.md`, and `log.md`. For durable reference knowledge only — agent operating rules
    (`feedback`/`user`/`tools`) never go to the wiki.
  - A literal path (advanced) → use as-is.

If $ARGUMENTS is empty, ask for both source and destination.

## Steps

1. **Identify the source entry**: search dailies first (`~/Memory/global/daily/*.md`), then global durables, then repo durables. If multiple matches, list them and ask which.

2. **Identify the target destination** from the second argument. If the destination is `repo/...` and cwd isn't in a git repo, abort with a clear message.

3. **Validate** against the routing rules:
   - "Would this fact still be true in a different project tomorrow?" → if yes but destination is repo, warn.
   - **Trust ladder**: only user-confirmed or repeatedly-observed facts get promoted — for a single observation, warn
     and suggest it stay in the daily.
   - Wiki destination: reference knowledge only; warn if the entry is an agent operating rule or still provisional.

4. **Show the proposed move**:
   - Source content (verbatim).
   - Destination path (and whether the file is being created or appended to).
   - Final shape of the destination file (or the relevant section).

5. **Wait for approval.**

6. **Apply**:
   - Write to destination (create file if missing, append/merge if existing).
   - **Remove the source entry**:
     - If source is a daily: remove the whole `## HH:MM — topic` section from the daily file. Content now lives in the destination; keeping it in the daily is duplication.
     - If source is a durable topic file: remove the entry from the source file.
   - Update `MEMORY.md` index in the destination store: bump the last-updated date for the destination file. If a new file was created, also add a new descriptive index entry.

## Constraints

- Do **not** modify `~/.claude/projects/<mapped-cwd>/memory/`.
- Single-item operation — if the user wants to move many things, suggest `/memory-dream` instead.
