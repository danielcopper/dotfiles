#!/usr/bin/env python3
"""PreToolUse(Bash) hook: commits to protected branches are refused.

This is the early warning, not the lock. The lock is the global git
pre-commit hook in ~/.githooks, which git runs inside the repository it
resolved itself and which aborts the commit outright. This hook reads a
command line instead, so it can only judge what that line says.

Where the line pins its directory - `git -C <path>`, or a `cd` in an
earlier segment, including through a variable assigned in the same block -
the verdict is exact. Where it pins nothing, the fallback is the cwd the
harness reports, and that value can lag the shell: a command that commits
in a directory the harness has not noticed yet is judged against the old
one. Closing that would mean refusing every commit that does not name its
directory, which is most of them; the git hook covers it instead.

Repos whose work legitimately lives on main are read from the same list the
git hook uses, so the exemption is stated once.
"""

import json
import os
import re
import subprocess
import sys

HOME = os.path.expanduser("~")
ALLOWLIST = os.path.join(HOME, ".githooks", "commit-on-main-allowed")

PROTECTED = re.compile(r"^(main|master|develop|release/.+)$")

# git commit, also with leading -C <path> / -c <key=val> options
GIT_COMMIT_RE = re.compile(r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+commit\b")
GIT_DASH_C = re.compile(r"\bgit\s+-C\s+(\S+)")
CD = re.compile(r"^\s*\(*\s*cd\s+([^\s;&|]+)")

# Shell block anatomy, read the same way block_dangerous_bash.py reads it.
SEGMENT = re.compile(r"[|;&\r\n]+")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+|local\s+)?([A-Za-z_]\w*)=(.*)$")
VARIABLE = re.compile(r"\$\{(\w+)\}|\$(\w+)")


def substitute(text, variables):
    return VARIABLE.sub(
        lambda m: variables.get(m.group(1) or m.group(2), m.group(0)), text
    )


def unquote(token):
    return token.replace('"', "").replace("'", "").strip("()")


def allowed_repos():
    """Repo paths whose work belongs on main, from the list the git hook reads."""
    try:
        with open(ALLOWLIST) as handle:
            lines = handle.readlines()
    except OSError:
        return set()  # No list means no exemptions - the loud direction.
    paths = set()
    for line in lines:
        entry = line.split("#", 1)[0].strip()
        if entry:
            paths.add(os.path.realpath(os.path.expanduser(entry)))
    return paths


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


def resolve(token: str, current: str, variables: dict) -> str | None:
    """A cd or -C operand as a path, or None when it stays unresolved."""
    target = unquote(substitute(token, variables))
    if not target or "$" in target or "`" in target:
        return None
    return os.path.normpath(os.path.join(current, os.path.expanduser(target)))


def commit_dirs(command: str, cwd: str) -> list[str]:
    """Every directory this block commits in, walked segment by segment."""
    variables = {"HOME": HOME, "PWD": cwd}
    current = cwd
    targets = []
    for segment in SEGMENT.split(command):
        assigned = ASSIGNMENT.match(segment)
        if assigned:
            name, value = assigned.groups()
            variables[name] = unquote(substitute(value.strip(), variables))
            continue
        moved = CD.match(segment)
        if moved:
            current = resolve(moved.group(1), current, variables) or current
        resolved = substitute(segment, variables)
        if not GIT_COMMIT_RE.search(resolved):
            continue
        pinned = GIT_DASH_C.search(resolved)
        here = resolve(pinned.group(1), current, variables) if pinned else current
        targets.append(here or current)
    return targets


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command):
        return 0

    exempt = allowed_repos()
    for directory in commit_dirs(command, data.get("cwd") or "."):
        if repo_root(directory) in exempt:
            continue
        branch = _git(directory, "branch", "--show-current")
        if branch is None or not PROTECTED.match(branch):
            continue
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            f"This commit targets protected branch '{branch}' in "
                            f"{directory}. Work on a worktree branch instead."
                        ),
                    }
                }
            )
        )
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
