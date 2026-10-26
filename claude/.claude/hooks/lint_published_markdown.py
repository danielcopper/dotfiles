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

- `#974`, also after `(`, `/`, `&`, `\\`, `#`, `[x]`, `**`, `_…_` or `__…__`
  emphasis or a letter outside ASCII (`ä#974`), and before `]`, `-`, `/`, `.`,
  `)`; `#012` too (it links #12).
- `owner/repo#974`, and `GH-974` in any case.
- A full issue, pull request or discussion URL of any repository —
  `https://github.com/<owner>/<repo>/issues/974`, `/pull/N`, `/discussions/N`
  — bare or in `<…>`, also with a trailing `/`, a query or a `#issuecomment-…`
  anchor.
- `[#974]`, `[#974][]` and `[#974][label]` without a definition of their label
  in the same text. A definition written straight after a list item is a lazy
  continuation of the item: the item, the `[#974]` in it and the definition's
  URL all render large. This hook counts a definition only when it opens the
  text or follows a blank line, a heading, a thematic break, an HTML comment
  line or another definition.
- All of these in a task-list item, an ordered item (`1.`, `1)`), a heading
  inside an item (`- ## …`), a lazy continuation line (unindented, no blank
  line before it), an indented paragraph of the item, a quote indented under
  the item (`- a` then `  > b #974`, also after a blank line), and a list
  inside a quote (`> - …`, `> > 1. …`).

**What stays small or unlinked**, so it passes: an ASCII letter, digit or `_`
directly before (`a#974`, `_#974`, `x_#974_`, `romm-tender#974`) or any letter,
digit or `_` directly after (`#974x`, `#974ä`, `GH-974x`); `#0` and `GH-0`;
`[#974]`, `[#974][]` and `[#974][label]` with a definition of their label,
`[#974](url)`, and any reference inside the text of an inline link or a
`[text][ref]` link; a URL that only contains `#974`
(`https://example.com/#974`) or an issue URL in its query; `http://`, `www.`
and `/pull/N/files` URLs; a commit URL (it renders `class="commit-link"`);
inline code, `<code>…</code>` and fenced code blocks (``` and ~~~); lines
outside a list, top-level headings included. A list ends at a blank line
followed by unindented text, at a quote that starts at the left margin or
ends, and at an unindented heading, fence or thematic break written without
spaces (`***`, `---`, `___`).

**What is read.** The text `utils/published_text.py` finds, in pieces rather
than as the whole command string (`pieces=True`); its docstring lists the
commands, options, files and heredocs. Every gh command it knows counts but
`gh pr merge` (its body is a commit message). Not `git commit` (plain text)
and not `az repos pr` (Azure DevOps renders markdown its own way).

**What this hook cannot see.** What `published_text.py` names; a body put
together in a variable from anything but a heredoc or `cat`
(`B="- …"; gh … --body "$B"`); a reference spelled
`github.com/<owner>/<repo>/issues/N` without a scheme, whose `/issues/N` tail
GitHub renders large; a reference inside `_…_` emphasis that also holds a
`_` of its own. A code span is found within one line only.

Refused although GitHub shows it small, each with the way around it:

- a list item's indented code block (four spaces past its text), and a
  top-level one (four spaces or a tab) holding `- … #N` — fence it;
- a fence opened on the item's own line (`- ```…`) — open it on a line of its
  own below the item;
- `#N` in an HTML comment or an HTML attribute (`<!-- #974 -->`,
  `<a href="#974">`) in an item — move the comment out of the list, write the
  link in markdown;
- a line `2. a #N` straight below a paragraph line, which an ordered marker
  other than `1` cannot start a list from — put a blank line before it, or
  write `2\\.`;
- a line below a thematic break written with spaces (`* * *`, `- - -`), which
  reads as a list item here — write it `***` or `---`;
- a shortcut reference link `[text #974]` with its definition — write
  `[text #974][ref]`, or an inline link.

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

QUOTE_RE = re.compile(r"^(?:[ ]{0,3}>[ ]?)+")
LIST_ITEM_RE = re.compile(r"^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)")
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")
# Blocks that end a list when they start unindented, even without a blank line.
LIST_ENDING_RE = re.compile(r"^(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)")
DEFINITION_RE = re.compile(r"^\s{0,3}\[([^\]]+)\]:\s*\S")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}(?:\s|$)")
# Lines a definition may follow directly: a thematic break, spaced or not, and
# an HTML comment on a line of its own.
THEMATIC_BREAK_RE = re.compile(r"^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$")
HTML_COMMENT_RE = re.compile(r"^\s{0,3}<!--.*-->\s*$")

CODE_SPAN_RE = re.compile(r"(`+)(?!`).*?(?<!`)\1(?!`)")
HTML_CODE_RE = re.compile(r"<code>.*?</code>", re.IGNORECASE)
INLINE_LINK_RE = re.compile(r"\[[^\]]*\]\([^)]*\)")
REFERENCE_LINK_RE = re.compile(r"\[([^\]]*)\]\[([^\]]*)\]")
BRACKETED_RE = re.compile(r"\[(#\d+)\](?![(\[:])")
# `_…_` and `__…__` emphasis: its delimiters do not stand against a reference
# the way a `_` in a word does (`_#974_` links, `x_#974_` does not). The text
# inside holds no `_`, which keeps a line of many `_` linear.
EMPHASIS_RE = re.compile(r"(?<![A-Za-z0-9_])(_{1,3})([^\s_](?:[^_]*[^\s_])?)\1(?![A-Za-z0-9_])")
# An issue, pull request or discussion URL, ending where GitHub's autolink ends
# it; a further path segment (`/pull/N/files`) makes it a plain link.
ISSUE_URL_RE = re.compile(
    r"https://github\.com/[\w.-]+/[\w.-]+/(?:issues|pull|discussions)/(\d+)"
    + r"/?(?:[?#][^\s<>()]*)?(?=$|[\s<>()\[\].,;:!?'\"*_~])"
)
AUTOLINK_RE = re.compile(r"<(?:https?://|www\.)[^>\s]*>")
BARE_URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>]+")
# Before a reference only an ASCII word character stops it (`ä#974` links);
# after it any word character does (`#974ä` does not).
REFERENCE_RES = (
    re.compile(r"(?<![A-Za-z0-9_./-])[A-Za-z0-9-]+/[A-Za-z0-9_.-]+#(\d+)(?!\w)"),  # owner/repo#974
    re.compile(r"(?<![A-Za-z0-9_])#(\d+)(?!\w)"),  # #974
    re.compile(r"(?<![A-Za-z0-9_])GH-(\d+)(?!\w)", re.IGNORECASE),  # GH-974
)


