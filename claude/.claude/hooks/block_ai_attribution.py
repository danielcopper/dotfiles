#!/usr/bin/env python3
"""PreToolUse(Bash) hook: keep AI attribution out of commit messages and out of
the text that gh and az publish.

Blocks a command whose text carries attribution — an attribution trailer
whoever it names, a vendor noreply address, the robot emoji, an assistant
session link, a link to a tool's product page, or a tool/model name standing
next to a word like "generated". Commit messages stay plain Conventional
Commits; pull requests, issues, comments and release notes carry no tool credit
either. Exit 2 blocks the call; anything else lets it through.

**What is read, per command.**

- `git commit`: the command string, and the files `-F`/`--file`/`-t`/
  `--template` name. A heredoc is part of the command string; a message file is
  not, so the file forms are resolved and read too.
- The gh and az commands that publish text — pull requests, issues, comments,
  reviews, release notes, `gh api` writes: the text `utils/published_text.py`
  finds. Its docstring lists the commands, the options, files and heredocs it
  reads, and what it cannot see.

Left out of the whole-string scan, for commits and published text alike: the
pattern of a `grep`/`rg` in the same command. A check for a credit line
(`grep -q`, `grep -v`) names the marker it looks for and publishes nothing; the
text that would be published is still read, message and body files included.

A `git commit` message file resolves against the call's working directory.
Files are read only when they are regular files, and only up to `MAX_READ`
characters (about a megabyte). Anything that does not parse lets the call
through, and so does an error inside the hook: a guard that blocks a harmless
command by accident gets switched off.

**What this hook cannot see.** For the gh and az commands, what
`published_text.py` names. For commits: text typed into git's editor; a
message already in `.git/COMMIT_EDITMSG` for `--amend`; a relative
`git commit` message file after a `cd` or behind `git -C <dir>`, which resolves
against the call's working directory; text past `MAX_READ` in a file. For
both: a product-page link written without its `https://`. For commits, the git
`commit-msg` hook in `~/.githooks` sees the final message however it arrived,
editor and `--amend` included, but git runs it only for `git commit`,
`git merge` and a rebase `reword` — not for `cherry-pick`, `revert`, `am`, a
rebase `squash`, `fixup` or `pick`, `commit-tree`, or a tool that writes
commits without `git commit` (measured with git 2.55). This hook is the early,
specific error; neither is a complete guard.

**The commit-msg mode.** `block_ai_attribution.py --check-message <file>
[<comment>]` checks a commit message file with the same patterns and exits 2
when it carries attribution, naming what it found on stderr; anything else, an
unreadable file or an error inside the check included, exits 0. The git
`commit-msg` hook runs it on the message git is about to commit and blocks only
on 2: Python itself exits 1 when this file cannot even load, and a guard that
is broken is no reason to refuse a commit. The whole file is read, not only
`MAX_READ`: git wrote it, as a regular file. It is read without newline
translation and split on `\\n` alone, as git splits it: a carriage return,
alone or before `\\n`, stays part of its line while comment lines are found.
The patterns then read it as a line break, since a terminal or a web page
shows the text after it as a line of its own.

Lines starting with the comment string (`#` unless given) are left out: git
strips them from a message that comes from its editor. Without the editor —
`-m`, `-F` — git keeps them by default, and so do `--cleanup=verbatim`,
`whitespace` and `scissors`: such a line is committed but not read here. A
comment string of `auto` is read as `#`, which misses the lines git keeps when
it picked another character. Everything from the cut line `git commit -v`
writes above its diff on is left out too, since git drops it under `-v`,
`commit.verbose` or `--cleanup=scissors`. Whether one of those applies is not
visible here, so a message that carries the cut line itself without them has
the text below it committed but not read.

**Why tool names are not matched on their own.** `CLAUDE.md` is a real file in
several of these repos, so a bare /claude/ would refuse `docs: update CLAUDE.md`
— a commit that should obviously go through. A name only counts when it stands
with an attribution word on the same line, which is what an attribution looks
like and what a filename never does.
"""

import json
import os
import re
import shlex
import sys
from pathlib import Path
from typing import cast

# The shared reader sits beside this file in the repository. Resolved, so the
# live symlink in ~/.claude/hooks finds it without a link of its own.
sys.path.insert(0, str(Path(__file__).resolve().parent / "utils"))
from published_text import MAX_READ, parse_commands, publishing_sources, read_text, without_search_patterns  # noqa: E402

