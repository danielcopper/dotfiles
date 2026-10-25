#!/usr/bin/env python3
"""Unit tests for lint_published_markdown: which issue references GitHub renders
large inside a list item, and where in a gh command the text carrying them is
read.

The shapes are the ones measured with `gh api markdown` (see the hook's
docstring).

Run: python3 claude/.claude/hooks/test_lint_published_markdown.py
"""

import importlib.util
import io
import json
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_HOOK = Path(__file__).with_name("lint_published_markdown.py")
_spec = importlib.util.spec_from_file_location("lint_published_markdown", _HOOK)
assert _spec and _spec.loader
lint = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lint)

URL = "https://github.com/danielcopper/romm-tender/issues/974"
DECISION = "- D8: read the stamp through one helper (#974)"


def run_hook_raw(payload: str) -> subprocess.CompletedProcess[str]:
    """The hook as the harness runs it, fed `payload` on stdin."""
    return subprocess.run(
        [sys.executable, str(_HOOK)], input=payload, capture_output=True, text=True, check=False, timeout=15
    )


def run_hook(command: str, cwd: str) -> subprocess.CompletedProcess[str]:
    """The hook as the harness runs it: JSON on stdin, 2 means blocked."""
    return run_hook_raw(json.dumps({"tool_input": {"command": command}, "cwd": cwd}))


def temp_dir(test: unittest.TestCase) -> str:
    """A fresh directory, removed when `test` finishes."""
    path = tempfile.mkdtemp()
    test.addCleanup(shutil.rmtree, path, ignore_errors=True)
    return path


def refused(text: str) -> bool:
    """Whether `text` carries a list line with a reference that renders large."""
    return bool(lint.list_lines(text))


class WhatRendersLarge(unittest.TestCase):
    """Every shape measured as `class="issue-link"` inside a list item."""

    def test_a_bare_reference_whatever_punctuation_stands_beside_it(self):
        for text in (
            "- a #974 b",
            "- a (#974).",
            "- a/#974 b",
            "- a &#974 b",
            "- a \\#974 b",
            "- a ##974 b",
            "- a [x]#974 b",
            "- **#974** b",
            "- a #974] b",
            "- a #974-x b",
            "- a #974/x b",
            "- a #974.5 b",
            "- a #012 b",
        ):
            with self.subTest(text=text):
                self.assertTrue(refused(text))

    def test_owner_repo_and_gh_references(self):
        for text in ("- a danielcopper/romm-tender#974 b", "- a GH-974 b", "- a gh-974 b"):
            with self.subTest(text=text):
                self.assertTrue(refused(text))

    def test_a_full_issue_pull_or_discussion_url_of_any_repository(self):
        for url in (
            URL,
            URL + "/",
            URL + "?x=1",
            URL + "#issuecomment-1",
            "https://github.com/danielcopper/romm-tender/pull/2563",
            "https://github.com/danielcopper/romm-tender/discussions/974",
            "https://github.com/cli/cli/issues/974",
        ):
            for text in (f"- a {url} b", f"- a <{url}> b", f"- a ({url}) b", f"- a {url}. b"):
                with self.subTest(text=text):
                    self.assertTrue(refused(text))

    def test_a_bracketed_reference_without_its_definition(self):
        self.assertTrue(refused("- a [#974] b"))
        self.assertTrue(refused("- a [#974] b\n\n[#975]: " + URL))

    def test_every_kind_of_list_item(self):
        for text in (
            "* a #974",
            "+ a #974",
            "1. a #974",
            "1) a #974",
            "- [ ] a #974",
            "- [x] a #974",
            "  - nested #974",
        ):
            with self.subTest(text=text):
                self.assertTrue(refused(text))

    def test_a_heading_inside_a_list_item(self):
        self.assertTrue(refused("- ## head #974"))

    def test_a_continuation_line_of_the_item(self):
        for text in (
            "- item\n  continued (#974)",
            "- item\n\n  a second paragraph #974",
            "- item\nlazy continuation #974",
        ):
            with self.subTest(text=text):
                self.assertEqual(lint.list_lines(text)[0][1], ["#974"])


