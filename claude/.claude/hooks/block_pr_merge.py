#!/usr/bin/env python3
"""PreToolUse(Bash) hook: commands that merge a pull request are refused.

The owner merges every PR (`merge_policy` in
~/.claude/skills/implement/repo-config.md). The text deny rules in
settings.json match any command that mentions a merge command; this hook
parses the command instead, so a merge spelled differently is caught too:

- `gh pr merge`, and `gh alias set` / `gh alias import`, which could name
  a merge under another word;
- `gh api` on a pulls/<n>/merge or repos/.../merges path;
- `gh api graphql` whose query names mergePullRequest or
  enablePullRequestAutoMerge, or comes from a file (`query=@...`,
  `--input`), where the hook cannot read it;
- `az repos pr update` with `--status completed` or `--auto-complete`;
- `curl` or `wget` on a pulls/<n>/merge URL.

The command is split into words with the shell's quoting rules and cut at
shell operators and newlines. In each segment, every word naming gh, az,
curl, wget, a shell or eval is checked with the words after it, so
wrappers such as sudo, env or timeout and their options need no list; a
quoted argument stays one word, so a merge command mentioned inside a
message passes here (the text deny rules catch that). `xargs` or
`parallel` in front of gh, az, curl or wget is refused, since they supply
words the hook cannot see. `bash -c`, `eval` and the like are checked
recursively, command substitutions as their own text. Heredoc bodies are
checked as commands too, since `bash <<EOF` runs them.

The hook judges the command as written. A word that decides the verdict
(gh's first two positional words and its api endpoint; az's command words
and, for `az repos pr update`, every argument; curl's and wget's URLs) and
that the shell would still expand - an unquoted or double-quoted `$` or
backtick, an unquoted `{`, `*`, `?` or `[`, or any backslash - is refused,
because the hook cannot read what it will become. gh's own `{owner}`,
`{repo}` and `{branch}` placeholders are fine.
"""

import json
import os
import re
import sys
from dataclasses import dataclass

OPERATOR_CHARS = ";&|()<>"
UNQUOTED_EXPANSION = set("$`{*?[")
PULL_MERGE = re.compile(r"pulls/[^/\s]+/merge(?![\w-])")
REPO_MERGES = re.compile(r"repos/\S*/merges(?![\w-])")
MERGE_MUTATION = re.compile(r"mergePullRequest|enablePullRequestAutoMerge", re.IGNORECASE)
GH_PLACEHOLDER = re.compile(r"\{(owner|repo|branch)\}")
SHELL_C_OPTION = re.compile(r"-[A-Za-z]*c[A-Za-z]*")
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish"}
FEEDERS = {"xargs", "parallel"}
NETWORK = {"gh", "az", "curl", "wget"}
GH_VALUE_FLAGS = {"-R", "--repo", "--hostname"}
GH_API_VALUE_FLAGS = {
    "-X", "--method", "-H", "--header", "-f", "--raw-field", "-F", "--field",
    "-q", "--jq", "-t", "--template", "--input", "--hostname", "--cache",
    "-p", "--preview",
}  # fmt: skip
CURL_VALUE_FLAGS = {
    "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode",
    "-u", "--user", "-o", "--output", "-X", "--request", "-A", "--user-agent",
    "-e", "--referer", "-b", "--cookie", "-c", "--cookie-jar", "-F", "--form",
    "-T", "--upload-file", "--oauth2-bearer", "-w", "--write-out", "-m", "--max-time",
}  # fmt: skip
WGET_VALUE_FLAGS = {
    "--header", "-O", "--output-document", "--user", "--password", "--method",
    "--body-data", "--post-data", "-o", "--output-file", "-U", "--user-agent",
}  # fmt: skip
MAX_DEPTH = 5

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): {what}. Hand the PR over instead."
)


@dataclass(frozen=True)
class Word:
    """A word as the shell would see it, and the characters in it the shell would still expand."""

    text: str
    expands: frozenset[str] = frozenset()

    @property
    def opaque(self) -> bool:
        return bool(self.expands)


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


def substitutions(text: str) -> list[str]:
    """Text that runs inside $( ... ) or backticks, from each opening to the end."""
    inner = [text[match.end() :] for match in re.finditer(r"\$\(", text)]
    inner += text.split("`")[1::2]
    return inner


def takes_value(flag: str, value_flags: set[str]) -> bool:
    """Whether *flag*, alone or ending a cluster of short flags, takes the next word as its value."""
    if flag in value_flags:
        return True
    return bool(re.fullmatch(r"-[A-Za-z]{2,}", flag)) and f"-{flag[-1]}" in value_flags


def positional(args: list[Word], value_flags: set[str]) -> list[Word]:
    """The non-flag words of *args*, skipping the value of each flag in *value_flags*."""
    words: list[Word] = []
    skip = False
    for arg in args:
        if skip:
            skip = False
        elif takes_value(arg.text, value_flags):
            skip = True
        elif not arg.text.startswith("-"):
            words.append(arg)
    return words


