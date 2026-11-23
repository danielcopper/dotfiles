#!/usr/bin/env python3
"""PreToolUse(Bash) hook: a coarse, fail-closed filter against merging a pull request.

What it refuses, what passes, and what is left to the policy is written once, in
`merge_policy` (~/.claude/skills/implement/repo-config.md).
"""

import itertools
import json
import re
import signal
import sys
from dataclasses import dataclass
from urllib.parse import unquote

MAX_LENGTH = 100_000
DEADLINE = 5.0  # seconds a check may take before the hook denies
MAX_EVALS = 5
MAX_SUBSTITUTIONS = 64

# A command word as a whole word or a path's basename, not part of gh-pages or gh.io.
NETWORK_TOOLS = ("gh", "az", "curl", "wget")
NETWORK = re.compile(rf"(?<![\w.-])({'|'.join(NETWORK_TOOLS)})(?![\w.-])")
GH = re.compile(r"(?<![\w.-])gh(?![\w.-])")
AZ = re.compile(r"(?<![\w.-])az(?![\w.-])")
FEEDER = re.compile(r"(?<![\w.-])(xargs|parallel)(?![\w.-])")
EVAL = re.compile(r"(?<![\w.-])eval(?![\w.-])")
SHELL_NAMES = ("bash", "sh", "zsh", "dash", "ksh", "ash", "fish")
SHELL_WORD = re.compile(rf"(?<![\w.-])({'|'.join(SHELL_NAMES)})(?![\w.-])")
SHELL_C_CLUSTER = re.compile(r"(?<!\S)-[a-z]*c[a-z]*(?!\S)")
SOURCE_COMMAND = re.compile(r"(?:^|[;&|(\n])[^\S\n]*(?:source|\.)(?=\s)")
# Operators and words of de-quoted text, for finding command words.
# 2>&1, >&2 and &> are redirections, read before & can count as an operator.
COMMAND_TOKEN = re.compile(r"\d*[<>]&-?\d*|&>>?|\|&|&&|\|\||[|;&()\n`]|[^\s|;&()`]+")
COMMAND_OPERATORS = frozenset(["|&", "&&", "||", "|", ";", "&", "(", ")", "\n", "`"])
REDIRECTION = re.compile(r"\d*[<>]|&>")
BARE_REDIRECTION = re.compile(r"\d*[<>]+[&|]?|&>>?")
# Commands that run a program named in their arguments or their data.
TRAP = re.compile(r"(?<![\w.-])trap(?![\w.-])")
SORT = re.compile(r"(?<![\w.-])sort(?![\w.-])")
SORT_PROGRAM = re.compile(r"(?<!\S)--co[\w-]*")  # --compress-program and its abbreviations
FIND = re.compile(r"(?<![\w.-])find(?![\w.-])")
FIND_EXEC = re.compile(r"(?<!\S)-(?:exec|execdir|ok|okdir)(?!\S)")
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
EXTENSION_WORDS = frozenset(["extension", "extensions", "ext"])  # gh extension exec <name>
SUBCOMMANDS = {"gh": GH_SUBCOMMANDS, "az": AZ_SUBCOMMANDS}
PR_WORD = re.compile(r"\bpr\b")
# The merge word of the "pr followed later by merge" rule, next to gh; MERGE_TERM below is the
# narrower vocabulary of the body-tool and run-time rules.
MERGE_WORD = re.compile(r"\bmerge\b")

