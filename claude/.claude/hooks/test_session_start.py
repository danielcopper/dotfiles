#!/usr/bin/env python3
"""Unit tests for session_start: which context files it loads.

Run: python3 claude/.claude/hooks/test_session_start.py
"""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HOOK = Path(__file__).with_name("session_start.py")
_spec = importlib.util.spec_from_file_location("session_start", HOOK)
assert _spec and _spec.loader
hook = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hook)

GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@example.invalid"]


def git(cwd, *args):
    _ = subprocess.run([*GIT, "-C", str(cwd), *args], check=True, capture_output=True, text=True)


class OwnersGlossary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.home = base / "home"
        self.home.mkdir()
        self.repo = base / "proj"
        self.repo.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "commit", "-q", "--allow-empty", "-m", "init")
        env = {"HOME": str(self.home), "GIT_CONFIG_NOSYSTEM": "1"}
        self.env = patch.dict(os.environ, env)
        _ = self.env.start()
        self.cwd = Path.cwd()

    def tearDown(self):
        os.chdir(self.cwd)
        self.env.stop()
        self.tmp.cleanup()

    def owners_glossary(self, text):
        path = self.home / "Memory" / "proj" / "GLOSSARY.md"
        path.parent.mkdir(parents=True)
        _ = path.write_text(text)

    def context_in(self, cwd):
        os.chdir(cwd)
        return hook.get_context_files() or ""

    def test_owners_glossary_is_loaded_in_the_main_checkout(self):
        self.owners_glossary("**Slot**: one save location")
        self.assertIn("**Slot**: one save location", self.context_in(self.repo))

    def test_owners_glossary_is_loaded_from_a_linked_worktree(self):
        self.owners_glossary("**Slot**: one save location")
        worktree = Path(self.tmp.name) / "proj.worktrees" / "feat" / "x"
        git(self.repo, "worktree", "add", "-q", "-b", "feat/x", str(worktree))
        self.assertIn("**Slot**: one save location", self.context_in(worktree))

    def test_owners_glossary_is_named_by_its_path(self):
        self.owners_glossary("**Slot**: one save location")
        self.assertIn("## ~/Memory/proj/GLOSSARY.md", self.context_in(self.repo))

    def test_no_owners_glossary_loads_nothing_extra(self):
        self.assertNotIn("Memory", self.context_in(self.repo))

    def test_outside_a_repository_nothing_is_loaded(self):
        outside = Path(self.tmp.name) / "plain"
        outside.mkdir()
        self.assertEqual(self.context_in(outside), "")


if __name__ == "__main__":
    _ = unittest.main()
