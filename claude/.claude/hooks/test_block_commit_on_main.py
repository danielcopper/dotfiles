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


class TextIsNotACommand(unittest.TestCase):
    """Quoted text and heredoc bodies are data: a git write named there runs nowhere."""

    def test_double_quoted_text_is_not_a_write(self):
        command = 'gh issue create --title x --body "Run git rebase onto main first"'
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [])

    def test_single_quoted_text_is_not_a_write(self):
        command = "gh pr comment 1 --body 'then git commit the fix; cd /elsewhere'"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [])

    def test_an_echoed_sentence_is_not_a_write(self):
        self.assertEqual(guard.commit_dirs('echo "git cherry-pick is not needed"', "/cwd"), [])

    def test_a_heredoc_body_is_not_a_write(self):
        for opener in ("<<EOF", "<<'EOF'", '<<"EOF"', "<<-EOF"):
            with self.subTest(opener=opener):
                command = f"cat {opener} > notes.md\nthen git commit the fix\n\tgit revert it\nEOF"
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])

    def test_a_comment_is_not_a_write(self):
        self.assertEqual(guard.commit_dirs("git status  # then git commit", "/cwd"), [])

    def test_a_commit_after_a_heredoc_is_still_seen(self):
        command = "cat <<'EOF' > msg.txt\ngit rebase main\nEOF\ncd /two && git commit -F msg.txt"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/two", "commit")])

    def test_a_command_substitution_inside_double_quotes_runs(self):
        self.assertEqual(guard.commit_dirs('echo "$(git commit -m x)"', "/cwd"), [("/cwd", "commit")])

    def test_a_cd_inside_a_command_substitution_stays_there(self):
        command = "D=$(cd /elsewhere && pwd); git commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])


