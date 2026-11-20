#!/usr/bin/env python3
"""Black-box tests for block_pr_merge.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_pr_merge.py
"""

import json
import subprocess
import sys
import time
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_pr_merge.py")


def decide(command: str) -> dict[str, str] | None:
    payload = json.dumps({"tool_input": {"command": command}, "cwd": "/home/someone/project"})
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None
    out = json.loads(proc.stdout)["hookSpecificOutput"]
    assert out["hookEventName"] == "PreToolUse"
    return out


def run(command: str) -> str | None:
    out = decide(command)
    return None if out is None else out["permissionDecision"]


PASSES = [
    # the read-only gh forms, a whole command each
    "gh pr view 12",
    "gh pr checks 12 --watch",
    "gh pr list --state merged",
    "gh pr view 3 --json mergeable,mergedAt",
    "gh pr diff 3",
    "gh pr status",
    "gh pr list --author @me --state merged",
    "gh issue list --search merge",
    "gh issue view 4",
    "gh search prs --merged",
    "gh run list --branch merge-fix",
    "gh -R o/r pr list --state merged",
    "gh --repo=o/r pr view 3",
    "env GH_HOST=example.com timeout 30 gh pr list --state merged",
    "env GH_HOST=x timeout 30 gh pr list",
    # opening and editing a PR, quoted values allowed
    "gh pr create --title x --body-file body.md",
    'gh pr create --title "fix(hooks): merge the two lists" --body-file body.md',
    "gh -R o/r pr create --title 'feat: x' --body-file b.md --base main",
    "gh pr edit 12 --body-file body.md",
    # gh subcommands whose request body cannot merge, reading it from a file
    'gh issue create --title "fix(dev): say which password a target\'s setup asks for" --body-file /var/tmp/x/issue.md',
    "gh issue comment 12 --body-file c.md",
    "gh pr comment 12 --body-file c.md",
    "gh release create v1 --notes-file n.md",
    # api, rest and the like as plain words, not in the subcommand position
    'gh issue create --title "fix the api client" --body-file b.md',
    "gh issue comment 3 --body-file /tmp/api/c.md",
    "gh -R o/r issue comment 3 --body-file c.md",
    'az boards work-item create --title "rest client" --description @d.md',
    # commands that mention a merge without gh, az, curl or wget
    "git log --merges --oneline",
    "git merge --ff-only origin/main",
    "git merge origin/gh-pages",
    "echo 'merge done'",
    "git commit -m 'fix: merge the two lists'",
    # gh, az, curl or wget with nothing the filter reads as a merge
    "gh alias list",
    "gh api repos/o/r/pulls/12",
    "gh api graphql -f query='query { viewer { login } }'",
    "gh api https://api.github.com/graphql -f query='query { viewer { login } }'",
    "gh api repos/{owner}/{repo}/pulls/12/comments --jq '.[].body'",
    "gh api graphql -f query='query($n: Int!) { viewer { login } }' -F n=1",
    # read-only curl, and other pipeline stages that are not its words
    "curl -sI https://github.com/cli/cli | grep -i '^location'",
    "git show HEAD:x.py | grep -i -E 'gh|curl'",
    'curl -s "https://sonarcloud.io/api/issues/search?componentKeys=x_y&pullRequest=12&resolved=false"',
    "curl -s 'https://sonarcloud.io/api/issues/search?componentKeys=x_y&pullRequest=12&resolved=false'",
    "curl -s 'https://api.github.com/repos/o/r/pulls?state=open&per_page=100'",
    "curl -s -X GET https://api.github.com/repos/o/r/pulls/12",
    "az repos pr update --id 4 --title 'fix: x'",
    "az repos pr update --id 4 --status active",
    "curl -s https://api.github.com/repos/o/r/pulls/12",
    "bash -o pipefail -c 'gh pr view 3 | head'",
    "cat > notes.md <<EOF\nit's read with gh pr view 3\nEOF",
    # run-time constructs with neither a merge mention nor gh, az, curl or wget
    "echo $(date) $(whoami) `hostname`",
    "echo " + "$(true) " * 64,
    "git commit -F - <<'EOF'\nfix: don't wait for the owner's review\nEOF",
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
    # words the shell still expands
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
    # shells and their -c forms
    "bash -ec 'gh pr merge 3'",
    "bash -c -- 'gh pr merge 3'",
    "bash -c 'echo hi' 'gh pr merge 3'",
    "fish -c 'gh pr merge 3'",
    # the GraphQL endpoint in any spelling, a query from a file or built at run time
    "gh api https://api.github.com/graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    "gh api /graphql --input q.json",
    "gh api graphql/ -F query=@q.graphql",
    "gh api 'graphql?x=1' --input q.json",
    "gh api https://ghe.example.com/api/graphql --input q.json",
    'gh api graphql -f query="$(cat q.graphql)"',
    "gh api graphql --raw-field=query=@q.graphql",
    # nesting, substitutions, length
    "eval " * 7 + "echo hi",
    "echo " + "$(true) " * 65,
    "echo " + "x" * 100_001,
    "echo $(echo $(echo $(gh pr merge 3)))",
    # quoting that does not parse
    'gh pr "merge" 3 --body \'unclosed',
    "gh p\\r merge 3 'unclosed",
    'gh api "repos/o/r/pulls/$N/merge" \'unclosed',
    # attached forms of the file query and of auto-complete
    "gh api graphql --input=body.json",
    "az repos pr update --id 4 --auto-complete=true",
    # heredocs whose apostrophes leave the quoting open
    "bash <<'EOF'\ngh pr merge 3 # the owner's call\nEOF",
    'bash <<EOF\necho it\'s done\ngh pr "merge" 3\nEOF',
    "sh <<'EOF'\n# don't wait\ngh api graphql --input q.json\nEOF",
    # clustered and attached flags
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
    # a read-only gh form next to another command
    "curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr view 1",
    "wget --method=PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr list",
    "az repos pr update --id 4 --status completed gh pr view 1",
    "env curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge gh pr view 1",
    "gh pr view 1 gh pr merge 1",
    # flags before the subcommand
    "gh pr --body view merge 3 --squash",
    "gh pr -b view merge 3",
    "gh pr --title view merge 3 --squash",
    "gh pr --body=x merge 3",
    "gh pr --body list merge 3",
    "gh pr --body status merge 3",
    "gh pr --body checks merge 3",
    "gh pr --body diff merge 3",
    "gh alias --clobber=true set m 'pr merge'",
    "gh alias --shell=true set m 'gh pr merge $1'",
    # a redirection in the middle of a command
    "gh pr 2>/dev/null merge 3",
    "gh api repos/o/r/pulls/3/merge >/dev/null --method PUT",
    "curl -X PUT https://api.github.com/repos/o/r/pulls/3/merge 2>/dev/null",
    "az repos pr update --id 4 2>/dev/null --status completed",
    "gh alias 2>/dev/null set m 'pr merge'",
    # runners outside the shells
    "script -qc 'gh pr merge 3' /dev/null",
    "flock /tmp/lock -c 'gh pr merge 3'",
    "git -c alias.x='!gh pr merge 3' x",
    # a request body from a file, a backslash inside quotes
    'az rest --method patch --uri u --body \'{"status":"comp\\leted"}\'',
    "curl -d@m.json https://api.github.com/repos/o/r/pulls/3",
    "curl -K cfg",
    "wget --post-file=m.json https://api.github.com/repos/o/r/pulls/3",
    "gh api repos/o/r/pulls/3 --body-file=m.json",
    "az devops invoke --area git --resource pullRequests --in-file m.json",
    # a command word built at run time or renamed
    "{gh,} pr merge 3",
    "${G:-gh} pr merge 3",
    "G=gh; $G pr merge 3",
    "$'\\x67h' pr merge 3",
    "/usr/bin/g[h] pr merge 3",
    "/tmp/g pr merge 3",
    # the method given as an option
    "gh api repos/o/r/pulls/3/merge --method PUT",
    "gh api repos/o/r/pulls/3/merge --method=PUT",
    "az repos pr update --id 4 --autocomplete true",
    # accepted false refusals: the filter cannot tell a mention from a call
    "echo 'gh pr merge 12'",
    "git commit -m 'docs: the owner runs gh pr merge'",
    "grep -n 'pr merge' notes.md",
    "az repos pr list --status completed",
    'gh pr view "$N" --json title',
    'curl -sH "Authorization: Bearer $TOKEN" https://api.github.com/repos/o/r/pulls/12',
    "gh api repos/o/r/pulls/12/merged_by",
    "gh api -X GET repos/o/r/pulls/12/merge",
    # opening or editing a PR with anything beyond flags and plain quoted values
    'gh pr create --title "$(cat title.txt)" --body-file b.md',
    "gh pr create --body-file b; gh pr merge 1",
    "gh pr edit 12 --add-label x | gh pr merge 12",
    'gh pr create --title "a\\"; gh pr merge 1"',
    "gh pr create --title x; /tmp/g pr merge 1",
    'gh pr create --title "$(/tmp/g pr merge 1)"',
    "gh pr edit 12 --body-file b.md curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge",
    # a long open brace before a brace-built word
    ": {" + "a," * 40_000 + " ; gh pr {m..m}erge 3",
    # api or rest in the subcommand position, also after options and their values
    "gh --input b.json api graphql",
    "gh -R o/r api graphql -F query=@q.graphql",
    "x=1;gh api graphql --input q.json",
    "az --only-show-errors rest --method put --uri u --body @b.json",
    "az -o json devops invoke --in-file m.json",
    "gh " + "-x " * 60 + "api --input q.json",
    # a redirection or a quoted option value with spaces before the subcommand
    "gh 2>/dev/null api graphql --input q.json",
    "gh 2>&1 api graphql --input q.json",
    "gh <q.json api graphql --input -",
    "gh &>/dev/null api graphql --input q.json",
    "az 2>/dev/null rest --method patch --uri u --body @b.json",
    "az >o devops invoke --in-file m.json",
    'gh --repo "a b" api graphql --input q.json',
    "gh -R 'o/r x' api graphql --input q.json",
    'az --query "[0] | x" rest --method patch --uri u --body @b.json',
    # a quote or a redirection before a known word in the subcommand position
    "gh >issue api graphql --input q.json",
    "gh <pr api graphql --input -",
    'gh -H "X-A: issue" api graphql --input q.json',
    'az --query "[0] | group" rest --method patch --uri u --body @b.json',
    "az >account rest --body @b.json",
    # the subcommand spelled with quotes or a backslash, read after normalising
    "gh 'a'pi -X PUT repos/o/r/pulls/1/merge",
    "gh a\\pi graphql --input q.json",
    "az 're'st --method patch --body @b.json",
    # curl or wget sending a writing request, in any stage of a pipeline
    "curl -X PUT 'https://api.github.com/repos/o/r/pulls/1/merge'",
    "curl -s -d @b.json https://api.github.com/graphql",
    "cat q | curl -d @- https://api.github.com/graphql",
    "curl -s -X POST https://api.github.com/graphql",
    "curl --json @q.json https://api.github.com/graphql",
    "wget --method=PATCH https://api.github.com/repos/o/r/pulls/1",
    "echo hi | bash -c 'curl -sd @q.json https://api.github.com/graphql'",
    # a shell that reads its text again: run-time words inside its quotes
    "bash -c 'gh pr $(printf mer)ge 12'",
    "bash -c 'gh api -X PUT repos/o/r/pulls/1/$(printf %s mer ge)'",
    "bash -c 'gh api graphql -f query=\"$(cat q.json)\"'",
    "sh -c 'gh pr $(printf mer)ge 12'",
    "eval 'gh pr $(printf mer)ge 12'",
    "bash <<< 'gh pr $(printf mer)ge 12'",
    "echo 'gh pr $(printf mer)ge 12' | bash",
    "bash -c 'x=gh; $x api graphql --input q.json'",
    "bash -c 'az rest --method put --url https://x/$(cat u)'",
    # a shell that reads its text again: words joined from quotes or escaped spaces
    "bash -c 'cu''rl -d @q.json https://api.github.com/graphql'",
    "bash -c curl' -d @q.json https://api.github.com/graphql'",
    "bash -c curl\\ -d\\ @q.json\\ https://api.github.com/graphql",
    "bash <<< curl\\ -d\\ @q.json\\ https://api.github.com/graphql",
    "bash -c 'gh a''pi graphql --input q.json'",
    "bash -c gh\\ api\\ graphql\\ --input\\ q.json",
    "eval 'gh ''api graphql --input q.json'",
]

