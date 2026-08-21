#!/usr/bin/env python3
"""PreToolUse(Bash) hook: destructive commands need explicit approval.

Successor to the retired pre_tool_use.py guard, which read a wrong input
shape and never fired. Recursive force-deletes (rm -rf) trigger a
permission prompt ("ask"); recursive deletes aimed at filesystem roots,
$HOME, or bare wildcards and disk-wipe commands (mkfs, dd or a redirect
onto a block device, wipefs) are denied outright.

Token-based on purpose: `rm` inside a quoted string keeps its quote
character and doesn't match. No config, no state - edit this file to
tune the pattern lists.
"""

import json
import os
import re
import sys

HOME = os.path.expanduser("~")

# Recursive deletion of these is never waved through.
CATASTROPHIC = {
    "/", "/*", "~", "$HOME", "${HOME}", "*", "./*", HOME,
    "/home", "/root", "/etc", "/usr", "/var", "/boot", "/bin",
    "/sbin", "/lib", "/lib64", "/opt", "/srv", "/dev", "/sys", "/proc",
}

DISK_WIPE = re.compile(
    r"\bmkfs(\.\w+)?\b"                # mkfs, mkfs.ext4, ...
    r"|\bdd\b[^|;&]*\bof=/dev/"        # dd writing to a device node
    r"|\bwipefs\b"
    r"|>\s*/dev/(sd|hd|nvme|mmcblk)"   # redirect onto a block device
)


def normalize(target):
    """Strip quotes and trailing slashes so /etc/ and /etc compare equal."""
    target = target.strip("'\"")
    if len(target) > 1:
        target = target.rstrip("/") or "/"
    return target


def is_catastrophic(target):
    if target in CATASTROPHIC:
        return True
    # /etc/* etc.: wildcard directly under a protected root
    return target.endswith("/*") and target[:-2] in CATASTROPHIC


def check_rm(command):
    """('deny'|'ask', reason) for the worst rm in the command, or None."""
    worst = None
    for segment in re.split(r"[|;&]+", command):
        tokens = segment.split()
        if "rm" not in tokens:
            continue
        args = tokens[tokens.index("rm") + 1:]
        flags = [t for t in args if t.startswith("-")]
        targets = [normalize(t) for t in args if not t.startswith("-")]
        short = "".join(f for f in flags if not f.startswith("--"))
        recursive = "r" in short or "R" in short or "--recursive" in flags
        force = "f" in short or "--force" in flags
        if not recursive:
            continue
        bad = [t for t in targets if is_catastrophic(t)]
        if bad:
            return ("deny", f"recursive delete of protected path '{bad[0]}'")
        if force:
            worst = ("ask", "recursive force delete (rm -rf) - approve explicitly")
    return worst


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not command:
        return 0
    if DISK_WIPE.search(command):
        verdict = ("deny", "disk-wipe pattern (mkfs / dd or redirect onto a block device / wipefs)")
    else:
        verdict = check_rm(command)
    if verdict:
        decision, reason = verdict
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": decision,
                        "permissionDecisionReason": reason,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
