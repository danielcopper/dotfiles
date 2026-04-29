---
description: Move a specific memory entry to a durable destination. Validates against routing rules in memory/README.md.
argument-hint: "<from-description> <to-destination>  (e.g. 'sqlcmd quoting trick' tools/sql-server)"
---

# /memory-promote - Single-item promotion

You are running the `/memory-promote` command. The user wants to move one specific memory entry to one specific destination. Granular alternative to `/memory-dream`.

Read the routing rules at `~/.claude/memory/README.md` first if not already in context.

## Argument shape

Expected form: `/memory-promote <from-description> <to-destination>`

- **`<from-description>`**: a phrase identifying the source entry. Could be a quote, a topic name, or a date+timestamp (e.g. "today's 14:30 sql-server bullet"). If unclear, ask for clarification.
- **`<to-destination>`**: one of:
  - `general` → `~/.claude/memory/general.md`
  - `tools/<X>` → `~/.claude/memory/tools/<X>.md`
  - `domain/<X>` → `~/.claude/memory/domain/<X>.md`
  - `repo/general`, `repo/tools/<X>`, `repo/domain/<X>` → expands to `<git-root>/.claude/memory/...`. Requires cwd inside a git repo.
  - A literal path (advanced) → use as-is.

If $ARGUMENTS is empty, ask for both source and destination.

## Steps

1. **Identify the source entry**: search dailies first (`~/.claude/memory/daily/*.md`), then global durables, then repo durables. If multiple matches, list them and ask which.

2. **Identify the target destination** from the second argument. If the destination is `repo/...` and cwd isn't in a git repo, abort with a clear message.

3. **Validate** against the routing rules:
   - "Would this fact still be true in a different project tomorrow?" → if yes but destination is repo, warn.
   - "Would teammates benefit?" → if no but destination is repo, warn.
   - If the entry contains anything sensitive (secrets, in-flight personal observations, "I'm confused"), warn before promoting to a committed location.

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
