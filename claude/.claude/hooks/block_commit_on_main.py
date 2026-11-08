#!/usr/bin/env python3
"""PreToolUse(Bash) hook: writes to protected branches are refused.

For `git commit` this is the early warning and the lock is elsewhere: the
global git pre-commit hook in ~/.githooks, which git runs inside the
repository it resolved itself and which aborts the commit outright. For
rebase, cherry-pick and revert there is no lock — git runs no pre-commit
hook for them, measured — so on those this is the only guard. It reads a
command line, so it can only judge what that line says.

Where the line pins its directory - `git -C <path>`, or a `cd` in an
earlier segment, including through a variable assigned in the same block -
the verdict is exact. Where it pins nothing, the fallback is the cwd the
harness reports, and that value can lag the shell: a command that commits
in a directory the harness has not noticed yet is judged against the old
one. Closing that would mean refusing every commit that does not name its
directory, which is most of them; the git hook covers it instead.

Repos whose work legitimately lives on main are read from the same list the
git hook uses, so the exemption is stated once.

The judgement is on raw text: every match of `GIT_COMMIT_RE` counts, quoted
or not, with the limits that brings (a `-C` path with a space, a write split
by a `\` line break, git options other than one `-C` and `-c` pairs). One
exception, for text that only names a write: a line is let through when
every match lies in text that `gh`, `az`, `echo`, `printf` or `cat` is
handed and does not run - a word that is wholly single-quoted, a wholly
double-quoted word with no `$` or backtick in it, or the body of a heredoc
whose delimiter is quoted - as the shell reader in `utils/published_text.py`
reads the line. Every other command on the line must be `cd`, so a line
with any other command (`make`, `./run.sh`, `bash`, `eval`, `sudo`, a `$`
word), or one the reader cannot read, gets no exception. A comment is not
such text.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "utils"))
from published_text import dequote, parse_commands  # noqa: E402

HOME = os.path.expanduser("~")
ALLOWLIST = os.path.join(HOME, ".githooks", "commit-on-main-allowed")

PROTECTED = re.compile(r"^(main|master|develop|release/.+)$")

# The operations that write a commit onto the current branch, also with
# leading -C <path> / -c <key=val> options. Only `commit` reaches git's own
# pre-commit hook; rebase, cherry-pick and revert write commits without it,
# so for those this hook is the only guard there is. `merge` is left out: on
# a protected branch it is nearly always the fast-forward half of a pull,
# which writes nothing, and git runs pre-merge-commit for the other half.
GIT_COMMIT_RE = re.compile(
    r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+(commit|rebase|cherry-pick|revert)\b"
)

# Steering an operation that is already running creates nothing.
CONTROL_FLAG = re.compile(r"--(abort|continue|skip|quit)\b")
GIT_DASH_C = re.compile(r"\bgit\s+-C\s+(\S+)")
CD = re.compile(r"^\s*\(*\s*cd\s+([^\s;&|]+)")

# Shell block anatomy, read the same way block_dangerous_bash.py reads it.
SEGMENT = re.compile(r"[|;&\r\n]+")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+|local\s+)?([A-Za-z_]\w*)=(.*)$")
VARIABLE = re.compile(r"\$\{(\w+)\}|\$(\w+)")


# Commands that print or publish the words they are handed and run none.
DATA_COMMANDS = {"gh", "az", "echo", "printf", "cat"}
SINGLE_QUOTED = re.compile(r"'[^']*'")
DOUBLE_QUOTED = re.compile(r'"(?:[^"\\$`]|\\.)*"', re.DOTALL)


def only_named_in_text(command: str) -> bool:
    """Whether every git write the raw *command* names lies in text a
    `DATA_COMMANDS` command is handed, on a line that runs nothing else but
    `cd` (the exception in the module docstring)."""
    named = [match.span() for match in GIT_COMMIT_RE.finditer(command)]
    try:
        commands = parse_commands(command, strict=True)
    except Exception:  # Unread means no exception: the raw judgement stands.
        return False
    text: list[tuple[int, int]] = []
    for simple in commands:
        words = simple.words
        lead = 0
        while lead < len(words) and ASSIGNMENT.match(words[lead]):
            lead += 1
        if lead == len(words):
            continue
        name = dequote(words[lead])
        if name == "cd":
            continue
        if name not in DATA_COMMANDS:
            return False
        for word, start in zip(words, simple.starts):
            if SINGLE_QUOTED.fullmatch(word) or DOUBLE_QUOTED.fullmatch(word):
                text.append((start, start + len(word)))
        for body, expands in zip(simple.heredocs, simple.heredoc_expands):
            # The first place the body's text stands: a wrong one leaves a
            # match uncovered, never one covered that is not text.
            at = command.find(body)
            if body and not expands and at >= 0:
                text.append((at, at + len(body)))
    return bool(named) and all(
        any(start <= begin and end <= stop for start, stop in text)
        for begin, end in named
    )


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


def commit_dirs(command: str, cwd: str) -> list[tuple[str, str]]:
    """(directory, operation) for every commit this block writes, segment by segment."""
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
        writing = GIT_COMMIT_RE.search(resolved)
        if not writing:
            continue
        operation = writing.group(1)
        if operation != "commit" and CONTROL_FLAG.search(resolved):
            continue
        pinned = GIT_DASH_C.search(resolved)
        here = resolve(pinned.group(1), current, variables) if pinned else current
        targets.append((here or current, operation))
    return targets


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command) or only_named_in_text(command):
        return 0

    exempt = allowed_repos()
    for directory, operation in commit_dirs(command, data.get("cwd") or "."):
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
                            f"This {operation} writes to protected branch '{branch}' "
                            f"in {directory}. Work on a worktree branch instead."
                        ),
                    }
                }
            )
        )
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