def gh_opaque(word: Word) -> bool:
    """Whether *word* still expands once gh's own placeholders are set aside."""
    if word.expands - {"{"}:
        return True
    return "{" in word.expands and "{" in GH_PLACEHOLDER.sub("", word.text)


def gh_reason(args: list[Word]) -> str | None:
    words = positional(args, GH_VALUE_FLAGS)
    if any(gh_opaque(word) for word in words[:2]):
        return "gh's subcommand is built at run time, so the hook cannot read it"
    texts = [word.text for word in words]
    if texts[:2] == ["pr", "merge"]:
        return "gh pr merge merges it"
    if texts[:1] == ["alias"] and texts[1:2] in (["set"], ["import"]):
        return "a gh alias can run a merge under another name"
    if texts[:1] != ["api"]:
        return None
    after_api = args[next(i for i, arg in enumerate(args) if arg is words[0]) + 1 :]
    endpoints = positional(after_api, GH_API_VALUE_FLAGS)
    if any(gh_opaque(endpoint) for endpoint in endpoints):
        return "the gh api endpoint is built at run time, so the hook cannot read it"
    if any(PULL_MERGE.search(e.text) or REPO_MERGES.search(e.text) for e in endpoints):
        return "gh api calls a merge endpoint"
    if any(endpoint.text == "graphql" for endpoint in endpoints):
        if any(MERGE_MUTATION.search(arg.text) for arg in after_api):
            return "the GraphQL query merges or arms auto-merge"
        if any(
            arg.text == "--input" or arg.text.startswith("--input=") or "query=@" in arg.text
            for arg in after_api
        ):
            return "the GraphQL query comes from a file the hook cannot check"
    return None


def az_reason(args: list[Word]) -> str | None:
    if any(word.opaque for word in positional(args, set())[:3]):
        return "az's command is built at run time, so the hook cannot read it"
    texts = [arg.text for arg in args]
    if not any(texts[i : i + 3] == ["repos", "pr", "update"] for i in range(len(texts))):
        return None
    if any(arg.opaque for arg in args):
        return "an argument of az repos pr update is built at run time"
    lowered = [text.lower() for text in texts]
    for i, arg in enumerate(lowered):
        if arg == "--status" and lowered[i + 1 : i + 2] == ["completed"]:
            return "az completes the PR"
        if arg == "--status=completed":
            return "az completes the PR"
        if arg == "--auto-complete" or arg.startswith("--auto-complete="):
            return "az sets the PR to auto-complete"
    return None


def url_reason(name: str, args: list[Word]) -> str | None:
    flags = CURL_VALUE_FLAGS if name == "curl" else WGET_VALUE_FLAGS
    urls = positional(args, flags)
    urls += [Word(a.text.split("=", 1)[1], a.expands) for a in args if a.text.startswith("--url=")]
    if any(url.opaque for url in urls):
        return f"a {name} URL is built at run time, so the hook cannot read it"
    if any(PULL_MERGE.search(url.text) for url in urls):
        return f"{name} calls a merge endpoint"
    return None


def segment_reason(tokens: list[Word], depth: int) -> str | None:
    for at, token in enumerate(tokens):
        found = word_reason(os.path.basename(token.text), tokens[at + 1 :], depth)
        if found:
            return found
    return None


def word_reason(name: str, args: list[Word], depth: int) -> str | None:
    """The reason to refuse running *name* with *args*, or None."""
    if name in SHELLS:
        for i, arg in enumerate(args):
            if not arg.text.startswith("--") and SHELL_C_OPTION.fullmatch(arg.text):
                for command in args[i + 1 :]:
                    if not command.text.startswith("-"):
                        found = check(command.text, depth + 1)
                        if found:
                            return found
                return None
        return None
    if name == "eval":
        return check(" ".join(arg.text for arg in args), depth + 1)
    if name in FEEDERS and any(os.path.basename(arg.text) in NETWORK for arg in args):
        return f"{name} feeds words to gh, az, curl or wget that the hook cannot see"
    if name == "gh":
        return gh_reason(args)
    if name == "az":
        return az_reason(args)
    if name in ("curl", "wget"):
        return url_reason(name, args)
    return None


def check(command: str, depth: int = 0) -> str | None:
    """The reason to refuse *command*, or None."""
    if depth > MAX_DEPTH:
        return None
    for text in [command, *substitutions(command)]:
        try:
            parsed = segments(text)
        except ValueError:
            parsed = [
                [Word(word) for word in segment.split()]
                for segment in re.split(r"[;&|()<>\n]", text)
            ]
        for tokens in parsed:
            found = segment_reason(tokens, depth)
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
