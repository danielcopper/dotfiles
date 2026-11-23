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
from urllib.parse import unquote

REASON = (
    "Merging or completing a pull request is the owner's decision (merge_policy). Leave the PR"
    " open, report its state and what is left, and stop. Do not look for another way to merge,"
    " complete or auto-complete it. (found: {form})"
)
MAX_SIZE = 1_000_000  # characters of a command, bytes of a body file
SUSPECT = re.compile(r"merge|complet|enqueue", re.IGNORECASE)

# A heredoc marker (not the here-string <<<). The command receiving it runs its body, sends it as
# a request body, writes it to a file, or only reads it.
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)\\?([\w.-]+)\1")
RUNNER = re.compile(r"bash|sh|zsh|dash|ksh|fish|python[\d.]*|node|ruby|perl|ssh")
SEPARATOR = re.compile(r"&&|\|\||[;&|\n()`]")  # ends a simple command
STATEMENT = re.compile(r"&&|\|\||[;&\n]")  # ends a pipeline
SUBSTITUTION = re.compile(r"(?:(\w+)=)?\$\(([^()]*)\)")
ASSIGNMENTS = re.compile(r"\s*(?:\w+=\S*\s+)*")
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


def heredoc_role(line: str, marker: re.Match[str]) -> tuple[str, list[str]]:
    """What the command receiving the heredoc opened by *marker* does with its body: "run" it
    (a shell or an interpreter), "send" it (a request tool), or "read" it, writing it to the
    files it names with a `>`, `>>` or `tee`."""
    before = SEPARATOR.split(line[: marker.start()])[-1]
    after = STATEMENT.split(line[marker.end() :])[0]
    words = re.sub(r"['\"]", " ", f"{before} {after}").split()
    names = {os.path.basename(word) for word in words}
    if any(RUNNER.fullmatch(word) for word in names):
        return "run", []
    if REQUEST_TOOLS & names:
        return "send", []
    paths: list[str] = []
    tee = False
    for k, word in enumerate(words):
        if word in (">", ">>") and k + 1 < len(words):
            paths.append(words[k + 1])
        elif re.fullmatch(r">>?[^>&].*", word):
            paths.append(word.lstrip(">"))
        elif word == "|":
            tee = False
        elif os.path.basename(word) == "tee":
            tee = True
        elif tee and not word.startswith("-"):
            paths.append(word)
    return "read", paths


def normalise(command: str) -> tuple[str, str, dict[str, str]]:
    """*command* with backslash-newlines joined, the bodies of heredocs that no shell or
    interpreter runs dropped, quotes, backslashes and the commas and brackets of a list removed;
    the bodies of the heredocs a request tool receives; and the heredoc bodies written to a file,
    by its path. A marker whose delimiter line never comes opens no heredoc."""
    lines = command.replace("\\\n", "").split("\n")
    kept: list[str] = []
    sent: list[str] = []
    written: dict[str, str] = {}
    pending: list[tuple[str, str, list[str], list[str]]] = []  # delimiter, role, paths, body
    last = {line.strip(): i for i, line in enumerate(lines)}
    for i, line in enumerate(lines):
        if pending:
            delimiter, role, paths, body = pending[0]
            if line.strip() == delimiter:
                _ = pending.pop(0)
                written.update(dict.fromkeys(paths, "\n".join(body)))
            else:
                body.append(line)
                {"run": kept, "send": sent}.get(role, []).append(line)
            continue
        kept.append(line)
        for marker in HEREDOC.finditer(line):
            if last.get(marker[2], -1) > i:
                pending.append((marker[2], *heredoc_role(line, marker), []))
    text = "\n".join(kept).replace("$'", "'").replace('$"', '"')
    return re.sub(r"[,\[\]]", " ", re.sub(r"['\"\\]", "", text)), "\n".join(sent), written


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


