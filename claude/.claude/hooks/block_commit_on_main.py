#!/usr/bin/env python3
"""PreToolUse(Bash) hook: writes to protected branches are refused.

It reads a command line, so it can only judge what that line says. For
`git commit` it is the early warning and the lock is elsewhere: the global
git pre-commit hook in ~/.githooks, which git runs inside the repository it
resolved itself and which aborts the commit outright. Rebase, cherry-pick
and revert run no pre-commit hook, so for those this hook is the only guard.

Where a write runs. A `git -C <path>`, or a `cd <path>` in an earlier
command - also through a variable assigned on the same line - sets the
directory a write is judged in. Where the line sets none, or the path stays
unresolved, the write is judged in the cwd the harness reports, and that
value can lag the shell: a commit in a directory the harness has not noticed
yet is judged against the old one. Closing that would mean refusing every
write that does not name its directory, which is most of them; for
`git commit` the git hook covers it, for the other three nothing does.

What counts. The line is read with the shell reader in
`utils/published_text.py`, so only what the shell would run counts: a git
write named in single or double quotes, in a heredoc body or in a comment
is text, unless something runs that text (below). A command substitution
runs even inside double quotes (`"$(git commit ...)"`) and in a heredoc body
whose delimiter is unquoted (`<<EOF`, not `<<'EOF'`), so there it counts. A
`cd` reaches only the commands of its own subshell: one inside `( ... )`,
`$( ... )` or backticks moves nothing after it.

Scripts that run. Where the command word - after leading assignments and
the prefixes `sudo`, `env`, `command`, `exec`, `builtin`, `nohup` and
`time`, each with the words after it that start with `-` (and env's
`NAME=value`) - is `eval` or one of `bash`, `sh`, `zsh` and `dash`, the
script it runs is read as a command line of its own, starting where that
command runs: the arguments of `eval`; a shell's `-c` string (also `-lc`,
`-ec`, `-o pipefail -c`, `-c --`); for a shell without `-c`, the heredoc
bodies or here-string it reads on stdin. The command's own words are judged
as well. A shell's script keeps its own scope: its `cd` and assignments stay
in it, and the assignments before the shell (or given to `env`) are visible
in it. `eval` runs in the same shell, so its `cd` and assignments carry on
to the commands after it. A script that is not on the line - a lone
variable nobody assigned, a lone `$(...)`, a `-c` with no string, a shell
fed by a pipe or by `< file` - is reported as unknown where it would run,
and a protected branch there refuses it. Assignments before a command
(`FOO=1 git commit`) set nothing for later commands; a command made only of
assignments sets them all.

All of this is read only on a line whose text names a git write
(`GIT_COMMIT_RE`), so a script that is not on a line which names none passes
unread. A line that names one and cannot be read at all (nested too deep,
say) is refused outright, in any repository.

What it cannot judge:

- git with global options other than one leading `-C <path>` followed by
  `-c <key=val>` pairs (`--no-pager`, `-P`, `--git-dir=...`, `-c` before
  `-C`, a second `-C`), git named through a variable (`$G commit`), and a
  command word in quotes or split (`"git" commit`, `g""it`);
- `cd` with options (`cd -P x`) and `cd -`, read as a move into a directory
  of that name, and `pushd`/`popd`, not read at all; an assignment inside a
  subshell, which here reaches the commands after it;
- a string any other program runs (`su -c "..."`, `python -c "..."`,
  `ssh host "..."`); `eval` or a shell behind any other prefix (`nice`,
  `timeout`, `xargs`) or behind a prefix option with a separate value
  (`sudo -u root bash -c ...`); a shell running a script file
  (`bash deploy.sh`); a `-c` string written as `$'...'`, whose escapes are
  not decoded; and assignments before `eval`, which its script does not see
  here.

It also reads more than git writes: `git commit-tree` counts as a commit,
and so does an unquoted mention in another command's arguments
(`echo git commit`).

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

# The operations that write a commit onto the current branch, with one
# leading -C <path> and then -c <key=val> pairs. `merge` is left out: on a
# protected branch it is nearly always the fast-forward half of a pull, which
# writes nothing, and git runs pre-merge-commit for the other half. Searched
# over the raw line only to let every other Bash call pass before the line is
# read; quoted text matches it too.
GIT_COMMIT_RE = re.compile(
    r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+(commit|rebase|cherry-pick|revert)\b"
)
# The same shape, word by word.
GIT_WORD = re.compile(r"(?<!\w)git$")
OPERATION = re.compile(r"(commit|rebase|cherry-pick|revert)\b")

# Steering an operation already running is let through: the operation was
# judged when it started.
CONTROL_FLAG = re.compile(r"--(abort|continue|skip|quit)\b")

ASSIGNMENT = re.compile(r"([A-Za-z_]\w*)=(.*)$", re.DOTALL)

# Shells whose script is read as a command line of its own.
SHELLS = {"bash", "sh", "zsh", "dash"}
# Shell options that take the next word as their value.
SHELL_VALUE_OPTIONS = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}
# A redirection word: the operator alone (`<`, `2>`) or with its target.
REDIRECTION = re.compile(r"\d*(?:<<<|<>|<&|>&|&>>?|>>?|<)")
# A redirection that feeds stdin from a file.
FROM_FILE = re.compile(r"\d*<(?![<&>(])")

# Words that run the command after them.
PREFIXES = {"sudo", "env", "command", "exec", "builtin", "nohup", "time"}

# The operation reported for a script that is not on the line, judged where it
# would run.
UNREAD = "script that is not on the line"

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
            if word.startswith("-"):
                index += 1
            elif prefix == "env" and (assigned := ASSIGNMENT.match(word)):
                given[assigned.group(1)] = assigned.group(2)
                index += 1
            else:
                break
    return index, given


def shell_script(words: list[str], index: int) -> tuple[bool, str | None]:
    """Whether the shell at `words[index]` runs a `-c` string, and its first
    operand: that string, or else a script file (None when there is none)."""
    runs = False
    index += 1
    while index < len(words):
        word = dequote(words[index])
        redirection = REDIRECTION.match(word)
        if redirection:
            index += 2 if redirection.end() == len(word) else 1
        elif word in ("--", "-"):
            index += 1
            break
        elif word in SHELL_VALUE_OPTIONS:
            index += 2
        elif word.startswith("--"):
            index += 1
        elif len(word) > 1 and word[0] in "-+":
            runs = runs or (word[0] == "-" and "c" in word[1:])
            index += 1
        else:
            break
    return runs, words[index] if index < len(words) else None


def stdin_scripts(
    simple: SimpleCommand, words: list[str], start: int, variables: dict
) -> list[str | None]:
    """What the shell at `words[start]`, without `-c`, reads on stdin from this
    line: its heredoc bodies and here-strings, or [None] when a pipe or a file
    feeds it."""
    here = [
        script_text(dequote(words[index + 1]), variables)
        for index in range(start, len(words) - 1)
        if words[index] == "<<<"
    ]
    if simple.heredocs or here:
        return [*simple.heredocs, *here]
    if simple.piped or any(FROM_FILE.match(word) for word in words[start + 1 :]):
        return [None]
    return []


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


def commit_dirs(command: str, cwd: str) -> list[tuple[str, str]]:
    """Every distinct (directory, operation) this block writes, in order.

    Raises `RecursionError` on nesting too deep to read.
    """
    found: list[tuple[str, str]] = []
    for target in judge(parse_commands(command, strict=True), cwd, None):
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
    commands: list[SimpleCommand], cwd: str, variables: dict | None
) -> list[tuple[str, str]]:
    """`commit_dirs` over commands already read, with the *variables* of the
    line that runs them (None at the top)."""
    variables = {"HOME": HOME, "PWD": cwd} if variables is None else dict(variables)
    places: dict[tuple[int, ...], str] = {}
    targets = []
    queue = deque(commands)
    evals = 0
    while queue:
        simple = queue.popleft()
        group = simple.group
        current = place(places, group, cwd)
        for body, expands in zip(simple.heredocs, simple.heredoc_expands):
            if expands:
                inside = expanded_commands(body, strict=True)
                targets.extend(judge(inside, current, variables))
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
                queue.extendleft(reversed(list(evaluated(line, group, evals))))
        elif os.path.basename(runner) in SHELLS:
            scoped = dict(variables)
            for name, value in [*assignments, *given.items()]:
                scoped[name] = unquote(substitute(value.strip(), variables))
            runs, operand = shell_script(words, start)
            if runs and operand is None:
                scripts = [None]
            elif runs:
                scripts = [script_text(dequote(operand), scoped)]
            elif operand is None:
                scripts = stdin_scripts(simple, words, start, scoped)
            else:
                scripts = []
            for line in scripts:
                if line is None:
                    targets.append((current, UNREAD))
                else:
                    inner = parse_commands(line, strict=True)
                    targets.extend(judge(inner, current, scoped))
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
    # A write the line shows is named before a script that is not on it.
    targets.sort(key=lambda target: target[1] == UNREAD)
    for directory, operation in targets:
        if repo_root(directory) in exempt:
            continue
        branch = _git(directory, "branch", "--show-current")
        if branch is None or not PROTECTED.match(branch):
            continue
        if operation == UNREAD:
            deny(
                "This command runs a script that is not on the line, so whether "
                f"it writes to protected branch '{branch}' in {directory} is "
                "unknown. Work on a worktree branch instead."
            )
        else:
            deny(
                f"This {operation} writes to protected branch '{branch}' "
                f"in {directory}. Work on a worktree branch instead."
            )
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
