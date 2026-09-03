#!/usr/bin/env python3
"""Unit tests for block_commit_on_main.target_dir: the directory the guard checks the branch in.

Run: python3 claude/.claude/hooks/test_block_commit_on_main.py
"""

import importlib.util
import os
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


if __name__ == "__main__":
    unittest.main()
