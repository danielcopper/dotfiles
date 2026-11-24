#!/usr/bin/env python3
"""PreToolUse(Bash) hook: refuse the explicit forms of merging or completing a pull request.

What it refuses, how it reads a command, and why an error of its own lets most calls through are
written once, in `merge_policy` (~/.claude/skills/implement/repo-config.md).
"""

import json
import os
import re
import stat
import sys
from collections.abc import Callable
from typing import cast

REASON = (
    "Merging or completing a pull request is the owner's decision (merge_policy). Leave the PR"
    " open, report its state and what is left, and stop. Do not look for another way to merge,"
    " complete or auto-complete it. (found: {form})"
)
UNCHECKED = "a command the hook could not check"
MAX_SIZE = 1_000_000  # characters of a command, bytes of a body file
SUSPECT = re.compile(r"merge|complet|enqueue", re.IGNORECASE)

# A heredoc marker (not the here-string <<<). The command receiving it runs its body, sends it as
# a request body, writes it to a file, or only reads it.
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)\\?([\w.-]+)\1")
SHELLS = r"(?:bash|sh|zsh|dash|ksh|fish)"
RUNNER = re.compile(rf"{SHELLS}|python[\d.]*|node|ruby|perl|ssh")
# Programs that run another command given after them; a heredoc or a written file handed to one
# counts as run, whatever its options are.
WRAPPERS = {
    "env",
    "sudo",
    "nohup",
    "exec",
    "command",
    "time",
    "timeout",
    "nice",
    "ionice",
    "stdbuf",
    "setsid",
    "xargs",
    "flock",
    "watch",
}
WRAPPER_PAIRS = {
    ("uv", "run"),
    ("poetry", "run"),
    ("mise", "exec"),
    ("mise", "x"),
    ("docker", "exec"),
    ("kubectl", "exec"),
}
RESERVED = {"!", "{", "if", "then", "elif", "else", "do", "while", "until"}
# The only options of a runner known to take the next word as value: a shell's and ssh's.
SHELL_VALUES = ("-o", "-O", "+o", "+O")
SSH_VALUES = tuple(f"-{flag}" for flag in "BbcDEeFIiJLlmOoPpQRSWw")
# A redirection word: its file descriptor, its operator and the file when attached to it.
REDIRECT = re.compile(r"(\d*)([<>]+[&|-]?)(.*)")
# A cat heredoc inside the `$( )` that is a shell's -c argument: `bash -c "$(cat <<X`.
SHELL_C_CAT = re.compile(
    rf"(?:^|[\s;&|(])(?:\S*/)?{SHELLS}\s+(?:-\w+\s+)*-\w*c\w*\s+[\"']?\$\(\s*cat\s*$"
)
SEPARATOR = re.compile(r"&&|\|\||[;&|\n()`]")  # ends a simple command
STATEMENT = re.compile(r"&&|\|\||[;&\n]")  # ends a pipeline
ASSIGNMENT = re.compile(r"\w+=\S*")
SUBSTITUTION = re.compile(r"(?:(\w+)=)?\$\(([^()]*)\)")
ASSIGNMENT_PREFIX = re.compile(
    rf"\s*(?:(?:export|local|readonly|declare|typeset)(?:\s+-\w+)*\s+)?(?:{ASSIGNMENT.pattern}\s+)*"
)
GITHUB_TOOLS = {"gh", "curl", "wget"}  # the tools that reach GitHub
REQUEST_TOOLS = GITHUB_TOOLS | {"az"}  # the tools that send a request body

METHOD = re.compile(r"(?:-X|--method|--request|--http-method)=?(.*)")
BODY_OPTION = {  # options that make the tool send a request body
    "gh": re.compile(r"-[a-zA-Z]*[fF]|--(?:field|raw-field|input)"),
    "curl": re.compile(r"-[a-zA-Z]*[dFT]|--(?:data|json|form|upload-file)"),
    "wget": re.compile(r"--(?:post|body)-"),
}
REST_MERGE = re.compile(
    r"pulls/[^/\s]+/merge(?![\w-])|repos/\S+/merges(?![\w-])|merge_method\s*[=:]", re.IGNORECASE
)
MUTATION = re.compile(r"mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest")
COMPLETION = re.compile(
    r"status\"?\s*:\s*\"?(?:completed|3)(?!\w)|autoCompleteSetBy", re.IGNORECASE
)
PR_ITSELF = re.compile(r"pullrequests(?:/[^/\s?]+)?(?=[?\s]|$)", re.IGNORECASE)
ALIAS_MERGE = re.compile(r"(?<![\w-])pr(?![\w-]).*?(?<![\w-])merge(?![\w-])", re.DOTALL)
FILE_OPTION = re.compile(r"--(?:input|in-f[\w-]*|body-file|post-file|upload-file)")


