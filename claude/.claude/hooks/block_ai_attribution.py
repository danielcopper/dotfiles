#!/usr/bin/env python3
"""PreToolUse(Bash) hook: keep AI attribution out of git commit messages.

Blocks `git commit` whose message carries attribution — an attribution trailer
whoever it names, a vendor noreply address, the robot emoji, or a tool/model
name standing next to a word like "generated". Commit messages stay plain
Conventional Commits. Exit 2 blocks the call; anything else lets it through.

**Where the message can hide.** Scanning the command string alone misses the
form an agent reaches for when a message is long: `git commit -F <file>` puts
every trailer in a file the command line never names. A heredoc IS caught, since
its body is part of the command string, but `-F` is not — that hole let a
trailer through on a real commit. So the file forms are resolved and read too:
`-F`/`--file`, `-t`/`--template`.

**What no PreToolUse hook can see**, whatever it reads: a message typed into
git's editor, or one already in `.git/COMMIT_EDITMSG` for `--amend`. Those never
appear in the command at all. The complete guard is git's own `commit-msg` hook,
which sees the final message however it arrived and applies to every tool rather
than only to this one. This hook is the early, specific error; it is not the
last line of defence.

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
        elif token.startswith("--file=") or token.startswith("--template="):
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
        try:
            with open(candidate, encoding="utf-8", errors="replace") as handle:
                chunks.append(handle.read())
        except OSError:
            continue
    return "\n".join(chunks)


def offence(text: str) -> str | None:
    """What attribution `text` carries, or None."""
    for pattern, label in PATTERNS:
        if pattern.search(text):
            return label
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    if not GIT_COMMIT_RE.search(command):
        return 0

    sources = [("the commit command", command)]
    from_files = read_message_files(command, data.get("cwd") or "")
    if from_files:
        sources.append(("a message file the commit reads", from_files))

    for where, text in sources:
        label = offence(text)
        if label:
            print(
                f"Blocked: {where} carries {label}. "
                "Commit with a plain Conventional-Commit message: "
                "<type>(<scope>): <description>, optional plain body - "
                "no attribution trailers, no tool credits.",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