# git commit, also with leading -C <path> / -c <key=val> options
GIT_COMMIT_RE = re.compile(r"\bgit(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+commit\b")

# Trailer keys that are attribution whoever they name. `Co-authored-by` is here
# rather than under a vendor pattern deliberately: the rule is no co-author
# trailers at all, not "none naming an AI".
TRAILER_KEYS = r"co-authored-by|assisted-by|generated-by|generated-with|ai-assisted-by|claude-session|codex-session"
TRAILER_RE = re.compile(rf"^\s*(?:{TRAILER_KEYS})\s*:", re.IGNORECASE | re.MULTILINE)

# Assistants, agents and the models behind them. Matched only beside an
# attribution word — see the module docstring.
#
# `cursor` and `cody` are deliberately absent though both are coding assistants:
# "move the cursor" is ordinary English about a text field, and either would
# refuse honest commits on this codebase. A guard that blocks real work gets
# switched off, and the trailer rule above already catches the shapes those
# tools actually emit.
TOOL_NAMES = (
    r"claude|anthropic|chatgpt|openai|gpt-\d|copilot|codeium|windsurf|"
    r"gemini|llama|mistral|aider|opencode|codex|devin"
)
ATTRIBUTION_WORDS = r"generated|authored|assisted|co-?written|written|created|produced|powered|made"
# Either order — "generated with Claude" and "Claude generated this" both count —
# and within one line: `.` does not cross a newline, so a tool named in one
# paragraph cannot be paired with a verb three lines away.
NAME_WITH_WORD_RE = re.compile(
    rf"(?:{ATTRIBUTION_WORDS}).{{0,25}}(?:{TOOL_NAMES})|(?:{TOOL_NAMES}).{{0,25}}(?:{ATTRIBUTION_WORDS})",
    re.IGNORECASE,
)

PATTERNS = [
    (TRAILER_RE, "an attribution trailer"),
    (NAME_WITH_WORD_RE, "an AI tool named as an author"),
    (re.compile(r"\U0001F916"), "the robot emoji"),
    (re.compile(r"noreply@(?:anthropic|openai)\.com", re.IGNORECASE), "a vendor noreply address"),
    (re.compile(r"https?://(?:claude\.ai|chatgpt\.com|chat\.openai\.com)/\S*", re.IGNORECASE), "an assistant session link"),
    # The page a tool credit links to. Prose naming the tool passes; the link is
    # what a credit line carries, whatever verb stands before it.
    (re.compile(r"https?://(?:www\.)?claude\.com/claude-code", re.IGNORECASE), "a link to an AI tool's page"),
]

# Options whose value is a path holding the message text.
FILE_OPTIONS = {"-F", "--file", "-t", "--template"}


def message_files(command: str) -> list[str]:
    """Paths named by a message-carrying option in `command`.

    Best effort: a command that does not lex is skipped rather than guessed at,
    because reading a wrongly-parsed path is worse than the string scan alone.
    """
    try:
        tokens = shlex.split(command)
    except ValueError:
        return []
    paths: list[str] = []
    for index, token in enumerate(tokens):
        if token in FILE_OPTIONS:
            if index + 1 < len(tokens):
                paths.append(tokens[index + 1])
        elif token.startswith(("--file=", "--template=")):
            paths.append(token.split("=", 1)[1])
        elif len(token) > 2 and token.startswith("-F") and not token.startswith("--"):
            paths.append(token[2:])
    # `-F -` reads stdin, which a heredoc already put in the command string.
    return [p for p in paths if p != "-"]


def read_message_files(command: str, cwd: str) -> str:
    """The text of every message file the command names, concatenated."""
    chunks: list[str] = []
    for path in message_files(command):
        candidate = path if os.path.isabs(path) else os.path.join(cwd or ".", path)
        text = read_text(candidate, MAX_READ)
        if text is not None:
            chunks.append(text)
    return "\n".join(chunks)


def offence(text: str) -> str | None:
    """What attribution `text` carries, or None."""
    for pattern, label in PATTERNS:
        if pattern.search(text):
            return label
    return None