def tools(words: list[str]) -> set[str]:
    """The program names among *words*: each word's last path component."""
    return {os.path.basename(word) for word in words}


def unquoted(text: str) -> str:
    """*text* with quotes and backslashes deleted, as the hook reads every word."""
    return re.sub(r"['\"\\]", "", text.replace("$'", "'").replace('$"', '"'))


def command_word(words: list[str]) -> int:
    """Index of the command word of the simple command *words*, past assignments and the
    reserved words `!`, `{`, `if`, `then`, `elif`, `else`, `do`, `while` and `until`;
    len(words) when there is none. The word found may be a wrapper (see wrapper_at)."""
    k = 0
    while k < len(words) and (ASSIGNMENT.fullmatch(words[k]) or words[k] in RESERVED):
        k += 1
    return k


def wrapper_at(words: list[str], k: int) -> int:
    """How many words the wrapper at index *k* of *words* spans (`sudo` 1, `uv run` 2), or 0."""
    name = os.path.basename(words[k]) if k < len(words) else ""
    if name in WRAPPERS:
        return 1
    return 2 if (name, words[k + 1] if k + 1 < len(words) else "") in WRAPPER_PAIRS else 0


def skip_options(words: list[str], k: int, values: tuple[str, ...] = ()) -> int:
    """Index of the first word from *k* that is no option, an option in *values* taking the
    next word as its value."""
    while k < len(words) and words[k].startswith(("-", "+")):
        k += 2 if words[k] in values else 1
    return k


def opens_heredoc(line: str, end: int) -> bool:
    """Whether a marker at position *end* of *line* opens a heredoc: it stands outside quotes and
    before a comment (a `#` at the start of a word or after `;`, `&`, `|` or `(`); a `$( )`,
    also inside double quotes, starts afresh (the caller checks the delimiter line)."""
    quote = ""
    outer: list[str] = []  # the quote each open `$(` stands in
    k = 0
    while k < end:
        char = line[k]
        if char == "\\" and quote != "'":
            k += 2
            continue
        if quote != "'" and line.startswith("$(", k):
            outer.append(quote)
            quote = ""
            k += 1
        elif quote:
            quote = "" if char == quote else quote
        elif char in "'\"":
            quote = char
        elif char == ")" and outer:
            quote = outer.pop()
        elif char == "#" and (k == 0 or line[k - 1].isspace() or line[k - 1] in ";&|("):
            return False
        k += 1
    return not quote


def heredoc_role(line: str, marker: re.Match[str]) -> tuple[str, list[tuple[str, bool]]]:
    """What the command receiving the heredoc opened by *marker* does with its body, judged by
    the command words of that command and of the pipeline stages after it: "run" it (a shell or
    an interpreter, any wrapper, or the -c string of a shell), "send" it (a request tool), or
    "read" it, writing it to the files it names with `>`, `>>`, `tee` or `tee -a` (the flag
    says whether it appends)."""
    if SHELL_C_CAT.search(line[: marker.start()]):
        return "run", []
    before = SEPARATOR.split(line[: marker.start()])[-1]
    after = STATEMENT.split(line[marker.end() :])[0]
    stages = [unquoted(stage).split() for stage in f"{before} {after}".split("|")]
    names: set[str] = set()
    for stage in stages:
        k = command_word(stage)
        if wrapper_at(stage, k):
            return "run", []
        if k < len(stage):
            names.add(os.path.basename(stage[k]))
    if any(RUNNER.fullmatch(name) for name in names):
        return "run", []
    if REQUEST_TOOLS & names:
        return "send", []
    paths: list[tuple[str, bool]] = []
    for words in stages:
        tee = append = False
        for k, word in enumerate(words):
            if word in (">", ">>") and k + 1 < len(words):
                paths.append((words[k + 1], word == ">>"))
            elif re.fullmatch(r">>?[^>&].*", word):
                paths.append((word.lstrip(">"), word.startswith(">>")))
            elif os.path.basename(word) == "tee":
                tee = True
            elif tee and word in ("-a", "--append"):
                append = True
            elif tee and not word.startswith("-"):
                paths.append((word, append))
    return "read", paths


