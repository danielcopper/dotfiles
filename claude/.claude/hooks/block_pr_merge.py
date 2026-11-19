#!/usr/bin/env python3
"""PreToolUse(Bash) hook: a coarse, fail-closed filter against merging a pull request.

What it refuses, what passes, and what is left to the policy is written
once, in `merge_policy` (~/.claude/skills/implement/repo-config.md).
"""

import json
import os
import re
import sys
from dataclasses import dataclass

OPERATOR_CHARS = ";&|()<>"
UNQUOTED_EXPANSION = set("$`{*?[")
GH_PLACEHOLDER = re.compile(r"\{(owner|repo|branch)\}")
SHELL_C_OPTION = re.compile(r"-[A-Za-z]*c[A-Za-z]*")
COMMAND_PIECES = re.compile(r"[\s;&|()<>`$]+")
MERGE_WORDS = re.compile(r"merge", re.IGNORECASE)
COMPLETE_WORDS = re.compile(r"completed|auto-?complete", re.IGNORECASE)
ALIAS_WORDS = re.compile(r"\balias\s+(set|import)\b", re.IGNORECASE)
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish"}
FEEDERS = {"xargs", "parallel"}
NETWORK = {"gh", "az", "curl", "wget"}
WRAPPERS = {"env", "sudo", "doas", "timeout", "command", "nice", "nohup", "time", "exec", "stdbuf"}
GH_VALUE_FLAGS = {"-R", "--repo", "--hostname"}
GH_READ_ONLY = {
    ("pr", "view"), ("pr", "list"), ("pr", "status"), ("pr", "checks"), ("pr", "diff"),
    ("issue", "view"), ("issue", "list"),
}  # fmt: skip
MAX_DEPTH = 5
MAX_LENGTH = 100_000
MAX_SUBSTITUTIONS = 64

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): {what}. Hand the PR over instead."
)
SEEN = "a gh, az, curl or wget command"


@dataclass(frozen=True)
class Word:
    """A word as the shell would see it, and the characters in it the shell would still expand."""

    text: str
    expands: frozenset[str] = frozenset()

    @property
    def opaque(self) -> bool:
        """Whether the shell would still expand the word; gh's own placeholders do not count."""
        if self.expands - {"{"}:
            return True
        return "{" in self.expands and "{" in GH_PLACEHOLDER.sub("", self.text)


Token = Word | str  # a str is an operator


def lex(text: str) -> list[Token]:
    """Words and operators of *text* by the shell's quoting rules; ValueError on open quotes."""
    tokens: list[Token] = []
    chars: list[str] = []
    expands: set[str] = set()
    in_word = False
    i = 0

    def flush() -> None:
        nonlocal in_word
        if in_word:
            tokens.append(Word("".join(chars), frozenset(expands)))
        chars.clear()
        expands.clear()
        in_word = False

    while i < len(text):
        c = text[i]
        if c == "\\":
            if text[i + 1 : i + 2] == "\n":
                i += 2
                continue
            chars.append(text[i + 1 : i + 2])
            expands.add("\\")
            in_word = True
            i += 2
        elif c == "'":
            end = text.find("'", i + 1)
            if end < 0:
                raise ValueError("open single quote")
            chars.append(text[i + 1 : end])
            in_word = True
            i = end + 1
        elif c == '"':
            i += 1
            while True:
                if i >= len(text):
                    raise ValueError("open double quote")
                d = text[i]
                if d == '"':
                    break
                if d == "\\":
                    expands.add("\\")
                    if text[i + 1 : i + 2] == "\n":
                        i += 2
                        continue
                    chars.append(text[i + 1 : i + 2])
                    i += 2
                    continue
                if d in "$`":
                    expands.add(d)
                chars.append(d)
                i += 1
            in_word = True
            i += 1
        elif c in " \t\r":
            flush()
            i += 1
        elif c == "\n":
            flush()
            tokens.append(";")
            i += 1
        elif c in OPERATOR_CHARS:
            flush()
            start = i
            while i < len(text) and text[i] in OPERATOR_CHARS:
                i += 1
            tokens.append(text[start:i])
        else:
            if c in UNQUOTED_EXPANSION:
                expands.add(c)
            chars.append(c)
            in_word = True
            i += 1
    flush()
    return tokens


def segments(text: str) -> list[list[Word]]:
    """The simple commands of *text*, each as its list of words."""
    found: list[list[Word]] = [[]]
    for token in lex(text):
        if isinstance(token, str):
            found.append([])
        else:
            found[-1].append(token)
    return [segment for segment in found if segment]


def rough_segments(text: str) -> list[list[Word]]:
    """Segments of *text* whose quoting does not parse: quotes and backslashes dropped, and
    every expanding character counted as expanding, since its quoting is unknown."""
    bare = re.sub(r"[\"'\\]", "", text)
    return [
        [Word(word, frozenset(word) & UNQUOTED_EXPANSION) for word in segment.split()]
        for segment in re.split(r"[;&|()<>\n]", bare)
    ]


