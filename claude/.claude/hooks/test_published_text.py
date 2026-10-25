#!/usr/bin/env python3
"""Unit tests for utils/published_text: the text a gh command publishes is read
the same way for both hooks that judge it, and the two readings differ only
where `counts` and `pieces` say.

Markers are assembled from pieces so this file never carries a literal a grep
for stray attribution would flag.

Run: python3 claude/.claude/hooks/test_published_text.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_HOOKS = Path(__file__).parent
sys.path.insert(0, str(_HOOKS / "utils"))
import published_text  # noqa: E402

TRAILER = "Co-" + "authored-by: Someone <a@b.c>"
DECISION = "- D8: read the stamp through one helper (#974)"


def run(hook: str, command: str, cwd: str) -> int:
    """The exit code of `hook` as the harness runs it on `command`."""
    payload = json.dumps({"tool_input": {"command": command}, "cwd": cwd})
    return subprocess.run(
        [sys.executable, str(_HOOKS / hook)], input=payload, capture_output=True, text=True, check=False, timeout=15
    ).returncode


def temp_dir(test: unittest.TestCase) -> str:
    """A fresh directory, removed when `test` finishes."""
    path = tempfile.mkdtemp()
    test.addCleanup(shutil.rmtree, path, ignore_errors=True)
    return path


class BothHooksReadTheSameText(unittest.TestCase):
    """A heredoc, a body file and a file `cat` prints reach both hooks."""

    def commands(self, directory: str, text: str) -> dict[str, str]:
        _ = (Path(directory) / "body.md").write_text(text + "\n")
        return {
            "a heredoc": f"gh pr create --title x --body \"$(cat <<'EOF'\nSummary\n\n{text}\nEOF\n)\"",
            "a body file": "gh pr create --title x --body-file body.md",
            "a file cat prints": "cat body.md | gh issue comment 5 -F -",
        }

    def test_each_place_is_judged_by_both_hooks(self):
        directory = temp_dir(self)
        for hook, text in (
            ("block_ai_attribution.py", "Summary\n\n" + TRAILER),
            ("lint_published_markdown.py", DECISION),
        ):
            for place, command in self.commands(directory, text).items():
                with self.subTest(hook=hook, place=place):
                    self.assertEqual(run(hook, command, directory), 2)

    def test_the_pieces_are_the_texts_the_whole_reading_holds_beside_the_command(self):
        directory = temp_dir(self)
        for place, command in self.commands(directory, DECISION).items():
            with self.subTest(place=place):
                whole = published_text.publishing_sources(command, directory)
                pieces = published_text.publishing_sources(command, directory, pieces=True)
                files = {text for where, text in whole if not where.endswith("command")}
                self.assertLessEqual(files, {text for _, text in pieces})
                self.assertTrue(any(DECISION in text for _, text in pieces))


class CountsAndPieces(unittest.TestCase):
    """What the two parameters change, and that the defaults change nothing."""

    def test_by_default_the_whole_command_string_is_read(self):
        sources = published_text.publishing_sources("gh pr create --body 'x'", "/")
        self.assertEqual(sources, [("the gh pr create command", "gh pr create --body 'x'")])

    def test_pieces_read_the_text_options_instead_of_the_whole_string(self):
        sources = published_text.publishing_sources("gh pr close 5 --comment 'a\nb'", "/", pieces=True)
        self.assertEqual(sources, [("a text option of the gh pr close command", "a\nb")])

    def test_a_text_option_built_by_a_substitution_is_left_to_its_source(self):
        command = "gh pr create --body \"$(cat <<'EOF'\nbody\nEOF\n)\""
        texts = [text for _, text in published_text.publishing_sources(command, "/", pieces=True)]
        self.assertEqual(texts, ["body"])

    def test_a_command_counts_leaves_out_publishes_nothing(self):
        def not_merge(name: str) -> bool:
            return name != "gh pr merge"

        self.assertEqual(published_text.publishing_sources("gh pr merge 5 --body 'x'", "/", not_merge), [])
        sources = published_text.publishing_sources("gh pr merge 5; gh pr new --body 'x'", "/", not_merge)
        self.assertEqual(sources[0][0], "the gh pr new command")

    def test_az_has_no_text_option_pieces(self):
        self.assertEqual(published_text.publishing_sources("az repos pr create -d 'x'", "/", pieces=True), [])


if __name__ == "__main__":
    unittest.main()
