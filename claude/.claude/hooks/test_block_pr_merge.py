#!/usr/bin/env python3
"""Black-box tests for block_pr_merge.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_pr_merge.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_pr_merge.py")


def run(command: str) -> str | None:
    payload = json.dumps({"tool_input": {"command": command}, "cwd": "/home/someone/project"})
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None
    out = json.loads(proc.stdout)["hookSpecificOutput"]
    assert out["hookEventName"] == "PreToolUse"
    return out["permissionDecision"]


PASSES = [
    "gh pr view 12",
    "gh pr checks 12 --watch",
    "gh pr list --state merged",
    "gh alias list",
    "gh api repos/o/r/pulls/12",
    "gh api repos/o/r/pulls/12/merged_by",
    "gh api graphql -f query='query { viewer { login } }'",
    "az repos pr update --id 4 --title 'fix: x'",
    "az repos pr list --status completed",
    "az repos pr update --id 4 --status active",
    "curl -s https://api.github.com/repos/o/r/pulls/12",
    "git log --merges --oneline",
    "git merge --ff-only origin/main",
    "echo 'gh pr merge 12'",
    "git commit -m 'docs: the owner runs gh pr merge'",
    "grep -n 'pr merge' notes.md",
    'gh pr view "$N" --json title',
    "gh api repos/{owner}/{repo}/pulls/12/comments --jq '.[].body'",
    "gh api graphql -f query='query($n: Int!) { viewer { login } }' -F n=1",
    'curl -sH "Authorization: Bearer $TOKEN" https://api.github.com/repos/o/r/pulls/12',
    "bash -o pipefail -c 'gh pr view 3 | head'",
]

DENIED = [
    "gh pr merge 12 --squash",
    "gh pr merge",
    "gh -R owner/repo pr merge 12",
    "gh --repo owner/repo pr merge 12",
    "GH_REPO=owner/repo gh pr merge 12",
    "/usr/bin/gh pr merge 3",
    "sudo -u someone gh pr merge 3",
    "timeout 30 gh pr merge 3",
    "cd /tmp && gh pr merge 3",
    "gh pr checks 3; gh pr merge 3",
    "gh pr checks 3\ngh pr merge 3",
    "echo $(gh pr merge 3)",
    'echo "$(gh pr merge 3)"',
    "echo `gh pr merge 3`",
    "bash -c 'gh pr merge 3'",
    'sh -lc "gh pr merge 3"',
    "eval gh pr merge 3",
    "bash <<'EOF'\ngh pr merge 3\nEOF",
    "gh alias set m 'pr merge'",
    "gh alias import aliases.yml",
    "gh api -X PUT repos/o/r/pulls/12/merge",
    "gh api /repos/{owner}/{repo}/pulls/$N/merge -X PUT",
    "gh api repos/o/r/merges -f base=main -f head=topic",
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh api graphql -F query=@merge.graphql",
    "gh api graphql --input body.json",
    "az repos pr update --id 4 --status completed",
    "az repos pr update --id 4 --status Completed",
    "az repos pr update --id 4 --status=completed",
    "az repos pr update --id 4 --auto-complete true",
    "curl -X PUT -H 'Authorization: token x' https://api.github.com/repos/o/r/pulls/12/merge",
    "wget --method=PUT https://api.github.com/repos/o/r/pulls/12/merge",
    # a word that decides the verdict and that the shell still expands
    "gh $SUB merge 3",
    'gh pr "$VERB" 3',
    "gh pr merg* 3",
    "gh pr {merge,view} 3",
    "gh pr mer\\ge 3",
    "gh pr \\\nmerge 3",
    'gh api "repos/o/r/pulls/$N/merge" -X PUT',
    'gh api "$ENDPOINT" -X PUT',
    "gh api repos/o/r/pulls/1/merg?",
    "gh api repos/{owner}/{repo}/{a,b}",
    "az $GROUP pr update --id 4",
    'az repos pr update --id 4 --status "$S"',
    'curl -X PUT "$URL"',
    'wget "https://api.github.com/repos/o/r/pulls/$N/merge"',
    "curl --url=$URL -X PUT",
    # words supplied by xargs or parallel
    "echo 3 | xargs gh pr view",
    "parallel gh pr view ::: 1 2",
    # every shell, every -c cluster, every command word after it
    "bash -ec 'gh pr merge 3'",
    "bash -c -- 'gh pr merge 3'",
    "bash -c 'echo hi' 'gh pr merge 3'",
    "fish -c 'gh pr merge 3'",
]


class MergeBlock(unittest.TestCase):
    def test_passes(self):
        for command in PASSES:
            with self.subTest(command=command):
                self.assertIsNone(run(command))

    def test_denied(self):
        for command in DENIED:
            with self.subTest(command=command):
                self.assertEqual(run(command), "deny")

    def test_garbage_input_passes(self):
        proc = subprocess.run(
            [sys.executable, str(HOOK)],
            input="not json",
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, "")

    def test_unbalanced_quotes_still_checked(self):
        self.assertEqual(run("gh pr merge 3 --body 'unclosed"), "deny")


if __name__ == "__main__":
    unittest.main()