PR_MERGE = re.compile(
    r"\bpr\s+merge\b|pulls/[^\s/]+/merge|/merges\b"
    r"|mergepullrequest|enablepullrequestautomerge|enqueuepullrequest"
)
ALIAS = re.compile(r"\balias\b")
ALIAS_VERB = re.compile(r"\b(set|import)\b")
# The Azure DevOps completion rule, next to az; auto-complete also as the start of a name, such
# as autoCompleteSetBy. COMPLETION below is the run-time rule's narrower reading.
AZ_COMPLETE = re.compile(r"\b(?:completed\b|auto-?complete)")
DEVOPS_INVOKE = re.compile(r"\bdevops\s+invoke\b")
# Where a write can merge or complete a pull request: an Azure pull request itself (nothing after
# its id, which completion PATCHes), a GitHub merge endpoint, or GraphQL, whose body is not read.
MERGE_SURFACE = re.compile(
    r"pullrequests/\d+/?(?:$|[?#])|/pulls/[^/\s?#]+/merge|/merges(?![\w-])|graphql"
)
INVOKE_RESOURCE = re.compile(r"--resource(?:=|\s+)(\S+)")
# az devops invoke's method; without one it reads (GET)
HTTP_METHOD = re.compile(r"--http-method(?:=|\s+)(\S+)")
FILE_LONG_FLAGS = re.compile(r"--input|--upload-file|--config|--post-file|--body-file|--in-file")
FILE_FLAGS = re.compile("@|" + FILE_LONG_FLAGS.pattern)  # re-read or open-quoted: any @
FILE_REFERENCE = re.compile(r"^@|=@")  # an @ at a word's start or after =
FILE_SHORT_FLAGS = re.compile(r"(?<!\S)-[A-Za-z]*[TK]|(?<!\S)-i(?!\S)")  # case-sensitive
# The vocabulary of the body-tool and run-time rules: merge as a word, without merge-base and
# merge-tree, with mergeBranch and merge-upstream. COMPLETION, a completion only as a status or
# auto-complete, counts for the run-time rule only.
MERGE_TERM = re.compile(r"(?<!\w)merge(?!\w)(?!-(?:base|tree)\b)|mergebranch|merge-upstream")
COMPLETION = re.compile(r"auto-?complete|(?:status|-s)\W{1,4}completed\b")
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
    rf"(?P<redirect>{PLAIN_REDIRECT})|(?P<word>{PLAIN_WORD})"
    # the separator without the blanks before it, which finditer skips: linear time
    r"|(?P<separator>(?:;|&&|\|\||\||\n)[ \t\n]*+)"
)
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

# How runs_a_shell() finds a command word, and where raw_commands() cuts simple commands.
SEGMENT_OPS = set(";|&\n()`")
WRAPPERS = frozenset(
    ["sudo", "env", "timeout", "nice", "nohup", "command", "exec", "time", "stdbuf", "setsid"]
    + ["ionice", "doas"]
)
KEYWORDS = frozenset(["do", "then", "else", "elif", "if", "while", "until", "!", "{"])

# Heredocs whose body the run-time rule does not read (merge_policy).
DELIMITER = r"[A-Za-z_][\w-]*"
HEREDOC = re.compile(
    rf"<<(-?)[ \t]*(?:'({DELIMITER})'|\"({DELIMITER})\"|\\({DELIMITER})|({DELIMITER}))"
    r"(?=[\s;&|<>()]|$)"
)
DATA_READERS = frozenset(["cat", "tee", "python", "python3", "git"])
GIT_DATA_SUBCOMMANDS = frozenset(["commit", "tag", "notes"])
AFTER_MARKER = re.compile(r"[ \t]*(?:\d*>>?[ \t]*[^\s;&|<>()`$'\"\\#]+[ \t]*)?")
STANDALONE = " \t\n;&|()<>"

REASON = (
    "Merging a pull request is the owner's alone (merge_policy in "
    "~/.claude/skills/implement/repo-config.md): the command {what}. Hand the PR over instead."
)


def stripped(command: str) -> str:
    """*command* with backslash-newlines joined and every quote, backslash and $'/$" prefix
    removed."""
    text = command.replace("\\\n", "").replace("$'", "").replace('$"', "")
    return text.replace("'", "").replace('"', "").replace("\\", "")


def quote_parts(command: str) -> tuple[str, str]:
    """The text of *command* outside quotes, and the text inside double quotes. Single-quoted
    text is in neither. A backslash outside quotes or inside double quotes keeps the character
    after it, which then opens or closes no quote. Open quoting puts the whole command outside,
    which fails closed."""
    outside: list[str] = []
    double: list[str] = []
    quote = ""
    i = 0
    while i < len(command):
        c = command[i]
        if c == "\\" and quote != "'":
            (double if quote else outside).append(command[i : i + 2])
            i += 2
            continue
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
        i += 1
    if quote:
        return command, ""
    return "".join(outside), "".join(double)


