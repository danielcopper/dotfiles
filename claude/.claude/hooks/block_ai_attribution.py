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
- `gh pr create|edit|comment|review|merge|close|reopen`,
  `gh issue create|edit|comment|close|reopen`, `gh release create|edit` (and
  the `new` aliases), `az repos pr create|update`: the whole command string,
  and the files `--body-file`/`-F` (`--notes-file`/`-F` for a release) and az's
  `@file` values of `--title`/`--description`/`-d` name. The whole string
  rather than the option values alone, because the text is often put together
  earlier in the same call — a variable filled from a heredoc, or a file a
  heredoc writes just before the command reads it, which does not exist yet
  when this hook runs. The az flags follow the az documentation.
- `gh api`, unless the call says `GET`: the values of `-f`/`--raw-field` and
  `-F`/`--field`, the file behind a `@path` field value or `--input`, and every
  heredoc body in the command — the files and heredocs also decoded as JSON, so
  a `\\n` or `\\u` escape inside a string is read as what it stands for. Not the
  endpoint path and not `--jq`/`--template`: those choose what is read and
  publish nothing, and a jq filter naming a bot beside `.created_at` would
  otherwise read as a credit. A GraphQL call is a POST with fields, so its
  query is checked even when it only reads.
- With any of these present, also every file a `cat` in the command prints,
  inside `$(…)`, backticks or a pipe, and every `$(< file)`:
  `--body "$(cat body.md)"` and `cat body.md | gh … -F -` publish that file.
  Every such `cat` counts, whether or not its output reaches the published
  text: `cat notes.md; gh pr create --body 'plain'` is judged on `notes.md` too.

Left out of the whole-string scan, for commits and published text alike: the
pattern of a `grep`/`rg` in the same command. A check for a credit line
(`grep -q`, `grep -v`) names the marker it looks for and publishes nothing; the
text that would be published is still read, message and body files included.

Relative paths resolve against the call's working directory. For the gh and az
commands they also follow a `cd <path>` earlier in the command — within its
subshell only: a `cd` inside `( … )`, `$( … )` or backticks does not reach the
commands after it. A `git commit` message file always resolves against the
call's working directory. Files are read only when they are regular files, and only up to
`MAX_READ` characters (about a megabyte). Anything that does not parse lets
the call through, and so does an error inside the hook: a guard that blocks a
harmless command by accident gets switched off.

**What this hook cannot see.** Text typed into git's editor or gh's prompts;
a message already in `.git/COMMIT_EDITMSG` for `--amend`; a body on stdin that
is neither a heredoc in the command nor a file `cat` prints (`make-notes |
gh … -F -`, `gh … -F - < body.md`), and a body put together by any other
reader (`$(sed … file)`, `$(head file)`) — those are skipped, not guessed at; a
`cat` behind a prefix that takes options of its own (`env -i cat`,
`sudo -u X cat`, `nice -n 5 cat`, `timeout 5 cat`); a `$(cat …)` or backtick
`cat` inside an unquoted heredoc body, which the shell expands and this hook
does not; a relative path after `cd -` or a `cd` to a `$`/backtick path, which
resolves against the call's working directory; a relative `git commit`
message file after a `cd` or behind `git -C <dir>`, which resolves against the
call's working directory too; text past `MAX_READ` in a file; a product-page
link written without its `https://`; a `gh api` call hidden inside a
`bash -c` or `eval` string. For commits, a git `commit-msg` hook would be the
complete guard, since it sees the final message however it arrived; this hook
is the early, specific error, not the last line of defence.

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
import stat
import sys
from dataclasses import dataclass, field
from typing import cast

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
        text = read_text(candidate)
        if text is not None:
            chunks.append(text)
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
    "pr": {"create", "new", "edit", "comment", "review", "merge", "close", "reopen"},
    "issue": {"create", "new", "edit", "comment", "close", "reopen"},
    "release": {"create", "new", "edit"},
}
AZ_VERBS = {"create", "update"}
# Blanks between words, a line continuation included (`gh \` newline `pr create`).
_GAP = r"(?:\s|\\\n)+"
PUBLISH_RE = re.compile(
    rf"(?<![\w.-])(?:gh{_GAP}(?:"
    + "|".join(rf"{group}{_GAP}(?:{'|'.join(sorted(verbs))})" for group, verbs in GH_VERBS.items())
    + rf")|az{_GAP}repos{_GAP}pr{_GAP}(?:{'|'.join(sorted(AZ_VERBS))}))\b"
)
PUBLISH_HINT_RE = re.compile(r"(?<![\w.-])(?:gh|az)(?:\s|\\\n)")

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

