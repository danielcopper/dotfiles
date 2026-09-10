#!/usr/bin/env python3
"""Unit tests for block_commit_on_main: where the guard looks, and which repo it lands in.

Run: python3 claude/.claude/hooks/test_block_commit_on_main.py
"""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "block_commit_on_main", Path(__file__).with_name("block_commit_on_main.py")
)
assert _spec and _spec.loader
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)

HOME = os.path.expanduser("~")


class TargetDir(unittest.TestCase):
    def test_cd_and_dash_c_paths_resolve_like_the_shell_would(self):
        cases = {
            "cd ~/dotfiles && git commit -m x": f"{HOME}/dotfiles",
            "cd $HOME/dotfiles && git commit -m x": f"{HOME}/dotfiles",
            'cd "$HOME/dotfiles" && git commit -m x': f"{HOME}/dotfiles",
            "cd /abs/path; git commit -m x": "/abs/path",
            "git -C ~/dotfiles commit -m x": f"{HOME}/dotfiles",
            "git -C /abs/path commit -m x": "/abs/path",
            "git commit -m x": "/cwd",
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.target_dir(command, "/cwd"), expected)


class RepoRoot(unittest.TestCase):
    """The exemption keys on the repository, so it has to hold from a subdirectory too."""

    def test_a_subdirectory_resolves_to_the_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            nested = repo / "a" / "b"
            nested.mkdir(parents=True)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            expected = os.path.realpath(repo)
            self.assertEqual(guard.repo_root(str(repo)), expected)
            self.assertEqual(guard.repo_root(str(nested)), expected)

    def test_outside_a_repository_there_is_no_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(guard.repo_root(tmp))

    def test_the_exempt_paths_are_absolute_and_expanded(self):
        for path in guard.MAIN_IS_THE_WORKING_BRANCH:
            with self.subTest(path=path):
                self.assertTrue(path.startswith("/"), path)
                self.assertNotIn("~", path)


if __name__ == "__main__":
    unittest.main()
