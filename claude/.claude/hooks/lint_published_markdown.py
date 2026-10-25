#!/usr/bin/env python3
"""PreToolUse(Bash) hook: refuse markdown that GitHub would render other than
meant, in the text gh publishes.

One rule so far: no issue reference in a list item. GitHub renders a reference
inside `<li>` as a large link carrying the issue's title and state icon; in a
paragraph the same reference stays a small link. A decisions list full of
`(#974)` turns into a list of issue cards. Exit 2 blocks the call, naming each
offending line and the fix; anything else lets it through.

**What renders large** — measured with `gh api markdown -f mode=gfm -f
context=danielcopper/romm-tender` on 2026-10-25; large means the rendered `<a>`
carries `class="issue-link"`:

- `#974`, also after `(`, `/`, `&`, `\\`, `#`, `[x]` or `**`, and before `]`,
  `-`, `/`, `.`, `)`; `#012` too (it links #12).
- `owner/repo#974`, and `GH-974` in any case.
- A full issue, pull request or discussion URL of any repository —
  `https://github.com/<owner>/<repo>/issues/974`, `/pull/N`, `/discussions/N`
  — bare or in `<…>`, also with a trailing `/`, a query or a `#issuecomment-…`
  anchor.
- `[#974]` without a `[#974]: <url>` definition in the same text.
- All of these in a task-list item, an ordered item (`1.`, `1)`), a heading
  inside an item (`- ## …`), a lazy continuation line (unindented, no blank
  line before it) and an indented paragraph of the item.

**What stays small or unlinked**, so it passes: a word character directly
before or after (`a#974`, `_#974`, `#974x`, `GH-974x`, `romm-tender#974`);
`#0` and `GH-0`; `[#974]` with its definition, `[#974](url)`, `[#974][ref]`
and any reference inside link text; a URL that only contains `#974`
(`https://example.com/#974`); `http://`, `www.` and `/pull/N/files` URLs; a
commit URL (it renders `class="commit-link"`); inline code, `<code>…</code>`
and fenced code blocks (``` and ~~~); lines outside a list, top-level headings
included. A list ends at a blank line followed by unindented text, and at an
unindented heading, fence, quote or thematic break.

**What is read.** The text `utils/published_text.py` finds for
`gh pr create|new|edit|comment|review|close|reopen`,
`gh issue create|new|edit|comment|close|reopen`, `gh release create|new|edit`
and `gh api` writes — as pieces, not the whole command string: the values of
`--body`/`-b` (`--comment`/`-c` for close and reopen, `--notes`/`-n` for a
release), the body files, every heredoc, the files a `cat` prints and the
`gh api` fields and files, decoded as JSON too. Not `gh pr merge` (its body is
a commit message), not `git commit` (plain text) and not `az repos pr` (Azure
DevOps renders markdown its own way).

**What this hook cannot see.** What `published_text.py` names; a body put
together in a variable from anything but a heredoc or `cat`
(`B="- …"; gh … --body "$B"`); a reference spelled `github.com/<owner>/<repo>/
issues/N` without a scheme, which GitHub links in a shape of its own. A list
item's indented code block (four spaces past its text) is refused although
GitHub shows it as code — fence it. A code span is found within one line only.
Anything that does not parse lets the call through, and so does an error
inside the hook: a guard that blocks a harmless command by accident gets
switched off.
"""

import json
import re
import sys
from pathlib import Path
from typing import cast

# The shared reader sits beside this file in the repository. Resolved, so the
# live symlink in ~/.claude/hooks finds it without a link of its own.
sys.path.insert(0, str(Path(__file__).resolve().parent / "utils"))
from published_text import publishing_sources  # noqa: E402

LIST_ITEM_RE = re.compile(r"^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)")
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")
# Blocks that end a list when they start unindented, even without a blank line.
LIST_ENDING_RE = re.compile(r"^(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)")
DEFINITION_RE = re.compile(r"^\s{0,3}\[#(\d+)\]:\s*\S")

CODE_SPAN_RE = re.compile(r"(`+)(?!`).*?(?<!`)\1(?!`)")
HTML_CODE_RE = re.compile(r"<code>.*?</code>", re.IGNORECASE)
INLINE_LINK_RE = re.compile(r"\[[^\]]*\]\([^)]*\)")
REFERENCE_LINK_RE = re.compile(r"\[[^\]]*\]\[[^\]]*\]")
BRACKETED_RE = re.compile(r"\[#(\d+)\](?![(\[:])")
# An issue, pull request or discussion URL, ending where GitHub's autolink ends
# it; a further path segment (`/pull/N/files`) makes it a plain link.
ISSUE_URL_RE = re.compile(
    r"https://github\.com/[\w.-]+/[\w.-]+/(?:issues|pull|discussions)/(\d+)"
    + r"/?(?:[?#][^\s<>()]*)?(?=$|[\s<>()\[\].,;:!?'\"*_~])"
)
AUTOLINK_RE = re.compile(r"<(?:https?://|www\.)[^>\s]*>")
BARE_URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>]+")
REFERENCE_RES = (
    re.compile(r"(?<![\w./-])[\w-]+/[\w.-]+#(\d+)(?!\w)"),  # owner/repo#974
    re.compile(r"(?<!\w)#(\d+)(?!\w)"),  # #974
    re.compile(r"(?<!\w)GH-(\d+)(?!\w)", re.IGNORECASE),  # GH-974
)