def substitution_spans(text: str) -> list[tuple[int, int]]:
    """Where $( ... ) and backtick substitutions sit in *text*, found in one pass; an open one
    runs to the end. Stops once more than MAX_SUBSTITUTIONS are found."""
    found: list[tuple[int, int]] = []
    opened: list[int | None] = []  # start of each open $( ), None for a plain (
    backtick: int | None = None
    i = 0
    while i < len(text) and len(found) <= MAX_SUBSTITUTIONS:
        c = text[i]
        if c == "$" and text[i + 1 : i + 2] == "(":
            opened.append(i + 2)
            i += 2
            continue
        if c == "(":
            opened.append(None)
        elif c == ")" and opened:
            start = opened.pop()
            if start is not None:
                found.append((start, i))
        elif c == "`":
            if backtick is None:
                backtick = i + 1
            else:
                found.append((backtick, i))
                backtick = None
        i += 1
    found += [(start, len(text)) for start in opened if start is not None]
    if backtick is not None:
        found.append((backtick, len(text)))
    return found


def names_network(word: Word) -> bool:
    """Whether *word*, or a command inside it when it is a quoted string, names gh, az, curl or wget."""
    return any(os.path.basename(piece) in NETWORK for piece in COMMAND_PIECES.split(word.text))


def reads_file(word: Word) -> bool:
    """Whether *word* hands a request body or query over from a file or stdin."""
    text = word.text
    if re.search(r"(^|=)@", text):
        return True
    if text == "--input" or text.startswith(("--input=", "--upload-file")):
        return True
    return bool(re.fullmatch(r"-[A-Za-z]*T.*", text))


def command_word(words: list[Word]) -> int | None:
    """Index of the word a segment runs, past VAR=value assignments and known wrappers with their
    options and numeric arguments."""
    for i, word in enumerate(words):
        text = word.text
        if re.match(r"[A-Za-z_][A-Za-z0-9_]*=", text) or text.startswith("-"):
            continue
        if os.path.basename(text) in WRAPPERS or re.fullmatch(r"\d+(\.\d+)?[smhd]?", text):
            continue
        return i
    return None


def gh_read_only(words: list[Word]) -> bool:
    """Whether the segment runs gh, as its command word and its only gh, az, curl or wget, in a
    read-only form: pr or issue view/list and the like, search, run, or api with no method other
    than GET and no fields."""
    at = command_word(words)
    if at is None or os.path.basename(words[at].text) != "gh":
        return False
    if sum(names_network(word) for word in words) != 1:
        return False
    args = [word.text for word in words[at + 1 :]]
    positional: list[str] = []
    skip = False
    for arg in args:
        if skip:
            skip = False
        elif arg in GH_VALUE_FLAGS:
            skip = True
        elif not arg.startswith("-"):
            positional.append(arg)
    if positional[:1] in (["search"], ["run"]) or tuple(positional[:2]) in GH_READ_ONLY:
        return True
    if positional[:1] != ["api"]:
        return False
    for i, arg in enumerate(args):
        if arg.startswith(("--field", "--raw-field", "--input")):
            return False
        if arg.startswith("--method"):
            value = arg.split("=", 1)[1] if "=" in arg else "".join(args[i + 1 : i + 2])
            if value.upper() != "GET":
                return False
        elif re.match(r"-[A-Za-z]", arg):
            letters = arg[1:]
            if "f" in letters or "F" in letters:
                return False
            if "X" in letters:
                after = letters.split("X", 1)[1] or "".join(args[i + 1 : i + 2])
                if after.upper() != "GET":
                    return False
    return True


def network_reason(words: list[Word]) -> str | None:
    """The reason to refuse a segment that names gh, az, curl or wget, or None."""
    if any(word.opaque for word in words):
        return f"{SEEN} builds a word at run time"
    said = " ".join(word.text for word in words)
    if any(reads_file(word) for word in words):
        what = "reads its body from a file"
    elif ALIAS_WORDS.search(said):
        what = "defines a gh alias"
    elif MERGE_WORDS.search(said):
        what = "mentions a merge"
    elif COMPLETE_WORDS.search(said):
        what = "mentions completing a pull request"
    else:
        return None
    return None if gh_read_only(words) else f"{SEEN} {what}"


def segment_reason(words: list[Word], depth: int) -> str | None:
    """The reason to refuse one simple command, or None."""
    for i, word in enumerate(words):
        name = os.path.basename(word.text)
        rest = words[i + 1 :]
        if name in SHELLS:
            for j, arg in enumerate(rest):
                if not arg.text.startswith("--") and SHELL_C_OPTION.fullmatch(arg.text):
                    for command in rest[j + 1 :]:
                        if not command.text.startswith("-"):
                            found = check(command.text, depth + 1)
                            if found:
                                return found
                    break
        elif name == "eval":
            found = check(" ".join(arg.text for arg in rest), depth + 1)
            if found:
                return found
        elif name in FEEDERS and any(names_network(arg) for arg in rest):
            return f"{name} feeds words to {SEEN} that the hook cannot see"
    if any(names_network(word) for word in words):
        return network_reason(words)
    return None


def check(command: str, depth: int = 0) -> str | None:
    """The reason to refuse *command*, or None."""
    if depth > MAX_DEPTH:
        return "the command is nested too deep to check"
    if len(command) > MAX_LENGTH:
        return "the command is too long to check"
    spans = substitution_spans(command)
    if len(spans) > MAX_SUBSTITUTIONS:
        return "the command holds too many substitutions to check"
    for text in [command, *(command[start:end] for start, end in spans)]:
        try:
            parsed = segments(text)
        except ValueError:
            parsed = rough_segments(text)
        for words in parsed:
            found = segment_reason(words, depth)
            if found:
                return found
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    what = check(command) if command else None
    if what:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": REASON.format(what=what),
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
