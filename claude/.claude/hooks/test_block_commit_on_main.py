#!/usr/bin/env python3
"""Unit tests for block_commit_on_main: which writes it sees, where it looks, and which repos are exempt.

Run: python3 claude/.claude/hooks/test_block_commit_on_main.py
"""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_spec = importlib.util.spec_from_file_location(
    "block_commit_on_main", Path(__file__).with_name("block_commit_on_main.py")
)
assert _spec and _spec.loader
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)

HOME = os.path.expanduser("~")


class CommitDirs(unittest.TestCase):
    def test_cd_and_dash_c_paths_resolve_like_the_shell_would(self):
        cases = {
            "cd ~/dotfiles && git commit -m x": f"{HOME}/dotfiles",
            "cd $HOME/dotfiles && git commit -m x": f"{HOME}/dotfiles",
            'cd "$HOME/dotfiles" && git commit -m x': f"{HOME}/dotfiles",
            "cd /abs/path; git commit -m x": "/abs/path",
            "cd /abs && cd sub && git commit -m x": "/abs/sub",
            "D=/abs/path; cd $D && git commit -m x": "/abs/path",
            "git -C ~/dotfiles commit -m x": f"{HOME}/dotfiles",
            "git -C /abs/path commit -m x": "/abs/path",
            "git commit -m x": "/cwd",
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [(expected, "commit")])

    def test_the_writes_that_skip_the_git_hook_are_seen(self):
        for operation in ("rebase", "cherry-pick", "revert"):
            with self.subTest(operation=operation):
                self.assertEqual(guard.commit_dirs(f"git {operation} abc123", "/cwd"), [("/cwd", operation)])

    def test_steering_a_running_operation_writes_nothing(self):
        for command in ("git rebase --continue", "git cherry-pick --abort", "git rebase --skip", "git revert --quit"):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])

    def test_reads_and_merges_are_not_writes(self):
        for command in ("git status", "git log --oneline", "git merge --ff-only origin/main", "echo commit"):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])

    def test_every_commit_in_a_block_is_listed(self):
        command = "git -C /one commit -m a; cd /two && git commit -m b"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/one", "commit"), ("/two", "commit")])


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


class AllowedRepos(unittest.TestCase):
    """The exemption list is the file the git hook reads: comments and blanks skipped, ~ expanded."""

    def test_entries_are_absolute_expanded_and_comments_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            listed = Path(tmp) / "commit-on-main-allowed"
            listed.write_text("# repos whose work lives on main\n\n~/dotfiles  # stow repo\n/abs/repo\n")
            with patch.object(guard, "ALLOWLIST", str(listed)):
                self.assertEqual(
                    guard.allowed_repos(),
                    {os.path.realpath(f"{HOME}/dotfiles"), os.path.realpath("/abs/repo")},
                )

    def test_a_missing_list_means_no_exemptions(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(guard, "ALLOWLIST", os.path.join(tmp, "absent")):
                self.assertEqual(guard.allowed_repos(), set())


if __name__ == "__main__":
    unittest.main()