def literal(word: str) -> str:
    """*word* as a key for a file this command writes: `${NAME}` as `$NAME`, a leading `$HOME`
    as `~`, the path normalised."""
    word = re.sub(r"\$\{(\w+)\}", r"$\1", word)
    return os.path.normpath(re.sub(r"^\$HOME(?=/|$)", "~", word))


def normalise(command: str) -> tuple[str, str, dict[str, str]]:
    """*command* with backslash-newlines joined, the bodies of heredocs that are not run dropped,
    quotes, backslashes and the commas and brackets of a list removed; the bodies of the heredocs
    a request tool receives; and the heredoc bodies written to a file, by the file's literal
    word (a body `>>` or `tee -a` appends is added to it). A marker opens a heredoc only outside
    quotes and comments, and only when its delimiter line comes."""
    lines = command.replace("\\\n", "").split("\n")
    kept: list[str] = []
    sent: list[str] = []
    written: dict[str, str] = {}
    pending: list[tuple[str, str, list[tuple[str, bool]], list[str]]] = []
    last = {line.strip(): i for i, line in enumerate(lines)}
    for i, line in enumerate(lines):
        if pending:
            delimiter, role, paths, body = pending[0]
            if line.strip() == delimiter:
                _ = pending.pop(0)
                for path, append in paths:
                    key = literal(path)
                    written[key] = (written.get(key, "") + "\n" if append else "") + "\n".join(body)
            else:
                body.append(line)
                {"run": kept, "send": sent}.get(role, []).append(line)
            continue
        kept.append(line)
        for marker in HEREDOC.finditer(line):
            if last.get(marker[2], -1) > i and opens_heredoc(line, marker.start()):
                role, paths = heredoc_role(line, marker)
                pending.append((marker[2], role, paths, []))
    return re.sub(r"[,\[\]]", " ", unquoted("\n".join(kept))), "\n".join(sent), written


def next_word_is(words: list[str], start: int, wanted: str) -> int | None:
    """Index of *wanted* when it is the first word from *start* that is no option (a word right
    after an option is taken for its value unless it is *wanted*), else None."""
    after_option = False
    for k in range(start, len(words)):
        if words[k].startswith("-") and len(words[k]) > 1:
            after_option = "=" not in words[k]
        elif after_option and words[k] != wanted:
            after_option = False
        else:
            return k if words[k] == wanted else None
    return None


def subcommand(words: list[str], tool: str, path: list[str]) -> int | None:
    """Index past `tool <path…>` (options allowed between), the first place it stands."""
    for i, word in enumerate(words):
        if os.path.basename(word) != tool:
            continue
        k: int | None = i
        for part in path:
            k = next_word_is(words, k + 1, part) if k is not None else None
        if k is not None:
            return k + 1
    return None


def option_value(words: list[str], k: int) -> tuple[str, str]:
    option, eq, value = words[k].partition("=")
    return option, value if eq else (words[k + 1] if k + 1 < len(words) else "")


def az_pr_completes(words: list[str]) -> str | None:
    """The completion `az repos pr update` or `create` in *words* sets, or None. az takes an
    unambiguous prefix of an option."""
    for verb in ("update", "create"):
        start = subcommand(words, "az", ["repos", "pr", verb])
        for k in range(start, len(words)) if start is not None else ():
            option, value = option_value(words, k)
            if (
                verb == "update"
                and len(option) > 3
                and "--status".startswith(option)
                and value.lower().startswith("complet")
            ):
                return "az repos pr update --status completed"
            if (
                len(option) > 5
                and "--auto-complete".startswith(option)
                and value.lower() not in ("false", "0")
            ):
                return f"az repos pr {verb} --auto-complete"
    return None