def runs_a_shell(lower: str) -> bool:
    """Whether a shell (SHELL_NAMES, as a word or a path's basename) is the command word of a
    simple command anywhere in the de-quoted, lowercased text: at the start, after `|`, `|&`,
    `;`, `&`, `&&`, `||`, a newline, a parenthesis or a backtick, past assignments,
    redirections and the keywords `if`, `then`, `do`, `!`, `{` and the like, or after one of the
    WRAPPERS, `coproc` (and a named coproc's name) or `busybox` with or without options. One
    pass over the words."""
    expect = True  # the next word may be a command word
    wrapped = False  # a wrapper stands earlier in this simple command
    target = False  # the next word is a redirection's target
    tokens = COMMAND_TOKEN.findall(lower)
    for at, token in enumerate(tokens):
        if token in COMMAND_OPERATORS:
            expect, wrapped, target = True, False, False
            continue
        name = token.rsplit("/", 1)[-1]
        if wrapped:
            if name in SHELL_NAMES:
                return True
            continue
        if not expect:
            continue
        if target:
            target = False
            continue
        if REDIRECTION.match(token):
            target = BARE_REDIRECTION.fullmatch(token) is not None
            continue
        if ASSIGNMENT.match(token) or token in KEYWORDS or token == "coproc":
            continue
        if at > 0 and tokens[at - 1] == "coproc" and tokens[at + 1 : at + 2] == ["{"]:
            continue  # the name of a named coproc: its command follows the {
        if name in WRAPPERS or name == "busybox":
            wrapped = True
            continue
        if name in SHELL_NAMES:
            return True
        expect = False
    return False


