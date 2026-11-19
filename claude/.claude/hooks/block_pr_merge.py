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

The command is split into words (shlex) and cut at shell operators and
newlines. In each segment, every word naming gh, az, curl, wget, a shell
or eval is checked with the words after it, so wrappers such as sudo,
env, timeout or xargs and their options need no list; a quoted argument
stays one word, so a merge command mentioned inside a message passes
here (the text deny rules catch that). `bash -c` and `eval` are checked
recursively, command substitutions as their own text. Heredoc bodies are
checked as commands too, since `bash <<EOF` runs them.
"""

import json
import os
import re
import shlex
import sys

OPERATOR = re.compile(r"^[;&|()<>]+$")
PULL_MERGE = re.compile(r"pulls/[^/\s]+/merge(?![\w-])")
REPO_MERGES = re.compile(r"repos/\S*/merges(?![\w-])")
MERGE_MUTATION = re.compile(r"mergePullRequest|enablePullRequestAutoMerge", re.IGNORECASE)
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}
GH_VALUE_FLAGS = {"-R", "--repo", "--hostname"}
MAX_DEPTH = 5

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): {what}. Hand the PR over instead."
)


def tokenize(text: str) -> list[str]:
    """Words and operator tokens of *text*; a whitespace split when the quoting does not parse."""
    lexer = shlex.shlex(
        text.replace("\r\n", "\n").replace("\n", " ; "), posix=True, punctuation_chars=True
    )
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return list(lexer)
    except ValueError:
        return re.split(r"\s+", re.sub(r"[;&|()<>\n]", " ; ", text))


def segments(text: str) -> list[list[str]]:
    """The simple commands of *text*, each as its list of words."""
    found: list[list[str]] = [[]]
    for token in tokenize(text):
        if OPERATOR.match(token):
            found.append([])
        elif token:
            found[-1].append(token)
    return [segment for segment in found if segment]


def substitutions(text: str) -> list[str]:
    """Text that runs inside $( ... ) or backticks, from each opening to the end."""
    inner = [text[match.end() :] for match in re.finditer(r"\$\(", text)]
    inner += text.split("`")[1::2]
    return inner


def positional(args: list[str], value_flags: set[str]) -> list[str]:
    """The non-flag words of *args*, skipping the value of each flag in *value_flags*."""
    words: list[str] = []
    skip = False
    for arg in args:
        if skip:
            skip = False
        elif arg in value_flags:
            skip = True
        elif not arg.startswith("-"):
            words.append(arg)
    return words


def gh_reason(args: list[str]) -> str | None:
    words = positional(args, GH_VALUE_FLAGS)
    if words[:2] == ["pr", "merge"]:
        return "gh pr merge merges it"
    if words[:1] == ["alias"] and words[1:2] in (["set"], ["import"]):
        return "a gh alias can run a merge under another name"
    if words[:1] != ["api"]:
        return None
    if any(PULL_MERGE.search(arg) or REPO_MERGES.search(arg) for arg in args):
        return "gh api calls a merge endpoint"
    if "graphql" in args:
        if any(MERGE_MUTATION.search(arg) for arg in args):
            return "the GraphQL query merges or arms auto-merge"
        if any(arg == "--input" or arg.startswith("--input=") or "query=@" in arg for arg in args):
            return "the GraphQL query comes from a file the hook cannot check"
    return None


def az_reason(args: list[str]) -> str | None:
    if positional(args, set())[:3] != ["repos", "pr", "update"]:
        return None
    lowered = [arg.lower() for arg in args]
    for i, arg in enumerate(lowered):
        if arg == "--status" and lowered[i + 1 : i + 2] == ["completed"]:
            return "az completes the PR"
        if arg == "--status=completed":
            return "az completes the PR"
        if arg == "--auto-complete" or arg.startswith("--auto-complete="):
            return "az sets the PR to auto-complete"
    return None


def segment_reason(tokens: list[str], depth: int) -> str | None:
    for at, token in enumerate(tokens):
        found = word_reason(os.path.basename(token), tokens[at + 1 :], depth)
        if found:
            return found
    return None


def word_reason(name: str, args: list[str], depth: int) -> str | None:
    """The reason to refuse running *name* with *args*, or None."""
    if name in SHELLS:
        for i, arg in enumerate(args[:-1]):
            if re.fullmatch(r"-[a-z]*c", arg):
                return check(args[i + 1], depth + 1)
        return None
    if name == "eval":
        return check(" ".join(args), depth + 1)
    if name == "gh":
        return gh_reason(args)
    if name == "az":
        return az_reason(args)
    if name in ("curl", "wget") and any(PULL_MERGE.search(arg) for arg in args):
        return f"{name} calls a merge endpoint"
    return None


def check(command: str, depth: int = 0) -> str | None:
    """The reason to refuse *command*, or None."""
    if depth > MAX_DEPTH:
        return None
    for text in [command, *substitutions(command)]:
        for tokens in segments(text):
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