def alias_merges(words: list[str], imported: Callable[[list[str]], str]) -> bool:
    """Whether *words* define a gh alias whose expansion holds `pr … merge` or a merge mutation;
    for `alias import`, *imported* gives the text its arguments name."""
    start = subcommand(words, "gh", ["alias"])
    if start is None or start >= len(words) or words[start] not in ("set", "import"):
        return False
    expansion = " ".join(words[start + 1 :])
    if words[start] == "import":
        expansion += "\n" + imported(words[start + 1 :])
    return bool(ALIAS_MERGE.search(expansion) or MUTATION.search(expansion))


def writes(words: list[str]) -> bool:
    """Whether a gh, curl or wget among *words* sends a method other than GET or HEAD, or a
    body."""
    present = tools(words) & GITHUB_TOOLS
    for k, word in enumerate(words):
        method = METHOD.fullmatch(word)
        if method:
            value = method[1] or (words[k + 1] if k + 1 < len(words) else "")
            if present and value.upper() not in ("GET", "HEAD"):
                return True
        if any(BODY_OPTION[tool].match(word) for tool in present):
            return True
    return False


def body_paths(words: list[str]) -> list[str]:
    """The files the simple command *words* names as a request body: `@path`, `key=@path`,
    a file option, or jq's `--rawfile`/`--slurpfile`."""
    paths: list[str] = []
    for k, word in enumerate(words):
        following = words[k + 1 : k + 3]
        if word.startswith("@") or "=@" in word or re.match(r"-[a-zA-Z]@", word):
            paths.append(word.split("@", 1)[1])
        elif FILE_OPTION.fullmatch(word.split("=", 1)[0]) and "=" in word:
            paths.append(word.split("=", 1)[1])
        elif FILE_OPTION.fullmatch(word) and following:
            paths.append(following[0])
        elif word in ("--rawfile", "--slurpfile") and len(following) == 2:
            paths.append(following[1])
    return paths


def has_request(text: str) -> bool:
    return bool(REQUEST_TOOLS & tools(text.split()))


def stdin_paths(words: list[str], cat: bool) -> list[str]:
    """The files a `< path` (or `0<`) among *words* feeds, and with *cat* the files `cat`
    prints."""
    paths: list[str] = []
    for k, word in enumerate(words):
        redirect = REDIRECT.fullmatch(word)
        if redirect and redirect[1] in ("", "0") and redirect[2] == "<":
            paths += [redirect[3]] if redirect[3] else words[k + 1 : k + 2]
        elif cat and os.path.basename(word) == "cat":
            for arg in words[k + 1 :]:
                if re.search(r"[<>|]", arg):
                    break
                if not arg.startswith("-"):
                    paths.append(arg)
    return paths


def pipeline_feeds(text: str, receives: Callable[[list[str]], bool]) -> list[str]:
    """The files `cat` or `<` feeds, in *text*, a command *receives* accepts: with `<` into it,
    or from an earlier stage of its pipeline. Read once per pipeline, from its last stage."""
    paths: list[str] = []
    for statement in STATEMENT.split(text):
        later = False  # whether a later stage of the pipeline receives
        for stage in reversed(statement.split("|")):
            words = re.sub(r"[()`]", " ", stage).split()
            here = receives(words)
            if later or here:
                paths += stdin_paths(words, cat=later)
            later = later or here
    return paths


def fed_paths(text: str) -> list[str]:
    """The files `cat` or `<` feeds a request tool in *text*: in a `$( )` within the request's
    pipeline or assigned to a variable the request uses, through a pipe into it, or as its
    stdin."""
    paths: list[str] = []
    statements = STATEMENT.split(text)
    requests = " ".join(statement for statement in statements if has_request(statement))
    used = set(re.findall(r"\$\{?(\w+)", requests))
    for statement in statements:
        flat = SUBSTITUTION.sub(" ", statement)
        for found in SUBSTITUTION.finditer(statement):
            # `NAME=$( )` before the command word assigns a variable; elsewhere, as in
            # `-f query=$( )`, the substitution is a word of the command
            assigned = found[1] and ASSIGNMENT_PREFIX.fullmatch(statement[: found.start()])
            if has_request(flat) or (assigned and found[1] in used):
                paths += stdin_paths(found[2].split(), cat=True)
        paths += pipeline_feeds(flat, lambda words: bool(REQUEST_TOOLS & tools(words)))
    return paths


