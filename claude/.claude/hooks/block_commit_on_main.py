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
comment is text and is not judged, unless a shell's `-c` or `eval` runs that
text (below). A command substitution is run by the shell even inside double
quotes (`"$(git commit ...)"`) and in a heredoc body whose delimiter is not
quoted (`<<EOF`, not `<<'EOF'`), so there it counts. A `cd` reaches only the
commands of its own subshell: one inside `( ... )`, `$( ... )` or backticks
does not move the commands after it. A line that names a git write and
cannot be read (nested too deep, say) is refused outright, in any repository.

Where the command word - after leading assignments and the prefixes `sudo`,
`env`, `command`, `exec`, `builtin`, `nohup` and `time` - is `eval`, or
`bash`, `sh`, `zsh` or `dash` with a `-c` among its options (`-lc`, `-ec`,
`-o pipefail -c`, `-c --`), the string it runs is read again as a command
line, starting in the directory of the command that runs it. The command's
own words are judged as well. A shell's string keeps its own scope: a `cd` or
an assignment in it stays there, and the assignments before the shell (or
given to `env`) are visible in it. `eval` runs in the same shell, so its `cd`
and assignments carry on to the commands after it. A string that is not on
the line - a lone variable nobody assigned, a lone `$(...)`, a `-c` with no
string - is judged as a write where it would run. Strings nested deeper
than `MAX_DEPTH` make the line unreadable, which is refused. Assignments
before a command (`FOO=1 git commit`) set nothing for later commands; a
command made only of assignments sets them all. A `cd` or `-C` operand that
stays unresolved, inside a string or not, is judged in the current
directory.

What it cannot judge: a write inside a string any other program runs
(`su -c "..."`, `python -c "..."`, `ssh host "..."`), because that string is
quoted text here; `eval` or a shell behind any other prefix (`nice`,
`timeout`, `xargs`); a `-c` string written as `$'...'`, whose escapes are not
decoded; and assignments before `eval`, which its string does not see here.
Nor does it tell a command from an argument: an unquoted mention
(`echo git commit`) still counts.

