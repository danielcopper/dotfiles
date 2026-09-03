#!/usr/bin/env python3
"""Black-box tests for block_dangerous_git.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_dangerous_git.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_dangerous_git.py")


def run(command):
    payload = json.dumps({"tool_input": {"command": command}, "cwd": "/home/someone/project"})
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None, ""
    out = json.loads(proc.stdout)["hookSpecificOutput"]
    return out["permissionDecision"], out["permissionDecisionReason"]


PASSES = [
    "git status",
    "git push",
    "git push -u origin feat/x",
    "git push origin HEAD:refs/heads/feat/x",
    "git checkout main",
    "git checkout -b feat/x",
    "git switch -c feat/x",
    "git restore --staged src/a.cs",
    "git restore -S src/a.cs",
    "git reset",
    "git reset --soft HEAD~1",
    "git reset HEAD~1 -- src/a.cs",
    "git clean -nd",
    "git clean -fdn",
    "git stash push -m wip",
    "git stash pop",
    "git stash list",
    "git branch -d feat/x",
    "git branch -m old new",
    "git worktree add .claude/worktrees/feat/x -b feat/x",
    "git worktree remove .claude/worktrees/feat/x",
    "git worktree prune",
    'git commit -m "fix: reset --hard no longer discards"',
    'echo "git push --force"',
    "git -C ~/repo -c user.name=x push",
    "git rebase -i main",
]

ASKS = [
    ("git push --force", "force push"),
    ("git push -f origin main", "force push"),
    ("git push --force-with-lease", "force push"),
    ("git push origin +main", "force push"),
    ("git push --delete origin feat/x", "deletes remote"),
    ("git push -d origin feat/x", "deletes remote"),
    ("git push origin :feat/x", "deletes remote"),
    ("git push --mirror backup", "deletes remote"),
    ("git -C ~/repo push --force", "force push"),
    ("git -c core.pager=cat push -f", "force push"),
    ("git checkout -- .", "checkout of paths"),
    ("git checkout .", "checkout of paths"),
    ("git checkout HEAD -- src/a.cs", "checkout of paths"),
    ("git checkout main -- src/a.cs", "checkout of paths"),
    ("git restore .", "restore discards"),
    ("git restore src/a.cs", "restore discards"),
    ("git restore --staged --worktree src/a.cs", "restore discards"),
    ("git restore --source=HEAD~1 src/a.cs", "restore discards"),
    ("git reset --hard", "reset --hard"),
    ("git reset --hard origin/main", "reset --hard"),
    ("git clean -fd", "clean -f"),
    ("git clean -xdf", "clean -f"),
    ("git clean --force", "clean -f"),
    ("git stash drop", "stash drop"),
    ("git stash drop stash@{1}", "stash drop"),
    ("git stash clear", "stash clear"),
    ("git branch -D feat/x", "branch -D"),
    ("git branch --delete --force feat/x", "branch -D"),
    ("git branch -df feat/x", "branch -D"),
    ("git worktree remove --force .claude/worktrees/feat/x", "worktree remove --force"),
    ("git worktree remove -f .claude/worktrees/feat/x", "worktree remove --force"),
    ("cd repo && git push -f", "force push"),
    ("git fetch -q\ngit reset --hard origin/develop", "reset --hard"),
    ("sudo git push --force", "force push"),
    ("xargs git branch -D", "branch -D"),
]


class BlockDangerousGit(unittest.TestCase):
    def test_ordinary_git_passes(self):
        for command in PASSES:
            with self.subTest(command=command):
                self.assertEqual(run(command), (None, ""))

    def test_destructive_git_asks(self):
        for command, fragment in ASKS:
            with self.subTest(command=command):
                decision, reason = run(command)
                self.assertEqual(decision, "ask", reason)
                self.assertIn(fragment, reason)

    def test_unparseable_input_passes(self):
        proc = subprocess.run(
            [sys.executable, str(HOOK)], input="not json", capture_output=True, text=True
        )
        self.assertEqual((proc.returncode, proc.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