REASONS = {
    "gh pr merge 3": "mentions a PR merge",
    "gh alias set m x": "defines a gh alias",
    "az repos pr update --id 4 --status completed": "completes an Azure DevOps pull request",
    "curl -d @m.json https://example.com/x": "sends a writing request with curl or wget",
    "gh api graphql --input q.json": "reads a request from a file",
    "curl https://example.com/merge-queue": (
        "mentions a merge next to curl, wget, gh api, az rest, az devops invoke or az repos pr"
    ),
    "echo merge | $RUNNER": "builds a word at run time next to a merge mention",
    'gh api "$ENDPOINT"': "builds a word at run time next to gh, az, curl or wget",
    "echo " + "x" * 100_001: "is too long to check",
}

PATHOLOGICAL = [
    "gh pr view " + "{a," * 33_000,
    "gh pr view" + " x" * 49_400,
    "gh " + "pr " * 33_000,
    "a=" * 49_500,
    "curl " + "-" * 98_000,
    "{" + "a," * 49_000,
    "{a" + "," * 98_000,
    "{" + "a.." * 33_000,
    ": {" + "a," * 40_000 + " ; gh pr {m..m}erge 3",
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

    def test_reason_names_the_rule(self):
        for command, phrase in REASONS.items():
            with self.subTest(command=command[:60]):
                out = decide(command)
                assert out is not None, f"{command[:60]} was not denied"
                self.assertIn(phrase, out["permissionDecisionReason"])

    def test_pathological_commands_return_within_a_second(self):
        for command in PATHOLOGICAL:
            with self.subTest(command=command[:40]):
                self.assertLess(len(command), 100_000)
                started = time.monotonic()
                run(command)
                self.assertLess(time.monotonic() - started, 1.0)

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