def az_pr_completes(words: list[str], text: str) -> str | None:
    """The completion `az repos pr update` or `create` in *words* sets, or None. az takes an
    unambiguous prefix of an option; a status from a variable counts when the text spells
    completed."""
    for verb in ("update", "create"):
        start = subcommand(words, "az", ["repos", "pr", verb])
        for k in range(start, len(words)) if start is not None else ():
            option, value = option_value(words, k)
            completes = value.lower().startswith("complet") or (
                value.startswith("$") and "completed" in text.lower()
            )
            if verb == "update" and len(option) > 3 and "--status".startswith(option) and completes:
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
    tools = {os.path.basename(word) for word in words} & GITHUB_TOOLS
    for k, word in enumerate(words):
        method = METHOD.fullmatch(word)
        if method:
            value = method[1] or (words[k + 1] if k + 1 < len(words) else "")
            if tools and value.upper() not in ("GET", "HEAD"):
                return True
        if any(BODY_OPTION[tool].match(word) for tool in tools):
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
    return bool(REQUEST_TOOLS & {os.path.basename(word) for word in text.split()})


def stdin_paths(words: list[str], cat: bool) -> list[str]:
    """The files a `< path` among *words* feeds, and with *cat* the files `cat` prints."""
    paths: list[str] = []
    for k, word in enumerate(words):
        if word == "<" and k + 1 < len(words):
            paths.append(words[k + 1])
        elif word.startswith("<") and not word.startswith("<<") and len(word) > 1:
            paths.append(word[1:])
        elif cat and os.path.basename(word) == "cat":
            for arg in words[k + 1 :]:
                if re.search(r"[<>|]", arg):
                    break
                if not arg.startswith("-"):
                    paths.append(arg)
    return paths


def fed_paths(text: str) -> list[str]:
    """The files `cat` or `<` feeds a request tool in *text*: in a `$( )` within the request's
    pipeline or assigned to a variable the request uses, through a pipe into it, or as its
    stdin."""
    paths: list[str] = []
    statements = STATEMENT.split(text)
    for statement in statements:
        flat = SUBSTITUTION.sub(" ", statement)
        for found in SUBSTITUTION.finditer(statement):
            # `NAME=$( )` before the command word assigns a variable; elsewhere, as in
            # `-f query=$( )`, the substitution is a word of the command
            assigned = found[1] and ASSIGNMENTS.fullmatch(statement[: found.start()])
            variable = re.compile(rf"\$\{{?{found[1]}\b")
            if has_request(flat) or (
                assigned and any(has_request(s) and variable.search(s) for s in statements)
            ):
                paths += stdin_paths(found[2].split(), cat=True)
        stages = flat.split("|")
        for i, stage in enumerate(stages):
            later = any(has_request(other) for other in stages[i + 1 :])
            if later or has_request(stage):
                paths += stdin_paths(stage.split(), cat=later)
    return paths


def candidates(path: str, bases: list[str]) -> list[str]:
    """The absolute paths *path* may name: `~` and `$HOME` expanded, a relative path taken from
    each of *bases*; none when another variable stands in it."""
    path = os.path.expanduser(re.sub(r"^\$(?:HOME|\{HOME\})(?=/|$)", "~", path))
    if "$" in path or path in ("", "-"):
        return []
    return [os.path.normpath(os.path.join(base, path)) for base in bases]


def cd_bases(segments: list[list[str]], cwd: str | None) -> list[str]:
    """The literal `cd` targets in *segments*, taken from *cwd*, and *cwd* itself."""
    bases = [cwd or ""]
    for words in segments:
        if len(words) > 1 and words[0] == "cd" and "$" not in words[1]:
            bases.insert(-1, os.path.join(cwd or "", os.path.expanduser(words[1])))
    return bases


def read_body(path: str, bases: list[str], written: dict[str, str]) -> str:
    """The text the file *path* holds, up to MAX_SIZE: a heredoc this command writes to it, or
    the regular file on disk; empty when none can be read."""
    texts: list[str] = []
    for candidate in candidates(path, bases):
        if candidate in written:
            texts.append(written[candidate])
            continue
        try:
            if stat.S_ISREG(os.stat(candidate).st_mode):
                with open(candidate, "rb") as file:
                    texts.append(file.read(MAX_SIZE).decode("utf-8", "replace"))
        except (OSError, ValueError, UnicodeError):
            continue
    return "\n".join(texts)