def read_body(path: str, cwd: str | None, written: dict[str, str]) -> str:
    """The text the file *path* holds: a heredoc this command writes to it, found by the same
    word with quotes deleted, or else the regular file on disk up to MAX_SIZE (`~` and `$HOME`
    expanded, a relative path taken from *cwd*); empty when neither can be read."""
    key = literal(path)
    if key in written:
        return written[key]
    path = os.path.expanduser(key)
    if "$" in path or path in ("", "-"):
        return ""
    try:
        path = os.path.join(cwd or "", path)
        if stat.S_ISREG(os.stat(path).st_mode):
            with open(path, "rb") as file:
                return file.read(MAX_SIZE).decode("utf-8", "replace")
    except (OSError, ValueError, UnicodeError):
        pass
    return ""


def without_redirects(words: list[str]) -> list[str]:
    """*words* without their redirections: an operator word with the file after it, and a word
    that holds its file (`<path`, `2>/dev/null`, a heredoc marker)."""
    kept: list[str] = []
    target = False
    for word in words:
        redirect = REDIRECT.fullmatch(word)
        if target:
            target = False
        elif redirect:
            target = not redirect[3]
        else:
            kept.append(word)
    return kept


def script_index(words: list[str], r: int) -> int:
    """Index of the script argument of the shell or interpreter at index *r* of *words*: the
    first word past its options, past the host for ssh. Only a shell's -o and -O and ssh's
    options are known to take the next word as value."""
    name = os.path.basename(words[r])
    first = skip_options(words, r + 1, SSH_VALUES if name == "ssh" else SHELL_VALUES)
    return first + 1 if name == "ssh" else first


def runs_stdin(words: list[str]) -> bool:
    """Whether the simple command *words* runs a shell or an interpreter that reads its script
    from stdin: the command word, or the first one behind a wrapper, with no script argument
    (script_index), given `-`, a shell given -s, or ssh with nothing past the host."""
    words = without_redirects(words)
    k = command_word(words)
    span = wrapper_at(words, k)
    if span:
        runners = (
            r for r in range(k + span, len(words)) if RUNNER.fullmatch(os.path.basename(words[r]))
        )
        k = next(runners, len(words))
    name = os.path.basename(words[k]) if k < len(words) else ""
    if not RUNNER.fullmatch(name):
        return False
    first = script_index(words, k)
    options = [word for word in words[k + 1 : first] if word.startswith("-")]
    shell_s = re.fullmatch(SHELLS, name) and any(re.fullmatch(r"-\w*s\w*", o) for o in options)
    return first >= len(words) or "-" in options or bool(shell_s)


def run_scripts(text: str) -> set[str]:
    """The script words *text* may run, to be looked up among the files the command writes: the
    command word, the file `source` or `.` reads, every argument of a wrapper, the script
    argument of any shell or interpreter word (script_index), and the files `cat` or `<` feeds a
    shell or an interpreter that runs its stdin (runs_stdin)."""
    scripts = {literal(path) for path in pipeline_feeds(text, runs_stdin)}
    for words in simple_commands(text):
        k = command_word(words)
        if k >= len(words):
            continue
        span = wrapper_at(words, k)
        if span:
            scripts.update(literal(arg) for arg in words[k + span :] if not arg.startswith("-"))
        elif os.path.basename(words[k]) in ("source", "."):
            k = skip_options(words, k + 1)
        for r, word in enumerate(words):
            if RUNNER.fullmatch(os.path.basename(word)):
                first = script_index(words, r)
                scripts.update(literal(arg) for arg in words[first : first + 1])
        if k < len(words):
            scripts.add(literal(words[k]))
    return scripts


def azure_requests(segments: list[list[str]]) -> list[list[str]]:
    """The simple commands among *segments* that run curl, wget, az rest or az devops invoke."""
    return [
        words
        for words in segments
        if {"curl", "wget"} & tools(words)
        or ("az" in tools(words) and {"rest", "invoke"} & set(words))
    ]


def literal_target(words: list[str]) -> bool:
    """Whether the request *words* spells a target: a URL, or devops invoke's resource."""
    return any("://" in word for word in words) or ("invoke" in words and "--resource" in words)


