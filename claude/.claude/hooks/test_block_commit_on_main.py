#!/usr/bin/env python3
"""Unit tests for block_commit_on_main: which writes it sees, where it looks, and which repos are exempt.

Run: python3 claude/.claude/hooks/test_block_commit_on_main.py
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import warnings
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


class OnMain(unittest.TestCase):
    """The hook as the harness runs it, in a repository on main that no exemption list holds."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = os.path.join(self.tmp.name, "repo")
        subprocess.run(["git", "init", "-q", "-b", "main", self.repo], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def decision(self, command: str) -> str:
        done = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("block_commit_on_main.py"))],
            input=json.dumps({"tool_input": {"command": command}, "cwd": self.repo}),
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(done.returncode, 0, done.stderr)
        if not done.stdout:
            return "allow"
        return json.loads(done.stdout)["hookSpecificOutput"]["permissionDecision"]


class TextThatOnlyNamesAWrite(OnMain):
    """A line whose every mention of a git write is quoted text it hands echo, cat, a gh publishing verb or az repos pr."""

    def test_it_is_let_through(self):
        for command in (
            'gh issue create --title x --body "Run git rebase onto main first"',
            "gh pr comment 1 --body 'then git commit the fix; cd /elsewhere'",
            'echo "git cherry-pick is not needed"',
            "cat <<'EOF' > notes.md\nthen git commit the fix\nEOF",
            "gh pr create --title x --body \"$(cat <<'EOF'\nUse `git rebase main` first.\nEOF\n)\"",
            "gh pr create --title x --body \"$(cat <<'EOF'\nRun git rebase main first.\nEOF\n)\"",
            "az repos pr create --description 'git rebase main first'",
            'cd repo && gh pr create --title x --body "Run git rebase main first"',
        ):
            with self.subTest(command=command):
                self.assertEqual(self.decision(command), "allow")


class WritesStayRefused(OnMain):
    """Anything else is judged on its raw text."""

    def test_they_are_denied(self):
        for command in (
            "git commit -m x",
            "git rebase main",
            "git cherry-pick abc",
            "git revert HEAD",
            'bash -c "git rebase main"',
            'eval "git rebase main"',
            "bash <<'EOF'\ngit rebase main\nEOF",
            "echo 'git commit -m x' | bash",
            'echo "$(git commit -m x)"',
            "cat <<EOF\n$(git rebase main)\nEOF",
            'echo "git rebase" ; git commit -m x',
            'gh issue create --body "x" && git rebase main',
            "bash -s -- a <<EOF\ngit commit -m x\nEOF",
            'sudo -u root bash -c "git rebase main"',
            "X='eval $X'; eval $X; echo \"git commit\"",
            "echo 'git commit -m x' > run.sh; ./run.sh",
            "echo 'git rebase main' > Makefile; make",
            "git status # then git commit",
            "$(" * 3000 + "echo 'git commit -m x'" + ")" * 3000,
            "gh alias set cm '!git commit -m x' && gh cm",
            "gh alias set --shell x 'git rebase main' && gh x",
            "gh config set editor 'git rebase main'",
            "gh extension exec x 'git commit -m x'",
            "az devops invoke --route-parameters 'git rebase main'",
            r"""echo $$'\' x' y '; git commit -m x; echo ' z'""",
            r"""echo `echo "\`git commit -m x\`"`""",
            "echo `cat <<'EOF'\nx`; git commit -m x; echo `\nEOF\n`",
            r"""echo "${x:-" '"}"; git commit -m x; echo "' "}""",
            "printf -v 'a[$(git commit -m x)]' '%s' y",
            "printf '%s\\n' 'git revert it'",
        ):
            with self.subTest(command=command):
                self.assertEqual(self.decision(command), "deny")


class GapsOfTheRawReading(OnMain):
    """A write behind or inside an assignment, a subshell `cd` or a later steering flag is refused."""

    def test_assignments_before_a_write_do_not_hide_it(self):
        for command in ("FOO=1 git commit -m x", "GIT_SEQUENCE_EDITOR=true git rebase -i main"):
            with self.subTest(command=command):
                self.assertEqual(self.decision(command), "deny")

    def test_a_write_in_an_assigned_substitution_is_judged(self):
        for command in (
            'X="$(git commit -m x)"',
            'export X="$(git rebase main)"',
            'OUT="$(git rebase main 2>&1)"',
            "X=`git commit -m x`",
        ):
            with self.subTest(command=command):
                self.assertEqual(self.decision(command), "deny")

    def test_a_cd_in_a_subshell_leaves_the_directory_in_doubt(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            self.assertEqual(self.decision(f"(cd {elsewhere}); git commit -m x"), "deny")

    def test_a_steering_flag_counts_only_right_after_the_operation(self):
        for command in ("git rebase main # --continue", 'git rebase main -x "echo --skip"'):
            with self.subTest(command=command):
                self.assertEqual(self.decision(command), "deny")


class InDoubt(unittest.TestCase):
    """Where the directory may have moved, every place the line has been before the write is judged."""

    def test_a_cd_anywhere_inside_open_parentheses_raises_doubt(self):
        command = "(true; cd /feat); git commit -m x"
        self.assertEqual(sorted(guard.commit_dirs(command, "/cwd")), [("/cwd", "commit"), ("/feat", "commit")])

    def test_pushd_names_its_directory(self):
        command = "pushd /two && git commit -m x"
        self.assertEqual(sorted(guard.commit_dirs(command, "/cwd")), [("/cwd", "commit"), ("/two", "commit")])

    def test_a_subshell_cd_keeps_every_place_the_line_has_been(self):
        cases = {
            "(cd /elsewhere); git commit -m x": [("/cwd", "commit"), ("/elsewhere", "commit")],
            "cd /one && (cd /two) && git -C sub commit": [
                ("/cwd/sub", "commit"),
                ("/one/sub", "commit"),
                ("/two/sub", "commit"),
            ],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(sorted(guard.commit_dirs(command, "/cwd")), expected)


class TheHookLoads(unittest.TestCase):
    """A warning while compiling the hook is a future error that would stop it loading."""

    def test_it_compiles_without_a_warning(self):
        path = Path(__file__).with_name("block_commit_on_main.py")
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            compile(path.read_text(), str(path), "exec")


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