class WhatStaysSmall(unittest.TestCase):
    """Shapes measured as a plain link or no link at all: a guard that refuses them gets turned off."""

    def test_a_reference_with_a_word_character_beside_it(self):
        for text in ("- a#974 b", "- a _#974 b", "- a #974x b", "- a #974_ b", "- a xGH-974 b", "- a GH-974x b"):
            with self.subTest(text=text):
                self.assertFalse(refused(text))

    def test_a_repo_reference_without_its_owner(self):
        self.assertFalse(refused("- a romm-tender#974 b"))

    def test_issue_zero(self):
        self.assertFalse(refused("- a #0 and GH-0 b"))

    def test_a_reference_style_link_with_its_definition(self):
        self.assertFalse(refused(f"- a [#974] b\n- c\n\n[#974]: {URL}"))

    def test_a_link_and_link_text(self):
        for text in (
            f"- a [#974]({URL}) b",
            "- a [#974][r] b\n\n[r]: https://example.com",
            "- [see #974](https://example.com) b",
            f"- [the issue]({URL})",
        ):
            with self.subTest(text=text):
                self.assertFalse(refused(text))

    def test_a_url_that_is_no_issue_url(self):
        for text in (
            "- see https://example.com/#974 b",
            "- a http://github.com/danielcopper/romm-tender/issues/974 b",
            "- a www.github.com/danielcopper/romm-tender/issues/974 b",
            "- a https://github.com/danielcopper/romm-tender/pull/2563/files b",
            "- a https://github.com/danielcopper/romm-tender/commit/12d543d2 b",
        ):
            with self.subTest(text=text):
                self.assertFalse(refused(text))

    def test_code(self):
        for text in (
            "- a `#974` b",
            "- a ``x #974 y`` b",
            "- a <code>#974</code> b",
            "- item\n\n  ```\n  #974\n  ```",
            "~~~\n- a #974\n~~~",
            "```text\n- a #974\n```",
        ):
            with self.subTest(text=text):
                self.assertFalse(refused(text))

    def test_lines_outside_a_list(self):
        for text in (
            "A sentence about #974.\n\nCloses #2556",
            "## Decisions (#974)\n\ntext",
            "- item\n\nafter the list #974",
            "- item\n## heading #974",
            f"[#974]: {URL}",
        ):
            with self.subTest(text=text):
                self.assertFalse(refused(text))