# grep and rg, whose pattern argument is left out of the whole-command scan.
SEARCH_TOOLS = {"grep", "egrep", "fgrep", "rg"}
# Their options read as taking a value whichever tool runs: each takes one in at
# least one of GNU grep, ugrep and rg, and none of them is a valueless flag in
# another. Reading an option as valued when it is not only costs a pattern that
# then still gets scanned, never a miss.
SEARCH_VALUE_OPTIONS = {
    "-A", "-B", "-C", "-m", "-f", "-d", "-D", "-g", "-t", "-M",
    "--max-count", "--after-context", "--before-context", "--context", "--glob", "--type",
    "--type-not", "--include", "--exclude", "--exclude-dir", "--max-columns",
    "--threads", "--max-depth", "--binary-files", "--devices", "--directories", "--label",
}
# Options that take a value in rg only: grep's `-r` recurses, its `-T` aligns
# tabs, and in ugrep (what `grep` runs in this shell) `-j` is `--smart-case`.
RG_VALUE_OPTIONS = {"-r", "--replace", "-T", "-j"}
# Words that can stand before the command they run: `! grep …`, `sudo cat …`.
COMMAND_PREFIXES = {"!", "command", "sudo", "env", "time", "nice", "xargs"}
ASSIGNMENT_RE = re.compile(r"[A-Za-z_]\w*=")
# A redirection operator, alone (`>`) or with its target attached (`>out`, `2>&1`).
REDIRECTION_RE = re.compile(r"\d*(?:&>>?|>>?&?|<&|>\|)")

# Characters that end a heredoc delimiter written outside quotes.
_DELIMITER_END = " \t\n;&|()<>"


@dataclass
class SimpleCommand:
    """One simple command: its words as written (quotes kept), where each word
    starts in the command string, the bodies of its heredocs, and its group.

    `group` names the subshell the command runs in. `( … )`, `$( … )` and
    backticks each open a new group inside the enclosing one, so a `cd` reaches
    only the commands whose group begins with its own.
    """

    words: list[str] = field(default_factory=list)
    starts: list[int] = field(default_factory=list)
    heredocs: list[str] = field(default_factory=list)
    group: tuple[int, ...] = ()


def parse_commands(command: str) -> list[SimpleCommand]:
    """The simple commands in `command`, those inside `$(…)` and backticks included.

    A small shell reader rather than `shlex`: an apostrophe in a heredoc body —
    "it's", "doesn't" — makes `shlex` give up on the whole command, and a PR body
    is exactly where such text lives. It knows quotes, escapes, line
    continuations, `$(…)`, backticks, comments, heredocs and the separators `;`,
    `&`, `|`, `&&`, `||`, parentheses and newlines. A command substitution comes
    before the command it sits in. Never raises: input it cannot follow ends up
    in fewer, longer words, and nesting too deep to follow ends the reading with
    the commands found so far.
    """
    reader = _Reader(command)
    try:
        _ = reader.commands(0, None, (0,))
    except RecursionError:
        pass
    return reader.out


