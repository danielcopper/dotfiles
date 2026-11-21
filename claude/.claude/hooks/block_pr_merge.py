#!/usr/bin/env python3
"""PreToolUse(Bash) hook: a coarse, fail-closed filter against merging a pull request.

What it refuses, what passes, and what is left to the policy is written once, in
`merge_policy` (~/.claude/skills/implement/repo-config.md).
"""

import itertools
import json
import re
import sys
from dataclasses import dataclass

MAX_LENGTH = 100_000
MAX_EVALS = 5
MAX_SUBSTITUTIONS = 64

# A command word as a whole word or a path's basename, not part of gh-pages or gh.io.
NETWORK = re.compile(r"(?<![\w.-])(gh|az|curl|wget)(?![\w.-])")
GH = re.compile(r"(?<![\w.-])gh(?![\w.-])")
AZ = re.compile(r"(?<![\w.-])az(?![\w.-])")
FEEDER = re.compile(r"(?<![\w.-])(xargs|parallel)(?![\w.-])")
EVAL = re.compile(r"(?<![\w.-])eval(?![\w.-])")
SHELL_WORD = re.compile(r"(?<![\w.-])(bash|sh|zsh|dash|ksh|fish)(?![\w.-])")
SHELL_C_CLUSTER = re.compile(r"(?<!\S)-[a-z]*c[a-z]*(?!\S)")
SOURCE_COMMAND = re.compile(r"(?:^|[;&|(\n])\s*(?:source|\.)(?=\s)")
PIPE_INTO_SHELL = re.compile(r"\|\s*(?:\S*/)?(bash|sh|zsh|dash|ksh|fish)(?![\w.-])")
# Where a request body can merge: gh api, curl, wget, and az rest, devops invoke and repos pr.
BODY_TOOL = re.compile(r"(?<![\w.-])(curl|wget)(?![\w.-])")
TOKEN_SPLIT = re.compile(r"[\s;&|()<>`]+")
MAX_OPTION_WALK = 50
MAX_QUOTE_DEPTH = 3
SHELL_OPS = set("|;&<>()`")
CURL_WRITE_LONG = ("--data", "--json", "--form", "--upload-file", "--config", "--post-", "--body-")
# gh's top-level commands other than api, as `gh help` lists them (gh 2.x, 2026-11), plus help
# and version. A word in the subcommand position outside this list fails closed.
GH_SUBCOMMANDS = frozenset(
    [
        "agent-task",
        "alias",
        "attestation",
        "auth",
        "browse",
        "cache",
        "co",
        "codespace",
        "completion",
        "config",
        "copilot",
        "discussion",
        "event",
        "extension",
        "gist",
        "gpg-key",
        "help",
        "issue",
        "label",
        "licenses",
        "org",
        "pr",
        "preview",
        "project",
        "release",
        "repo",
        "ruleset",
        "run",
        "search",
        "secret",
        "skill",
        "ssh-key",
        "status",
        "variable",
        "version",
        "workflow",
    ]
)
# az's top-level groups the filter lets past, a conservative list (az is not installed here to
# read them from); rest, devops invoke and repos pr are checked before this list.
AZ_SUBCOMMANDS = frozenset(
    [
        "account",
        "boards",
        "devops",
        "extension",
        "group",
        "login",
        "logout",
        "pipelines",
        "repos",
        "resource",
        "storage",
        "version",
    ]
)
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