def commit_block(command: str, cwd: str) -> str | None:
    """Why the `git commit` in `command` is blocked, or None."""
    if not GIT_COMMIT_RE.search(command):
        return None
    scanned = without_search_patterns(command, parse_commands(command))
    if not GIT_COMMIT_RE.search(scanned):
        return None
    sources = [("the commit command", scanned)]
    from_files = read_message_files(command, cwd)
    if from_files:
        sources.append(("a message file the commit reads", from_files))
    for where, text in sources:
        label = offence(text)
        if label:
            return (
                f"Blocked: {where} carries {label}. "
                "Commit with a plain Conventional-Commit message: "
                "<type>(<scope>): <description>, optional plain body - "
                "no attribution trailers, no tool credits."
            )
    return None


# The line `git commit -v` writes, after the comment character and a blank,
# above the diff it shows; git drops it and everything below it.
CUT_LINE = "------------------------ >8 ------------------------"


def committed_text(text: str, comment: str = "#") -> str:
    """The part of a commit message file git keeps when it strips comments.

    Lines starting with `comment` are dropped, and the reading stops at the
    cut line of `git commit -v`: the diff below it is not part of the message.
    Lines end at `\\n` only, as in git; `str.splitlines` would also split at a
    form feed or U+2028 and turn the rest of a line into a line of its own.
    The cut line counts only exactly as git writes it: with a blank, a tab or a
    carriage return after it, git 2.55 does not cut there (measured).
    """
    kept: list[str] = []
    for line in text.split("\n"):
        if line == f"{comment} {CUT_LINE}":
            break
        if not line.startswith(comment):
            kept.append(line)
    return "\n".join(kept)


def message_block(path: str, comment: str = "#") -> str | None:
    """Why the commit message in the file `path` is refused, or None.

    The whole file is read: git wrote it, and a cap would let a trailer through
    behind a long enough body. It is read without newline translation: to git a
    lone `\\r` does not end a line, so it must not end one when comment lines
    are dropped. Only after that is it turned into `\\n` for the patterns: git
    commits it unchanged, and a trailer behind it shows as a line of its own.
    A file that cannot be read is let through, with a warning on stderr: the
    guard being unavailable is no reason to refuse a commit.
    """
    text = read_text(path, None, newline="")
    if text is None:
        print(f"block_ai_attribution: cannot read {path}; the message was not checked.", file=sys.stderr)
        return None
    label = offence(committed_text(text, comment).replace("\r", "\n"))
    if label:
        return (
            f"Blocked: the commit message carries {label}. "
            "Commit with a plain Conventional-Commit message: "
            "<type>(<scope>): <description>, optional plain body - "
            "no attribution trailers, no tool credits."
        )
    return None


def check_message(args: list[str]) -> int:
    """The `--check-message <file> [<comment>]` mode: 2 when the message is refused, else 0."""
    if len(args) not in (1, 2) or not args[-1]:
        print("block_ai_attribution: usage: --check-message <file> [<comment>]", file=sys.stderr)
        return 0
    try:
        reason = message_block(*args)
    except Exception as error:  # noqa: BLE001 - a guard that crashes must not block the commit
        print(f"block_ai_attribution: letting the commit through after an error: {error!r}", file=sys.stderr)
        return 0
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


def publish_block(command: str, cwd: str) -> str | None:
    """Why a gh/az command in `command` is blocked from publishing, or None."""
    for where, text in publishing_sources(command, cwd):
        label = offence(text)
        if label:
            return (
                f"Blocked: {where} carries {label}. That text gets published - "
                "write it without attribution: no trailers, no tool credits, "
                "no robot-emoji line, no assistant session links."
            )
    return None


def main() -> int:
    try:
        data = cast(object, json.load(sys.stdin))
    except (json.JSONDecodeError, ValueError):
        return 0
    if not isinstance(data, dict):
        return 0
    payload = cast("dict[str, object]", data)
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0
    command = cast("dict[str, object]", tool_input).get("command")
    cwd = payload.get("cwd")
    if not isinstance(command, str):
        return 0
    cwd = cwd if isinstance(cwd, str) else ""
    try:
        reason = commit_block(command, cwd) or publish_block(command, cwd)
    except Exception as error:  # noqa: BLE001 - a guard that crashes must not block the call
        print(f"block_ai_attribution: letting the call through after an error: {error!r}", file=sys.stderr)
        return 0
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    if sys.argv[1:2] == ["--check-message"]:
        sys.exit(check_message(sys.argv[2:]))
    sys.exit(main())