class WhereTheTextIsRead(unittest.TestCase):
    """The hook as the harness runs it, over the commands that publish."""

    def test_a_body_file_is_refused(self):
        directory = temp_dir(self)
        _ = (Path(directory) / "body.md").write_text(f"## Decisions\n\n{DECISION}\n")
        result = run_hook("gh pr create --title x --body-file body.md", directory)
        self.assertEqual(result.returncode, 2)
        self.assertIn(DECISION, result.stderr)

    def test_a_heredoc_body_is_refused(self):
        command = f"gh pr create --title x --body \"$(cat <<'EOF'\nSummary\n\n{DECISION}\nEOF\n)\""
        self.assertEqual(run_hook(command, "/").returncode, 2)

    def test_a_continuation_line_in_a_body_is_refused(self):
        body = "- D8: read the stamp\n  through one helper (#974)\n"
        result = run_hook("gh issue comment 5 --body " + shlex.quote(body), "/")
        self.assertEqual(result.returncode, 2)
        self.assertIn("through one helper (#974)", result.stderr)

    def test_a_body_option_on_one_line_is_refused(self):
        for command in (
            "gh pr comment 5 --body " + shlex.quote(DECISION),
            "gh pr review 5 --comment -b " + shlex.quote(DECISION),
            "gh issue create --title x -b " + shlex.quote(DECISION),
            "gh pr close 5 -c " + shlex.quote(DECISION),
            "gh issue reopen 5 --comment " + shlex.quote(DECISION),
            "gh release create v1 --notes " + shlex.quote(DECISION),
            "gh release edit v1 -n " + shlex.quote(DECISION),
        ):
            with self.subTest(command=command[:24]):
                self.assertEqual(run_hook(command, "/").returncode, 2)

    def test_a_file_cat_prints_is_refused(self):
        directory = temp_dir(self)
        _ = (Path(directory) / "body.md").write_text(DECISION + "\n")
        self.assertEqual(run_hook('gh pr edit 5 --body "$(cat body.md)"', directory).returncode, 2)

    def test_a_gh_api_write_is_refused(self):
        directory = temp_dir(self)
        _ = (Path(directory) / "req.json").write_text(json.dumps({"body": "Intro\n\n" + DECISION}))
        for command in (
            "gh api repos/o/r/issues/5/comments -f body=" + shlex.quote(DECISION),
            "gh api repos/o/r/issues/5 -X PATCH --input req.json",
        ):
            with self.subTest(command=command[:40]):
                self.assertEqual(run_hook(command, directory).returncode, 2)

    def test_the_fixed_forms_pass(self):
        fixed = f"- D8: read the stamp through one helper ([#974])\n\n[#974]: {URL}\n"
        for command in (
            "gh pr create --title x --body " + shlex.quote(fixed),
            "gh pr create --title x --body " + shlex.quote(f"- D8: one helper ([#974]({URL}))"),
            "gh pr create --title x --body " + shlex.quote("- D8: one helper\n\nCloses #974"),
        ):
            with self.subTest(command=command[-30:]):
                self.assertEqual(run_hook(command, "/").returncode, 0)

    def test_commands_that_publish_no_rendered_markdown_pass(self):
        for command in (
            "echo " + shlex.quote(DECISION),
            "printf '%s\\n' " + shlex.quote(DECISION) + " > notes.md",
            "git commit -m " + shlex.quote("feat: x\n\n" + DECISION),
            "gh pr merge 5 --squash --body " + shlex.quote(DECISION),
            "az repos pr create --title x --description " + shlex.quote(DECISION),
            "gh pr view 5",
        ):
            with self.subTest(command=command[:24]):
                self.assertEqual(run_hook(command, "/").returncode, 0)

    def test_az_text_is_not_read(self):
        directory = temp_dir(self)
        _ = (Path(directory) / "body.md").write_text(DECISION + "\n")
        command = 'az repos pr create --title x --description "$(cat body.md)"'
        self.assertEqual(run_hook(command, directory).returncode, 0)

    def test_the_message_names_each_line_and_the_fix(self):
        body = f"{DECISION}\n- D9: and {URL}\n"
        stderr = run_hook("gh pr create --title x --body " + shlex.quote(body), "/").stderr
        self.assertIn(DECISION, stderr)
        self.assertIn(f"renders large: {URL}", stderr)
        self.assertIn("[#N]: https://github.com/<owner>/<repo>/issues/N", stderr)
        self.assertIn("outside the list", stderr)

    def test_input_of_the_wrong_shape_is_let_through_quietly(self):
        for payload in ("[]", '"text"', "3", '{"tool_input": []}', '{"tool_input": {"command": 5}}', "not json"):
            with self.subTest(payload=payload):
                result = run_hook_raw(payload)
                self.assertEqual((result.returncode, result.stderr), (0, ""))

    def test_an_error_inside_the_hook_lets_the_call_through(self):
        payload = json.dumps({"tool_input": {"command": "gh pr create --body " + shlex.quote(DECISION)}, "cwd": "/"})
        with (
            mock.patch.object(lint, "publishing_sources", side_effect=RuntimeError("boom")),
            mock.patch.object(sys, "stdin", io.StringIO(payload)),
            mock.patch.object(sys, "stderr", io.StringIO()) as stderr,
        ):
            self.assertEqual(lint.main(), 0)
        self.assertIn("boom", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
