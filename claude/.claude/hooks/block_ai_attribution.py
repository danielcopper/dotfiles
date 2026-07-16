#!/usr/bin/env python3
"""PreToolUse(Bash) hook: keep AI attribution out of git commit messages.

Blocks `git commit` commands whose message text carries attribution
markers (Co-Authored-By trailers, "Generated with", robot emoji,
anthropic noreply address). Commit messages stay plain Conventional
Commits. Exit 2 blocks the call; anything else lets it through.
"""

import json
import re
import sys

# git commit, also with leading -C <path> / -c <key=val> options
GIT_COMMIT_RE = re.compile(r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+commit\b")

PATTERNS = [
    (r"[Cc]o-[Aa]uthored-[Bb]y", "Co-Authored-By trailer"),
    (r"[Gg]enerated with", '"Generated with" attribution'),
    (r"\U0001F916", "robot emoji"),
    (r"noreply@anthropic\.com", "anthropic noreply address"),
]


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command):
        return 0
    for pattern, label in PATTERNS:
        if re.search(pattern, command):
            print(
                f"Blocked: the commit command carries AI attribution ({label}). "
                "Commit with a plain Conventional-Commit message: "
                "<type>(<scope>): <description>, optional plain body - "
                "no attribution trailers.",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