def _blank(line: str, match: re.Match[str]) -> str:
    """`line` with `match` turned into blanks, positions kept."""
    return line[: match.start()] + " " * (match.end() - match.start()) + line[match.end() :]


def label(text: str) -> str:
    """A link label as markdown matches it: case and runs of blanks do not count."""
    return " ".join(text.split()).casefold()


def references(line: str, defined: set[str]) -> list[str]:
    """The references in `line` that GitHub links with the issue-link class, as written, in line order.

    `defined` holds the labels the text defines (`label`).
    """
    found: list[tuple[int, str]] = []
    for pattern in (CODE_SPAN_RE, HTML_CODE_RE, INLINE_LINK_RE):
        for match in list(pattern.finditer(line)):
            line = _blank(line, match)
    for match in list(REFERENCE_LINK_RE.finditer(line)):
        if label(match.group(2) or match.group(1)) in defined:
            line = _blank(line, match)
    for match in list(BRACKETED_RE.finditer(line)):
        if label(match.group(1)) in defined:
            line = _blank(line, match)
    for pattern in (AUTOLINK_RE, BARE_URL_RE):
        for match in list(pattern.finditer(line)):
            url = ISSUE_URL_RE.match(match.group(0).lstrip("<"))
            if url and int(url.group(1)) > 0:
                found.append((match.start(), match.group(0)))
            line = _blank(line, match)
    for match in list(EMPHASIS_RE.finditer(line)):
        width = len(match.group(1))
        line = (
            line[: match.start()]
            + " " * width
            + line[match.start() + width : match.end() - width]
            + " " * width
            + line[match.end() :]
        )
    for pattern in REFERENCE_RES:
        for match in list(pattern.finditer(line)):
            if int(match.group(1)) > 0:
                found.append((match.start(), match.group(0)))
            line = _blank(line, match)
    return [text for _, text in sorted(found)]


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


