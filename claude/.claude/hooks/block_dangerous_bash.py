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
character and doesn't match. That scan cannot read code handed to an
interpreter, so a `-c`/`-e` one-liner or a heredoc is judged on its own:
a shell payload goes back through the full analysis with its quotes
stripped and keeps every verdict, another language asks as soon as its
payload names a deletion primitive. Only the payload is searched, and
the contents of a script file stay invisible.

No config, no state - edit this file to tune the pattern lists.
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

INLINE_FLAGS = {"-c", "-e", "-E", "--eval", "--command"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
LANGUAGES = {"python", "python2", "python3", "perl", "ruby", "node", "deno", "php", "lua"}
HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?\r?\n(.*?)\r?\n\s*\1", re.S)

# Filesystem-deletion primitives, as words. `remove` is deliberately absent:
# it is far more often a list operation than a file one, and the noise would
# swamp the signal. That is an accepted blind spot, as is a payload that
# builds the call name at runtime.
DELETE_CALL = re.compile(
    r"\brm\b|\brmSync\b|\brmdir\w*|\brmtree\b|\brm_rf\b|\bunlink\w*"
    r"|\bremovedirs\b|\bmkfs\b|\bwipefs\b"
)


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


def interpreter(tokens):
    """(name, index) of the first interpreter token in *tokens*, or None."""
    for index, token in enumerate(tokens):
        name = os.path.basename(token.strip("'\""))
        if name in SHELLS or name in LANGUAGES:
            return name, index
    return None


def opaque_code(command, cwd, depth):
    """The verdict on code an interpreter hides from the token scan, or None.

    The scan below reads `rm` as a token, so an inline payload slips past it:
    `python3 -c "shutil.rmtree(HOME)"` names no `rm` at all. A `-c`/`-e`
    one-liner or a heredoc is therefore judged on its own. A shell payload is
    shell syntax, so it goes back through the full analysis with its quotes
    stripped and keeps the precise verdict, deny included; another language is
    not ours to parse, so a deletion primitive in its payload asks - never
    denies, because the target cannot be resolved. Only the payload is
    searched, so an `rm` elsewhere on the line is still judged as itself.
    """
    tokens = command.split()
    found = interpreter(tokens)
    if not found or depth:
        return None
    name, index = found
    rest = tokens[index + 1:]
    inline = next((i for i, arg in enumerate(rest) if arg in INLINE_FLAGS), None)
    body = HEREDOC.search(command)
    if inline is not None:
        payload = " ".join(rest[inline + 1:])
    elif body:
        payload = body.group(2)
    else:
        return None
    if name in SHELLS:
        return check(payload.replace('"', " ").replace("'", " "), cwd, depth=1)
    if DELETE_CALL.search(payload):
        return ("ask", f"{name}: deletion driven through an interpreter the scan cannot parse - approve explicitly")
    return None


def check(command, cwd, depth=0):
    """('deny'|'ask', reason) for the worst command in the block, or None."""
    variables = {"HOME": HOME, "PWD": cwd}
    hidden = opaque_code(command, cwd, depth)
    if hidden:
        return hidden
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