class StringsAShellRuns(unittest.TestCase):
    """The string `bash -c` or `eval` runs is a command line of its own."""

    def test_a_shell_c_string_is_read_as_a_command_line(self):
        cases = {
            'bash -c "git rebase main"': [("/cwd", "rebase")],
            "sh -c 'git commit -m x'": [("/cwd", "commit")],
            'zsh -c "git revert HEAD"': [("/cwd", "revert")],
            'dash -c "git cherry-pick abc"': [("/cwd", "cherry-pick")],
            'bash -lc "git rebase main"': [("/cwd", "rebase")],
            'bash -ic "git commit -m x"': [("/cwd", "commit")],
            'bash -l -c "cd /two && git commit -m x"': [("/two", "commit")],
            'sudo /usr/bin/bash -c "git commit -m x"': [("/cwd", "commit")],
            "cd /one && bash -c 'git commit -m x'": [("/one", "commit")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_eval_reads_its_arguments_as_a_command_line(self):
        cases = {
            'eval "git rebase main"': [("/cwd", "rebase")],
            "eval 'cd /two && git commit -m x'": [("/two", "commit")],
            "eval git commit -m x": [("/cwd", "commit")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_a_cd_inside_the_string_stays_there(self):
        command = 'bash -c "cd /two && make"; git commit -m x'
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_quoted_text_inside_the_string_is_still_text(self):
        for command in ("bash -c 'echo \"git commit later\"'", "eval 'echo \"git rebase main\"'"):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])


class TheRunnerIsTheCommandWord(unittest.TestCase):
    """`eval` or a shell runs a string only where it is the command, behind known prefixes."""

    def test_eval_or_a_shell_named_as_an_argument_leaves_the_write_judged(self):
        cases = {
            "git commit -m eval": [("/cwd", "commit")],
            "git rebase main bash -c x": [("/cwd", "rebase")],
            "git -C /two commit -m sh": [("/two", "commit")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_a_runner_behind_a_prefix_or_in_quotes_is_still_read(self):
        cases = {
            "sudo -u root bash -c 'git commit -m x'": [("/cwd", "commit")],
            "env -u X bash -c 'git commit -m x'": [("/cwd", "commit")],
            "command eval 'git rebase main'": [("/cwd", "rebase")],
            "nohup sh -c 'git revert HEAD'": [("/cwd", "revert")],
            "time builtin eval 'git cherry-pick abc'": [("/cwd", "cherry-pick")],
            "\"bash\" -c 'git commit -m x'": [("/cwd", "commit")],
            "'eval' 'git rebase main'": [("/cwd", "rebase")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_shell_options_around_c_are_skipped_to_the_script(self):
        for command in (
            "bash -o pipefail -c 'git commit -m x'",
            "bash -c -o pipefail 'git commit -m x'",
            "bash -c -l 'git commit -m x'",
            "bash -c -- 'git commit -m x'",
            "bash +o posix -c 'git commit -m x'",
            "bash -ec 'git commit -m x'",
        ):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_a_script_that_cannot_be_told_is_judged_a_write_here(self):
        for command in ("cd /two && bash -c", 'cd /two && bash -c "$CMD"', 'cd /two && eval "$(cat cmd)"'):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/two", guard.UNREAD)])

    def test_a_script_held_in_a_known_variable_is_read(self):
        command = "CMD='git rebase main'; bash -c \"$CMD\""
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "rebase")])

    def test_an_empty_eval_finds_nothing(self):
        for command in ("eval", 'eval ""'):
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])


class EvalRunsInTheSameShell(unittest.TestCase):
    """What `eval` runs changes this shell: its `cd` and assignments reach later commands."""

    def test_a_cd_in_eval_moves_the_commands_after_it(self):
        self.assertEqual(guard.commit_dirs("eval 'cd /two'; git commit -m x", "/cwd"), [("/two", "commit")])

    def test_an_assignment_in_eval_reaches_the_commands_after_it(self):
        command = 'eval "D=/two"; git -C $D commit -m x'
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/two", "commit")])

    def test_a_cd_in_eval_inside_a_subshell_stays_in_it(self):
        command = "(eval 'cd /two'); git commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])


class NestingLimit(unittest.TestCase):
    """Strings run inside strings are read to a fixed depth; past it the line is unreadable."""

    def test_strings_nested_past_the_limit_are_unreadable(self):
        with self.assertRaises(guard.Unreadable):
            guard.commit_dirs("eval " * (guard.MAX_DEPTH + 2) + "git commit -m x", "/cwd")

    def test_strings_nested_within_the_limit_are_read(self):
        command = "eval " * (guard.MAX_DEPTH - 1) + "git commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])


class LeadingAssignments(unittest.TestCase):
    """`NAME=value` before a command is that command's environment, not a line of its own."""

    def test_leading_assignments_do_not_hide_the_write(self):
        cases = {
            "FOO=1 git commit -m x": [("/cwd", "commit")],
            "GIT_SEQUENCE_EDITOR=true git rebase -i main": [("/cwd", "rebase")],
            "A=1 B=2 git -C /two revert HEAD": [("/two", "revert")],
            "env X=1 git commit -m x": [("/cwd", "commit")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_a_prefix_assignment_sets_no_variable_for_later_commands(self):
        command = "D=/two git status; git -C $D commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_prefix_assignments_reach_the_string_a_shell_runs(self):
        cases = {
            "D=/two bash -c 'cd $D && git commit -m x'": [("/two", "commit")],
            "env D=/two sh -c 'git -C $D commit -m x'": [("/two", "commit")],
            "D=/two bash -c 'git -C $E commit -m x'": [("/cwd", "commit")],
            "D=/two bash -c 'true'; git -C $D commit -m x": [("/cwd", "commit")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_a_line_of_assignments_sets_every_variable(self):
        command = "A=/one B=/two; git -C $B commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/two", "commit")])


class HeredocExpansion(unittest.TestCase):
    """The shell expands `$(…)` and backticks in a heredoc body unless its delimiter is quoted."""

    def test_an_unquoted_heredoc_runs_its_substitutions(self):
        cases = {
            "cat <<EOF\n$(git rebase main)\nEOF": [("/cwd", "rebase")],
            "cat <<-EOF\n\t`git commit -m x`\nEOF": [("/cwd", "commit")],
            "cd /two && cat <<EOF > f\nsee $(git revert HEAD) here\nEOF": [("/two", "revert")],
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(guard.commit_dirs(command, "/cwd"), expected)

    def test_a_quoted_heredoc_keeps_its_substitutions_as_text(self):
        for opener in ("<<'EOF'", '<<"EOF"', "<<\\EOF", '<<E"O"F'):
            with self.subTest(opener=opener):
                command = f"cat {opener}\n$(git rebase main) and `git commit -m x`\nEOF"
                self.assertEqual(guard.commit_dirs(command, "/cwd"), [])


class ReaderEdges(unittest.TestCase):
    """Shell forms where a looser reading would hide the command after them."""

    def test_an_ansi_c_string_ends_where_the_shell_ends_it(self):
        command = "echo $'it\\'s' ; git commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_a_comment_inside_backticks_ends_at_the_backtick(self):
        command = "echo `true # note` ; git commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_a_shift_in_arithmetic_is_not_a_heredoc(self):
        command = "(( n = 1 << 2 ))\ngit commit -m x"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])

    def test_double_parentheses_that_are_no_arithmetic_are_read_as_commands(self):
        command = "((git -C /a commit -m x) && true)"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/a", "commit")])


    def test_a_substitution_inside_them_is_listed_once(self):
        command = "(($(git commit -m x)) && true)"
        self.assertEqual(guard.commit_dirs(command, "/cwd"), [("/cwd", "commit")])


class FailClosed(unittest.TestCase):
    """A line that names a git write and cannot be read is refused, wherever it runs."""

    def run_hook(self, command: str, cwd: str) -> str:
        done = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("block_commit_on_main.py"))],
            input=json.dumps({"tool_input": {"command": command}, "cwd": cwd}),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(done.returncode, 0, done.stderr)
        return done.stdout

    def test_nesting_too_deep_to_read_is_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            for command in ("$(" * 3000 + "git commit -m x" + ")" * 3000, "eval " * 600 + "git commit -m x"):
                with self.subTest(command=command[:20]):
                    decision = json.loads(self.run_hook(command, tmp))["hookSpecificOutput"]
                    self.assertEqual(decision["permissionDecision"], "deny")

    def test_a_readable_line_outside_a_repository_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.run_hook("git commit -m x", tmp), "")


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
