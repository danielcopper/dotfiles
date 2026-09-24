#!/usr/bin/env python3
"""
PreToolUse Memory Injection Hook

Injects the time- and place-bound memory slices into Claude's context on the
first tool call of a session. The always-true slices no longer live here:
the routing rules and the global index load natively via ~/.claude/CLAUDE.md
(inline section + @import), which also reaches subagents — something this
hook never could.

Sections, in order:
  1. ~/Memory/<repo-name>/MEMORY.md        per-repo index, in full (repo-name =
       basename of the MAIN repository root, so worktrees resolve to the same tier)
  2. ~/Memory/global/daily/<today>.md      today's entry headings (if any)
  3. ~/Memory/global/daily/<yest>.md       yesterday's entry headings (if any)

Lazy-loading philosophy: eager-load only indices, never bodies. The dailies
arrive as their `## HH:MM — slug` headings only; Claude reads the day's file
when a heading matters, the same way it fetches `<rule>.md`, `tools/<tool>.md`,
etc. on demand by matching the user's prompt against the index entries.

The output stays under Claude Code's limit for hook context: above 10,000
characters it is moved to a file and only a 2 KB preview reaches the model.
MAX_INJECTION_CHARS cuts below that, from the bottom, so the repo index goes
first and a cut costs daily headings before it costs the index.

Single-shot per session, keyed on the hook input's session_id (a resumed or
cleared session gets a fresh id and therefore a fresh injection). Falls back
to the parent pid if no session_id arrives.

Failure mode: catch everything, exit 0, never block tool execution.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

MAX_INJECTION_CHARS = 9_500  # hard cap (see the docstring)


def log_event(event_type, details):
    """Append a JSONL log entry. Never raises."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "memory_injection.jsonl"
        if log_file.exists() and log_file.stat().st_size > 10_000_000:
            log_file.replace(log_file.with_name(log_file.name + ".1"))
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            "details": details,
        }
        with open(log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def already_injected(key):
    """Check + set marker. Returns True if marker already existed."""
    marker = Path(f"/tmp/claude-memory-injected-{key}")
    if marker.exists():
        return True
    try:
        marker.touch()
    except Exception:
        pass
    return False


def read_file(path, max_lines=None):
    """Read file if it exists, optionally truncated. Returns str or None."""
    p = Path(path)
    if not p.is_file():
        return None
    try:
        text = p.read_text()
    except Exception:
        return None
    if max_lines:
        lines = text.splitlines()
        if len(lines) > max_lines:
            text = "\n".join(lines[:max_lines]) + f"\n\n... ({len(lines) - max_lines} more lines truncated)"
    return text


def get_git_root(cwd):
    """Absolute path to the MAIN repository root for cwd, or None.

    Uses --git-common-dir rather than --show-toplevel so a worktree resolves
    to the main repo root — its basename keys the ~/Memory/<repo-name>/ tier.
    """
    try:
        result = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=2,
        )
        if result.returncode == 0:
            common_dir = result.stdout.strip()
            if common_dir:
                return str(Path(common_dir).parent)
    except Exception:
        pass
    return None


def entry_headings(text):
    """The `## HH:MM — slug` headings of a daily, one per line."""
    return "\n".join(line[3:] for line in text.splitlines() if line.startswith("## "))


def collect_sections(cwd):
    """Return list of (header, content, path) tuples for available memory sources."""
    home = Path.home()
    memory_dir = home / "Memory" / "global"
    sections = []

    git_root = get_git_root(cwd)
    if git_root:
        repo_tier = home / "Memory" / Path(git_root).name
        repo_mem = read_file(repo_tier / "MEMORY.md")
        if repo_mem:
            path = f"{repo_tier}/MEMORY.md"
            sections.append((f"Repo memory — `{path}`", repo_mem, path))

    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    for label, day in (("Today's", today), ("Yesterday's", yesterday)):
        daily = read_file(memory_dir / "daily" / f"{day}.md")
        headings = entry_headings(daily) if daily else ""
        if headings:
            path = f"~/Memory/global/daily/{day}.md"
            sections.append((f"{label} daily ({day}), headings only — read `{path}` for an entry", headings, path))

    return sections


def assemble(sections):
    """Concat sections with headers, hard-cap total length.

    The cut note names every source, because the cut can remove a section
    together with the header that named its file.
    """
    parts = [f"## {header}\n\n{content}" for header, content, _ in sections]
    text = "\n\n---\n\n".join(parts)
    if len(text) > MAX_INJECTION_CHARS:
        sources = ", ".join(f"`{path}`" for _, _, path in sections)
        note = f"\n\n... (cut at the size cap — read the rest in {sources})"
        text = text[:MAX_INJECTION_CHARS - len(note)] + note
    return text


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    try:
        key = data.get("session_id") or f"ppid-{os.getppid()}"
        if already_injected(key):
            log_event("skip_already_injected", {"key": key})
            sys.exit(0)

        cwd = data.get("cwd") or os.getcwd()
        sections = collect_sections(cwd)

        if not sections:
            log_event("nothing_to_inject", {"key": key, "cwd": cwd})
            sys.exit(0)

        text = assemble(sections)

        log_event("injected", {
            "key": key,
            "cwd": cwd,
            "section_count": len(sections),
            "chars": len(text),
        })

        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": text,
            }
        }))
        sys.exit(0)

    except Exception as e:
        log_event("error", {"error": str(e)})
        sys.exit(0)


if __name__ == "__main__":
    main()