def _blank(line: str, match: re.Match[str]) -> str:
    """`line` with `match` turned into blanks, positions kept."""
    return line[: match.start()] + " " * (match.end() - match.start()) + line[match.end() :]


def references(line: str, defined: set[str]) -> list[str]:
    """The references in `line` that GitHub links with the issue-link class, as written."""
    found: list[str] = []
    for pattern in (CODE_SPAN_RE, HTML_CODE_RE, INLINE_LINK_RE, REFERENCE_LINK_RE):
        for match in reversed(list(pattern.finditer(line))):
            line = _blank(line, match)
    for match in reversed(list(BRACKETED_RE.finditer(line))):
        if match.group(1) in defined:
            line = _blank(line, match)
    for pattern in (AUTOLINK_RE, BARE_URL_RE):
        for match in reversed(list(pattern.finditer(line))):
            url = ISSUE_URL_RE.search(match.group(0))
            if url and int(url.group(1)) > 0:
                found.append(match.group(0))
            line = _blank(line, match)
    for pattern in REFERENCE_RES:
        for match in reversed(list(pattern.finditer(line))):
            if int(match.group(1)) > 0:
                found.append(match.group(0))
            line = _blank(line, match)
    return found


def fences(lines: list[str]) -> list[str | None]:
    """For each line: "open" for a line that opens a fenced code block, "code" inside one or closing it, else None."""
    marks: list[str | None] = []
    fence: str | None = None
    for line in lines:
        if fence is None:
            opener = FENCE_RE.match(line)
            fence = opener.group(1) if opener else None
            marks.append("open" if opener else None)
            continue
        marks.append("code")
        stripped = line.strip()
        if set(stripped) == {fence[0]} and len(stripped) >= len(fence):
            fence = None
    return marks


def list_lines(text: str) -> list[tuple[str, list[str]]]:
    """(line, references) for every line of a list item in `text` that carries a reference GitHub renders large."""
    lines = text.replace("\r\n", "\n").split("\n")
    marks = fences(lines)
    defined = {
        definition.group(1)
        for line, mark in zip(lines, marks)
        if mark is None and (definition := DEFINITION_RE.match(line))
    }
    offending: list[tuple[str, list[str]]] = []
    in_list = after_blank = False
    for line, mark in zip(lines, marks):
        if mark == "code":
            continue
        if not line.strip():
            after_blank = True
            continue
        if LIST_ITEM_RE.match(line):
            in_list = True
        elif in_list and not line[:1].isspace() and (after_blank or LIST_ENDING_RE.match(line)):
            in_list = False
        after_blank = False
        if in_list and mark is None and not DEFINITION_RE.match(line):
            found = references(line, defined)
            if found:
                offending.append((line.strip(), found))
    return offending


BLOCKED = (
    "Blocked: GitHub renders an issue reference inside a list item as a large link "
    "with the issue's title and state icon."
)
FIX = (
    "Write it as [#N] with a definition line [#N]: https://github.com/<owner>/<repo>/issues/N "
    "at the end of the text, or as a link [#N](https://github.com/<owner>/<repo>/issues/N) "
    "(also for a full URL), or move the reference into a sentence outside the list."
)


def counts(name: str) -> bool:
    """Whether the publishing command `name` puts out markdown GitHub renders: every gh one but `pr merge`."""
    return name.startswith("gh ") and name != "gh pr merge"


def lint_block(command: str, cwd: str) -> str | None:
    """Why the gh text `command` publishes is refused, or None."""
    seen: set[str] = set()
    report: list[str] = []
    for where, text in publishing_sources(command, cwd, counts, pieces=True):
        for line, found in list_lines(text):
            if line in seen:
                continue
            seen.add(line)
            report.append(f"  {where}: {line}\n    renders large: {', '.join(found)}")
    if not report:
        return None
    return "\n".join([BLOCKED, *report, FIX])


def main() -> int:
    try:
        data = cast(object, json.load(sys.stdin))
    except (json.JSONDecodeError, ValueError):
        return 0
    if not isinstance(data, dict):
        return 0
    payload = cast("dict[str, object]", data)
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0
    command = cast("dict[str, object]", tool_input).get("command")
    cwd = payload.get("cwd")
    if not isinstance(command, str):
        return 0
    cwd = cwd if isinstance(cwd, str) else ""
    try:
        reason = lint_block(command, cwd)
    except Exception as error:  # noqa: BLE001 - a guard that crashes must not block the call
        print(f"lint_published_markdown: letting the call through after an error: {error!r}", file=sys.stderr)
        return 0
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