# The plain language and the commands in which the run-time rule spares parameters (merge_policy).
PLAIN = r"[A-Za-z0-9_./:,@%+=-]"
NAME = r"[A-Za-z_][A-Za-z0-9_]*"
SPECIAL = r"\$[?#$]"
QUOTED_PARAMETER = rf'"\$(?:{NAME}|\{{{NAME}\}})"'
PLAIN_WORD = rf'{PLAIN}++|{QUOTED_PARAMETER}|{SPECIAL}|"(?:{PLAIN}| |{SPECIAL})*+"'
PLAIN_REDIRECT = rf"2>&1|(?:2?>>?|<)[ \t]*+{PLAIN}++"
PLAIN_SEPARATOR = r"[ \t]*+(?:;|&&|\|\||\||\n)[ \t\n]*+"
PLAIN_SIMPLE = rf"(?:{PLAIN_WORD})(?:[ \t]++(?:{PLAIN_REDIRECT}|{PLAIN_WORD}))*+"
PLAIN_COMMAND = re.compile(
    rf"[ \t\n]*+{PLAIN_SIMPLE}(?:{PLAIN_SEPARATOR}{PLAIN_SIMPLE})*+[ \t]*+(?:[;\n][ \t\n]*+)?"
)
PLAIN_PIECE = re.compile(
    rf"(?P<redirect>{PLAIN_REDIRECT})|(?P<word>{PLAIN_WORD})|(?P<separator>{PLAIN_SEPARATOR})"
)
SPECIAL_PARAMETER = re.compile(SPECIAL)
ASSIGNMENT = re.compile(rf"{NAME}=")
ALLOWED_COMMANDS = frozenset(
    ["echo", "printf", "test", "true", "false", "exit", ":"]
    + ["head", "tail", "grep", "jq", "wc", "uniq", "cut", "tr", "cat"]
)
GH_READ_ONLY = {
    "pr": frozenset(["view", "list", "status", "checks", "diff"]),
    "issue": frozenset(["view", "list"]),
    "run": frozenset(["view", "list", "watch"]),
}

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): the command {what}. Hand the PR over instead."
)


def stripped(command: str) -> str:
    """*command* with backslash-newlines joined and every quote, backslash and $'/$" prefix removed."""
    text = command.replace("\\\n", "").replace("$'", "").replace('$"', "")
    return text.replace("'", "").replace('"', "").replace("\\", "")


def quote_parts(command: str) -> tuple[str, str]:
    """The text of *command* outside quotes, and the text inside double quotes. Single-quoted
    text is in neither. Open quoting puts the whole command outside, which fails closed."""
    outside: list[str] = []
    double: list[str] = []
    quote = ""
    for c in command:
        if quote:
            if c == quote:
                quote = ""
                outside.append(" ")
            elif quote == '"':
                double.append(c)
        elif c in "'\"":
            quote = c
        else:
            outside.append(c)
    if quote:
        return command, ""
    return "".join(outside), "".join(double)


def rereads(lower: str) -> bool:
    """Whether the de-quoted, lowercased command hands text to a shell that reads it again: a
    shell word followed later by a `-c` option cluster, `eval`, `<<<`, `source` or `.` as a
    command, or a pipe into a shell word. Quoting means nothing to such text, so the caller
    judges the whole text instead."""
    shell = SHELL_WORD.search(lower)
    return bool(
        (shell and SHELL_C_CLUSTER.search(lower, shell.end()))
        or EVAL.search(lower)
        or "<<<" in lower
        or SOURCE_COMMAND.search(lower)
        or PIPE_INTO_SHELL.search(lower)
    )


def runs_at_run_time(command: str, whole: bool = False) -> bool:
    """Whether *command* holds a construct the shell expands when it runs: `$` or a backtick
    outside single quotes, a brace expansion or a glob next to a letter outside any quotes -
    or, with *whole*, any of them anywhere in the text."""
    outside, double = (command, "") if whole else quote_parts(command)
    return (
        "$" in outside
        or "`" in outside
        or "$" in double
        or "`" in double
        or bool(BRACE_EXPANSION.search(outside))
        or bool(GLOB_NEXT_TO_LETTER.search(outside))
    )


@dataclass(frozen=True)
class Token:
    """A word of a command with its quotes removed, or an operator (`op`)."""

    text: str
    op: bool = False
    quoted: bool = False


