#!/usr/bin/env python3
"""Run the merge hook over every Bash command in the local Claude Code transcripts.

A local acceptance run for block_pr_merge.py, not part of CI. It reads
~/.claude/projects/**/*.jsonl (subagent transcripts included), puts each distinct Bash command
through the hook's judge() as hook input with the cwd of the record it first appears in, and
prints:
- how many commands it read, and how many transcripts and lines it skipped as unreadable;
- how many the hook refuses, by form, and how many of those a plain detector of the explicit
  merge forms calls a real merge;
- how many checks ended in an error, by type;
- every command the detector calls a real merge that the hook lets through. None is the bar.
With --show it also prints the refused commands and the errors, tokens masked and each cut to
--width characters. The detector reads only the command's text: a merge that lies in a body
file, a variable or an encoding is the hook's to find. Reading the commands' body files is the
hook's doing; this script writes nothing but stdout.

Run: python3 claude/.claude/hooks/merge_corpus.py [--show] [--width N]
"""

import argparse
import collections
import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from block_pr_merge import field, judge

# A heredoc body cat, tee or git only reads, unless the marker's line pipes it on.
DATA_HEREDOC = re.compile(
    r"(?:^|[;&|(\n])\s*(?:cat|tee|git)\b[^\n;&|]*<<-?\s*(['\"]?)(\w+)\1[^\n|]*\n.*?\n\s*\2\s*(?:\n|$)",
    re.DOTALL,
)
GAP = r"(?:\s|\\\n)+"
REPO = rf"(?:(?:-R|--repo)[\s=]\S+{GAP})?"
# What may stand before gh as a command word: an operator, a keyword, a wrapper, an assignment,
# xargs with its options, or the quote that opens a `-c` or `eval` string.
PREFIX = (
    r"(?:^|[;&|`\n]|(?<![\w$])\(|\$\(|(?:-c|eval)\s+['\"])\s*"
    r"(?:(?:\w+=\S*|env|sudo|nohup|command|exec|time|do|then|else|timeout\s+\S+"
    r"|xargs(?:\s+-\S+)*)\s+)*"
)
MUTATIONS = r"(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)"
GH_WRITE = (
    r"(?:-X\s*=?\s*(?:PUT|POST)|--method[\s=]+(?:PUT|POST)|\s-[fF]\s|--field|--raw-field|--input)"
)
CURL_WRITE = (
    r"(?:-X\s*(?:PUT|POST)|--request[\s=]+(?:PUT|POST)|--method[\s=]+(?:PUT|POST)"
    r"|\s-d|--data|--json)"
)
COMPLETION = r"(?:\"?status\"?\s*:\s*\"?(?:completed|3)\b|autoCompleteSetBy)"
AZURE_TARGET = (
    r"(?:pullrequests[/\\][^/\\\s'\"?]+(?=[?'\"\s]|$)|--resource\s+pullRequests\b"
    r"|\$\{?\w*(?:URL|URI)\w*\}?)"
)
REAL_MERGE = re.compile(
    "|".join(
        [
            rf"{PREFIX}(?:\S*/)?gh{GAP}{REPO}pr{GAP}{REPO}\$?['\"]?merge['\"]?(?![\w-])",
            r"[\"']gh[\"']\s*,\s*[\"']pr[\"']\s*,\s*[\"']merge[\"']",
            rf"\bgh\s+api\b(?=[^\n;|&]*pulls/\S+/merge(?![\w-]))(?=[^\n;|&]*{GH_WRITE})",
            rf"\bgh\s+api\b(?=[^\n;|&]*repos/\S+/merges\b)(?=[^\n;|&]*{GH_WRITE})",
            r"\bgh\s+api\b[^\n;|&]*merge_method=",
            (
                rf"\b(?:curl|wget)\b(?=[^\n;|&]*(?:pulls/\d+/merge(?![\w-])|repos/\S+/merges\b))"
                rf"(?=[^\n;|&]*(?:{CURL_WRITE}|merge_method))"
            ),
            rf"\b(?:gh\s+api|curl|wget)\b[^\n]*graphql.*?{MUTATIONS}",
            (
                rf"\bgh\s+alias\s+(?:set|import)\b.*?(?:(?<![\w-])pr(?![\w-])[^\n]*?"
                rf"(?<![\w-])merge(?![\w-])|{MUTATIONS})"
            ),
            (
                r"\baz\s+repos\s+pr\s+(?:update|create)\b[^\n;|&]*"
                r"(?:--st\w*[\s=]+['\"]?completed|--auto-c[\w-]*(?![\w-])(?![\s=]+['\"]?(?:false|0)\b))"
            ),
            (
                rf"\b(?:az\s+rest|az\s+devops\s+invoke|curl|wget)\b(?=.*?{AZURE_TARGET})"
                rf"(?=.*?{COMPLETION})"
            ),
        ]
    ),
    re.IGNORECASE | re.DOTALL,
)
MASKS = [
    (re.compile(r"(gh[pousr]_|github_pat_)\w+"), r"\1<masked>"),
    (re.compile(r"(bearer\s+)[^\s\"']+", re.IGNORECASE), r"\1<masked>"),
    (
        re.compile(r"(\w*(?:pat|token|secret|password|key)\w*=)[^\s\"'$]+", re.IGNORECASE),
        r"\1<masked>",
    ),
    (re.compile(r"[A-Za-z0-9+=_]{32,}"), "<masked>"),
]