Repos whose work legitimately lives on main are read from the same list the
git hook uses, so the exemption is stated once.
"""

import json
import os
import re
import subprocess
import sys
from collections import deque
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "utils"))
from published_text import (  # noqa: E402
    SimpleCommand,
    dequote,
    expanded_commands,
    parse_commands,
)

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

# Shells whose `-c` string is read as a command line of its own.
SHELLS = {"bash", "sh", "zsh", "dash"}
# Shell options that take the next word as their value.
SHELL_VALUE_OPTIONS = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}

# Words that run the command after them, and those of their options that take
# the next word as a value.
PREFIXES = {
    "sudo": {"-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"},
    "env": {"-u", "-C"},
    "command": set(),
    "exec": {"-a"},
    "builtin": set(),
    "nohup": set(),
    "time": {"-f", "-o"},
}

# How deep strings run inside strings are read (`eval`, `bash -c`, a heredoc's
# substitutions); past it the line counts as unreadable.
MAX_DEPTH = 16

# The operation reported for a string a shell or `eval` runs that cannot be
# read, judged as a write where it runs.
UNREAD = "string it could not read"

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


class Unreadable(Exception):
    """Strings run inside strings nest deeper than `MAX_DEPTH`."""


def command_word(words: list[str]) -> tuple[int, dict[str, str]]:
    """The index of the command *words* run behind the `PREFIXES`, and the
    `NAME=value` words `env` gives it."""
    given: dict[str, str] = {}
    index = 0
    while index < len(words):
        prefix = os.path.basename(dequote(words[index]))
        if prefix not in PREFIXES:
            break
        index += 1
        while index < len(words):
            word = words[index]
            if word == "--":
                index += 1
                break
            if word.startswith("-"):
                index += 2 if word in PREFIXES[prefix] else 1
            elif prefix == "env" and (assigned := ASSIGNMENT.match(word)):
                given[assigned.group(1)] = assigned.group(2)
                index += 1
            else:
                break
    return index, given


def shell_script(words: list[str], index: int) -> tuple[bool, str | None]:
    """Whether the shell at `words[index]` runs a `-c` string, and the word
    that holds it (None when no word does)."""
    runs = False
    index += 1
    while index < len(words):
        word = dequote(words[index])
        if word in ("--", "-"):
            index += 1
            break
        if word in SHELL_VALUE_OPTIONS:
            index += 2
        elif word.startswith("--"):
            index += 1
        elif len(word) > 1 and word[0] in "-+":
            runs = runs or (word[0] == "-" and "c" in word[1:])
            index += 1
        else:
            break
    if not runs:
        return False, None
    return True, words[index] if index < len(words) else None


def script_text(text: str, variables: dict) -> str | None:
    """*text* as the command line it is, or None when it is a single variable
    nobody assigned or a single command substitution: then what runs is not on
    the line."""
    text = text.strip()
    whole = VARIABLE.fullmatch(text)
    if whole:
        return variables.get(whole.group(1) or whole.group(2))
    if (text.startswith("$(") and text.endswith(")")) or (
        len(text) > 1 and text.startswith("`") and text.endswith("`")
    ):
        return None
    return text


def place(places: dict[tuple[int, ...], str], group: tuple[int, ...], cwd: str) -> str:
    """Where a command in *group* runs: the last `cd` of its own or an enclosing subshell."""
    for depth in range(len(group), 0, -1):
        if group[:depth] in places:
            return places[group[:depth]]
    return cwd


def commit_dirs(
    command: str, cwd: str, variables: dict | None = None
) -> list[tuple[str, str]]:
    """Every distinct (directory, operation) this block writes, in order.

    *variables* are the enclosing line's, for a string that line runs; what the
    string assigns stays inside it. Raises `RecursionError` or `Unreadable` on
    nesting too deep to read.
    """
    found: list[tuple[str, str]] = []
    for target in judge(parse_commands(command, strict=True), cwd, variables, 0):
        if target not in found:
            found.append(target)
    return found


def evaluated(line: str, group: tuple[int, ...], tag: int):
    """The commands an `eval` in *group* runs, placed in that group: they run
    in the same shell, so a subshell of theirs is a subshell of *group*."""
    for inner in parse_commands(line, strict=True):
        nested = inner.group[1:]
        yield replace(inner, group=group + (-tag,) + nested if nested else group)


def judge(
    commands: list[SimpleCommand], cwd: str, variables: dict | None, depth: int
) -> list[tuple[str, str]]:
    """`commit_dirs` over commands already read, *depth* strings deep."""
    variables = {"HOME": HOME, "PWD": cwd} if variables is None else dict(variables)
    places: dict[tuple[int, ...], str] = {}
    targets = []
    queue = deque((simple, depth) for simple in commands)
    evals = 0
    while queue:
        simple, level = queue.popleft()
        if level > MAX_DEPTH:
            raise Unreadable
        group = simple.group
        current = place(places, group, cwd)
        for body, expands in zip(simple.heredocs, simple.heredoc_expands):
            if expands:
                inside = expanded_commands(body, strict=True)
                targets.extend(judge(inside, current, variables, level + 1))
        words = simple.words
        if words[0] in ("export", "local"):
            words = words[1:]
        assignments = []
        for word in words:
            assigned = ASSIGNMENT.match(word)
            if not assigned:
                break
            assignments.append(assigned.groups())
        if len(assignments) == len(words):
            for name, value in assignments:
                variables[name] = unquote(substitute(value.strip(), variables))
            continue
        # Assignments before a command are that command's environment only.
        words = words[len(assignments) :]
        if words[0] == "cd" and len(words) > 1:
            current = resolve(words[1], current, variables) or current
            places[group] = current
        start, given = command_word(words)
        runner = dequote(words[start]) if start < len(words) else ""
        if runner == "eval":
            arguments = [dequote(word) for word in words[start + 1 :]]
            line = script_text(" ".join(arguments), variables)
            if line is None:
                targets.append((current, UNREAD))
            else:
                evals += 1
                queue.extendleft(
                    (inner, level + 1)
                    for inner in reversed(list(evaluated(line, group, evals)))
                )
        elif os.path.basename(runner) in SHELLS:
            runs, script = shell_script(words, start)
            if runs:
                scoped = dict(variables)
                for name, value in [*assignments, *given.items()]:
                    scoped[name] = unquote(substitute(value.strip(), variables))
                line = None if script is None else script_text(dequote(script), scoped)
                if line is None:
                    targets.append((current, UNREAD))
                else:
                    inner = parse_commands(line, strict=True)
                    targets.extend(judge(inner, current, scoped, level + 1))
        writing = git_write(words)
        if not writing:
            continue
        operation, pinned, after = writing
        if operation != "commit" and any(CONTROL_FLAG.match(word) for word in after):
            continue
        here = resolve(pinned, current, variables) if pinned else current
        targets.append((here or current, operation))
    return targets


def deny(reason: str) -> None:
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


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    named = GIT_COMMIT_RE.search(command)
    if not named:
        return 0

    try:
        targets = commit_dirs(command, data.get("cwd") or ".")
    except Exception as error:  # A write that could not be read is refused.
        deny(
            f"This command names a git {named.group(1)} and could not be read "
            f"({type(error).__name__}), so where it writes is unknown. "
            "Split it into simpler commands."
        )
        return 0

    exempt = allowed_repos()
    for directory, operation in targets:
        if repo_root(directory) in exempt:
            continue
        branch = _git(directory, "branch", "--show-current")
        if branch is None or not PROTECTED.match(branch):
            continue
        deny(
            f"This {operation} writes to protected branch '{branch}' "
            f"in {directory}. Work on a worktree branch instead."
        )
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