def shell_tokens(text: str) -> tuple[list[Token], list[str]]:
    """Words and operators of *text* by the shell's quoting rules, and the content of every
    quoted string in it. ValueError on open quoting."""
    tokens: list[Token] = []
    quoted_parts: list[str] = []
    chars: list[str] = []
    in_word = False
    quoted = False
    i = 0

    def flush() -> None:
        nonlocal in_word, quoted
        if in_word:
            tokens.append(Token("".join(chars), quoted=quoted))
        chars.clear()
        in_word = quoted = False

    while i < len(text):
        c = text[i]
        if c == "\\":
            if text[i + 1 : i + 2] != "\n":
                chars.append(text[i + 1 : i + 2])
                in_word = True
            i += 2
        elif c in "'\"":
            end = text.find(c, i + 1)
            if end < 0:
                raise ValueError("open quote")
            quoted_parts.append(text[i + 1 : end])
            chars.append(text[i + 1 : end])
            in_word = quoted = True
            i = end + 1
        elif c in " \t\r":
            flush()
            i += 1
        elif c == "\n":
            flush()
            tokens.append(Token("\n", op=True))
            i += 1
        elif c in SHELL_OPS:
            flush()
            start = i
            while i < len(text) and text[i] in SHELL_OPS:
                i += 1
            tokens.append(Token(text[start:i], op=True))
        else:
            chars.append(c)
            in_word = True
            i += 1
    flush()
    return tokens, quoted_parts


def simple_commands(tokens: list[Token]) -> list[list[Token]]:
    """*tokens* cut at the operators that end a simple command: `|`, `;`, `&`, `&&`, `||`,
    newline, parentheses and backticks. Redirections (`<`, `>` and their forms) stay inside."""
    found: list[list[Token]] = [[]]
    for token in tokens:
        if token.op and not set(token.text) & set("<>"):
            found.append([])
        else:
            found[-1].append(token)
    return [command for command in found if command]


def writes_with_curl(words: list[str]) -> bool:
    """Whether curl or wget words send a request that writes: a method other than GET or HEAD,
    a body (`-d`, `--data*`, `--json`, `-F`, `--form*`, `--post-*`, `--body-*`), an upload
    (`-T`, `--upload-file`) or a config file (`-K`, `--config`)."""
    for i, word in enumerate(words):
        following = words[i + 1] if i + 1 < len(words) else ""
        if word.startswith("--"):
            name, _, value = word.partition("=")
            if name in ("--request", "--method"):
                if (value or following).upper() not in ("GET", "HEAD"):
                    return True
            elif name.startswith(CURL_WRITE_LONG):
                return True
        elif word.startswith("-"):
            # the option letters, before any attached value such as `@file`
            letters = re.split(r"[^A-Za-z0-9#:]", word[1:], maxsplit=1)[0]
            if "X" in letters:
                value = word[1:].split("X", 1)[1] or following
                if value.upper() not in ("GET", "HEAD"):
                    return True
            elif set(letters) & set("dFTK"):
                return True
    return False


def gh_az_body_tokens(words: list[Token]) -> bool:
    """Whether a simple command runs gh or az with a subcommand whose request body can merge,
    read from its quote-aware words: gh `api`, az `rest`, `devops invoke` or `repos pr` past the
    options - or an unknown word there, a quoted word or a redirection before it, or options too
    long to walk, all of which fail closed."""
    for at, token in enumerate(words):
        tool = token.text.lower().rsplit("/", 1)[-1]
        if token.op or tool not in ("gh", "az"):
            continue
        known = GH_SUBCOMMANDS if tool == "gh" else AZ_SUBCOMMANDS
        after_option = False
        for step, current in enumerate(words[at + 1 :]):
            if step >= MAX_OPTION_WALK:
                return True
            word = current.text.lower()
            if current.op or current.quoted:  # a redirection or a quoted word before it
                return True
            if word.startswith("-"):
                after_option = True
                continue
            index = at + 1 + step
            following = words[index + 1].text.lower() if index + 1 < len(words) else ""
            if tool == "gh" and word == "api":
                return True
            if tool == "az" and (
                word == "rest" or (word, following) in (("devops", "invoke"), ("repos", "pr"))
            ):
                return True
            if after_option:
                after_option = False
                continue
            if word not in known:
                return True
            break
    return False


