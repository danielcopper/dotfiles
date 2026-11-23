#!/usr/bin/env python3
"""Run block_pr_merge's check over every Bash command in the local Claude Code transcripts.

A local acceptance run, not part of CI. It prints how many distinct commands the hook refuses,
by form, and lists every command a plain detector of the explicit merge forms finds that the
hook lets through; the acceptance is that there is none. With --show it also prints each
refused command, masked and truncated, marked "real" when the detector finds a merge in it.
It reads ~/.claude/projects/**/*.jsonl (subagent transcripts included) and the body files
the commands name, and writes nothing but stdout.

Run: python3 claude/.claude/hooks/merge_corpus.py [--show] [--width N]
"""

import argparse
import collections
import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import cast

from block_pr_merge import SUSPECT, check, field

# The explicit merge forms as a reader would spell them, independent of the hook's parsing:
# gh as a command word (not inside a word such as Bash(gh …)), and a heredoc body that cat, tee
# or git reads is no command.
DATA_HEREDOC = re.compile(
    r"(?:^|[;&|(\n])\s*(?:cat|tee|git)\b[^\n;&|]*<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\s*(?:\n|$)",
    re.DOTALL,
)
REAL_MERGE = re.compile(
    (
        r"(?:^|[;&|`\n]|(?<![\w$])\(|\$\()\s*(?:\w+=\S*\s+)*(?:(?:env|command|timeout\s+\d+)\s+)*"
        r"(?:\S*/)?gh\s+(?:(?:-R|--repo)[\s=]\S+\s+)?pr\s+(?:(?:-R|--repo)[\s=]\S+\s+)?merge\b"
        r"|\bgh\s+api\b[^\n;|&]*(?:-X\s*|--method[\s=])(?:PUT|POST)\b[^\n;|&]*pulls/\S+/merge\b"
        r"|\bgh\s+api\b[^\n;|&]*pulls/\S+/merge\b[^\n;|&]*(?:-X\s*|--method[\s=])(?:PUT|POST)\b"
        r"|\bgh\s+api\s+graphql\b.*(?:mergePullRequest|enablePullRequestAutoMerge"
        r"|enqueuePullRequest)|\baz\s+repos\s+pr\s+update\b[^\n;|&]*"
        r"(?:--status[\s=]+completed|--auto-complete(?![\s=]+(?:false|0)\b))"
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
UNCHECKED = "a command the hook could not check"


def real_merge(command: str) -> bool:
    """Whether the detector finds an explicit merge form in *command*."""
    commands = DATA_HEREDOC.sub(lambda body: body[0][: body[0].index("\n") + 1], command)
    return bool(REAL_MERGE.search(commands))


def commands() -> Iterator[tuple[str, str | None]]:
    """Every distinct Bash command in the transcripts, with the cwd it first ran in."""
    seen: set[str] = set()
    for path in sorted(Path.home().glob(".claude/projects/**/*.jsonl")):
        yield from transcript_commands(path, seen)


def transcript_commands(path: Path, seen: set[str]) -> Iterator[tuple[str, str | None]]:
    """The Bash commands of one transcript not in *seen*, which they join."""
    try:
        file = path.open(encoding="utf-8", errors="replace")
    except OSError:
        return
    with file:
        for line in file:
            if '"Bash"' not in line:
                continue
            try:
                record = cast("object", json.loads(line))
            except ValueError:
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
    refused: dict[str, list[tuple[str, bool]]] = collections.defaultdict(list)
    missed: list[str] = []
    for command, cwd in commands():
        total += 1
        try:
            form = check(command, cwd)
        except Exception:  # noqa: BLE001 - counted as the hook's error path counts it
            form = UNCHECKED if SUSPECT.search(command) else None
        real = real_merge(command)
        if form:
            refused[form].append((command, real))
        elif real:
            missed.append(command)
    count = sum(len(found) for found in refused.values())
    reals = sum(real for found in refused.values() for _, real in found)
    print(f"commands: {total}")
    print(f"refused: {count} ({reals} real merges by the detector, {count - reals} other)")
    for form, found in sorted(refused.items(), key=lambda item: -len(item[1])):
        print(f"  {len(found):6d}  {form}  ({sum(real for _, real in found)} real)")
    print(f"real merges the hook lets through: {len(missed)}")
    for command in missed:
        print(f"  PASS  {mask(command, args.width)}")
    if args.show:
        for form, found in refused.items():
            print(f"\n## {form}")
            for command, real in found:
                print(f"  {'real ' if real else 'other'}  {mask(command, args.width)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
