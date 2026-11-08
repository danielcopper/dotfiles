#!/usr/bin/env python3
"""PreToolUse(Bash) hook: writes to protected branches are refused.

For `git commit` this is the early warning and the lock is elsewhere: the
global git pre-commit hook in ~/.githooks, which git runs inside the
repository it resolved itself and which aborts the commit outright. For
rebase, cherry-pick and revert there is no lock — git runs no pre-commit
hook for them, measured — so on those this is the only guard. It reads a
command line, so it can only judge what that line says.

Where the line pins its directory - `git -C <path>`, or a `cd` in an
earlier command, including through a variable assigned in the same block -
the verdict is exact. Where it pins nothing, the fallback is the cwd the
harness reports, and that value can lag the shell: a command that commits
in a directory the harness has not noticed yet is judged against the old
one. Closing that would mean refusing every commit that does not name its
directory, which is most of them; the git hook covers it instead.

It reads the line with the shell reader the publishing hooks share
(`utils/published_text.py`), so only what the shell would run counts: a git
write named inside single or double quotes, in a heredoc body or in a
comment is text and is not judged. A command substitution is run by the
shell even inside double quotes (`"$(git commit ...)"`), so it counts. A `cd`
reaches only the commands of its own subshell: one inside `( ... )`, `$( ... )`
or backticks does not move the commands after it.

What it cannot judge: a write inside a string another program runs
(`bash -c "git rebase main"`, `eval "..."`), because that string is quoted
text here. Nor does it tell a command from an argument: an unquoted mention
(`echo git commit`) still counts.

Repos whose work legitimately lives on main are read from the same list the
git hook uses, so the exemption is stated once.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "utils"))
from published_text import parse_commands  # noqa: E402

HOME = os.path.expanduser("~")
ALLOWLIST = os.path.join(HOME, ".githooks", "commit-on-main-allowed")

PROTECTED = re.compile(r"^(main|master|develop|release/.+)$")

# The operations that write a commit onto the current branch, also with
# leading -C <path> / -c <key=val> options. Only `commit` reaches git's own
# pre-commit hook; rebase, cherry-pick and revert write commits without it,
# so for those this hook is the only guard there is. `merge` is left out: on
# a protected branch it is nearly always the fast-forward half of a pull,
# which writes nothing, and git runs pre-merge-commit for the other half.
# Searched over the raw line only to let every other Bash call pass before
# the line is read; quoted text matches it too.
GIT_COMMIT_RE = re.compile(
    r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+(commit|rebase|cherry-pick|revert)\b"
)
# The same shape, word by word.
GIT_WORD = re.compile(r"(?<!\w)git$")
OPERATION = re.compile(r"(commit|rebase|cherry-pick|revert)\b")

# Steering an operation that is already running creates nothing.
CONTROL_FLAG = re.compile(r"--(abort|continue|skip|quit)\b")

ASSIGNMENT = re.compile(r"([A-Za-z_]\w*)=(.*)$", re.DOTALL)
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


def git_write(words: list[str]) -> tuple[str, str | None, list[str]] | None:
    """(operation, -C operand or None, the words after it) for a git write in *words*."""
    for index, word in enumerate(words):
        if not GIT_WORD.search(word):
            continue
        rest = words[index + 1 :]
        directory = None
        if len(rest) > 1 and rest[0] == "-C":
            directory, rest = rest[1], rest[2:]
        while len(rest) > 1 and rest[0] == "-c":
            rest = rest[2:]
        operation = OPERATION.match(rest[0]) if rest else None
        if operation:
            return operation.group(1), directory, rest[1:]
    return None


def place(places: dict[tuple[int, ...], str], group: tuple[int, ...], cwd: str) -> str:
    """Where a command in *group* runs: the last `cd` of its own or an enclosing subshell."""
    for depth in range(len(group), 0, -1):
        if group[:depth] in places:
            return places[group[:depth]]
    return cwd


def commit_dirs(command: str, cwd: str) -> list[tuple[str, str]]:
    """(directory, operation) for every commit this block writes, command by command."""
    variables = {"HOME": HOME, "PWD": cwd}
    places: dict[tuple[int, ...], str] = {}
    targets = []
    for simple in parse_commands(command):
        group = simple.group
        current = place(places, group, cwd)
        words = simple.words
        if words[0] in ("export", "local"):
            words = words[1:]
        if not words:
            continue
        assigned = ASSIGNMENT.match(words[0])
        if assigned:
            name, value = assigned.groups()
            variables[name] = unquote(substitute(value.strip(), variables))
            continue
        if words[0] == "cd" and len(words) > 1:
            current = resolve(words[1], current, variables) or current
            places[group] = current
        writing = git_write(words)
        if not writing:
            continue
        operation, pinned, after = writing
        if operation != "commit" and any(CONTROL_FLAG.match(word) for word in after):
            continue
        here = resolve(pinned, current, variables) if pinned else current
        targets.append((here or current, operation))
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