def reads_or_writes_body(command: str, depth: int = 0) -> str | None:
    """The reason when a simple command of *command*, or of a quoted string in it, sends a
    request body that can merge: gh api, az rest, devops invoke or repos pr reading from a file,
    or curl or wget writing. Only the words of that simple command count. None otherwise; open
    quoting returns None for the caller's whole-text check."""
    if depth > MAX_QUOTE_DEPTH:
        return "is nested too deep to check"
    tokens, quoted_parts = shell_tokens(command)
    for words in simple_commands(tokens):
        texts = [token.text for token in words if not token.op]
        names = [text.lower().rsplit("/", 1)[-1] for text in texts]
        if (set(names) & {"curl", "wget"}) and writes_with_curl(texts):
            return "sends a writing request with curl or wget"
        if gh_az_body_tokens(words):
            joined = " ".join(texts)
            if FILE_FLAGS.search(joined.lower()) or FILE_SHORT_FLAGS.search(joined):
                return "reads a request from a file"
    for part in quoted_parts:
        try:
            found = reads_or_writes_body(part, depth + 1)
        except ValueError:
            continue
        if found:
            return found
    return None


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


def subcommand_positions(tokens: list[str], at: int) -> tuple[list[int], bool] | None:
    """Indexes of the words that can be the subcommand of the tool at *tokens[at]*, past its
    options, and whether the last of them is the first word not right after an option. A word
    right after an option may be that option's value or the subcommand, so both count. None when
    the options run past MAX_OPTION_WALK words, where the walk gives up."""
    found: list[int] = []
    after_option = False
    end = min(len(tokens), at + 1 + MAX_OPTION_WALK)
    for i in range(at + 1, end):
        if not tokens[i]:
            continue
        if tokens[i].startswith("-"):
            after_option = True
            continue
        found.append(i)
        if not after_option:
            return found, True
        after_option = False
    return (found, False) if end == len(tokens) else None


def hidden_before(original: str, start: int, word: str) -> bool:
    """Whether the original text from *start* up to the first *word* after it holds a quote, `<`
    or `>` - a quoted value or a redirection that normalising may have turned into the word - or
    holds no such word at all."""
    found = re.compile(rf"(?<![\w.-]){re.escape(word)}(?![\w.-])").search(original, start)
    return found is None or any(c in original[start : found.start()] for c in "'\"<>")


def body_subcommand(lower: str, original: str) -> bool:
    """Whether gh or az may run a subcommand whose request body can merge: gh `api`, az `rest`,
    `devops invoke` or `repos pr` in the subcommand position, past any options - or a word there
    that is no known subcommand, options too long to walk, or a quote or redirection in the
    original text before the subcommand, all of which fail closed. *original* is the command
    lowercased but not normalised."""
    tokens = TOKEN_SPLIT.split(lower)
    tool_starts = {
        tool: [match.start() for match in re.finditer(rf"(?<![\w.-]){tool}(?![\w.-])", original)]
        for tool in ("gh", "az")
    }
    tool_tokens = [token.rsplit("/", 1)[-1] for token in tokens]
    if any(0 < tool_tokens.count(tool) != len(tool_starts[tool]) for tool in ("gh", "az")):
        return True  # the original and the normalised text disagree on where the tool runs
    seen = {"gh": 0, "az": 0}
    for at, token in enumerate(tokens):
        tool = token.rsplit("/", 1)[-1]
        if tool not in ("gh", "az"):
            continue
        ordinal = seen[tool]
        seen[tool] += 1
        walked = subcommand_positions(tokens, at)
        if walked is None:
            return True
        positions, has_final = walked
        for i in positions:
            pair = (tokens[i], tokens[i + 1] if i + 1 < len(tokens) else "")
            if tool == "gh" and pair[0] == "api":
                return True
            if tool == "az" and (
                pair[0] == "rest" or pair in (("devops", "invoke"), ("repos", "pr"))
            ):
                return True
        known = GH_SUBCOMMANDS if tool == "gh" else AZ_SUBCOMMANDS
        if has_final and tokens[positions[-1]] not in known:
            return True
        if has_final and hidden_before(original, tool_starts[tool][ordinal], tokens[positions[-1]]):
            return True
    return False


