#!/usr/bin/env python3
"""PreToolUse(Bash) hook: destructive commands need explicit approval.

Every `rm` is judged by where its operands resolve to, not by its flags:
below the session's cwd or /tmp is disposable and passes, anything else
prompts ("ask"), and a recursive delete of a filesystem root, $HOME, the
cwd itself or its bare wildcard is denied outright - as are disk-wipe
commands (mkfs, dd or a redirect onto a block device, wipefs).

A multi-line script is judged per command (split on newlines as well as
`;`, `|`, `&`). Variables assigned earlier in the same command
(`S=/tmp/x; rm -rf "$S"`) are resolved first, seeded with HOME and PWD;
an operand that stays opaque (`$(mktemp -d)`, `{}` from find -exec, or
none at all as with `xargs rm`) asks when the delete is recursive.
Relative paths resolve against the hook's cwd - a `cd` earlier in the
same command is not tracked, which is the accepted blind spot.

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
    "/", HOME, "/home", "/root", "/etc", "/usr", "/var", "/boot", "/bin",
    "/sbin", "/lib", "/lib64", "/opt", "/srv", "/dev", "/sys", "/proc",
}

# Deleting below these passes; the root itself or `root/*` still asks.
SAFE_ROOTS = ("/tmp", "/var/tmp")

DISK_WIPE = re.compile(
    r"\bmkfs(\.\w+)?\b"                # mkfs, mkfs.ext4, ...
    r"|\bdd\b[^|;&]*\bof=/dev/"        # dd writing to a device node
    r"|\bwipefs\b"
    r"|>\s*/dev/(sd|hd|nvme|mmcblk)"   # redirect onto a block device
)

SEGMENT = re.compile(r"[|;&\r\n]+")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+|local\s+)?([A-Za-z_]\w*)=(.*)$")
VARIABLE = re.compile(r"\$\{(\w+)\}|\$(\w+)")

RANK = {"ask": 1, "deny": 2}


def substitute(text, variables):
    return VARIABLE.sub(
        lambda m: variables.get(m.group(1) or m.group(2), m.group(0)), text
    )


def unquote(token):
    return token.replace('"', "").replace("'", "")


def is_rm(tokens, i):
    name = tokens[i]
    if name not in ("rm", "\\rm") and not name.endswith("/rm"):
        return False
    # git rm only removes tracked files, which HEAD can restore.
    return not (i > 0 and tokens[i - 1] == "git")


def is_catastrophic(path):
    return path in CATASTROPHIC or (path.endswith("/*") and (path[:-2] or "/") in CATASTROPHIC)


def below(path, root):
    return path.startswith(root + "/") and path != root + "/*"


def judge(operand, cwd):
    """('protected'|'opaque'|'outside', path) for one rm operand, or None if disposable."""
    target = unquote(operand)
    if not target:
        return None
    if "$" in target or "`" in target or target == "{}":
        return ("opaque", target)
    path = os.path.normpath(os.path.join(cwd, os.path.expanduser(target)))
    if is_catastrophic(path) or path in (cwd, cwd + "/*"):
        return ("protected", path)
    if any(below(path, root) for root in (cwd, *SAFE_ROOTS)):
        return None
    return ("outside", path)


def check(command, cwd):
    """('deny'|'ask', reason) for the worst command in the block, or None."""
    variables = {"HOME": HOME, "PWD": cwd}
    worst = None

    def escalate(decision, reason):
        nonlocal worst
        if worst is None or RANK[decision] > RANK[worst[0]]:
            worst = (decision, reason)

    for segment in SEGMENT.split(command):
        assigned = ASSIGNMENT.match(segment)
        if assigned:
            name, value = assigned.groups()
            variables[name] = unquote(substitute(value.strip(), variables))
        segment = substitute(segment, variables)
        if DISK_WIPE.search(segment):
            return ("deny", "disk-wipe pattern (mkfs / dd or redirect onto a block device / wipefs)")
        tokens = segment.split()
        at = next((i for i in range(len(tokens)) if is_rm(tokens, i)), None)
        if at is None:
            continue
        args = tokens[at + 1:]
        flags = [t for t in args if t.startswith("-")]
        short = "".join(f for f in flags if not f.startswith("--"))
        recursive = "r" in short or "R" in short or "--recursive" in flags
        operands = [t for t in args if not t.startswith("-")]
        if recursive and not operands:
            escalate("ask", "recursive delete with no explicit target (stdin/xargs) - approve explicitly")
        for operand in operands:
            verdict = judge(operand, cwd)
            if verdict is None:
                continue
            kind, path = verdict
            if kind == "protected" and recursive:
                return ("deny", f"recursive delete of protected path '{path}'")
            if kind == "protected":
                escalate("ask", f"delete of protected path '{path}' - approve explicitly")
            elif kind == "opaque" and recursive:
                escalate("ask", f"recursive delete with unresolved target '{path}' - approve explicitly")
            elif kind == "outside":
                escalate("ask", f"'{path}' is not below cwd or /tmp - approve explicitly")
    return worst


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not command:
        return 0
    cwd = os.path.normpath(data.get("cwd") or os.getcwd())
    verdict = check(command, cwd)
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
