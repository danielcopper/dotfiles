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
# Where a request body can merge: gh api, curl, wget, and az rest, devops invoke and repos pr.
BODY_TOOL = re.compile(r"(?<![\w.-])(curl|wget)(?![\w.-])")
TOKEN_SPLIT = re.compile(r"[\s;&|()<>`]+")
MAX_OPTION_WALK = 50
PR_WORD = re.compile(r"\bpr\b")
MERGE_WORD = re.compile(r"\bmerge\b")

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
# The part before the first comma or `..` cannot hold one, so a long open brace is scanned once.
BRACE_EXPANSION = re.compile(r"\{(?:[^{}\s,.]|\.(?!\.))*(?:,|\.\.)[^{}\s]*\}")
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
PR_WRITE_FORBIDDEN = set(";&|<>$`(){}\n\r\\")
PR_WRITE = re.compile(
    r"gh(?:\s+(?:-R|--repo)\s+\S+|\s+--repo=\S+)?\s+pr\s+(?:create|edit)(?:\s+\S+)*"
)
QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")

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


def pr_write(command: str) -> bool:
    """Whether *command* is, as a whole, `gh pr create` or `gh pr edit` with flags and values,
    quoted values allowed: no shell syntax outside the quotes, nothing the shell expands inside
    double quotes, and no second gh, az, curl or wget."""
    text = command.strip()
    for quoted in QUOTED.findall(text):
        if quoted.startswith('"') and set(quoted) & set("$`\\"):
            return False
    rest = QUOTED.sub("Q", text)
    if set(rest) & (PR_WRITE_FORBIDDEN | set("'\"")) or PR_WRITE.fullmatch(rest) is None:
        return False
    return len(NETWORK.findall(text.lower())) == 1


def subcommand_positions(tokens: list[str], at: int) -> list[int] | None:
    """Indexes of the words that can be the subcommand of the tool at *tokens[at]*, past its
    options: a word right after an option may be that option's value or the subcommand, so both
    count. None when the options run past MAX_OPTION_WALK words, where the walk gives up."""
    found: list[int] = []
    after_option = False
    end = min(len(tokens), at + 1 + MAX_OPTION_WALK)
    for i in range(at + 1, end):
        if tokens[i].startswith("-"):
            after_option = True
            continue
        found.append(i)
        if not after_option:
            return found
        after_option = False
    return found if end == len(tokens) else None


def body_subcommand(lower: str) -> bool:
    """Whether gh runs `api`, or az runs `rest`, `devops invoke` or `repos pr`, in the position
    of their subcommand, past any options: there a request body can merge."""
    tokens = TOKEN_SPLIT.split(lower)
    for at, token in enumerate(tokens):
        tool = token.rsplit("/", 1)[-1]
        if tool not in ("gh", "az"):
            continue
        positions = subcommand_positions(tokens, at)
        if positions is None:
            return True
        for i in positions:
            pair = (tokens[i], tokens[i + 1] if i + 1 < len(tokens) else "")
            if tool == "gh" and pair[0] == "api":
                return True
            if tool == "az" and (
                pair[0] == "rest" or pair in (("devops", "invoke"), ("repos", "pr"))
            ):
                return True
    return False


def check(command: str) -> str | None:
    """What makes *command* a possible merge, or None."""
    if len(command) > MAX_LENGTH:
        return "is too long to check"
    if read_only(command) or pr_write(command):
        return None
    plain = stripped(command)
    lower = plain.lower()
    network = NETWORK.search(lower) is not None
    gh = GH.search(lower) is not None
    az = AZ.search(lower) is not None
    body_tool = BODY_TOOL.search(lower) is not None or body_subcommand(lower)
    if PR_MERGE.search(lower):
        return "mentions a PR merge"
    if gh and (pr := PR_WORD.search(lower)) and MERGE_WORD.search(lower, pr.end()):
        return "mentions a PR merge"
    if ALIAS.search(lower) and ALIAS_VERB.search(lower) and gh:
        return "defines a gh alias"
    if az and (
        AZ_COMPLETE.search(lower) or (DEVOPS_INVOKE.search(lower) and "pullrequest" in lower)
    ):
        return "completes an Azure DevOps pull request"
    if body_tool and (FILE_FLAGS.search(lower) or FILE_SHORT_FLAGS.search(plain)):
        return "reads a request from a file"
    if body_tool and "merge" in lower:
        return "mentions a merge next to gh api, az, curl or wget"
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
