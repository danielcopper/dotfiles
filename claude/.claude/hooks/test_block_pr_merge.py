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
    "az repos pr update --id 4 --status active",
    "curl -s https://api.github.com/repos/o/r/pulls/12",
    "git log --merges --oneline",
    "git merge --ff-only origin/main",
    "echo 'merge done'",
    "git commit -m 'fix: merge the two lists'",
    "grep -n 'pr merge' notes.md",
    "gh api repos/{owner}/{repo}/pulls/12/comments --jq '.[].body'",
    "gh api graphql -f query='query($n: Int!) { viewer { login } }' -F n=1",
    "bash -o pipefail -c 'gh pr view 3 | head'",
    # read-only gh forms that mention a merge
    "gh pr view 3 --json mergeable,mergedAt",
    "gh pr diff 3",
    "gh pr status",
    "gh pr list --author @me --state merged",
    "gh issue list --search merge",
    "gh issue view 4",
    "gh search prs --merged",
    "gh run list --branch merge-fix",
    "gh api -X GET repos/o/r/pulls/12/merge",
    "gh -R o/r pr list --state merged",
    "env GH_HOST=example.com timeout 30 gh pr list --state merged",
    "gh api https://api.github.com/graphql -f query='query { viewer { login } }'",
    "echo $(date) $(whoami) `hostname`",
    "echo " + "$(true) " * 64,
    "git commit -F - <<'EOF'\nfix: don't wait for the owner's review\nEOF",
    "cat > notes.md <<EOF\nit's read with gh pr view 3\nEOF",
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
    # the GraphQL endpoint in any spelling, a query built at run time
    "gh api https://api.github.com/graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    "gh api /graphql --input q.json",
    "gh api graphql/ -F query=@q.graphql",
    "gh api 'graphql?x=1' --input q.json",
    "gh api https://ghe.example.com/api/graphql --input q.json",
    'gh api graphql -f query="$(cat q.graphql)"',
    "gh api graphql --raw-field=query=@q.graphql",
    # past what the hook checks: nesting, substitutions, length
    "eval " * 7 + "echo hi",
    "echo " + "$(true) " * 65,
    "echo " + "x" * 100_001,
    "echo $(echo $(echo $(gh pr merge 3)))",
    # quoting that does not parse: quotes and backslashes dropped
    'gh pr "merge" 3 --body \'unclosed',
    "gh p\\r merge 3 'unclosed",
    'gh api "repos/o/r/pulls/$N/merge" \'unclosed',
    # the attached forms of the file query and of auto-complete
    "gh api graphql --input=body.json",
    "az repos pr update --id 4 --auto-complete=true",
    # heredocs whose apostrophes leave the quoting open
    "bash <<'EOF'\ngh pr merge 3 # the owner's call\nEOF",
    'bash <<EOF\necho it\'s done\ngh pr "merge" 3\nEOF',
    "sh <<'EOF'\n# don't wait\ngh api graphql --input q.json\nEOF",
    # clustered and attached flags, which a flag-by-flag reading got wrong
    "curl -XPUT https://api.github.com/repos/o/r/pulls/12/merge",
    "gh api -tF repos/o/r/pulls/12/merge -X PUT",
    "gh api graphql -iF query=@q.graphql",
    "gh api graphql -F=query=@q.graphql",
    'gh api graphql -f "$(cat q.graphql)"',
    'gh api graphql -f "$F"',
    "parallel 'gh pr merge {}' ::: 3",
    'parallel "gh pr view {}" ::: 3',
    "gh -R $X merge 3",
    "gh --repo {o/r,pr} merge 3",
    "curl -d @body.json https://api.github.com/repos/o/r/pulls/12",
    "curl -sT body.json https://api.github.com/repos/o/r/pulls/12",
    # the read-only exemption holds only for gh as the command word and the only such command
    "curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr view 1",
    "wget --method=PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr list",
    "az repos pr update --id 4 --status completed gh pr view 1",
    "env curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr view 1",
    "gh pr view 1 gh pr merge 1",
    # accepted false refusals: the filter cannot tell a mention from a call
    "echo 'gh pr merge 12'",
    "git commit -m 'docs: the owner runs gh pr merge'",
    "az repos pr list --status completed",
    'gh pr view "$N" --json title',
    'curl -sH "Authorization: Bearer $TOKEN" https://api.github.com/repos/o/r/pulls/12',
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
