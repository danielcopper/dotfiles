#!/usr/bin/env python3
"""PreToolUse(Edit|Write|Bash) hook: a pending decision stops the work waiting on it.

An agent that asks a question it must not answer itself writes the question
into `.claude/DECISION-PENDING` at the root of the tree it works in. While
that file exists, this hook refuses every tool that could change that tree
and hands the question back as the reason.

The point is the asymmetry. An agent can stop itself; it cannot start
itself again, because removing the marker is a write in the same tree and
is refused too. Only the answer removes it - from outside, by the lead or
the owner.

Scope is the tree, not the machine. The search walks up from the path a
call names and stops at the first directory holding a `.git` entry, so a
marker in a worktree binds that worktree and a marker in the main checkout
binds the main checkout. A lead in one tree and an agent in another do not
see each other's markers.

Reading is untouched: Read, Grep and Glob carry no marker check, so an
agent can still finish its report and answer questions about what it found.
"""

import json
import os
import re
import sys

MARKER = os.path.join(".claude", "DECISION-PENDING")
CD = re.compile(r"^\s*\(*\s*cd\s+([^\s;&|]+)")
WRITES_A_PATH = ("Edit", "Write", "NotebookEdit", "MultiEdit")


def pending_marker(start: str) -> str | None:
    """The marker governing *start*, searching up to its tree root."""
    directory = os.path.realpath(start)
    while True:
        candidate = os.path.join(directory, MARKER)
        if os.path.isfile(candidate):
            return candidate
        if os.path.exists(os.path.join(directory, ".git")):
            return None  # Tree root reached: a marker above binds another tree.
        parent = os.path.dirname(directory)
        if parent == directory:
            return None
        directory = parent


def target_of(data: dict) -> str | None:
    """The directory a call would act in, or None when the tool cannot change a tree."""
    tool = data.get("tool_name") or ""
    tool_input = data.get("tool_input") or {}
    if tool in WRITES_A_PATH:
        path = tool_input.get("file_path") or tool_input.get("notebook_path")
        return os.path.dirname(os.path.abspath(path)) if path else None
    if tool == "Bash":
        cwd = data.get("cwd") or "."
        moved = CD.match(tool_input.get("command") or "")
        if moved:
            token = moved.group(1).strip("'\"")
            if "$" not in token and "`" not in token:
                return os.path.normpath(os.path.join(cwd, os.path.expanduser(token)))
        return cwd
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    target = target_of(data)
    if not target:
        return 0
    marker = pending_marker(target)
    if not marker:
        return 0
    try:
        with open(marker) as handle:
            question = handle.read().strip()
    except OSError:
        question = ""
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "A decision is pending for this tree and nothing may be "
                        "changed until it is answered. You cannot lift this "
                        "yourself - the answer does. Report that you are waiting, "
                        "and take no other task. The open question is:\n\n"
                        f"{question or '(the marker names no question)'}"
                    ),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