class _Reader:
    """What `parse_commands` shares across nesting levels: the text, the commands found, the group count."""

    def __init__(self, text: str) -> None:
        self.text: str = text
        self.out: list[SimpleCommand] = []
        self._groups: int = 0

    def _new_group(self, parent: tuple[int, ...]) -> tuple[int, ...]:
        self._groups += 1
        return (*parent, self._groups)

    def commands(self, i: int, closer: str | None, group: tuple[int, ...]) -> int:
        """Read commands from `text[i:]`; return the index where reading stopped.

        `closer` is `)` inside `$(`, a backtick inside backticks and None at the
        top: an unmatched closer ends the reading.
        """
        text = self.text
        n = len(text)
        groups = [group]
        current = SimpleCommand(group=group)
        pending: list[tuple[str, bool, SimpleCommand]] = []
        word_start: int | None = None

        def finish_word(end: int) -> None:
            nonlocal word_start
            if word_start is not None:
                current.words.append(text[word_start:end])
                current.starts.append(word_start)
                word_start = None

        def finish_command() -> None:
            nonlocal current
            if current.words:
                self.out.append(current)
            current = SimpleCommand(group=groups[-1])

        while i < n:
            char = text[i]
            if char == "\n":
                finish_word(i)
                i = _read_heredocs(text, i + 1, pending, closer == ")")
                finish_command()
                continue
            if char in " \t":
                finish_word(i)
                i += 1
                continue
            if text.startswith("\\\n", i) and word_start is None:
                i += 2  # a line continuation between words
                continue
            if char == "#" and word_start is None:
                while i < n and text[i] != "\n":
                    i += 1
                continue
            if char == closer and (closer == "`" or len(groups) == 1):
                finish_word(i)
                finish_command()
                return i + 1
            if char == "&" and (text.startswith("&>", i) or (i > 0 and text[i - 1] in "<>")):
                pass  # a redirection such as `2>&1` or `&>file`, not a separator
            elif char in ";&|()":
                finish_word(i)
                finish_command()
                if char == "(":
                    groups.append(self._new_group(groups[-1]))
                elif char == ")" and len(groups) > 1:
                    _ = groups.pop()
                current.group = groups[-1]
                i += 1
                continue
            elif text.startswith("<<<", i):
                finish_word(i)
                current.words.append("<<<")  # a here-string: the next word is its text
                current.starts.append(i)
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
            i = self._word_part(i, groups[-1])
        finish_word(n)
        finish_command()
        return n

    def _word_part(self, i: int, group: tuple[int, ...]) -> int:
        """Step over one character of a word, or over a whole quoted/substituted part of it."""
        text = self.text
        char = text[i]
        if char == "\\":
            return i + 2
        if char == "'":
            close = text.find("'", i + 1)
            return len(text) if close < 0 else close + 1
        if char == '"':
            return self._double_quoted(i + 1, group)
        if char == "`":
            return self.commands(i + 1, "`", self._new_group(group))
        if text.startswith("$(", i):
            return self.commands(i + 2, ")", self._new_group(group))
        return i + 1

    def _double_quoted(self, i: int, group: tuple[int, ...]) -> int:
        text = self.text
        n = len(text)
        while i < n:
            if text[i] == "\\":
                i += 2
            elif text[i] == '"':
                return i + 1
            elif text[i] == "`":
                i = self.commands(i + 1, "`", self._new_group(group))
            elif text.startswith("$(", i):
                i = self.commands(i + 2, ")", self._new_group(group))
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

    Handles `--long value`, `--long=value`, `-s value`, `-svalue` and
    `-s=value`. Returns `(None, 0)` when the word is not that option.
    """
    word = words[index]
    if word == long or (short and word == short):
        following = words[index + 1] if index + 1 < len(words) else None
        return following, 2
    if word.startswith(long + "="):
        return word[len(long) + 1 :], 1
    if short and word.startswith(short) and len(word) > len(short) and not word.startswith("--"):
        value = word[len(short) :]
        return value.removeprefix("="), 1
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


# The most of one file this hook reads, in characters. A body is a few KB; the
# cap keeps a huge file from stalling the Bash call behind it.
MAX_READ = 1 << 20


def read_text(path: str) -> str | None:
    """The first `MAX_READ` characters of `path` when it is a regular file, or None.

    Only regular files: opening a FIFO waits for a writer that may never come,
    and a device such as `/dev/zero` never ends.
    """
    try:
        if not stat.S_ISREG(os.stat(path).st_mode):
            return None
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read(MAX_READ)
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
    """The values of `--title` and `--description`/`-d`; the description takes several words."""
    values = option_values(args, None, "--title")
    for index, word in enumerate(args):
        if word in ("--description", "-d"):
            for value in args[index + 1 :]:
                if value.startswith("-") and len(value) > 1:
                    break
                values.append(value)
        elif word.startswith("--description="):
            values.append(word.split("=", 1)[1])
        elif word.startswith("-d") and len(word) > 2:
            values.append(word[2:].removeprefix("="))
    return values


def body_files(family: str, args: list[str]) -> list[str]:
    """Paths whose text the gh/az command `family` publishes; stdin (`-`) is left out."""
    if family.startswith("az "):
        paths = [value[1:] for value in az_text_values(args) if value.startswith("@")]
    else:
        short, long = GH_FILE_OPTIONS[family.split()[1]]
        paths = option_values(args, short, long)
    return [path for path in paths if path and path != "-"]


def gh_api_request(args: list[str]) -> tuple[list[str], list[str]] | None:
    """What a `gh api` call sends, as (field values, paths of files it reads), or None.

    None for an explicit GET and for a call that sends no field and no input:
    such a call reads, and publishes nothing. A path of `-` is stdin.
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
        return None
    return values, files