def run_scripts(segments: list[list[str]]) -> list[str]:
    """The script paths *segments* run: the command word, or the first argument of a shell or
    an interpreter."""
    scripts: list[str] = []
    for words in segments:
        command = next((w for w in words if not re.fullmatch(r"\w+=\S*", w)), None)
        if command:
            scripts.append(command)
        for k, word in enumerate(words):
            if RUNNER.fullmatch(os.path.basename(word)):
                scripts += [w for w in words[k + 1 :] if not w.startswith("-")][:1]
    return scripts


def azure_requests(segments: list[list[str]]) -> list[list[str]]:
    """The requests of curl, wget, az rest and az devops invoke among *segments*, curl's
    --next splitting one simple command into several."""
    requests: list[list[str]] = []
    for words in segments:
        names = {os.path.basename(word) for word in words}
        if {"curl", "wget"} & names or ("az" in names and {"rest", "invoke"} & set(words)):
            requests += [part.split() for part in re.split(r"\s(?:--next|-:)\s", " ".join(words))]
    return requests


def literal_target(words: list[str]) -> bool:
    """Whether the request *words* names its target: a URL that is no header value, or
    devops invoke's resource."""
    invoke = "invoke" in words
    return any(
        ("://" in word and not (k and words[k - 1].endswith(":")))
        or (invoke and word == "--resource")
        for k, word in enumerate(words)
    )


def split(text: str) -> list[list[str]]:
    return [segment.split() for segment in SEPARATOR.split(text)]


def check(command: str, cwd: str | None = None) -> str | None:
    """The merge form *command* holds, or None."""
    if len(command) > MAX_SIZE:
        raise ValueError(f"the command is longer than {MAX_SIZE:,} characters")
    text, sent, heredocs = normalise(command)
    bases = cd_bases(split(text), cwd)
    written = {key: body for path, body in heredocs.items() for key in candidates(path, bases)}
    ran = [
        written[key]
        for path in run_scripts(split(text))
        for key in candidates(path, bases)
        if key in written
    ]
    if ran:  # a script this command writes and runs is read as commands too
        more_text, more_sent, _ = normalise("\n".join(ran))
        text, sent = f"{text}\n{more_text}", f"{sent}\n{more_sent}"
    segments = split(text)
    names = {os.path.basename(word) for segment in segments for word in segment}

    def imported(args: list[str]) -> str:
        return "\n".join([sent] + [read_body(arg, bases, written) for arg in args])

    for segment in segments:
        if subcommand(segment, "gh", ["pr", "merge"]) is not None:
            return "gh pr merge"
        if alias_merges(segment, imported):
            return "a gh alias that merges"
        found = az_pr_completes(segment, text)
        if found:
            return found
        if writes(segment) and REST_MERGE.search(unquote(" ".join(segment))):
            return "a GitHub REST merge (pulls/<n>/merge, /merges or merge_method)"
    if not names & REQUEST_TOOLS:
        return None
    paths = [path for segment in segments for path in body_paths(segment)] + fed_paths(text)
    bodies = "\n".join([text, sent] + [read_body(path, bases, written) for path in paths])
    mutation = MUTATION.search(bodies)
    if mutation and names & GITHUB_TOOLS:
        return f"the GraphQL mutation {mutation[0]}"
    # Toward a pull request itself (a backslash may stand for the slash), or a request whose
    # target is not spelled out.
    requests = azure_requests(segments)
    slashed = command.replace("\\", "/")
    pr_target = PR_ITSELF.search(f"{text}\n{slashed}") or not all(
        literal_target(request) for request in requests
    )
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
        if SUSPECT.search(command):
            return (
                f"a command the hook could not check: {error!r}; split it or tell the owner",
                error,
            )
        return None, error


def main() -> int:
    try:
        form, error = judge(sys.stdin.read())
    except (OSError, ValueError, UnicodeError) as unread:
        form, error = None, unread
    if error is not None:
        print(f"block_pr_merge: {error!r}", file=sys.stderr)
    if form:
        decision = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON.format(form=form),
        }
        print(json.dumps({"hookSpecificOutput": decision}))
    elif error is not None:
        message = f"block_pr_merge: could not check this command ({error!r}); it was allowed"
        print(json.dumps({"systemMessage": message}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
