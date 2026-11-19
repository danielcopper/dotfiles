#!/usr/bin/env python3
"""PreToolUse(Bash) hook: a coarse, fail-closed filter against merging a pull request.

It judges the whole command text, normalised, with linear-time patterns.
What it refuses, what passes, and what is left to the policy is written
once, in `merge_policy` (~/.claude/skills/implement/repo-config.md).
"""

import json
import re
import sys

MAX_LENGTH = 100_000
MAX_EVALS = 5
MAX_SUBSTITUTIONS = 64

# A command word as a whole word or a path's basename, not part of gh-pages or gh.io.
NETWORK = re.compile(r"(?<![\w.-])(gh|az|curl|wget)(?![\w.-])")
GH = re.compile(r"(?<![\w.-])gh(?![\w.-])")
AZ = re.compile(r"(?<![\w.-])az(?![\w.-])")
FEEDER = re.compile(r"(?<![\w.-])(xargs|parallel)(?![\w.-])")
EVAL = re.compile(r"(?<![\w.-])eval(?![\w.-])")

PR_MERGE = re.compile(
    r"\bpr\s+merge\b|pulls/[^\s/]+/merge|/merges\b|mergepullrequest|enablepullrequestautomerge"
)
ALIAS = re.compile(r"\balias\b")
ALIAS_VERB = re.compile(r"\b(set|import)\b")
AZ_COMPLETE = re.compile(r"\b(completed|auto-?complete)\b")
DEVOPS_INVOKE = re.compile(r"\bdevops\s+invoke\b")
FILE_FLAGS = re.compile(r"@|--input|--upload-file|--config|--post-file|--body-file|--in-file")
FILE_SHORT_FLAGS = re.compile(r"(?<!\S)-[A-Za-z]*[TK]|(?<!\S)-i(?!\S)")  # case-sensitive
MENTION = re.compile(r"merge|complet|alias")
BRACE_EXPANSION = re.compile(r"\{[^{}\s]*(?:,|\.\.)[^{}\s]*\}")
GLOB_NEXT_TO_LETTER = re.compile(r"[A-Za-z][*?\[]|[*?\[][A-Za-z]")

READ_ONLY_FORBIDDEN = set(";&|<>$`(){}\n\r'\"\\")
READ_ONLY = re.compile(
    r"(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*"
    r"(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)?"
    r"(?:timeout\s+\d+[smhd]?\s+)?"
    r"gh(?:\s+(?:-R|--repo)\s+\S+|\s+--repo=\S+)?\s+"
    r"(?:pr\s+(?:view|list|status|checks|diff)|issue\s+(?:view|list)|(?:search|run)\s+\S+)"
    r"(?:\s+\S+)*"
)

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): the command {what}. Hand the PR over instead."
)


def stripped(command: str) -> str:
    """*command* with backslash-newlines joined and every quote, backslash and $'/$" prefix removed."""
    text = command.replace("\\\n", "").replace("$'", "").replace('$"', "")
    return text.replace("'", "").replace('"', "").replace("\\", "")


def runs_at_run_time(command: str) -> bool:
    """Whether *command* holds a construct the shell expands when it runs."""
    return (
        "$" in command
        or "`" in command
        or bool(BRACE_EXPANSION.search(command))
        or bool(GLOB_NEXT_TO_LETTER.search(command))
    )


def read_only(command: str) -> bool:
    """Whether *command* is, as a whole, one of the read-only gh forms with no shell syntax."""
    text = command.strip()
    if set(text) & READ_ONLY_FORBIDDEN or READ_ONLY.fullmatch(text) is None:
        return False
    lower = text.lower()
    return len(NETWORK.findall(lower)) == 1 and PR_MERGE.search(lower) is None


def check(command: str) -> str | None:
    """What makes *command* a possible merge, or None."""
    if len(command) > MAX_LENGTH:
        return "is too long to check"
    if read_only(command):
        return None
    plain = stripped(command)
    lower = plain.lower()
    network = NETWORK.search(lower) is not None
    if PR_MERGE.search(lower):
        return "mentions a PR merge"
    if ALIAS.search(lower) and ALIAS_VERB.search(lower) and GH.search(lower):
        return "defines a gh alias"
    if AZ.search(lower) and (
        AZ_COMPLETE.search(lower) or (DEVOPS_INVOKE.search(lower) and "pullrequest" in lower)
    ):
        return "completes an Azure DevOps pull request"
    if network and (FILE_FLAGS.search(lower) or FILE_SHORT_FLAGS.search(plain)):
        return "reads a request from a file"
    if network and "merge" in lower:
        return "mentions a merge next to gh, az, curl or wget"
    if network and FEEDER.search(lower):
        return "feeds gh, az, curl or wget through xargs or parallel"
    if runs_at_run_time(command):
        if MENTION.search(lower):
            return "builds a word at run time next to a merge mention"
        if network:
            return "builds a word at run time next to gh, az, curl or wget"
    if len(EVAL.findall(lower)) > MAX_EVALS:
        return "is nested too deep to check"
    if command.count("$(") + command.count("`") // 2 > MAX_SUBSTITUTIONS:
        return "holds too many substitutions to check"
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
