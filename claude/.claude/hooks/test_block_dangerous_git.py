#!/usr/bin/env python3
"""Black-box tests for block_dangerous_git.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_dangerous_git.py
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_dangerous_git.py")


def run(command, cwd="/home/someone/project"):
    payload = json.dumps({"tool_input": {"command": command}, "cwd": cwd})
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

    def test_branch_D_passes_for_a_branch_that_holds_nothing_to_lose(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            origin = Path(tmp) / "origin.git"
            git = lambda *a, cwd=repo: subprocess.run(  # noqa: E731
                ["git", *a], cwd=cwd, capture_output=True, text=True, check=True
            )
            subprocess.run(["git", "init", "-q", "--bare", str(origin)], check=True)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            git("config", "user.email", "t@example.invalid")
            git("config", "user.name", "t")
            (repo / "a").write_text("a")
            git("add", "a")
            git("commit", "-q", "-m", "init")
            git("remote", "add", "origin", str(origin))
            git("push", "-q", "-u", "origin", "main")
            # merged by ancestry
            git("checkout", "-q", "-b", "merged")
            (repo / "b").write_text("b")
            git("add", "b")
            git("commit", "-q", "-m", "b")
            git("checkout", "-q", "main")
            git("merge", "-q", "--no-ff", "merged", "-m", "merge")
            # squash-merged upstream: pushed, then deleted on the remote, not pruned locally
            git("checkout", "-q", "-b", "squashed")
            (repo / "c").write_text("c")
            git("add", "c")
            git("commit", "-q", "-m", "c")
            git("push", "-q", "-u", "origin", "squashed")
            git("push", "-q", "origin", "--delete", "squashed")
            git("checkout", "-q", "main")
            # local only, unmerged
            git("checkout", "-q", "-b", "local-only")
            (repo / "d").write_text("d")
            git("add", "d")
            git("commit", "-q", "-m", "d")
            git("checkout", "-q", "main")

            self.assertEqual(run("git branch -D merged", cwd=str(repo)), (None, ""))
            self.assertEqual(run("git branch -D squashed", cwd=str(repo)), (None, ""))
            self.assertEqual(run(f"git -C {repo} branch -D merged squashed"), (None, ""))
            decision, reason = run("git branch -D local-only", cwd=str(repo))
            self.assertEqual(decision, "ask", reason)
            self.assertIn("local-only", reason)
            decision, reason = run("git branch -D merged local-only", cwd=str(repo))
            self.assertEqual(decision, "ask", reason)
            self.assertIn("local-only", reason)
            self.assertNotIn("merged", reason.split("(")[-1])

    def test_unparseable_input_passes(self):
        proc = subprocess.run(
            [sys.executable, str(HOOK)], input="not json", capture_output=True, text=True
        )
        self.assertEqual((proc.returncode, proc.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
