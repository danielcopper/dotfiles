#!/usr/bin/env python3
"""
SessionStart hook: surface changes to ~/.claude/remote-settings.json
(company-applied org policy synced from Anthropic Console) by diffing
against a snapshot taken on previous session start.

Emits a styled diff via systemMessage (UI banner) and additionalContext
(model context). Secret-shaped values are redacted so tokens don't leak.
"""

import json
import re
import sys
from pathlib import Path

REMOTE = Path.home() / ".claude" / "remote-settings.json"
SNAPSHOT = Path.home() / ".claude" / "remote-settings.snapshot.json"

SECRET_KEY = re.compile(r"(token|auth|secret|password|key|header|credential)", re.I)

# ANSI styling. If Claude Code strips ANSI from systemMessage we'll fall back
# to no-color by setting USE_COLOR=False below.
USE_COLOR = True
BOLD_YELLOW = "\033[1;33m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"


def c(color, text):
    return f"{color}{text}{RESET}" if USE_COLOR else text


def load(path):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def fmt_value(value):
    return json.dumps(value, ensure_ascii=False)


def diff_dict(prev, curr, prefix=""):
    lines = []
    prev = prev or {}
    curr = curr or {}
    for key in sorted(set(prev) | set(curr)):
        full = f"{prefix}{key}"
        p, c_val = prev.get(key), curr.get(key)
        secret = bool(SECRET_KEY.search(key))

        if isinstance(p, dict) and isinstance(c_val, dict):
            lines.extend(diff_dict(p, c_val, prefix=f"{full}."))
            continue

        if key not in prev:
            verb = c(GREEN, "ADDED  ")
            tail = "(secret, redacted)" if secret else f"= {fmt_value(c_val)}"
            lines.append(f"  {verb}  {full}  {tail}")
        elif key not in curr:
            verb = c(RED, "REMOVED")
            tail = "(secret, redacted)" if secret else f"(was {fmt_value(p)})"
            lines.append(f"  {verb}  {full}  {tail}")
        elif p != c_val:
            verb = c(YELLOW, "CHANGED")
            if secret:
                lines.append(f"  {verb}  {full}  (secret, redacted)")
            else:
                lines.append(
                    f"  {verb}  {full}: {fmt_value(p)} → {fmt_value(c_val)}"
                )
    return lines


def banner(body_lines):
    header = c(BOLD_YELLOW, "⚠  POLICY CHANGED")
    return (
        f"{header}  (~/.claude/remote-settings.json)\n\n"
        + "\n".join(body_lines)
    )


def write_snapshot(data):
    try:
        SNAPSHOT.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    except OSError:
        pass


def emit(message):
    """Surface to user via systemMessage (UI banner) and to model via
    additionalContext (so it shows up in transcript context too)."""
    print(message, file=sys.stderr)
    print(json.dumps({
        "systemMessage": message,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": message,
        },
    }))


def main():
    try:
        sys.stdin.read()
    except Exception:
        pass

    curr = load(REMOTE) if REMOTE.exists() else None
    prev = load(SNAPSHOT) if SNAPSHOT.exists() else None

    if curr is None and prev is None:
        sys.exit(0)

    if curr is None and prev is not None:
        emit(
            c(BOLD_YELLOW, "⚠  POLICY REMOVED")
            + "  (~/.claude/remote-settings.json no longer present)"
        )
        try:
            SNAPSHOT.unlink()
        except OSError:
            pass
        sys.exit(0)

    if prev is None:
        write_snapshot(curr)
        sys.exit(0)

    if prev == curr:
        sys.exit(0)

    lines = diff_dict(prev, curr)
    if lines:
        emit(banner(lines))
    write_snapshot(curr)
    sys.exit(0)


if __name__ == "__main__":
    main()
