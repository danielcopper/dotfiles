#!/usr/bin/env python3
"""Unit tests for session_worktree: which Bash calls record a worktree, and what lands in the session file.

Run: python3 claude/.claude/hooks/test_session_worktree.py
"""

import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

_spec = importlib.util.spec_from_file_location(
    "session_worktree", Path(__file__).with_name("session_worktree.py")
)
assert _spec and _spec.loader
hook = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hook)

SESSION = "0b6f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f"
WT = "/home/someone/repo.worktrees/feat/session-chip"
READY = f"✓ worktree ready: {WT}  (branch feat/session-chip, base main)\n"
NEXT = "  next: hand subagents this absolute path — see the `worktree` skill\n"


def payload(command, stdout, session=SESSION):
    return {
        "session_id": session,
        "hook_event_name": "PostToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command, "description": "Create worktree"},
        "tool_response": {"stdout": stdout, "stderr": "", "interrupted": False, "isImage": False},
    }


class Record(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "statusline-session-wt"

    def tearDown(self):
        self.tmp.cleanup()

    def recorded(self, data):
        hook.record(data, self.dir)
        session_file = self.dir / data["session_id"]
        return session_file.read_text() if session_file.exists() else None

    def test_worktree_new_output_writes_path_and_branch(self):
        stdout = "Preparing worktree (new branch 'feat/session-chip')\n" + READY + NEXT
        self.assertEqual(self.recorded(payload("mise run worktree-new feat session-chip", stdout)), f"{WT}\nfeat/session-chip\n")

    def test_mise_dash_c_call_is_recognised(self):
        command = "mise -C /home/someone/repo run worktree-new feat session-chip main"
        self.assertEqual(self.recorded(payload(command, READY)), f"{WT}\nfeat/session-chip\n")

    def test_prefixed_task_output_is_recognised(self):
        stdout = f"[worktree-new] {READY}"
        self.assertEqual(self.recorded(payload("mise run worktree-new feat session-chip", stdout)), f"{WT}\nfeat/session-chip\n")

    def test_path_with_spaces_is_kept_whole(self):
        wt = "/home/someone/my repo.worktrees/fix/x"
        stdout = f"✓ worktree ready: {wt}  (branch fix/x, base develop)\n"
        self.assertEqual(self.recorded(payload("mise run worktree-new fix x", stdout)), f"{wt}\nfix/x\n")

    def test_other_bash_writes_nothing(self):
        for command in ("git worktree add ../wt -b feat/x", f"echo '{READY.strip()}'", "mise run setup"):
            with self.subTest(command=command):
                self.assertIsNone(self.recorded(payload(command, READY)))
        self.assertFalse(self.dir.exists())

    def test_failed_task_writes_nothing(self):
        data = payload("mise run worktree-new feat session-chip", "")
        data["tool_response"]["stderr"] = "fatal: a branch named 'feat/session-chip' already exists\n"
        self.assertIsNone(self.recorded(data))

    def test_last_worktree_of_the_session_wins(self):
        self.recorded(payload("mise run worktree-new feat session-chip", READY))
        second = "/home/someone/repo.worktrees/fix/later"
        stdout = f"✓ worktree ready: {second}  (branch fix/later, base main)\n"
        self.assertEqual(self.recorded(payload("mise run worktree-new fix later", stdout)), f"{second}\nfix/later\n")

    def test_last_ready_line_in_one_call_wins(self):
        second = "/home/someone/repo.worktrees/fix/later"
        stdout = READY + f"✓ worktree ready: {second}  (branch fix/later, base main)\n"
        command = "mise run worktree-new feat session-chip && mise run worktree-new fix later"
        self.assertEqual(self.recorded(payload(command, stdout)), f"{second}\nfix/later\n")

    def test_session_id_that_is_not_a_plain_name_writes_nothing(self):
        for session in ("", "../escape", "a/b"):
            with self.subTest(session=session):
                hook.record(payload("mise run worktree-new feat session-chip", READY, session), self.dir)
                self.assertFalse(self.dir.exists())


class Directory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.data = payload("mise run worktree-new feat session-chip", READY)

    def tearDown(self):
        self.tmp.cleanup()

    def notice(self, out):
        """The systemMessage record() prints for the user; nothing may go to stderr, which nobody sees."""
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            hook.record(self.data, out)
        self.assertEqual(stderr.getvalue(), "")
        return json.loads(stdout.getvalue())["systemMessage"]

    def test_xdg_runtime_dir_holds_the_session_files_when_set(self):
        with patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(self.root)}):
            hook.record(self.data)
        self.assertEqual((self.root / "statusline-session-wt" / SESSION).read_text(), f"{WT}\nfeat/session-chip\n")

    def test_home_cache_holds_them_without_xdg_runtime_dir(self):
        for runtime in ({}, {"XDG_RUNTIME_DIR": ""}):
            with self.subTest(runtime=runtime):
                env = {k: v for k, v in os.environ.items() if k != "XDG_RUNTIME_DIR"} | runtime | {"HOME": str(self.root)}
                with patch.dict(os.environ, env, clear=True):
                    self.assertEqual(hook.session_wt_dir(), self.root / ".cache" / "claude" / "statusline-session-wt")

    def test_directory_and_file_are_private(self):
        out = self.root / "statusline-session-wt"
        hook.record(self.data, out)
        self.assertEqual(stat.S_IMODE(os.stat(out).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(out / SESSION).st_mode), 0o600)
        self.assertEqual(os.listdir(out), [SESSION])

    def test_symlinked_directory_is_refused(self):
        target = self.root / "elsewhere"
        target.mkdir()
        for name, points_to in (("linked", target), ("dangling", self.root / "missing")):
            with self.subTest(name=name):
                out = self.root / name
                out.symlink_to(points_to)
                self.assertIn(f"refusing {out}", self.notice(out))
                self.assertEqual(os.listdir(target), [])
                self.assertFalse((self.root / "missing").exists())

    def test_directory_owned_by_someone_else_is_refused(self):
        out = self.root / "statusline-session-wt"
        out.mkdir(mode=0o700)
        with patch.object(hook.os, "getuid", return_value=os.getuid() + 1):
            self.assertIn(f"refusing {out}", self.notice(out))
        self.assertEqual(os.listdir(out), [])


if __name__ == "__main__":
    unittest.main()