def simple_commands(text: str) -> list[list[str]]:
    return [segment.split() for segment in SEPARATOR.split(text)]


def check(command: str, cwd: str | None = None) -> str | None:
    """The merge form *command* holds, or None."""
    if len(command) > MAX_SIZE:
        raise ValueError(f"the command is longer than {MAX_SIZE:,} characters")
    text, sent, written = normalise(command)
    segments = simple_commands(text)
    ran = [written[word] for word in run_scripts(text) if word in written]
    if ran:  # a script this command writes and runs is read as commands too
        more_text, more_sent, more_written = normalise("\n".join(ran))
        text, sent = f"{text}\n{more_text}", f"{sent}\n{more_sent}"
        for key, body in more_written.items():  # joined: any version of a file counts
            written[key] = f"{written.get(key, '')}\n{body}"
        segments = simple_commands(text)
    names = tools([word for segment in segments for word in segment])

    def imported(args: list[str]) -> str:
        return "\n".join([sent] + [read_body(arg, cwd, written) for arg in args])

    for segment in segments:
        if subcommand(segment, "gh", ["pr", "merge"]) is not None:
            return "gh pr merge"
        if alias_merges(segment, imported):
            return "a gh alias that merges"
        found = az_pr_completes(segment)
        if found:
            return found
        if writes(segment) and REST_MERGE.search(" ".join(segment)):
            return "a GitHub REST merge (pulls/<n>/merge, /merges or merge_method)"
    if not names & REQUEST_TOOLS:
        return None
    paths = [path for segment in segments for path in body_paths(segment)] + fed_paths(text)
    bodies = "\n".join([text, sent] + [read_body(path, cwd, written) for path in paths])
    mutation = MUTATION.search(bodies)
    if mutation and names & GITHUB_TOOLS:
        return f"the GraphQL mutation {mutation[0]}"
    # Toward a pull request itself, or a request that spells no target.
    requests = azure_requests(segments)
    pr_target = PR_ITSELF.search(text) or not all(literal_target(words) for words in requests)
    if requests and pr_target and COMPLETION.search(bodies):
        return "an Azure DevOps pull request completion body"
    return None


def field(value: object, key: str) -> object:
    """*value*[*key*] when *value* is a JSON object that has it, else None."""
    return cast("dict[str, object]", value).get(key) if isinstance(value, dict) else None


def judge(raw: str) -> tuple[str | None, Exception | None]:
    """The form to refuse the hook input *raw* for, or None to let it through; and the error
    that stopped the check, if one did. After an error, the command (or the raw input when it
    holds none) is refused only when it holds a merge word."""
    command = raw
    try:
        data = cast("object", json.loads(raw))
        found = field(field(data, "tool_input"), "command")
        if not isinstance(found, str):
            raise TypeError("no command string")
        command = found
        cwd = field(data, "cwd")
        return (check(command, cwd if isinstance(cwd, str) else None) if command else None), None
    except Exception as error:  # noqa: BLE001 - judged by its merge words instead
        return unchecked(repr(error), command), error


def unchecked(detail: str, text: str) -> str | None:
    """The form to refuse a command the hook could not check for, naming *detail*, when *text*
    holds a merge word; None to let it through."""
    return f"{UNCHECKED}: {detail}; split it or tell the owner" if SUSPECT.search(text) else None


def main() -> int:
    detail = ""  # what stopped the check, if anything did
    try:
        form, error = judge(sys.stdin.buffer.read().decode("utf-8"))
        detail = repr(error) if error is not None else ""
    except UnicodeDecodeError as unread:
        # Name the bad byte, not the input; refuse only when the input holds a merge word.
        detail = f"UnicodeDecodeError at byte {unread.start}"
        form = unchecked(detail, unread.object.decode("utf-8", "replace"))
    except OSError as unread:
        form, detail = None, repr(unread)
    if detail:
        print(f"block_pr_merge: {detail}", file=sys.stderr)
    if form:
        decision = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON.format(form=form),
        }
        print(json.dumps({"hookSpecificOutput": decision}))
    elif detail:
        message = f"block_pr_merge: could not check this command ({detail}); it was allowed"
        print(json.dumps({"systemMessage": message}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
