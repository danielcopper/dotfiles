#!/usr/bin/env python3
"""PreToolUse(Bash) hook: commands that wipe a disk are refused outright.

The auto-mode classifier judges deletions with context and is the guard for
`rm`, `git reset --hard` and friends. It does not name filesystem creation
or raw device writes, and there is no session in which those are wanted
from an agent on this machine - so this hook denies them without asking:
mkfs, wipefs, dd onto a device node, a redirect onto a block device.

Token-based on purpose: heredoc bodies are dropped first (they are data),
then each `;`/`|`/`&`/newline segment is split into words and only the
command word counts (after sudo/env and friends), so `mkfs` mentioned
inside an echo or a heredoc does not match. `dd` counts only with an
`of=/dev/...` operand.
"""

import json
import os
import re
import sys

SEGMENT = re.compile(r"[|;&\r\n]+")
BLOCK_DEVICE = re.compile(r"^/dev/(sd|hd|nvme|mmcblk|vd|xvd|loop|md|dm-)")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")


def without_heredoc_bodies(command):
    """The command with every heredoc body removed - a body is data, not commands."""
    lines = command.split("\n")
    kept = []
    delimiter = None
    for line in lines:
        if delimiter is not None:
            if line.strip() == delimiter:
                delimiter = None
            continue
        kept.append(line)
        opened = HEREDOC.search(line)
        if opened:
            delimiter = opened.group(2)
    return "\n".join(kept)

# Prefixes that hand off to the real command: skipped, along with their
# leading options and VAR=value assignments.
WRAPPERS = {"sudo", "doas", "env", "nice", "nohup", "time", "command", "exec"}


def command_word(tokens):
    """(index, basename) of the command a segment runs, or None."""
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token.startswith("-") or "=" in token.split("/")[0]:
            i += 1
            continue
        if os.path.basename(token) in WRAPPERS:
            i += 1
            continue
        return i, os.path.basename(token)
    return None


def check(command):
    """The reason to refuse *command*, or None."""
    for segment in SEGMENT.split(without_heredoc_bodies(command)):
        tokens = segment.split()
        found = command_word(tokens)
        if found:
            at, name = found
            args = tokens[at + 1:]
            if name.startswith("mkfs") or name == "wipefs":
                return f"{name} wipes a disk"
            if name == "dd" and any(a.startswith("of=/dev/") for a in args):
                return "dd writes onto a device node"
        for i, token in enumerate(tokens):
            target = token[1:] if token.startswith(">") and len(token) > 1 else (
                tokens[i + 1] if token in (">", ">>") and i + 1 < len(tokens) else ""
            )
            if BLOCK_DEVICE.match(target.lstrip(">")):
                return "redirect onto a block device"
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    reason = check(command) if command else None
    if reason:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": reason,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