def plain_commands(command: str) -> list[list[re.Match[str]]]:
    """The simple commands of *command*, each as its words and redirections, when the whole text
    is in the plain language and every simple command is allowed; no command at all otherwise."""
    if not PLAIN_COMMAND.fullmatch(command):
        return []
    found: list[list[re.Match[str]]] = [[]]
    for piece in PLAIN_PIECE.finditer(command):
        if piece.lastgroup == "separator":
            found.append([])
        else:
            found[-1].append(piece)
    commands = [pieces for pieces in found if pieces]
    return commands if all(allowed(pieces) for pieces in commands) else []


def allowed(pieces: list[re.Match[str]]) -> bool:
    """Whether a plain simple command is only assignments, or its command word past leading
    assignments is one of ALLOWED_COMMANDS or gh with a subcommand from GH_READ_ONLY."""
    rest = list(
        itertools.dropwhile(
            lambda piece: piece.lastgroup == "word" and ASSIGNMENT.match(piece.group()), pieces
        )
    )
    texts = [piece.group() if piece.lastgroup == "word" else "" for piece in rest[:3]]
    if not texts:
        return True
    if texts[0] == "gh":
        return len(texts) == 3 and texts[2] in GH_READ_ONLY.get(texts[1], ())
    return texts[0] in ALLOWED_COMMANDS


def spared_in(command: str, pieces: list[re.Match[str]]) -> list[tuple[int, int, str]]:
    """Where a parameter of one allowed plain simple command does not count, and what stands for
    it: `0` for `$?`, `$#` and `$$` when no piece names gh, az, curl or wget; `""` for a
    whole-word `"$NAME"` in a command that starts with gh, after a plain word that is no
    option."""
    if not NETWORK.search(" ".join(piece.group() for piece in pieces).lower()):
        return [
            (found.start(), found.end(), "0")
            for piece in pieces
            if piece.lastgroup == "word"
            for found in SPECIAL_PARAMETER.finditer(command, piece.start(), piece.end())
        ]
    if pieces[0].group() != "gh":
        return []
    return [
        (piece.start(), piece.end(), '""')
        for previous, piece in itertools.pairwise(pieces[2:])
        if re.fullmatch(rf"{PLAIN}++", previous.group())
        and not previous.group().startswith("-")
        and re.fullmatch(QUOTED_PARAMETER, piece.group())
    ]


def without_spared_parameters(command: str) -> str:
    """*command* with the parameters the run-time rule does not count replaced by plain text;
    unchanged when the command is not in the plain language."""
    spans = sorted(
        span for pieces in plain_commands(command) for span in spared_in(command, pieces)
    )
    out: list[str] = []
    position = 0
    for start, end, replacement in spans:
        out.append(command[position:start])
        out.append(replacement)
        position = end
    out.append(command[position:])
    return "".join(out)


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
    body_tool = BODY_TOOL.search(lower) is not None or body_subcommand(lower, command.lower())
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
    reread = rereads(lower)
    whole = reread  # a shell reads the text again: judge the whole de-quoted text
    body = None
    if not reread:
        try:
            body = reads_or_writes_body(command)
        except ValueError:  # open quoting: judge the whole text
            whole = True
    if whole:
        # re-read text counts next to any network word; open quoting next to a body tool only
        near = network if reread else body_tool
        if near and (FILE_FLAGS.search(lower) or FILE_SHORT_FLAGS.search(plain)):
            body = "reads a request from a file"
        elif near and writes_with_curl(plain.split()):
            body = "sends a writing request with curl or wget"
        else:
            body = None
    if body:
        return body
    if body_tool and "merge" in lower:
        return (
            "mentions a merge next to curl, wget, gh api, az rest, az devops invoke or az repos pr"
        )
    if network and FEEDER.search(lower):
        return "feeds gh, az, curl or wget through xargs or parallel"
    if runs_at_run_time(command if reread else without_spared_parameters(command), whole=reread):
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