def definitions(lines: list[str], marks: list[str | None]) -> set[int]:
    """The indexes of the lines that are link definitions.

    A definition cannot interrupt a paragraph: one written straight below a
    paragraph or list line is a continuation of that line, and its label stays
    undefined. Here it counts when it opens the text or follows a blank line, a
    heading, a thematic break, an HTML comment line, a code block or another
    definition.
    """
    found: set[int] = set()
    may_start = True
    for index, (line, mark) in enumerate(zip(lines, marks)):
        if (
            mark is not None
            or not line.strip()
            or HEADING_RE.match(line)
            or THEMATIC_BREAK_RE.match(line)
            or HTML_COMMENT_RE.match(line)
        ):
            may_start = True
        elif DEFINITION_RE.match(line) and may_start:
            found.add(index)
        else:
            may_start = False
    return found


def list_lines(text: str) -> list[tuple[str, list[str]]]:
    """(line, references) for every line of a list item in `text` that carries a reference GitHub renders large.

    A quote's `>` markers are taken off first. A quote indented under an open
    list item belongs to that item, as on GitHub; any other change of quote
    depth starts afresh, outside any list.
    """
    quoted = text.replace("\r\n", "\n").split("\n")
    prefixes = [match.group(0) if (match := QUOTE_RE.match(line)) else "" for line in quoted]
    depths = [prefix.count(">") for prefix in prefixes]
    lines = [line[len(prefix) :] for line, prefix in zip(quoted, prefixes)]
    marks = fences(lines)
    definition_lines = definitions(lines, marks)
    defined = {label(match.group(1)) for index in definition_lines if (match := DEFINITION_RE.match(lines[index]))}
    offending: list[tuple[str, list[str]]] = []
    in_list = after_blank = nested = False
    depth = 0
    for index, (line, mark) in enumerate(zip(lines, marks)):
        if depths[index] > depth and in_list and (nested or quoted[index][:1].isspace()):
            nested = True  # a quote inside the open item: checked as the item's text
        elif depths[index] != depth:
            depth = depths[index]
            in_list = after_blank = nested = False
        else:
            nested = False
        if mark == "code":
            continue
        if nested:
            if mark is None and index not in definition_lines:
                found = references(line, defined)
                if found:
                    offending.append((quoted[index].strip(), found))
            continue
        if not line.strip():
            after_blank = True
            continue
        if LIST_ITEM_RE.match(line):
            in_list = True
        elif in_list and not line[:1].isspace() and (after_blank or LIST_ENDING_RE.match(line)):
            in_list = False
        after_blank = False
        if in_list and mark is None and index not in definition_lines:
            found = references(line, defined)
            if found:
                offending.append((quoted[index].strip(), found))
    return offending


BLOCKED = (
    "Blocked: GitHub renders an issue reference inside a list item as a large link "
    "with the issue's title and state icon."
)
FIX = (
    "Write it as [#N] and add, after a blank line at the end of the text, the definition line "
    "[#N]: https://github.com/<owner>/<repo>/issues/N; or write "
    "[#N](https://github.com/<owner>/<repo>/issues/N), which also replaces a bare issue URL; "
    "or move the reference into a sentence outside the list."
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
