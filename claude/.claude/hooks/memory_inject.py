#!/usr/bin/env python3
"""
PreToolUse Memory Injection Hook

Injects memory content into Claude's context on the first tool call of each
session/subagent. Uses parent-pid marker files to ensure single-shot per process.

Sources, in order:
  1. Inline routing cheatsheet (constant below)
       — replaces the full ~/.claude/memory/README.md eager-inject (~83 lines)
       — the README stays as the canonical doc and is read on demand by the
         /memory-* skills when their workflows actually need the full ruleset
  2. ~/.claude/memory/MEMORY.md           personal global index (if exists)
  3. ~/.claude/memory/daily/<today>.md    today's running log (if exists)
  4. ~/.claude/memory/daily/<yest>.md     yesterday's running log (if exists)
  5. <git-root>/.claude/memory/MEMORY.md  per-repo index (if cwd in a git repo)
  6. ~/.claude/projects/<encoded-cwd>/memory/MEMORY.md  Anthropic auto-memory, read-only

Lazy-loading philosophy: eager-load only indices and time-bound running logs,
never topic-file bodies. Claude fetches `general.md`, `tools/<tool>.md`, etc.
on demand by matching the user's prompt against the index entries' keywords.

Failure mode: catch everything, exit 0, never block tool execution.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

MAX_INJECTION_CHARS = 30_000  # ~7-8k tokens, soft cap; truncates from the bottom

ROUTING_SUMMARY = """\
When you learn something worth recording, pick the destination:

1. True/useful across projects? → `~/.claude/memory/general.md`
2. Tool-specific quirk? → `~/.claude/memory/tools/<tool>.md`
3. Cross-tool conceptual knowledge? → `~/.claude/memory/domain/<topic>.md`
4. Repo-specific, team-useful? → `<repo>/.claude/memory/<file>.md` (committed)
5. Private/WIP or just-noted-today? → `~/.claude/memory/daily/<YYYY-MM-DD>.md`

Per-entry format for feedback/project memories: lead with the rule/fact,
then `**Why:**` (reason) and `**How to apply:**` lines. Link related
memories via `[[name]]`.

After creating or modifying a topic file: bump its `Updated:` date in
the corresponding `MEMORY.md` section; new files get a new section
with a keyword-dense description so future sessions match prompts to
the right file.

Full structure docs and slash-command behaviour: `~/.claude/memory/README.md`
(read on demand for `/memory-dream`, `/memory-consolidate`, `/memory-promote`).
"""


def log_event(event_type, details):
    """Append a JSONL log entry. Never raises."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "memory_injection.jsonl"
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            "details": details,
        }
        with open(log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def already_injected(ppid):
    """Check + set marker. Returns True if marker already existed."""
    marker = Path(f"/tmp/claude-memory-injected-{ppid}")
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
    """Return absolute path to git repo root containing cwd, or None."""
    try:
        result = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=2,
        )
        if result.returncode == 0:
            root = result.stdout.strip()
            return root or None
    except Exception:
        pass
    return None


def anthropic_memory_path(cwd):
    """Anthropic auto-memory location for this cwd. Encoding: '/' -> '-'."""
    encoded = cwd.replace("/", "-")
    return Path.home() / ".claude" / "projects" / encoded / "memory" / "MEMORY.md"


def collect_sections(cwd):
    """Return list of (header, content) tuples for available memory sources."""
    home = Path.home()
    memory_dir = home / ".claude" / "memory"
    sections = []

    sections.append(("Memory routing — quick reference", ROUTING_SUMMARY))

    index = read_file(memory_dir / "MEMORY.md")
    if index:
        sections.append(("Global memory index — `~/.claude/memory/MEMORY.md`", index))

    today = datetime.now().strftime("%Y-%m-%d")
    today_daily = read_file(memory_dir / "daily" / f"{today}.md")
    if today_daily:
        sections.append((f"Today's daily ({today}) — `~/.claude/memory/daily/{today}.md`", today_daily))

    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    yest_daily = read_file(memory_dir / "daily" / f"{yesterday}.md")
    if yest_daily:
        sections.append((f"Yesterday's daily ({yesterday}) — `~/.claude/memory/daily/{yesterday}.md`", yest_daily))

    git_root = get_git_root(cwd)
    if git_root:
        repo_mem = read_file(Path(git_root) / ".claude" / "memory" / "MEMORY.md")
        if repo_mem:
            sections.append((f"Repo memory — `{git_root}/.claude/memory/MEMORY.md`", repo_mem))

    anthropic = anthropic_memory_path(cwd)
    anthropic_content = read_file(anthropic, max_lines=80)
    if anthropic_content:
        sections.append((f"Anthropic auto-memory (read-only continuity) — `{anthropic}`", anthropic_content))

    return sections


def assemble(sections):
    """Concat sections with headers, hard-cap total length."""
    parts = []
    for header, content in sections:
        parts.append(f"## {header}\n\n{content}")
    text = "\n\n---\n\n".join(parts)
    if len(text) > MAX_INJECTION_CHARS:
        text = text[:MAX_INJECTION_CHARS] + "\n\n... (memory injection truncated due to size cap)"
    return text


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    try:
        ppid = os.getppid()
        if already_injected(ppid):
            log_event("skip_already_injected", {"ppid": ppid})
            sys.exit(0)

        cwd = data.get("cwd") or os.getcwd()
        sections = collect_sections(cwd)

        if not sections:
            log_event("nothing_to_inject", {"ppid": ppid, "cwd": cwd})
            sys.exit(0)

        text = assemble(sections)

        log_event("injected", {
            "ppid": ppid,
            "cwd": cwd,
            "section_count": len(sections),
            "chars": len(text),
            "session_id": data.get("session_id", ""),
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
