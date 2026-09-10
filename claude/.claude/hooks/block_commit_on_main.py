#!/usr/bin/env python3
"""PreToolUse(Bash) hook: commits to protected branches need explicit approval.

Wired globally. Any `git commit` targeting main/master, develop, or
release/* triggers a permission prompt ("ask") — the user approves or
rejects. Feature/worktree branches pass untouched.

Repos where main *is* the working branch are exempt, listed by path
below. They are personal config repos whose own CLAUDE.md says to commit
straight to main, so the prompt would fire on every commit of a workflow
that was chosen deliberately.
"""

import json
import os
import re
import subprocess
import sys

PROTECTED = re.compile(r"^(main|master|develop|release/.+)$")

# git commit, also with leading -C <path> / -c <key=val> options
GIT_COMMIT_RE = re.compile(r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+commit\b")

# Repos where a commit on main needs no prompt. A plain list on purpose: no
# detection, no reading another repo's rules at runtime. Add a path here when a
# repo's own workflow puts the work on main.
MAIN_IS_THE_WORKING_BRANCH = {
    os.path.realpath(os.path.expanduser(path))
    for path in ("~/dotfiles", "~/Repos/homelab")
}


def target_dir(command: str, cwd: str) -> str:
    """Best-effort directory the git command runs in, expanded like the shell would."""
    m = re.search(r"(?:^|&&|;)\s*cd\s+([^\s;&|]+)", command) or re.search(r"git\s+-C\s+([^\s;&|]+)", command)
    if not m:
        return cwd or "."
    return os.path.expandvars(os.path.expanduser(m.group(1).strip("'\"")))


def _git(directory: str, *args: str) -> str | None:
    """git's stdout for *args* in *directory*, or None when it could not run."""
    try:
        done = subprocess.run(
            ["git", "-C", directory, *args],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout.strip() if done.returncode == 0 else None


def repo_root(directory: str) -> str | None:
    """The repository *directory* sits in, resolved through symlinks."""
    top = _git(directory, "rev-parse", "--show-toplevel")
    return os.path.realpath(top) if top else None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command):
        return 0
    directory = target_dir(command, data.get("cwd") or ".")
    if repo_root(directory) in MAIN_IS_THE_WORKING_BRANCH:
        return 0
    branch = _git(directory, "branch", "--show-current")
    if branch is None or not PROTECTED.match(branch):
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
