#!/usr/bin/env python3
"""PreToolUse(Bash) hook: refuse the explicit forms of merging or completing a pull request.

Built against a well-meaning agent that merges by accident or reaches for another merge path
after a refusal, not against an attacker. It reads the whole command text, quotes removed, so a
form counts wherever it stands: chained, in a substitution, in `bash -c`, after `xargs`. What it
refuses and what it leaves alone is written once, in `merge_policy`
(~/.claude/skills/implement/repo-config.md).
"""

import json
import os
import re
import stat
import sys
from typing import cast
from urllib.parse import unquote

REASON = (
    "Merging or completing a pull request is the owner's decision (merge_policy). Leave the PR"
    " open, report its state and what is left, and stop. Do not look for another way to merge,"
    " complete or auto-complete it. (found: {form})"
)
MAX_SIZE = 1_000_000  # characters of a command, bytes of a body file
SUSPECT = re.compile(r"merge|complet|enqueue", re.IGNORECASE)

# A heredoc marker (not the here-string <<<); its body is data unless a shell or an
# interpreter in the receiving command runs it.
HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)\\?([\w.-]+)\1")
RUNNER = re.compile(r"bash|sh|zsh|dash|ksh|fish|python[\d.]*|node|ruby|perl|ssh")
SEPARATOR = re.compile(r"&&|\|\||[;&|\n()`]")
REQUEST_TOOLS = {"gh", "curl", "wget"}

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
FILE_OPTION = re.compile(r"--(?:input|in-f[\w-]*|body-file|post-file|upload-file)")


def name(word: str) -> str:
    return word.rsplit("/", 1)[-1]


def runs_body(line: str, marker: re.Match[str]) -> bool:
    """Whether the command that receives the heredoc opened by *marker* runs its body."""
    before = SEPARATOR.split(line[: marker.start()])[-1]
    after = re.split(r"&&|\|\||[;&]", line[marker.end() :])[0]
    words = re.sub(r"['\"]", " ", f"{before} {after}").split()
    return any(RUNNER.fullmatch(name(word)) for word in words)


def normalise(command: str) -> str:
    """*command* with backslash-newlines joined, data heredoc bodies dropped, quotes,
    backslashes and the commas and brackets of a list removed."""
    kept: list[str] = []
    pending: list[tuple[str, bool]] = []  # (delimiter, body runs) of the heredocs opened
    for line in command.replace("\\\n", "").split("\n"):
        if pending:
            if line.strip() == pending[0][0]:
                _ = pending.pop(0)
            elif pending[0][1]:
                kept.append(line)
            continue
        kept.append(line)
        pending += [(m[2], runs_body(line, m)) for m in HEREDOC.finditer(line)]
    text = "\n".join(kept).replace("$'", "'").replace('$"', '"')
    return re.sub(r"[,\[\]]", " ", re.sub(r"['\"\\]", "", text))


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
        if name(word) != tool:
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


def az_pr_update(words: list[str], text: str) -> str | None:
    start = subcommand(words, "az", ["repos", "pr", "update"])
    for k in range(start, len(words)) if start is not None else ():
        option, value = option_value(words, k)
        # az takes an unambiguous prefix of an option; a status from a variable counts when
        # the text spells completed.
        completes = value.lower().startswith("complet") or (
            value.startswith("$") and "completed" in text.lower()
        )
        if len(option) > 3 and "--status".startswith(option) and completes:
            return "az repos pr update --status completed"
        if (
            len(option) > 5
            and "--auto-complete".startswith(option)
            and value.lower() not in ("false", "0")
        ):
            return "az repos pr update --auto-complete"
    return None


def writes(words: list[str]) -> bool:
    """Whether a gh, curl or wget among *words* sends a method other than GET or a body."""
    tools = {name(word) for word in words} & REQUEST_TOOLS
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
    """The files the simple command *words* hands a request as its body, or feeds it through
    cat, < or jq."""
    paths: list[str] = []
    for k, word in enumerate(words):
        following = words[k + 1 : k + 3]
        if word.startswith("@") or "=@" in word or re.match(r"-[a-zA-Z]@", word):
            paths.append(word.split("@", 1)[1])
        elif word.startswith("<") and not word.startswith("<<") and len(word) > 1:
            paths.append(word[1:])
        elif FILE_OPTION.fullmatch(word.split("=", 1)[0]) and "=" in word:
            paths.append(word.split("=", 1)[1])
        elif (FILE_OPTION.fullmatch(word) or word == "<") and following:
            paths.append(following[0])
        elif word in ("--rawfile", "--slurpfile") and len(following) == 2:
            paths.append(following[1])
        elif name(word) == "cat":
            for arg in words[k + 1 :]:
                if "<" in arg or ">" in arg:
                    break
                if not arg.startswith("-"):
                    paths.append(arg)
    return paths


def read_body(path: str, cwd: str | None) -> str:
    """The text of the regular file *path* names, up to MAX_SIZE; empty when it cannot be read."""
    path = os.path.expanduser(re.sub(r"^\$(?:HOME|\{HOME\})(?=/|$)", "~", path))
    if "$" in path or path in ("", "-"):
        return ""
    path = os.path.join(cwd or "", path)
    try:
        if not stat.S_ISREG(os.stat(path).st_mode):
            return ""
        with open(path, "rb") as file:
            return file.read(MAX_SIZE).decode("utf-8", "replace")
    except OSError:
        return ""


def azure_requests(segments: list[list[str]]) -> list[list[str]]:
    """The requests of curl, wget, az rest and az devops invoke among *segments*, curl's
    --next splitting one simple command into several."""
    requests: list[list[str]] = []
    for words in segments:
        names = {name(word) for word in words}
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


def check(command: str, cwd: str | None = None) -> str | None:
    """The merge form *command* holds, or None."""
    if len(command) > MAX_SIZE:
        raise ValueError("the command is past the size cap")
    text = normalise(command)
    segments = [segment.split() for segment in SEPARATOR.split(text)]
    words = [word for segment in segments for word in segment]
    names = {name(word) for word in words}
    for segment in segments:
        if subcommand(segment, "gh", ["pr", "merge"]) is not None:
            return "gh pr merge"
        found = az_pr_update(segment, text)
        if found:
            return found
        if writes(segment) and REST_MERGE.search(unquote(" ".join(segment))):
            return "a GitHub REST merge (pulls/<n>/merge, /merges or merge_method)"
    if not names & (REQUEST_TOOLS | {"az"}):
        return None
    paths = [path for segment in segments for path in body_paths(segment)]
    bodies = "\n".join([text] + [read_body(path, cwd) for path in paths])
    mutation = MUTATION.search(bodies)
    if mutation and names & REQUEST_TOOLS:
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


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = cast("object", json.loads(raw))
        command = field(field(data, "tool_input"), "command")
        if not isinstance(command, str):
            raise TypeError("no command string")
        cwd = field(data, "cwd")
        form = check(command, cwd if isinstance(cwd, str) else None) if command else None
    except Exception as error:  # noqa: BLE001 - judged by its merge words instead
        print(f"block_pr_merge: {error!r}", file=sys.stderr)
        form = "a command the hook could not check" if SUSPECT.search(raw) else None
    if form:
        decision = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON.format(form=form),
        }
        print(json.dumps({"hookSpecificOutput": decision}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
