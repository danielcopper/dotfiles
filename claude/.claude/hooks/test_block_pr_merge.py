#!/usr/bin/env python3
"""Black-box tests for block_pr_merge.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_pr_merge.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar, cast, override

from merge_corpus import real_merge

HOOK = Path(__file__).with_name("block_pr_merge.py")
SECRET = "SECRET_PLACEHOLDER"  # stands in for a token the real command held

# Body files the commands name as {d}/<file>; HOME is {d}/home, the hook's cwd is {d}.
MERGE_QUERY = 'mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }'
QUEUE_JSON = (
    '{"query": "mutation { enqueuePullRequest(input: {pullRequestId: \\"PR_x\\"})'
    ' { clientMutationId } }"}'
)
BODIES = {
    "merge.graphql": MERGE_QUERY,
    "auto.graphql": (
        "mutation($id: ID!) { enablePullRequestAutoMerge(input: {pullRequestId: $id})"
        " { clientMutationId } }"
    ),
    "queue.json": QUEUE_JSON,
    "read.graphql": "query { viewer { login } }",
    "done.json": '{"status": "completed", "lastMergeSourceCommit": {"commitId": "abc"}}',
    "done3.json": '{"status": 3}',
    "autocomplete.json": '{"autoCompleteSetBy": {"id": "me"}}',
    "comment.json": '{"body": "merge after CI"}',
    "title.json": '{"title": "fix: merge the two lists"}',
    "home/q.graphql": MERGE_QUERY,
    "rel/q.graphql": MERGE_QUERY,
    "aliases.yml": "mm: pr merge --squash\n",
    "other-aliases.yml": "co: pr checkout\n",
    # files that name the merge forms, read without feeding a request
    "hook_source.py": f'QUERY = """{MERGE_QUERY}"""\nBODY = {{"status": "completed"}}\n',
    "settings.json": '{"deny": ["Bash(*mergePullRequest*)"]}',
    "repo-config.md": 'A body holding `"status": "completed"` completes the pull request.\n',
}

AZ_PR = "https://dev.azure.com/o/p/_apis/git/repositories/r/pullrequests/5?api-version=7.1"
AZ_THREAD = (
    "https://dev.azure.com/o/p/_apis/git/repositories/r/pullRequests/5/threads/7?api-version=7.1"
)
INVOKE_PR = "az devops invoke --area git --resource pullRequests --route-parameters pullRequestId=5"

# Every explicit merge form, by the text its refusal names.
DENIED = {
    "gh pr merge": [
        "gh pr merge 12",
        "gh pr merge 12 --squash --delete-branch",
        "gh -R o/r pr merge 5",
        "gh pr -R o/r merge 5 --squash",
        "gh --repo=o/r pr merge 5",
        "/usr/bin/gh pr merge 5",
        "env GH_TOKEN=x timeout 30 gh pr merge 5 --auto",
        "gh pr checks 5 --watch && gh pr merge 5 --squash",
        "make test || gh pr merge 5",
        "gh pr view 5; gh pr merge 5",
        "gh pr view 5 & gh pr merge 5",
        "gh pr list | head\ngh pr merge 5",
        "echo $(gh pr merge 5)",
        "echo `gh pr merge 5`",
        "(cd repo && gh pr merge 5)",
        "bash -c 'gh pr merge 5'",
        'sh -c "gh pr checks 5 && gh pr merge 5 --squash"',
        "eval 'gh pr merge 5'",
        "gh pr list --json number -q '.[].number' | xargs -n1 gh pr merge",
        "gh pr list -q .[].number | xargs -I{} gh pr merge {} --squash",
        "for n in 1 2; do gh pr merge $n; done",
        "bash <<'EOF'\ngh pr checks 5\ngh pr merge 5\nEOF",
        "cat <<'EOF' | sh\ngh pr merge 5\nEOF",
        'python3 - <<\'PY\'\nimport subprocess\nsubprocess.run(["gh", "pr", "merge", "5"])\nPY',
        "gh pr \\\nmerge 5",
        "gh pr 'merge' 5",
        "gh pr $'merge' 5",
        # a script the command writes and then runs
        "cat > m.sh <<'EOF'\ngh pr merge 5\nEOF\nbash m.sh",
        "cat > m.sh <<'EOF'\ngh pr merge 5\nEOF\nchmod +x m.sh && ./m.sh",
        # a << whose delimiter line never comes opens no heredoc
        'echo "use <<EOF for heredocs"\ngh pr merge 5',
        "x=$((1<<3))\ngh pr merge 5",
        "# note: cat <<EOF\ngh pr merge 5",
    ],
    "pulls/<n>/merge": [
        "gh api -X PUT repos/o/r/pulls/5/merge",
        "gh api --method PUT repos/o/r/pulls/5/merge -f merge_method=squash",
        "gh api --method=PUT repos/o/r/pulls/5/merge",
        "gh api -XPUT 'repos/{owner}/{repo}/pulls/'$PR'/merge'",
        "gh api repos/o/r/pulls/5/merge -f merge_method=squash",
        "gh api repos/o/r/pulls/5/merge --input {d}/comment.json",
        "gh api -X POST repos/o/r/merges -f base=main -f head=feature",
        "gh api -X PUT repos/o/r/pulls/5/%6Derge",
        'EP=$(cat {d}/ep); gh api -X PUT "$EP" -f merge_method=squash',
        'curl -X PUT -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/o/r/pulls/5/merge',
        'curl -s -d \'{"merge_method":"squash"}\' https://api.github.com/repos/o/r/pulls/5/merge',
        "wget -q --method=PUT https://api.github.com/repos/o/r/pulls/5/merge",
        "curl --request POST https://api.github.com/repos/o/r/merges -d @{d}/comment.json",
        'bash -c "gh api -X PUT repos/o/r/pulls/5/merge"',
    ],
    "GraphQL": [
        f"gh api graphql -f query='{MERGE_QUERY}'",
        (
            "gh api graphql -f query='mutation($id: ID!) { enablePullRequestAutoMerge(input:"
            " {pullRequestId: $id}) { clientMutationId } }' -f id=PR_x"
        ),
        (
            'gh api graphql -f query=\'mutation { enqueuePullRequest(input: {pullRequestId: "PR_x"})'
            " { clientMutationId } }'"
        ),
        "gh api graphql -F query=@{d}/merge.graphql",
        'gh api graphql -f query="$(cat {d}/merge.graphql)" -f id=PR_x',
        'gh api graphql -f query="$(< {d}/auto.graphql)" -F prId="$PR_ID"',
        'Q=$(cat {d}/merge.graphql); gh api graphql -f query="$Q" -f id=PR_x',
        "gh api --input {d}/queue.json graphql",
        "gh api --input={d}/queue.json graphql",
        "gh api -iF query=@{d}/merge.graphql graphql",
        "cat {d}/merge.graphql | gh api graphql -F query=@-",
        "jq -n --rawfile q {d}/merge.graphql '{query:$q}' | gh api graphql --input -",
        (
            'curl -s -H "Authorization: bearer $TOKEN" -X POST -d @{d}/queue.json'
            " https://api.github.com/graphql"
        ),
        'curl -s -X POST -d "$(cat {d}/queue.json)" https://api.github.com/graphql',
        "gh api graphql -F query=@~/q.graphql",
        "gh api graphql -F query=@$HOME/q.graphql",
        "gh api graphql -F query=@rel/q.graphql",
        # a relative body path after a literal cd
        "cd rel && gh api graphql -F query=@q.graphql",
        "cd {d}/rel; gh api graphql --input q.graphql",
        # a body the request reads from stdin: a heredoc, a here-string, a redirect
        f"gh api graphql --input - <<'EOF'\n{QUEUE_JSON}\nEOF",
        f"gh api graphql -F query=@- <<EOF\n{MERGE_QUERY}\nEOF",
        f"cat <<'EOF' | gh api graphql -F query=@-\n{MERGE_QUERY}\nEOF",
        f"curl -s -X POST -d @- https://api.github.com/graphql <<'EOF'\n{MERGE_QUERY}\nEOF",
        f"gh api graphql -F query=@- <<< '{MERGE_QUERY}'",
        "gh api graphql --input - < {d}/queue.json",
        # a body file the command writes from a heredoc first
        f"tee q2.graphql <<'EOF' >/dev/null\n{MERGE_QUERY}\nEOF\ngh api graphql -F query=@q2.graphql",
        f"cat > q.json <<'EOF'\n{QUEUE_JSON}\nEOF\ngh api graphql --input q.json",
    ],
    "a gh alias that merges": [
        "gh alias set mm 'pr merge --squash'",
        "gh alias set mm 'pr -R o/r merge'",
        "gh alias set --clobber am 'api graphql -f query=mutation{enablePullRequestAutoMerge}'",
        "gh alias import {d}/aliases.yml",
        "gh alias import - <<'EOF'\nmm: pr merge --squash\nEOF",
    ],
    "az repos pr update --status completed": [
        "az repos pr update --id 5 --status completed",
        "az repos pr update --id 5 --status=completed",
        "az repos pr update --id 5 --stat Completed",
        "S=completed; az repos pr update --id 5 --status $S",
        "git push && az repos pr update --id 5 --status completed --squash",
    ],
    "--auto-complete": [
        "az repos pr update --id 5 --auto-complete true",
        "az repos pr update --id 5 --auto-complete",
        "az repos pr update --id 5 --auto-comp true",
        "az repos pr create --title 'fix: x' --source-branch f --auto-complete true",
        "az repos pr create --source-branch f --auto-comp",
    ],
    "Azure DevOps pull request completion": [
        f"az rest --method patch --uri '{AZ_PR}' --body '{{\"status\": \"completed\"}}'",
        f"az rest --method patch --uri '{AZ_PR}' --body '{{\"status\": 3, \"x\": {{}}}}'",
        f"az rest --method patch --uri '{AZ_PR}' --body '{{\"autoCompleteSetBy\": {{\"id\": 1}}}}'",
        f"az rest --method patch --uri '{AZ_PR}' --body @{{d}}/done.json",
        f"az rest --method patch --uri '{AZ_PR}' --body \"$(cat {{d}}/done.json)\"",
        'BODY=$(cat {d}/done.json); az rest --method patch --uri "$PRURL" --body "$BODY"',
        'az rest --method patch --uri "$PRURL" --body \'{"status":"completed"}\'',
        f"{INVOKE_PR} project=p repositoryId=r --http-method PATCH --in-file {{d}}/done.json",
        f"{INVOKE_PR} --http-m PATCH --in-f {{d}}/autocomplete.json",
        (
            f"curl -s -u \":$PAT\" -X PATCH -H 'Content-Type: application/json' -d @{{d}}/done3.json"
            f" '{AZ_PR}'"
        ),
        (
            f"curl -s -u :{SECRET} -X PATCH -d @{{d}}/done.json"
            f" '{AZ_PR.replace('pullrequests', 'PullRequests')}'"
        ),
        f"curl -s -X PATCH -d@{{d}}/done.json '{AZ_PR}'",
        (
            "curl -s -u \":$PAT\" -X PATCH -H 'Referer: https://dev.azure.com/o'"
            ' -d @{d}/done.json "$PRURL"'
        ),
        (
            "wget -q --method=PATCH --body-file={d}/done.json --header='Origin: https://dev.azure.com'"
            ' "$PRURL"'
        ),
        'bash -c "curl -s -X PATCH -d \\"\\$(cat {d}/done.json)\\" \\$PRURL"',
        f"az rest --method patch --uri '{AZ_PR}' --body @- <<'EOF'\n{{\"status\": \"completed\"}}\nEOF",
        f'curl -s -X PATCH -d @- \'{AZ_PR}\' <<EOF\n{{"autoCompleteSetBy": {{"id": "me"}}}}\nEOF',
        # a literal URL in another request does not name this one's target
        (
            'curl -s https://dev.azure.com/o/_apis/connectionData --next -u ":$PAT" -X PATCH'
            ' -d @{d}/done.json "$PRURL"'
        ),
        (
            "curl -s https://dev.azure.com/o/_apis/connectionData;"
            ' bash -c "curl -s -X PATCH -d \\"\\$(cat {d}/done.json)\\" \\$PRURL"'
        ),
        (
            'curl -s -u ":$PAT" -X PATCH -d @{d}/done.json'
            ' "https://dev.azure.com/o/p/_apis/git/repositories/r/pullRequests\\5?api-version=7.1"'
        ),
        # a body file the command writes from a heredoc first
        (
            'cat > body.json <<\'EOF\'\n{"status": "completed"}\nEOF\n'
            f"az rest --method patch --uri '{AZ_PR}' --body @body.json"
        ),
        (
            "cat >> body3.json <<'EOF'\n{\"status\": 3}\nEOF\n"
            f"curl -s -X PATCH -d @body3.json '{AZ_PR}'"
        ),
        (
            'cat >body4.json <<\'EOF\'\n{"status": "completed"}\nEOF\n'
            f"curl -s -X PATCH -d @body4.json '{AZ_PR}'"
        ),
        (
            'cat <<\'EOF\' > {d}/w.json\n{"autoCompleteSetBy": {"id": "me"}}\nEOF\n'
            f"{INVOKE_PR} --http-method PATCH --in-file {{d}}/w.json"
        ),
    ],
}

PASSES = [
    # gh pr forms that read, open, edit, review or comment
    "gh pr view 12",
    "gh pr view 3 --json state,mergeable,mergedAt,autoMergeRequest,mergeStateStatus",
    "gh pr list --state merged",
    "gh pr checks 12 --watch",
    "gh pr diff 3",
    "gh pr status",
    "gh pr update-branch 2578 && sleep 5 && gh pr view 2578 --json headRefOid,mergeStateStatus",
    "gh pr create --title 'fix: merge the two lists' --body-file body.md",
    "gh pr edit 12 --title 'feat: merge queue docs'",
    "gh pr comment 5 --body 'ready to merge once CI is green'",
    "gh pr review 5 --approve",
    "gh -R o/merge-tool pr view 3",
    # GitHub REST reads and writes that cannot merge
    "gh api repos/o/r/pulls/5/merge",
    "gh api -X GET repos/o/r/pulls/5/merge",
    "curl -s https://api.github.com/repos/o/r/pulls/5/merge",
    "gh api -X POST repos/o/r/pulls/5/comments -f body='merge after CI'",
    "gh api -X POST repos/o/r/pulls/5/reviews --input {d}/comment.json",
    "gh api -X PATCH repos/o/r -f allow_merge_commit=false -f allow_squash_merge=true",
    "gh repo edit o/r --enable-squash-merge --enable-merge-commit=false --delete-branch-on-merge",
    # GraphQL reads, and body files that hold no mutation or cannot be read
    (
        'gh api graphql -f query=\'query { repository(owner: "o", name: "r")'
        " { pullRequest(number: 5) { mergeable } } }'"
    ),
    "gh api graphql -F query=@{d}/read.graphql",
    "gh api graphql -F query=@{d}/missing.graphql",
    'gh api graphql -F query=@"$S/q.graphql"',
    "gh api graphql -F query=@bad\x00path",
    # files that name a merge form, printed without feeding a request
    "cat {d}/hook_source.py | head; gh pr view 5",
    "cat {d}/settings.json | head -3; gh pr list",
    'cat {d}/repo-config.md | grep -n status; curl -s "$URL"',
    # git's own merge commands, and paths or names with merge next to a variable
    "git merge --ff-only origin/main",
    "git merge-base HEAD origin/main",
    "git merge-tree --write-tree main feature",
    "git branch --merged main | grep guard",
    (
        'M=/home/someone/Repos/x\ncd "$M"\ngit pull --ff-only -q origin main'
        ' && echo "main: $(git log --oneline -1)"'
    ),
    'gh pr view 5 --json state > "$S/merge-check.txt"; git merge --ff-only origin/main',
    'for h in pre-commit pre-merge-commit; do cp hook "$S/hooks/$h"; done',
    # completed anywhere but in an Azure pull request completion
    (
        "for i in $(seq 30); do s=$(gh run view 1 --json status -q .status);"
        ' [ "$s" = completed ] && break; sleep 10; done'
    ),
    "gh run list --status completed --limit 5",
    "az repos pr update --id 5 --status active",
    "S=active; az repos pr update --id 5 --status $S",
    "az repos pr update --id 5 --auto-complete false",
    "az repos pr update --id 5 --auto-complete=0 --title 'fix: x'",
    "az repos pr create --title 'fix: x' --source-branch f",
    "az repos pr create --title x --source-branch f --auto-complete false",
    "az repos pr show --id 5 --query status",
    f"curl -s -u \":$PAT\" -X PATCH -d '{{\"status\": 3}}' '{AZ_THREAD}'",
    (
        "az devops invoke --area git --resource pullRequestThreads --route-parameters"
        " pullRequestId=5 --http-method PATCH --in-file {d}/done3.json"
    ),
    (
        'curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -d \'{"status":"completed"}\''
        " https://api.github.com/repos/o/r/check-runs/9"
    ),
    f"az rest --method patch --uri '{AZ_PR}' --body @{{d}}/title.json",
    # a write toward Home Assistant with a variable in the body and the URL
    (
        'for a in bedroom hall; do curl -s -o /dev/null -w "$a %{http_code}\\n" -X POST'
        f' -H "Authorization: Bearer {SECRET}" -H "Content-Type: application/json"'
        ' -d "{\\"area\\":\\"$a\\"}" "$HA_URL/api/services/script/heating_resume"; done'
    ),
    # heredoc bodies that are only data, or written to a file nothing sends or runs
    "cat > notes.md <<'EOF'\nRun `gh pr merge 5` when the owner says so; `$VAR` stays.\nEOF",
    "git commit -q -F - <<'EOF'\nfix(hooks): refuse gh pr merge in chained commands\nEOF",
    (
        "git commit -m \"$(cat <<'EOF'\ndocs: az repos pr update --status completed is the"
        " owner's\nEOF\n)\""
    ),
    (
        "cat > {d}/brief.md <<'EOF' && echo written\n"
        "curl -X PUT https://api.github.com/repos/o/r/pulls/5/merge\nEOF"
    ),
    f"tee q.graphql <<'EOF'\n{MERGE_QUERY}\nEOF",
    "cat > notes.md <<'EOF' && bash lint.sh notes.md\nRun gh pr merge 5 later.\nEOF",
    # request bodies from stdin that cannot merge, and a PR body that only mentions one
    'gh api graphql --input - <<\'EOF\'\n{"query": "query { viewer { login } }"}\nEOF',
    "gh pr create --title 'fix: x' --body-file - <<'EOF'\nRun gh pr merge after review.\nEOF",
    'gh api -X POST repos/o/r/issues/5/comments --input - <<< \'{"body": "merge after CI"}\'',
    # gh aliases that do not merge
    "gh alias set co 'pr checkout'",
    "gh alias set prs 'pr list --search merged'",
    "gh alias list",
    "gh alias import {d}/other-aliases.yml",
    # mentions without a request tool
    "grep -rn mergePullRequest claude/.claude/hooks",
    "az boards work-item update --id 5 --discussion 'needs the mergePullRequest scope'",
    "echo 'status: completed'",
]

# DENIED forms the corpus detector does not flag: the merge lies in a file, a variable or an
# encoding, not in the command's text.
NOT_DETECTED = {
    "gh api -X PUT repos/o/r/pulls/5/%6Derge",
    "gh api graphql -F query=@{d}/merge.graphql",
    'gh api graphql -f query="$(cat {d}/merge.graphql)" -f id=PR_x',
    'gh api graphql -f query="$(< {d}/auto.graphql)" -F prId="$PR_ID"',
    'Q=$(cat {d}/merge.graphql); gh api graphql -f query="$Q" -f id=PR_x',
    "gh api --input {d}/queue.json graphql",
    "gh api --input={d}/queue.json graphql",
    "gh api -iF query=@{d}/merge.graphql graphql",
    "cat {d}/merge.graphql | gh api graphql -F query=@-",
    "jq -n --rawfile q {d}/merge.graphql '{query:$q}' | gh api graphql --input -",
    (
        'curl -s -H "Authorization: bearer $TOKEN" -X POST -d @{d}/queue.json'
        " https://api.github.com/graphql"
    ),
    'curl -s -X POST -d "$(cat {d}/queue.json)" https://api.github.com/graphql',
    "gh api graphql -F query=@~/q.graphql",
    "gh api graphql -F query=@$HOME/q.graphql",
    "gh api graphql -F query=@rel/q.graphql",
    "cd rel && gh api graphql -F query=@q.graphql",
    "cd {d}/rel; gh api graphql --input q.graphql",
    "gh api graphql --input - < {d}/queue.json",
    "gh alias import {d}/aliases.yml",
    "S=completed; az repos pr update --id 5 --status $S",
    f"az rest --method patch --uri '{AZ_PR}' --body @{{d}}/done.json",
    f"az rest --method patch --uri '{AZ_PR}' --body \"$(cat {{d}}/done.json)\"",
    'BODY=$(cat {d}/done.json); az rest --method patch --uri "$PRURL" --body "$BODY"',
    f"{INVOKE_PR} project=p repositoryId=r --http-method PATCH --in-file {{d}}/done.json",
    f"{INVOKE_PR} --http-m PATCH --in-f {{d}}/autocomplete.json",
    (
        f"curl -s -u \":$PAT\" -X PATCH -H 'Content-Type: application/json' -d @{{d}}/done3.json"
        f" '{AZ_PR}'"
    ),
    (
        f"curl -s -u :{SECRET} -X PATCH -d @{{d}}/done.json"
        f" '{AZ_PR.replace('pullrequests', 'PullRequests')}'"
    ),
    f"curl -s -X PATCH -d@{{d}}/done.json '{AZ_PR}'",
    (
        "curl -s -u \":$PAT\" -X PATCH -H 'Referer: https://dev.azure.com/o'"
        ' -d @{d}/done.json "$PRURL"'
    ),
    (
        "wget -q --method=PATCH --body-file={d}/done.json --header='Origin: https://dev.azure.com'"
        ' "$PRURL"'
    ),
    'bash -c "curl -s -X PATCH -d \\"\\$(cat {d}/done.json)\\" \\$PRURL"',
    (
        'curl -s https://dev.azure.com/o/_apis/connectionData --next -u ":$PAT" -X PATCH'
        ' -d @{d}/done.json "$PRURL"'
    ),
    (
        "curl -s https://dev.azure.com/o/_apis/connectionData;"
        ' bash -c "curl -s -X PATCH -d \\"\\$(cat {d}/done.json)\\" \\$PRURL"'
    ),
    (
        'curl -s -u ":$PAT" -X PATCH -d @{d}/done.json'
        ' "https://dev.azure.com/o/p/_apis/git/repositories/r/pullRequests\\5?api-version=7.1"'
    ),
    # written to a file by a cat or tee heredoc, then sent or run
    "cat > m.sh <<'EOF'\ngh pr merge 5\nEOF\nbash m.sh",
    "cat > m.sh <<'EOF'\ngh pr merge 5\nEOF\nchmod +x m.sh && ./m.sh",
    f"tee q2.graphql <<'EOF' >/dev/null\n{MERGE_QUERY}\nEOF\ngh api graphql -F query=@q2.graphql",
    f"cat > q.json <<'EOF'\n{QUEUE_JSON}\nEOF\ngh api graphql --input q.json",
    (
        'cat > body.json <<\'EOF\'\n{"status": "completed"}\nEOF\n'
        f"az rest --method patch --uri '{AZ_PR}' --body @body.json"
    ),
    (
        "cat >> body3.json <<'EOF'\n{\"status\": 3}\nEOF\n"
        f"curl -s -X PATCH -d @body3.json '{AZ_PR}'"
    ),
    (
        'cat >body4.json <<\'EOF\'\n{"status": "completed"}\nEOF\n'
        f"curl -s -X PATCH -d @body4.json '{AZ_PR}'"
    ),
    (
        'cat <<\'EOF\' > {d}/w.json\n{"autoCompleteSetBy": {"id": "me"}}\nEOF\n'
        f"{INVOKE_PR} --http-method PATCH --in-file {{d}}/w.json"
    ),
}


def payload(command: str, cwd: str) -> str:
    return json.dumps({"tool_input": {"command": command}, "cwd": cwd})


def run_hook(raw: str, home: str) -> subprocess.CompletedProcess[str]:
    """The hook run on raw hook input *raw* with HOME at *home*; it must exit 0."""
    return subprocess.run(
        [sys.executable, "-I", str(HOOK)],
        input=raw,
        capture_output=True,
        text=True,
        check=True,
        env=dict(os.environ, HOME=home),
    )


def output(stdout: str) -> dict[str, dict[str, str] | str]:
    """The JSON object the hook printed, empty when it printed nothing."""
    return cast("dict[str, dict[str, str] | str]", json.loads(stdout)) if stdout.strip() else {}


def decision(stdout: str) -> dict[str, str] | None:
    out = output(stdout).get("hookSpecificOutput")
    if not isinstance(out, dict):
        return None
    assert out["hookEventName"] == "PreToolUse"
    return out


class BlockPrMerge(unittest.TestCase):
    tmp: ClassVar[tempfile.TemporaryDirectory[str]]
    d: ClassVar[str]

    @classmethod
    @override
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.d = cls.tmp.name
        for name, body in BODIES.items():
            path = Path(cls.d, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            _ = path.write_text(body)

    @classmethod
    @override
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def stdout(self, command: str) -> str:
        raw = payload(command.replace("{d}", self.d), self.d)
        return run_hook(raw, f"{self.d}/home").stdout

    def decide(self, command: str) -> dict[str, str] | None:
        return decision(self.stdout(command))

    def test_denied(self):
        for form, commands in DENIED.items():
            for command in commands:
                with self.subTest(command=command):
                    out = self.decide(command)
                    assert out is not None, f"not denied: {command!r}"
                    self.assertEqual(out["permissionDecision"], "deny")
                    self.assertIn(form, out["permissionDecisionReason"])

    def test_passes(self):
        for command in PASSES:
            with self.subTest(command=command):
                self.assertEqual(self.stdout(command), "")

    def test_the_corpus_detector_flags_the_denied_forms_it_can_read(self):
        denied = [command for commands in DENIED.values() for command in commands]
        self.assertLessEqual(NOT_DETECTED, set(denied))
        for command in denied:
            with self.subTest(command=command):
                self.assertEqual(real_merge(command), command not in NOT_DETECTED)
        for command in PASSES:
            with self.subTest(command=command):
                self.assertFalse(real_merge(command))

    def test_the_reason_reminds_and_names_the_form(self):
        out = self.decide("gh pr checks 5 && gh pr merge 5")
        assert out is not None
        self.assertEqual(
            out["permissionDecisionReason"],
            (
                "Merging or completing a pull request is the owner's decision (merge_policy). Leave"
                " the PR open, report its state and what is left, and stop. Do not look for another"
                " way to merge, complete or auto-complete it. (found: gh pr merge)"
            ),
        )

    def test_an_empty_command_passes(self):
        self.assertEqual(self.stdout(""), "")

    def test_an_error_refuses_only_with_a_merge_word_in_the_command(self):
        too_long = "echo " + "x" * 1_100_000
        for raw, denied in [
            ("not json", False),
            ('{"tool_input": {"command": 5}}', False),
            (json.dumps({"tool_input": {"command": too_long}, "cwd": "/srv/merge-work"}), False),
            ("not json, but gh pr merge 5", True),
            ('{"tool_input": "az repos pr update --status Completed"}', True),
            ('["enqueue"]', True),
            (json.dumps({"tool_input": {"command": "echo merge " + too_long}}), True),
        ]:
            with self.subTest(raw=raw[:80]):
                proc = run_hook(raw, f"{self.d}/home")
                self.assertIn("block_pr_merge:", proc.stderr)
                out = decision(proc.stdout)
                self.assertEqual(out is not None, denied)
                if out is not None:
                    reason = out["permissionDecisionReason"]
                    self.assertIn("(found: a command the hook could not check: ", reason)
                    self.assertTrue(reason.endswith("; split it or tell the owner)"), reason)
                else:
                    message = output(proc.stdout)["systemMessage"]
                    assert isinstance(message, str)
                    self.assertTrue(
                        message.startswith("block_pr_merge: could not check this command ("),
                        message,
                    )
                    self.assertTrue(message.endswith("); it was allowed"), message)


if __name__ == "__main__":
    _ = unittest.main()