def rereads(lower: str) -> bool:
    """Whether the de-quoted, lowercased command hands text to a shell that reads it again, or
    to a command that runs a program from its arguments or data: a shell word followed later by
    a `-c` option cluster, `eval`, `<<<`, `source` or `.` as a command, a shell as the command
    word of any simple command (runs_a_shell), `trap`, `sort` with `--compress-program`, `find`
    with `-exec`, `-execdir`, `-ok` or `-okdir`, `xargs` or `parallel`. Quoting means nothing to
    such text, so the caller judges the whole text instead."""
    shell = SHELL_WORD.search(lower)
    sort = SORT.search(lower)
    find = FIND.search(lower)
    return bool(
        (shell and SHELL_C_CLUSTER.search(lower, shell.end()))
        or EVAL.search(lower)
        or "<<<" in lower
        or SOURCE_COMMAND.search(lower)
        or runs_a_shell(lower)
        or TRAP.search(lower)
        or (sort and SORT_PROGRAM.search(lower, sort.end()))
        or (find and FIND_EXEC.search(lower, find.end()))
        or FEEDER.search(lower)
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


def mentions_merge(lower: str) -> bool:
    """Whether the de-quoted, lowercased command mentions a merge for the run-time rule: a merge
    word, a completion, or `alias` followed later by `set` or `import`."""
    if MERGE_TERM.search(lower) or COMPLETION.search(lower):
        return True
    alias = ALIAS.search(lower)
    return bool(alias and ALIAS_VERB.search(lower, alias.end()))


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
        known = SUBCOMMANDS[tool]
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
        if (
            (set(names) & {"curl", "wget"})
            and writes_with_curl(texts)
            and may_write_to_merge(texts)
        ):
            return "sends a writing request with curl or wget that may reach a merge"
        if gh_az_body_tokens(words):
            joined = " ".join(texts)
            if (
                FILE_LONG_FLAGS.search(joined.lower())
                or any(FILE_REFERENCE.search(text) for text in texts)
                or FILE_SHORT_FLAGS.search(joined)
            ) and body_target_may_merge(texts):
                return "reads a request from a file that may reach a merge"
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


def unknown_merge_subcommand(lower: str) -> bool:
    """Whether gh or az has a word that can be its subcommand, past any options and also right
    after one, that is no known subcommand and holds `merge` anywhere in it, such as `automerge`
    or `pr_merge` - or whether gh's `extension exec` runs an extension so named."""
    tokens = TOKEN_SPLIT.split(lower)
    for at, token in enumerate(tokens):
        tool = token.rsplit("/", 1)[-1]
        if tool not in ("gh", "az"):
            continue
        walked = subcommand_positions(tokens, at)
        if walked is None:
            continue
        positions, has_final = walked
        known = SUBCOMMANDS[tool]
        if any(tokens[i] not in known and "merge" in tokens[i] for i in positions):
            return True
        if tool == "gh" and has_final and tokens[positions[-1]] in EXTENSION_WORDS:
            rest = [word for word in tokens[positions[-1] + 1 : positions[-1] + 5] if word]
            if rest[:1] == ["exec"] and len(rest) > 1 and "merge" in rest[1]:
                return True
    return False


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
        known = SUBCOMMANDS[tool]
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


def spared_in(pieces: list[re.Match[str]]) -> list[tuple[int, int]]:
    """Where a parameter of one allowed plain simple command does not count: a whole-word
    `"$NAME"` in a command that starts with gh, after a plain word that is no option."""
    if pieces[0].group() != "gh":
        return []
    return [
        (piece.start(), piece.end())
        for previous, piece in itertools.pairwise(pieces[2:])
        if re.fullmatch(rf"{PLAIN}++", previous.group())
        and not previous.group().startswith("-")
        and re.fullmatch(QUOTED_PARAMETER, piece.group())
    ]


def without_spared_parameters(command: str) -> str:
    """*command* with the parameters the run-time rule does not count replaced by `""`;
    unchanged when the command is not in the plain language."""
    spans = sorted(span for pieces in plain_commands(command) for span in spared_in(pieces))
    out: list[str] = []
    position = 0
    for start, end in spans:
        out.append(command[position:start])
        out.append('""')
        position = end
    out.append(command[position:])
    return "".join(out)


def raw_commands(command: str) -> list[str] | None:
    """The simple commands of *command* as raw text, cut at unquoted `;`, `|`, `&`, newline,
    parentheses and backticks; `>&`, `<&` and `&>` stay inside. A substitution (`$( )`, `<( )`,
    `>( )` or backticks) is a simple command of its own, and the command around it keeps a `$`
    where it stood. None on open quoting or an unclosed substitution."""
    parts: list[str] = []
    current: list[str] = []
    stack: list[tuple[list[str], str]] = []  # the buffer around a substitution, its closer
    quote = ""
    i = 0
    while i < len(command):
        c = command[i]
        if quote:
            current.append(c)
            if c == quote:
                quote = ""
            elif c == "\\" and quote == '"' and i + 1 < len(command):
                current.append(command[i + 1])
                i += 1
        elif c == "\\":
            current.append(command[i : i + 2])
            i += 1
        elif c in "'\"":
            quote = c
            current.append(c)
        elif c == "(" and current and current[-1] in "$<>":
            if current[-1] != "$":
                current.append("$")
            stack.append((current, ")"))
            current = []
        elif c == "`" and stack and stack[-1][1] == "`":
            parts.append("".join(current))
            current = stack.pop()[0]
        elif c == "`":
            current.append("$")
            stack.append((current, "`"))
            current = []
        elif c == "(":
            parts.append("".join(current))
            current = []
            stack.append(([], "("))
        elif c == ")" and stack and stack[-1][1] in ")(":
            parts.append("".join(current))
            outer, closer = stack.pop()
            current = outer if closer == ")" else []
        elif c == "&" and ((i > 0 and command[i - 1] in "<>") or command[i + 1 : i + 2] == ">"):
            current.append(c)
        elif c in SEGMENT_OPS:
            parts.append("".join(current))
            current = []
        else:
            current.append(c)
        i += 1
    if quote or stack:
        return None
    parts.append("".join(current))
    return parts


def reads_data(text: str) -> bool:
    """Whether the simple command *text*, up to a heredoc marker, runs a command that does not
    read the heredoc as shell text: cat, tee, python or python3, or git commit, tag or notes
    without `-c`, with no shell word among its words."""
    words = text.lower().split()
    if not words or words[0].rsplit("/", 1)[-1] not in DATA_READERS:
        return False
    if any(SHELL_WORD.fullmatch(word.rsplit("/", 1)[-1]) for word in words):
        return False
    if words[0].rsplit("/", 1)[-1] == "git":
        return len(words) > 1 and words[1] in GIT_DATA_SUBCOMMANDS and "-c" not in words
    return True


def terminator(command: str, position: int, delimiter: str, tabs: bool) -> tuple[int, int] | None:
    """Where the line that ends a heredoc body starting at *position* begins, and where the text
    after that line goes on; None when no line ends the body."""
    while True:
        newline = command.find("\n", position)
        end = len(command) if newline < 0 else newline
        line = command[position:end]
        if (line.lstrip("\t") if tabs else line) == delimiter:
            return position, min(end + 1, len(command))
        if newline < 0:
            return None
        position = newline + 1


def standalone(command: str, i: int) -> bool:
    """Whether the character at *i* stands as a word of its own."""
    return standalone_word(command, i, 1)


def standalone_word(command: str, i: int, length: int) -> bool:
    """Whether the *length* characters at *i* stand as a word of their own."""
    before = i == 0 or command[i - 1] in STANDALONE
    end = i + length
    return before and (end == len(command) or command[end] in STANDALONE)


def after_blanks(command: str, i: int) -> str:
    """The character before *i* past spaces and tabs, or a newline at the start of *command*."""
    i -= 1
    while i >= 0 and command[i] in " \t":
        i -= 1
    return command[i] if i >= 0 else "\n"


def data_heredoc_bodies(command: str) -> list[tuple[int, int]]:
    """Spans of the heredoc bodies the run-time rule does not read: a quoted delimiter
    (`<<'D'`, `<<"D"`, `<<\\D`, also with `<<-`), a marker outside quotes, comments, groups and
    substitutions, fed to a command reads_data() accepts, with at most an output redirection to a
    plain word after the marker on its line, and a line that ends the body. No span at all when
    the text holds what this reading does not follow: a backtick, a `$'` string, a substitution
    or `${` inside double quotes, a process substitution, `((`, `$[`, `case`, a `{` or `}` that is
    no command word, a backslash escape right before a `#`, or a `<<` that is no heredoc marker it
    reads."""
    spans: list[tuple[int, int]] = []
    pending: list[tuple[str, bool, bool]] = []  # delimiter, tabs stripped, body spared
    quote = ""
    depth = 0  # parentheses and brace groups around the current position
    start = 0  # where the current simple command starts
    i = 0
    while i < len(command):
        c = command[i]
        if quote:
            if quote == '"' and c == "\\":
                i += 2
                continue
            if quote == '"' and (c == "`" or command.startswith(("$(", "${"), i)):
                return []
            if c == quote:
                quote = ""
            i += 1
            continue
        if c == "\\":
            if command[i + 2 : i + 3] == "#":  # the # continues a word, no comment
                return []
            i += 2
            continue
        if c == "`" or command.startswith(("$'", "$[", "<(", ">(", "(("), i):
            return []
        if command.startswith("case", i) and standalone_word(command, i, 4):
            return []
        if c in "'\"":
            quote = c
        elif c == "#" and (i == 0 or command[i - 1] in STANDALONE):
            newline = command.find("\n", i)
            i = len(command) if newline < 0 else newline
            continue
        elif (
            c in "{}"
            and standalone(command, i)
            and after_blanks(command, i) not in ("\n;&|(){" if c == "{" else "\n;&")
        ):
            return []  # a brace that is an argument, or a group the reading cannot place
        elif c == "(" or (c == "{" and standalone(command, i)):
            depth += 1
            start = i + 1
        elif c == ")" or (c == "}" and standalone(command, i)):
            depth -= 1
            start = i + 1
            if depth < 0:
                return []
        elif c in ";&|":
            start = i + 1
        elif command.startswith("<<<", i):
            i += 3
            continue
        elif command.startswith("<<", i):
            marker = HEREDOC.match(command, i)
            if marker is None:
                return []
            after = AFTER_MARKER.match(command, marker.end())
            line_ends = after.end() == len(command) or command[after.end()] == "\n"
            spared = (
                marker.group(5) is None
                and depth == 0
                and line_ends
                and reads_data(command[start:i])
            )
            delimiter = next(group for group in marker.groups()[1:] if group)
            pending.append((delimiter, bool(marker.group(1)), spared))
            i = marker.end()
            continue
        elif c == "\n":
            start = i + 1
            position = i + 1
            for delimiter, tabs, spared in pending:
                found = terminator(command, position, delimiter, tabs)
                if found is None:
                    return []
                if spared:
                    spans.append((position, found[0]))
                position = found[1]
            if pending:
                pending = []
                i = start = position
                continue
        i += 1
    return [] if quote or pending else spans


def without_data_heredocs(command: str) -> str:
    """*command* with every heredoc body data_heredoc_bodies() finds reduced to its newlines."""
    out: list[str] = []
    position = 0
    for begin, end in data_heredoc_bodies(command):
        out.append(command[position:begin])
        out.append("\n" * command.count("\n", begin, end))
        position = end
    out.append(command[position:])
    return "".join(out)


def network_words(command: str, plain: str) -> list[str]:
    """The de-quoted words of the simple commands of *command* that name gh, az, curl or wget,
    which pick the whole-text write rule's reason; every word of *plain* when the command cannot
    be cut."""
    parts = raw_commands(command)
    if parts is None:
        return plain.split()
    return [
        word
        for part in parts
        if NETWORK.search(stripped(part).lower())
        for word in stripped(part).split()
    ]


def on_merge_surface(target: str) -> bool:
    """Whether a URL or an endpoint, percent-decoded, is on MERGE_SURFACE, or its path may
    resolve to one: a `.` or `..` segment, `//` after the host, or a `;`."""
    decoded = unquote(target).lower()
    if MERGE_SURFACE.search(decoded):
        return True
    path = decoded.split("://", 1)[1] if "://" in decoded else decoded
    if "://" in decoded:
        path = path[path.find("/") :] if "/" in path else ""
    path = re.split(r"[?#]", path, maxsplit=1)[0]
    return "//" in path or ";" in path or any(part in (".", "..") for part in path.split("/"))


def may_write_to_merge(words: list[str]) -> bool:
    """For the words of a curl or wget command that writes: whether the request may reach a
    merge surface - a config or input file that may name the URL (`-K`, `--config`, wget's `-i`
    or `--input-file`), a `--url @file`, no literal URL (`://`) at all, a URL with `$`, a
    backtick, `{` or `[` (built by the shell or by curl's own globbing), or a URL on
    MERGE_SURFACE. A write to a literal sub-resource of a pull request passes."""
    wget = any(word.lower().rsplit("/", 1)[-1] == "wget" for word in words)
    urls: list[str] = []
    for i, word in enumerate(words):
        following = words[i + 1] if i + 1 < len(words) else ""
        if word.startswith("--"):
            name, equals, value = word.partition("=")
            if name in ("--config", "--input-file"):
                return True
            if name == "--url":
                urls.append(value if equals else following)
        elif word.startswith("-"):
            letters = re.split(r"[^A-Za-z0-9#:]", word[1:], maxsplit=1)[0]
            if "K" in letters or (wget and "i" in letters):
                return True
        if "://" in word:
            urls.append(word)
    if not urls:
        return True
    return any(
        url.startswith("@") or any(c in url for c in "$`{[") or on_merge_surface(url)
        for url in urls
    )


def body_target_may_merge(texts: list[str]) -> bool:
    """For the words of a gh or az command that reads its request body from a file: whether the
    target may be a merge surface. gh api: a word after `api` built at run time (`$`, a backtick,
    a brace expansion), one on MERGE_SURFACE, or none that looks like an endpoint (a `/`
    or graphql). az rest: no `--uri`/`--url`/`-u` holding a URL or a path, or one built at run
    time or on the surface.
    az devops invoke: invoke_reaches_pr(). az repos pr, or anything else: the pull request
    itself or unknown, so yes."""
    lower = [text.lower() for text in texts]
    names = [text.rsplit("/", 1)[-1] for text in lower]
    joined = " ".join(lower)
    if "gh" in names and "api" in lower:
        after = [text for text in texts[lower.index("api") + 1 :] if not text.startswith("-")]
        if not any("/" in text or "graphql" in text.lower() for text in after):
            return True
        return any(
            "$" in text
            or "`" in text
            or BRACE_EXPANSION.search(text) is not None
            or on_merge_surface(text)
            for text in after
        )
    if "az" in names and "rest" in lower:
        uris = []
        for i, text in enumerate(lower):
            name, equals, value = text.partition("=")
            if name in ("--uri", "--url", "-u"):
                uris.append(value if equals else (lower[i + 1] if i + 1 < len(lower) else ""))
        return not uris or any(
            ("://" not in uri and not uri.startswith("/"))  # no literal URL or path: unknown
            or "$" in uri
            or "`" in uri
            or on_merge_surface(uri)
            for uri in uris
        )
    if DEVOPS_INVOKE.search(joined):
        return invoke_reaches_pr(joined)
    return True


def invoke_reaches_pr(lower: str) -> bool:
    """Whether az devops invoke's `--resource` may be a pull request itself or its completion:
    `pullRequests`, a pull-request name holding `complet` or `merge`, a name built at run time,
    or no `--resource` at all. Threads, comments, reviewers, labels and statuses are none of
    these."""
    resources = INVOKE_RESOURCE.findall(lower)
    if not resources:
        return True
    return any(
        resource == "pullrequests"
        or "$" in resource
        or "`" in resource
        or ("pullrequest" in resource and ("complet" in resource or "merge" in resource))
        for resource in resources
    )


def invoke_writes(lower: str) -> bool:
    """Whether the de-quoted, lowercased text sends `az devops invoke` a writing request: an
    `--http-method` other than GET, or an `--in-file` body."""
    return "--in-file" in lower or any(method != "get" for method in HTTP_METHOD.findall(lower))


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
    reread = rereads(lower)
    # words a feeder supplies or a re-reading shell joins may stand in either order
    fed = reread or FEEDER.search(lower) is not None
    if gh and (pr := PR_WORD.search(lower)) and MERGE_WORD.search(lower, 0 if fed else pr.end()):
        return "mentions a PR merge"
    if unknown_merge_subcommand(lower):
        return "runs a gh or az subcommand it does not know, spelled with merge"
    if ALIAS.search(lower) and ALIAS_VERB.search(lower) and gh:
        return "defines a gh alias"
    if az and (
        AZ_COMPLETE.search(lower)
        or (
            DEVOPS_INVOKE.search(lower)
            and "pullrequest" in lower
            and invoke_writes(lower)
            and invoke_reaches_pr(lower)
        )
    ):
        return "completes an Azure DevOps pull request"
    write_words = False  # re-read text holds curl's writing options outside a tool's command
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
        elif near and writes_with_curl(plain.split()) and may_write_to_merge(plain.split()):
            # every word decides; when only another command's option reads like curl's, such as
            # find's -execdir, a later rule may name the reason, and the end of check denies
            if writes_with_curl(network_words(command, plain)):
                body = "sends a writing request with curl or wget that may reach a merge"
            else:
                write_words = True
        else:
            body = None
    if body:
        return body
    if body_tool and MERGE_TERM.search(lower):
        return (
            "mentions a merge next to curl, wget, gh api, az rest, az devops invoke or az repos pr"
        )
    # The run-time rule next to a merge mention does not read data heredoc bodies, unless the
    # text around them is re-read: then the whole text counts. Otherwise the spared parameters
    # do not count either.
    runtime_text = without_data_heredocs(command)
    runtime_lower = stripped(runtime_text).lower()
    runtime_whole = rereads(runtime_lower) if runtime_text != command else reread
    if runtime_whole:
        runtime_text, runtime_lower = command, lower
    else:
        runtime_text = without_spared_parameters(runtime_text)
    if runs_at_run_time(runtime_text, whole=runtime_whole) and mentions_merge(runtime_lower):
        return "builds a word at run time next to a merge mention"
    if len(EVAL.findall(lower)) > MAX_EVALS:
        return "is nested too deep to check"
    if command.count("$(") + command.count("`") // 2 > MAX_SUBSTITUTIONS:
        return "holds too many substitutions to check"
    if write_words:
        return "sends a writing request with curl or wget that may reach a merge"
    return None


def judge(payload: str) -> str | None:
    """What makes the hook input *payload* a possible merge, or None; None for an empty command.
    ValueError when it is no JSON, TypeError when it is no object, has no tool_input object or
    no command string."""
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise TypeError("no JSON object")
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        raise TypeError("no tool_input object")
    command = tool_input.get("command")
    if not isinstance(command, str):
        raise TypeError("no command string")
    return check(command) if command else None


class TookTooLong(Exception):
    """The check ran past DEADLINE."""


def past_deadline(signum: int, frame: object) -> None:
    raise TookTooLong


def main() -> int:
    """Read the hook input and deny what judge() names; input it cannot read, any error while
    checking, and a check that runs past DEADLINE deny too."""
    try:
        signal.signal(signal.SIGALRM, past_deadline)
        signal.setitimer(signal.ITIMER_REAL, DEADLINE)
        try:
            what = judge(sys.stdin.read())
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
    except TookTooLong:
        what = "took too long to check; split or simplify the command"
    except Exception as error:  # noqa: BLE001 - a filter that cannot check refuses
        print(f"block_pr_merge: denying the call after an error: {error!r}", file=sys.stderr)
        what = (
            f"could not be checked ({type(error).__name__}: {error}), a bug in the merge hook -"
            " report it to the owner; split or simplify the command meanwhile"
        )
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