def json_strings(text: str) -> str | None:
    """Every string value in `text` read as JSON, one per line, or None when it is not JSON.

    A request body carries its line breaks as `\\n` and may spell the emoji as a
    `\\u` escape; decoded, a trailer is back at the start of a line.
    """
    try:
        stack: list[object] = [json.loads(text)]
    except (ValueError, RecursionError):
        return None
    strings: list[str] = []
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            strings.append(item)
        elif isinstance(item, dict):
            stack.extend(cast("dict[str, object]", item).values())
        elif isinstance(item, list):
            stack.extend(cast("list[object]", item))
    return "\n".join(strings) if strings else None


def command_word(words: list[str]) -> int:
    """Index of the word naming the program `words` runs, past `!`, `sudo`, `VAR=value` and the like."""
    index = 0
    while index < len(words) and (words[index] in COMMAND_PREFIXES or ASSIGNMENT_RE.match(words[index])):
        index += 1
    return index


def search_pattern_words(words: list[str]) -> list[int]:
    """Indexes of the words that are a `grep`/`rg` search pattern, if `words` runs one.

    The pattern names what to find or filter out, so a check for a credit line —
    `grep -q`, `grep -v` — carries the very marker it looks for. It publishes
    nothing.
    """
    index = command_word(words)
    if index >= len(words) or os.path.basename(words[index]) not in SEARCH_TOOLS:
        return []
    value_options = SEARCH_VALUE_OPTIONS
    if os.path.basename(words[index]) == "rg":
        value_options = value_options | RG_VALUE_OPTIONS
    patterns: list[int] = []
    from_file = False
    operand: int | None = None
    options_ended = False
    index += 1
    while index < len(words):
        word = words[index]
        if options_ended or not word.startswith("-") or word == "-":
            if operand is None:
                operand = index
            index += 1
        elif word == "--":
            options_ended = True
            index += 1
        elif word == "--regexp" or word.startswith("--regexp="):
            patterns.append(index + 1 if word == "--regexp" else index)
            index += 2 if word == "--regexp" else 1
        elif word == "--file" or word.startswith("--file="):
            from_file = True
            index += 2 if word == "--file" else 1
        elif word.startswith("--"):
            index += 2 if word in value_options else 1
        elif "e" in word[1:]:
            # `-e`, or a cluster such as `-ve PATTERN` / `-vePATTERN`.
            patterns.append(index + 1 if word[-1] == "e" else index)
            index += 2 if word[-1] == "e" else 1
        else:
            from_file = from_file or word[1:].startswith("f")
            index += 2 if word[:2] in value_options and len(word) == 2 else 1
    if not patterns and not from_file and operand is not None:
        patterns.append(operand)
    return [index for index in patterns if index < len(words)]


def without_search_patterns(command: str, commands: list[SimpleCommand]) -> str:
    """`command` with every `grep`/`rg` pattern blanked out, positions kept."""
    chars = list(command)
    for simple in commands:
        for index in search_pattern_words([dequote(word) for word in simple.words]):
            start = simple.starts[index]
            for position in range(start, start + len(simple.words[index])):
                if chars[position] != "\n":
                    chars[position] = " "
    return "".join(chars)