def real_merge(command: str) -> bool:
    """Whether the detector finds an explicit merge form in the text of *command*."""
    commands = DATA_HEREDOC.sub(lambda body: body[0][: body[0].index("\n") + 1], command)
    return bool(REAL_MERGE.search(commands))


@dataclass
class Skipped:
    transcripts: int = 0
    lines: int = 0


def commands(skipped: Skipped) -> Iterator[tuple[str, str | None]]:
    """Every distinct Bash command in the transcripts, with the cwd of the record it first
    appears in; what cannot be read is counted in *skipped*."""
    seen: set[str] = set()
    for path in sorted(Path.home().glob(".claude/projects/**/*.jsonl")):
        yield from transcript_commands(path, seen, skipped)


def transcript_commands(
    path: Path, seen: set[str], skipped: Skipped
) -> Iterator[tuple[str, str | None]]:
    """The Bash commands of one transcript not in *seen*, which they join."""
    try:
        file = path.open(encoding="utf-8", errors="replace")
    except OSError:
        skipped.transcripts += 1
        return
    with file:
        for line in file:
            if '"Bash"' not in line:
                continue
            try:
                record = cast("object", json.loads(line))
            except ValueError:
                skipped.lines += 1
                continue
            content = field(field(record, "message"), "content")
            for block in cast("list[object]", content) if isinstance(content, list) else []:
                if field(block, "name") != "Bash":
                    continue
                command = field(field(block, "input"), "command")
                if isinstance(command, str) and command and command not in seen:
                    seen.add(command)
                    cwd = field(record, "cwd")
                    yield command, cwd if isinstance(cwd, str) else None


def mask(command: str, width: int) -> str:
    for pattern, replacement in MASKS:
        command = pattern.sub(replacement, command)
    command = command.replace("\n", "\\n")
    return command if len(command) <= width else command[:width] + "..."


class Args(argparse.Namespace):
    show: bool = False
    width: int = 240


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    _ = parser.add_argument("--show", action="store_true", help="print the refused commands")
    _ = parser.add_argument("--width", type=int, default=240, help="characters per command")
    args = parser.parse_args(namespace=Args())
    total = 0
    skipped = Skipped()
    refused: dict[str, list[tuple[str, bool]]] = collections.defaultdict(list)
    errors: dict[str, list[str]] = collections.defaultdict(list)
    missed: list[str] = []
    for command, cwd in commands(skipped):
        total += 1
        form, error = judge(json.dumps({"tool_input": {"command": command}, "cwd": cwd}))
        if error is not None:
            errors[type(error).__name__].append(command)
        real = real_merge(command)
        if form:
            refused[form.split(": ", 1)[0] if error else form].append((command, real))
        elif real:
            missed.append(command)
    count = sum(len(found) for found in refused.values())
    reals = sum(real for found in refused.values() for _, real in found)
    print(f"commands: {total} (skipped: {skipped.transcripts} transcripts, {skipped.lines} lines)")
    print(f"refused: {count} ({reals} real merges by the detector, {count - reals} other)")
    for form, found in sorted(refused.items(), key=lambda item: -len(item[1])):
        print(f"  {len(found):6d}  {form}  ({sum(real for _, real in found)} real)")
    kinds = ", ".join(f"{kind}: {len(found)}" for kind, found in errors.items())
    print(f"hook errors: {sum(len(found) for found in errors.values())} ({kinds})")
    print(f"real merges the hook lets through: {len(missed)}")
    for command in missed:
        print(f"  PASS  {mask(command, args.width)}")
    if args.show:
        for form, found in refused.items():
            print(f"\n## {form}")
            for command, real in found:
                print(f"  {'real ' if real else 'other'}  {mask(command, args.width)}")
        for kind, found in errors.items():
            print(f"\n## hook error {kind}")
            for command in found:
                print(f"  {mask(command, args.width)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
