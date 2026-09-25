#!/usr/bin/env python3
"""PreToolUse(Bash) hook: keep AI attribution out of commit messages and out of
the text that gh and az publish.

Blocks a command whose text carries attribution — an attribution trailer
whoever it names, a vendor noreply address, the robot emoji, an assistant
session link, or a tool/model name standing next to a word like "generated".
Commit messages stay plain Conventional Commits; pull requests, issues, comments
and release notes carry no tool credit either. Exit 2 blocks the call; anything
else lets it through.

**What is read, per command.**

- `git commit`: the command string, and the files `-F`/`--file`/`-t`/
  `--template` name. A heredoc is part of the command string; a message file is
  not, so the file forms are resolved and read too.
- `gh pr create|edit|comment|review|merge`, `gh issue create|edit|comment`,
  `gh release create|edit` (and the `new` aliases), `az repos pr create|update`:
  the whole command string, and the files `--body-file`/`-F`
  (`--notes-file`/`-F` for a release) and az's `@file` values of `--title`/
  `--description` name. The whole string rather than the option values alone,
  because the text is often put together earlier in the same call — a variable
  filled from a heredoc, or a file a heredoc writes just before the command
  reads it, which does not exist yet when this hook runs.
- `gh api`, unless the call says `GET`: the values of `-f`/`--raw-field` and
  `-F`/`--field`, the file behind a `@path` field value or `--input`, and every
  heredoc body in the command. Not the endpoint path and not `--jq`/
  `--template`: those choose what is read and publish nothing, and a jq filter
  naming a bot beside `.created_at` would otherwise read as a credit.

Relative paths resolve against the call's working directory. Anything that does
not parse lets the call through: a guard that blocks a harmless command by
accident gets switched off.

**What this hook cannot see.** Text typed into git's editor or gh's prompts;
a message already in `.git/COMMIT_EDITMSG` for `--amend`; a body read from
stdin that is not a heredoc in the command (`--body-file -` fed by a pipe or a
`< file` redirect) — such a body is skipped, not guessed at; a relative body
file after a `cd` in the same command, since paths are resolved against the
call's working directory only; a `gh api` call hidden inside a `bash -c` or
`eval` string. For commits the complete guard is git's own `commit-msg` hook,
which sees the final message however it arrived; this hook is the early,
specific error, not the last line of defence.

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
from dataclasses import dataclass, field

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


# gh and az commands that publish text. Matched anywhere in the command, like
# `git commit` above, so `cd x && …`, `$(…)` and `bash -c "…"` forms all count.
GH_VERBS = {
    "pr": {"create", "new", "edit", "comment", "review", "merge"},
    "issue": {"create", "new", "edit", "comment"},
    "release": {"create", "new", "edit"},
}
AZ_VERBS = {"create", "update"}
PUBLISH_RE = re.compile(
    r"(?<![\w.-])(?:gh\s+(?:"
    + "|".join(rf"{group}\s+(?:{'|'.join(sorted(verbs))})" for group, verbs in GH_VERBS.items())
    + rf")|az\s+repos\s+pr\s+(?:{'|'.join(sorted(AZ_VERBS))}))\b"
)
PUBLISH_HINT_RE = re.compile(r"(?<![\w.-])(?:gh|az)\s")

# Options naming a file whose text a gh command publishes, as (short, long).
GH_FILE_OPTIONS = {
    "pr": ("-F", "--body-file"),
    "issue": ("-F", "--body-file"),
    "release": ("-F", "--notes-file"),
}
# gh api options this hook reads, as (short, long, kind).
GH_API_SENDING_OPTIONS = (
    ("-X", "--method", "method"),
    ("-f", "--raw-field", "raw"),
    ("-F", "--field", "typed"),
    (None, "--input", "input"),
)
# gh api options that take a value this hook does not read, so the value is
# not mistaken for an option of its own.
GH_API_OTHER_VALUE_OPTIONS = {"-H", "--header", "-q", "--jq", "-t", "--template", "-p", "--preview", "--hostname", "--cache"}

# Characters that end a heredoc delimiter written outside quotes.
_DELIMITER_END = " \t\n;&|()<>"


@dataclass
class SimpleCommand:
    """One simple command: its words as written (quotes kept) and the bodies of its heredocs."""

    words: list[str] = field(default_factory=list)
    heredocs: list[str] = field(default_factory=list)


def parse_commands(command: str) -> list[SimpleCommand]:
    """The simple commands in `command`, those inside `$(…)` included.

    A small shell reader rather than `shlex`: an apostrophe in a heredoc body —
    "it's", "doesn't" — makes `shlex` give up on the whole command, and a PR body
    is exactly where such text lives. It knows quotes, escapes, `$(…)`,
    backticks, comments, heredocs and the separators `;`, `&`, `|`, `&&`, `||`,
    parentheses and newlines. Never raises: input it cannot follow just ends up
    in fewer, longer words.
    """
    commands: list[SimpleCommand] = []
    _parse(command, 0, commands, nested=False)
    return commands


def _parse(text: str, i: int, out: list[SimpleCommand], nested: bool) -> int:
    """Read commands from `text[i:]` into `out`; return the index where reading stopped.

    `nested` is inside `$(`: an unmatched `)` ends it.
    """
    n = len(text)
    current = SimpleCommand()
    pending: list[tuple[str, bool, SimpleCommand]] = []
    word_start: int | None = None
    depth = 0

    def finish_word(end: int) -> None:
        nonlocal word_start
        if word_start is not None:
            current.words.append(text[word_start:end])
            word_start = None

    def finish_command() -> None:
        nonlocal current
        if current.words:
            out.append(current)
        current = SimpleCommand()

    while i < n:
        char = text[i]
        if char == "\n":
            finish_word(i)
            i = _read_heredocs(text, i + 1, pending, nested)
            finish_command()
            continue
        if char in " \t":
            finish_word(i)
            i += 1
            continue
        if char == "#" and word_start is None:
            while i < n and text[i] != "\n":
                i += 1
            continue
        if char == ")" and nested and depth == 0:
            finish_word(i)
            finish_command()
            return i + 1
        if char == "&" and (text.startswith("&>", i) or (i > 0 and text[i - 1] in "<>")):
            pass  # a redirection such as `2>&1` or `&>file`, not a separator
        elif char in ";&|()":
            if char == "(":
                depth += 1
            elif char == ")":
                depth = max(0, depth - 1)
            finish_word(i)
            finish_command()
            i += 1
            continue
        elif text.startswith("<<<", i):
            finish_word(i)
            current.words.append("<<<")  # a here-string: the next word is its text
            i += 3
            continue
        elif text.startswith("<<", i):
            finish_word(i)
            i, delimiter, strip_tabs = _heredoc_operator(text, i + 2)
            if delimiter:
                pending.append((delimiter, strip_tabs, current))
            continue
        if word_start is None:
            word_start = i
        i = _skip_word_char(text, i, out)
    finish_word(n)
    finish_command()
    return n


def _skip_word_char(text: str, i: int, out: list[SimpleCommand]) -> int:
    """Step over one character of a word, or over a whole quoted/substituted part of it."""
    char = text[i]
    if char == "\\":
        return i + 2
    if char == "'":
        close = text.find("'", i + 1)
        return len(text) if close < 0 else close + 1
    if char == '"':
        return _skip_double_quoted(text, i + 1, out)
    if char == "`":
        return _skip_backticks(text, i + 1)
    if text.startswith("$(", i):
        return _parse(text, i + 2, out, nested=True)
    return i + 1


def _skip_double_quoted(text: str, i: int, out: list[SimpleCommand]) -> int:
    n = len(text)
    while i < n:
        if text[i] == "\\":
            i += 2
        elif text[i] == '"':
            return i + 1
        elif text[i] == "`":
            i = _skip_backticks(text, i + 1)
        elif text.startswith("$(", i):
            i = _parse(text, i + 2, out, nested=True)
        else:
            i += 1
    return n


def _skip_backticks(text: str, i: int) -> int:
    n = len(text)
    while i < n:
        if text[i] == "\\":
            i += 2
        elif text[i] == "`":
            return i + 1
        else:
            i += 1
    return n


def _heredoc_operator(text: str, i: int) -> tuple[int, str, bool]:
    """Read what follows `<<`: return the index after it, the delimiter, and whether `<<-` strips tabs."""
    n = len(text)
    strip_tabs = text.startswith("-", i)
    if strip_tabs:
        i += 1
    while i < n and text[i] in " \t":
        i += 1
    start = i
    while i < n and text[i] not in _DELIMITER_END:
        if text[i] in "'\"":
            close = text.find(text[i], i + 1)
            i = n if close < 0 else close + 1
        elif text[i] == "\\":
            i += 2
        else:
            i += 1
    delimiter = "".join(ch for ch in text[start:i] if ch not in "'\"\\")
    return min(i, n), delimiter, strip_tabs


def _read_heredocs(text: str, i: int, pending: list[tuple[str, bool, SimpleCommand]], nested: bool) -> int:
    """Consume the bodies of `pending` heredocs starting at `text[i]`; return the index after them."""
    n = len(text)
    for delimiter, strip_tabs, owner in pending:
        lines: list[str] = []
        while i < n:
            newline = text.find("\n", i)
            line_end = n if newline < 0 else newline
            line = text[i:line_end]
            check = line.lstrip("\t") if strip_tabs else line
            if check == delimiter:
                i = line_end + 1
                break
            # `EOF)` closing both the heredoc and the `$(` around it.
            if nested and check.startswith(delimiter) and check[len(delimiter) :].lstrip().startswith(")"):
                i += line.index(")", len(line) - len(check) + len(delimiter))
                break
            lines.append(line)
            i = line_end + 1
        owner.heredocs.append("\n".join(lines))
    pending.clear()
    return min(i, n)


def dequote(word: str) -> str:
    """`word` with its shell quoting removed, or as written when it does not lex as one word."""
    try:
        tokens = shlex.split(word)
    except ValueError:
        return word
    if len(tokens) == 1:
        return tokens[0]
    return "" if not tokens else word


def option_value(words: list[str], index: int, short: str | None, long: str) -> tuple[str | None, int]:
    """The value `words[index]` gives the option `short`/`long`, and how many words that took.

    Handles `--long value`, `--long=value`, `-s value` and `-svalue`. Returns
    `(None, 0)` when the word is not that option.
    """
    word = words[index]
    if word == long or (short and word == short):
        following = words[index + 1] if index + 1 < len(words) else None
        return following, 2
    if word.startswith(long + "="):
        return word[len(long) + 1 :], 1
    if short and word.startswith(short) and len(word) > len(short) and not word.startswith("--"):
        return word[len(short) :], 1
    return None, 0


def option_values(words: list[str], short: str | None, long: str) -> list[str]:
    """Every value the option `short`/`long` takes in `words`."""
    values: list[str] = []
    index = 0
    while index < len(words):
        value, used = option_value(words, index, short, long)
        if value is not None:
            values.append(value)
        index += max(used, 1)
    return values


def resolve(path: str, cwd: str) -> str:
    """`path` with `~` expanded, relative to `cwd` unless absolute."""
    path = os.path.expanduser(path)
    return path if os.path.isabs(path) else os.path.join(cwd or ".", path)


def read_text(path: str) -> str | None:
    """The text of `path`, or None when it cannot be read."""
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return None


def publisher(words: list[str]) -> tuple[str, list[str]] | None:
    """The publishing gh/az command `words` runs, as (its name, the words after it), or None."""
    for index, word in enumerate(words):
        name = os.path.basename(word)
        rest = words[index + 1 :]
        if name == "gh" and rest:
            if rest[0] == "api":
                return "gh api", rest[1:]
            if len(rest) > 1 and rest[1] in GH_VERBS.get(rest[0], ()):
                return f"gh {rest[0]} {rest[1]}", rest[2:]
        if name == "az" and len(rest) > 2 and rest[:2] == ["repos", "pr"] and rest[2] in AZ_VERBS:
            return f"az repos pr {rest[2]}", rest[3:]
    return None


def az_text_values(args: list[str]) -> list[str]:
    """The values of `--title` and `--description`; the latter takes several words."""
    values = option_values(args, None, "--title")
    for index, word in enumerate(args):
        if word == "--description":
            for value in args[index + 1 :]:
                if value.startswith("-") and len(value) > 1:
                    break
                values.append(value)
        elif word.startswith("--description="):
            values.append(word.split("=", 1)[1])
    return values


def body_files(family: str, args: list[str]) -> list[str]:
    """Paths whose text the gh/az command `family` publishes; stdin (`-`) is left out."""
    if family.startswith("az "):
        paths = [value[1:] for value in az_text_values(args) if value.startswith("@")]
    else:
        short, long = GH_FILE_OPTIONS[family.split()[1]]
        paths = option_values(args, short, long)
    return [path for path in paths if path and path != "-"]


def gh_api_texts(args: list[str], cwd: str, heredocs: list[str]) -> list[tuple[str, str]]:
    """(where, text) for what a `gh api` call sends, `heredocs` included.

    Nothing for an explicit GET or for a call that sends no field and no input:
    such a call reads, and publishes nothing.
    """
    method: str | None = None
    values: list[str] = []
    files: list[str] = []
    index = 0
    while index < len(args):
        kind, value, used = None, None, 0
        for short, long, kind in GH_API_SENDING_OPTIONS:
            value, used = option_value(args, index, short, long)
            if used:
                break
        if not used and args[index] in GH_API_OTHER_VALUE_OPTIONS:
            used = 2
        elif used and value is not None:
            if kind == "method":
                method = value
            elif kind == "input":
                files.append(value)
            else:
                value = value.split("=", 1)[-1]
                # Only a typed field (`-F`) reads `@path`; a raw one sends it as written.
                if kind == "typed" and value.startswith("@"):
                    files.append(value[1:])
                else:
                    values.append(value)
        index += max(used, 1)
    if (method or "").upper() == "GET" or not (values or files):
        return []
    texts = [("a field value of the gh api call", value) for value in values]
    texts += [("a heredoc in the gh api command", body) for body in heredocs]
    for path in files:
        if path and path != "-":
            text = read_text(resolve(path, cwd))
            if text:
                texts.append(("a file the gh api call sends", text))
    return texts


def publishing_sources(command: str, cwd: str) -> list[tuple[str, str]]:
    """(where, text) for every piece of text the gh/az commands in `command` publish."""
    if not PUBLISH_HINT_RE.search(command):
        return []
    sources: list[tuple[str, str]] = []
    match = PUBLISH_RE.search(command)
    if match:
        sources.append((f"the {' '.join(match.group(0).split())} command", command))
    commands = parse_commands(command)
    for simple in commands:
        found = publisher([dequote(word) for word in simple.words])
        if not found:
            continue
        family, args = found
        if family == "gh api":
            # Every heredoc, not only this command's: the body is often written
            # to a variable or file first, then handed to `gh api`.
            heredocs = [body for other in commands for body in other.heredocs]
            sources.extend(gh_api_texts(args, cwd, heredocs))
            continue
        for path in body_files(family, args):
            text = read_text(resolve(path, cwd))
            if text:
                sources.append((f"a file the {family} command reads", text))
    return sources


def commit_block(command: str, cwd: str) -> str | None:
    """Why the `git commit` in `command` is blocked, or None."""
    if not GIT_COMMIT_RE.search(command):
        return None
    sources = [("the commit command", command)]
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
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or ""
    reason = commit_block(command, cwd) or publish_block(command, cwd)
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