def read_into_command(words: list[str]) -> list[str]:
    """Paths whose text `words` puts on stdout: what `cat` reads, or `< path` alone (`$(< path)`)."""
    words = words[command_word(words) :]
    if not words:
        return []
    if words[0] == "<" and len(words) == 2:
        return [words[1]]
    if words[0].startswith("<") and not words[0].startswith("<<") and len(words) == 1:
        return [words[0][1:]]
    if os.path.basename(words[0]) != "cat":
        return []
    paths: list[str] = []
    rest = iter(words[1:])
    for word in rest:
        if word == "<<<":
            _ = next(rest, None)  # a here-string: text, not a file
        elif word == "<":
            paths.append(next(rest, "-"))  # `cat < file` prints the file
        elif word.startswith("<") and not word.startswith("<<"):
            paths.append(word[1:])
        elif REDIRECTION_RE.fullmatch(word):
            _ = next(rest, None)  # `> out`: the next word is where output goes
        elif REDIRECTION_RE.match(word) or word.startswith("<<") or (word.startswith("-") and word != "-"):
            continue
        else:
            paths.append(word)
    return [path for path in paths if path != "-"]


def working_directories(commands: list[SimpleCommand], words: list[list[str]], cwd: str) -> list[str]:
    """The directory each command runs in, following `cd <path>` to the commands after it.

    A `cd` reaches only the commands of its own group and the groups inside it:
    one in `( … )`, `$( … )` or backticks ends with that subshell. `cd -` and a
    path built from `$`/backticks are not followed: the directory they name is
    not in the command.
    """
    directories: list[str] = []
    changes: list[tuple[tuple[int, ...], str]] = []
    for simple, dequoted in zip(commands, words):
        here = cwd
        for group, directory in changes:
            if simple.group[: len(group)] == group:
                here = directory
        directories.append(here)
        if len(dequoted) == 2 and dequoted[0] == "cd":
            raw = simple.words[1]
            if dequoted[1] != "-" and "$" not in raw and "`" not in raw:
                changes.append((simple.group, resolve(dequoted[1], here)))
    return directories


def publishing_sources(command: str, cwd: str) -> list[tuple[str, str]]:
    """(where, text) for every piece of text the gh/az commands in `command` publish."""
    if not PUBLISH_HINT_RE.search(command):
        return []
    scanned = without_search_patterns(command, parse_commands(command))
    commands = parse_commands(scanned)
    words = [[dequote(word) for word in simple.words] for simple in commands]
    directories = working_directories(commands, words, cwd)
    heredocs = [body for simple in commands for body in simple.heredocs]

    sources: list[tuple[str, str]] = []
    match = PUBLISH_RE.search(scanned)
    family = " ".join(match.group(0).replace("\\\n", " ").split()) if match else None
    if family:
        sources.append((f"the {family} command", scanned))
    for dequoted, here in zip(words, directories):
        found = publisher(dequoted)
        if not found:
            continue
        name, args = found
        if name != "gh api":
            for path in body_files(name, args):
                text = read_text(resolve(path, here))
                if text:
                    sources.append((f"a file the {name} command reads", text))
            continue
        request = gh_api_request(args)
        if request is None:
            continue
        family = family or name
        values, files = request
        sources += [("a field value of the gh api call", value) for value in values]
        # Every heredoc, not only this command's: the body is often written to
        # a variable or file first, then handed to `gh api`.
        sent = [("a heredoc in the gh api command", body) for body in heredocs]
        for path in files:
            text = read_text(resolve(path, here)) if path != "-" else None
            if text:
                sent.append(("a file the gh api call sends", text))
        for where, text in sent:
            sources.append((where, text))
            decoded = json_strings(text)
            if decoded:
                sources.append((f"{where} (read as JSON)", decoded))
    if family:
        # Files `cat` prints into the command (`$(cat file)`, `cat file | gh … -F -`)
        # and `$(< file)`.
        for dequoted, here in zip(words, directories):
            for path in read_into_command(dequoted):
                text = read_text(resolve(path, here))
                if text:
                    sources.append((f"a file read into the {family} command", text))
    return sources


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
    sys.exit(main())
