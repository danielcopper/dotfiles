#!/usr/bin/env python3
"""Unit tests for session_worktree: which Bash calls record a worktree, and what lands in the session file.

Run: python3 claude/.claude/hooks/test_session_worktree.py
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
