#!/usr/bin/env python3
"""PreToolUse(Bash) hook: commits to protected branches need explicit approval.

Wired globally. Any `git commit` targeting main/master, develop, or
release/* triggers a permission prompt ("ask") — the user approves or
rejects. Feature/worktree branches pass untouched.
"""

import json
import os
import re
import subprocess
import sys

PROTECTED = re.compile(r"^(main|master|develop|release/.+)$")

# git commit, also with leading -C <path> / -c <key=val> options
GIT_COMMIT_RE = re.compile(r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+commit\b")


def target_dir(command: str, cwd: str) -> str:
    """Best-effort directory the git command runs in, expanded like the shell would."""
    m = re.search(r"(?:^|&&|;)\s*cd\s+([^\s;&|]+)", command) or re.search(r"git\s+-C\s+([^\s;&|]+)", command)
    if not m:
        return cwd or "."
    return os.path.expandvars(os.path.expanduser(m.group(1).strip("'\"")))


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command):
        return 0
    directory = target_dir(command, data.get("cwd") or ".")
    try:
        branch = subprocess.run(
            ["git", "-C", directory, "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        ).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 0
    if not PROTECTED.match(branch):
        return 0
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": (
                        f"This commit targets protected branch '{branch}' - "
                        "approve it explicitly, or work on a worktree branch."
                    ),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
