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
    return hook_output(payload)


def run(command: str) -> str | None:
    out = decide(command)
    return None if out is None else out["permissionDecision"]


def parsed(stdout: str) -> dict[str, str] | None:
    if not stdout.strip():
        return None
    out = json.loads(stdout)["hookSpecificOutput"]
    assert out["hookEventName"] == "PreToolUse"
    return out


def hook_output(payload: str) -> dict[str, str] | None:
    """The hook's decision for raw hook input *payload*; it must exit 0."""
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    return parsed(proc.stdout)


# Loads the hook as a module, runs *patch* in its namespace, then its main() on the input.
PATCHED = """
import importlib.util, sys
spec = importlib.util.spec_from_file_location("hook", sys.argv[1])
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
exec(sys.argv[2], hook.__dict__)
sys.exit(hook.main())
"""


def patched_run(patch: str, command: str) -> subprocess.CompletedProcess[str]:
    """The hook run with *patch* run in its module, for *command*; it must exit 0."""
    payload = json.dumps({"tool_input": {"command": command}})
    return subprocess.run(
        [sys.executable, "-c", PATCHED, str(HOOK), patch],
        input=payload,
        capture_output=True,
        text=True,
        check=True,
    )


def patched_output(patch: str, command: str) -> dict[str, str] | None:
    """The decision of the hook with *patch* run in its module, for *command*."""
    return parsed(patched_run(patch, command).stdout)


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
    # a run-time word in a simple command that runs none of gh, az, curl or wget
    'gh pr view 12 --json state; echo "rc=$?"',
    "gh pr checks 3; test $? -eq 0 && echo $# $$",
    "test $? -eq 0 && echo ok",
    'gh pr checks 3 || printf %s "rc $?" >> log',
    "true; false; : $?\nexit $?",
    # one double-quoted parameter as a whole word after a read-only gh subcommand
    'N=12; gh pr view "$N" --json state',
    'gh pr view "$N" --json title',
    'gh issue view "$N"',
    'gh pr diff "${N}"',
    'gh run view "$ID" --log',
    'gh pr view "$N" --json state 2>&1 | head',
    'gh pr list "$X"',
    'gh pr status "$X"',
    'gh pr checks "$N"',
    'gh issue list "$X"',
    'gh run list "$X"',
    'gh run watch "$ID"',
    'gh pr view "$N" --json title | jq .title',
    # every listed command and each grammar form
    (
        'gh pr list "$X" --json number,head_ref_name 2>/dev/null | tail -1 | grep -c x | wc -l'
        " | uniq | cut -c1 | tr -d x | cat < in"
    ),
    'gh pr view\t"$N"\t--json\tstate',
    '  \t gh pr view "$N" | head -1',
    'gh pr view "$N" > out 2>> err;',
    'gh pr list "$X" --search a_b.c/d:e,f@g%h+i=j-k',
    # a run-time word in a simple command that runs none of gh, az, curl or wget and re-reads
    # nothing, or in an output-redirection target, cannot reach gh's words; a word built without
    # spelling gh stays out of sight (merge_policy)
    "gh pr view 1; env X=$? true",
    "X=1 env echo $?; gh pr view 1",
    "gh pr view 1; /usr/bin/env X=$? true",
    'echo $? #"x"; gh pr view 1',
    "gh pr view 1; echo x>log $?",
    "gh pr view 1; echo x$?y",
    "X+=1 env echo $?; gh pr view 1",
    "gh pr view 1; python3 x.py $?",
    "gh api x; echo $?",
    "/tmp/x/gh pr view 1; echo $?",
    "S=/tmp/s; gh issue view 10 -R o/r --json body -q .body > $S/issue10.md",
    "W=/tmp/w; git -C $W log --oneline -3; gh issue view 12 -R o/r",
    (
        "for i in $(seq 1 120); do s=$(gh pr view 20 --json state -q .state 2>/dev/null);"
        ' [ "$s" != OPEN ] && break; sleep 30; done'
    ),
    'gh pr checks 2856 -R o/r --watch --interval 30 > $S/ci.log 2>&1; echo "checks exit $?"',
    "mkdir -p $S/bom && cd $S/bom && curl -sfO https://dl.google.com/x.pom && grep -c x x.pom",
    # merge, completed and alias as other words than the merge vocabulary
    "grep -E 'FAILED|tests completed' $S/p1.log | head",
    "B=$(git merge-base origin/main HEAD); git diff --stat $B",
    "cat >> $F <<'EOF'\n- PR 20 merged, archived\nEOF",
    "grep -n host_key_alias $W/setup.py",
    "grep -n alias $F",
    "gh api repos/o/r --jq '{squash_merge_commit_title}'",
    "cd $D && gh api repos/github/docs/contents/content/x/configuring-branches-and-merges.md",
    # the body of a quoted heredoc fed to a command that does not read it as shell text
    "cat > $S/brief.md <<'EOF'\nshow it, then check it with curl -sI $URL\nEOF",
    "python3 - <<'EOF'\nprint(\"$HOME\", 'use gh pr view')\nEOF",
    "cat > $S/n.md <<'EOF'\nthe gh api call reads \"$EP\"\nEOF",
    "git commit -F - <<'EOF'\nfix: read $HOME and gh pr view 3\nEOF",
    "cat <<-'EOF' > /tmp/x.md\n\tsee gh api \"$EP\"\n\tEOF",
    "tee $S/a.md <<\\EOF\n`gh api $EP`\nEOF",
    'git tag -a v1 -F - <<"EOF"\nv1: gh api "$EP"\nEOF',
    "# don't wait\ncat > /tmp/n.md <<'EOF'\nsee gh api \"$EP\"\nEOF",
    "python3 - <<'EOF'\nprint(\"trap '$X' EXIT; bash -c x; gh pr view 1\")\nEOF",
    # a shell's name as an argument or part of a word, not a command word
    "grep -n bash notes.md; gh pr view 1 --jq '$x'",
    "echo sh; gh pr view 1 --jq '$x'",
    "cat bash.md; gh pr view 1 --jq '$x'",
    "which bash; gh pr view 1 --jq '$x'",
    # an @ inside a word, not at its start or after =
    "gh api 'users/x/repos?per_page=100' -q '.[] | [.name] | @tsv'",
    "gh api -X GET search/users -f q='\"agent for @\" in:bio' --jq .total_count",
    # a run-time word next to gh, az, curl or wget no longer counts: the merge must be spelled
    # to be caught (merge_policy)
    (
        'curl -s -u ":$AZURE_DEVOPS_EXT_PAT" "$B/pullRequests/88135/threads?api-version=7.1"'
        " | jq '.value[]'"
    ),
    "for w in 1 2; do az boards work-item show --id $w -o json; done",
    "gh pr view $N --json title",
    'gh pr edit 5 --body "$(cat $S/body.md)"',
    'gh pr "$VERB" 3',
    "gh pr merg* 3",
    'gh api "$ENDPOINT" -X PUT',
    "gh api repos/o/r/pulls/1/merg?",
    "gh api repos/{owner}/{repo}/{a,b}",
    "az $GROUP pr update --id 4",
    'az repos pr update --id 4 --status "$S"',
    'gh api graphql -f query="$(cat q.graphql)"',
    'gh api graphql -f "$(cat q.graphql)"',
    'gh api graphql -f "$F"',
    'curl -sH "Authorization: Bearer $TOKEN" https://api.github.com/repos/o/r/pulls/12',
    'gh pr create --title "$(cat title.txt)" --body-file b.md',
    ": {" + "a," * 40_000 + " ; gh pr {m..m}erge 3",
    "bash -c 'gh pr $(printf mer)ge 12'",
    "bash -c 'gh api graphql -f query=\"$(cat q.json)\"'",
    "sh -c 'gh pr $(printf mer)ge 12'",
    "eval 'gh pr $(printf mer)ge 12'",
    "bash <<< 'gh pr $(printf mer)ge 12'",
    "echo 'gh pr $(printf mer)ge 12' | bash",
    "gh pr me$!rge 12",
    'gh pr "me${!}rge" 12',
    "curl -$?d @body https://api.github.com/graphql",
    "curl -s$?K cfg",
    "wget --$!post-file=q.json https://api.github.com/graphql",
    "sudo curl -s$?K cfg",
    'ssh host "curl -s$?K cfg"',
    "bash -c 'echo $?; gh pr view 1'",
    'gh -R {o/r,pr,"$A$B",--squash,-t} pr view',
    'gh pr "$@" 1',
    'read N < f; gh pr view "${N@P}"',
    'gh pr view "x$N"',
    'gh pr view "$N"x',
    'gh pr view "$N""$M"',
    "N=12; gh pr view $N",
    'gh -R "$R" pr view 1',
    'gh pr "$X" 12',
    'gh "$X" view 12',
    'gh search prs "$Q"',
    'gh pr view --json "$F"',
    'gh pr view "$N" > "$F"',
    'GH_PAGER=x gh pr view "$N"',
    'ssh pr view "$N" gh',
    'gh pr view "\\"" "$N"',
    "gh pr view $'\\x22' \"$N\"",
    'X=me; Y=rge; gh pr view 1 # "\ngh pr $X$Y 1 # "',
    'gh pr view\r"$X" 1',
    'read N < f; bash <<EOF\ngh pr view "$N"\nEOF',
    'N=1; gh pr view "$N" | bash',
    'diff <(gh pr view "$N") x',
    'read X Y < f; gh pr view 1 ;> o "$X" pr "$Y" 1',
    'gh pr view "x\\\\y" "$N"',
    'gh pr view "$N" # see "$X"',
    'gh -R > pr view "$N" "$M" "$K" https://github.com/o/r/pull/1',
    'gh --repo > pr view "$N" "$M" "$K" https://github.com/o/r/pull/1',
    'gh -R < pr view "$N" "$M" "$K" https://github.com/o/r/pull/1',
    'gh -R o/r pr view "$N"',
    'gh --repo=o/r pr view "$N"',
    'gh -R o/r run view "$ID" --log',
    '"gh" pr view "$N"',
    "gh pr view ''\"$N\"",
    'gh pr view "$1"',
    'gh pr view "$N" > >(bash)',
    "gh pr view 1; sudo g$!h pr me$!rge 1",
    "gh pr view 1; ./step$? go",
    'curl -s$?K cfg; echo "rc=$?"',
    'URL=https://example.com; curl -s "$URL" | head',
    'U="https://example.com/a?b=1&c=2"\nwget -qO- "$U"',
    'curl -s "$URL"',
    'curl -s "-$X" https://x',
    'URL1=https://x; false; printf -v "URL$?" -- -Kcfg; curl -s "$URL1"',
    'declare -ai a=(gh pr view "$N")',
    'typeset -ai a=(gh pr view "$N")',
    'local -ai a=(gh pr view "$N")',
    'declare -i a; a=(gh pr view "$N")',
    'diff <(\ngh pr view "$N") x',
    'gh pr view "$@"',
    'gh pr view "$*"',
    '/*/gh pr view "$N"',
    "gh pr view 1; > log bash x.sh $?",
    "gh pr view 1; gh pr list $?",
    'gh pr list $?; echo "rc=$?"',
    '/usr/bin/gh pr view "$N"',
    'gh issue diff "$N"',
    'gh >f pr view "$N"',
    'gh pr >f view "$N"',
    'gh pr view >f "$N"',
    "gh pr view $$",
    'declare -n N; read N < f; gh pr view "$N"',
    'typeset -n N; read N < f; gh pr view "$N"',
    'local -n N; read N < f; gh pr view "$N"',
    'declare -n N; read N < f; gh pr view "${N}"',
    'declare -n N; read N < f; gh run view "$N"',
    'shopt -s expand_aliases\nalias "gh=let "\nread N < f\ngh pr view "$N"',
    'function gh if true\nthen\n:\nfi\ngh pr view "$N"',
    "setsid curl -s $? x",
    'gh pr view "${!X}"',
    'gh pr view "${a[N]}"',
    'gh pr view "${N:M}"',
    'gh pr view "${N:-x}"',
    'gh pr view "${N}x"',
    'gh pr view "$N$M"',
    'gh pr view "$N" "$M"',
    '\rgh pr view "$N"',
    'gh pr view -R "$R" 1',
    'gh pr view 1 "a$?"',
    "echo curl $?",
    'gh pr view "$N"; echo sh -c x',
    "gh pr view 1; echo x | sort --compress-program=sh; exit $?",
    'gh pr view 1 && trap "$N" EXIT',
    'gh pr view 1 || trap "$N" EXIT',
    'gh pr view 1\ntrap "$N" EXIT',
    "echo az $?",
    "echo wget $?",
    'S=x; gh api "$EP" -X PUT',
    "cd /tmp && gh pr view $N --json title",
    "gh pr view `cat n`",
    "gh pr view $(cat n) --json title",
    "gh api x $(true) --method $M",
    "G=gh; $G api graphql --input q.json",
    "G=gh; timeout 9 $G api graphql --input q.json",
    "G=gh; sudo -u me $G pr view 1",
    "echo hi; $(gh) pr view 1",
    'x=$(which gh); $x api -X PUT "$U"',
    "for n in 1 2; do gh pr view $n; done",
    "GH_TOKEN=$(cat t) gh api -X GET x",
    "gh pr view 1 <(true) $SUB",
    "gh pr view 1; >/dev/null $G api -X PUT x",
    'gh api repos/o/r/pulls/3 -f merge_method=squash -X PUT "$U"',
    "gh pr view 1; find . -name x -exec bash x.sh $? \\;",
    "cat > s.sh <<'EOF'\ngh api \"$EP\"\nEOF\n. s.sh",
    "git commit -c HEAD <<'EOF'\ngh api \"$EP\" -X PUT\nEOF",
    "bash <<'EOF'\nX=gh; $X pr view 1\nEOF",
    "ssh host <<'EOF'\ngh pr $(printf mer)ge 1\nEOF",
    'cat > f <<EOF\n$(gh api "$EP" -X PUT)\nEOF',
    "git -c alias.x='!sh' x <<'EOF'\ngh api \"$EP\" -X PUT\nEOF",
    "cat <<'EOF' | sh\ngh api \"$EP\"\nEOF",
    "X=1 cat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF",
    "cat <<'EOF' > s.sh # x\ngh api \"$EP\" -X PUT\nEOF",
    "cat <<'EOF'\ngh api \"$EP\" -X PUT\nEOX",
    "python3 bash <<'EOF'\ngh api \"$EP\" -X PUT\nEOF",
    "echo 'x\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '\nEOF\n'",
    "x=$'\\''\necho 'x\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '\nEOF\n' \\'",
    (
        "echo \"$(echo \"it's\")\"\necho 'x\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '"
        "\nEOF\n' \\'"
    ),
    "$(cat <<'EOF'\ngh\nEOF\n) api \"$EP\" -X PUT",
    "`cat <<'EOF'\ngh\nEOF\n` api \"$EP\" -X PUT",
    "{\ncat <<'EOF'\ngh\nEOF\n} | read G; $G api \"$EP\" -X PUT",
    "cat <<'EOF' >'s.sh\nEOF\n'; gh api \"$EP\" -X PUT",
    "gh api graphql -f query='#>'\"$Q\"",
    'gh api graphql -f query="#>$Q"',
    'gh pr "x >$X"',
    "gh pr view 1; sudo -u me $G pr view 1",
    "gh pr view 1; nice -n 5 $G api -X PUT x",
    "gh pr view 1; timeout -k 1 5 $G api -X PUT x",
    "gh pr view 1; timeout -s KILL 5 $G api -X PUT x",
    "gh pr view 1; ionice -c 2 $G api -X PUT x",
    "gh pr view 1; env -u X $G api -X PUT x",
    "gh pr view 1; exec -a x $G api -X PUT x",
    "G=$(command -v gh); watch $G api -X PUT x",
    "G=$(command -V gh); coproc $G api -X PUT x",
    "G=$(command -v gh); ssh host $G api -X PUT x",
    "G=$(command -v gh); flock f $G api -X PUT x",
    "echo x\\\n#'\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '\nEOF\n' \\'",
    "{ echo }; cat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF\necho {\n}",
    "case x in (x) cat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF\n;; esac",
    "gh pr view 1; bash x.sh $?",
    "gh pr view 1; /bin/bash x.sh $?",
    "gh pr view 1; 2>log bash x.sh $?",
    "gh pr view 1; setsid bash x.sh $?",
    "gh pr view 1; if true; then bash x.sh $?; fi",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; bash s.sh",
    "echo 'gh pr $(printf mer)ge 1' |& bash",
    "echo 'gh pr $(printf mer)ge 1' |\nbash",
    "echo 'gh pr $(printf mer)ge 1' | (bash)",
    "echo 'gh pr $(printf mer)ge 1' | { bash; }",
    "echo 'gh pr $(printf mer)ge 1' | ! bash",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; if bash s.sh; then :; fi",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; for i in 1; do bash s.sh; done",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; X=1 bash s.sh",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; >log bash s.sh",
    "echo 'gh pr $(printf mer)ge 1' > >(bash)",
    "bash <(echo 'gh pr $(printf mer)ge 1')",
    "bash < <(echo 'gh pr $(printf mer)ge 1')",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; busybox sh s.sh",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; ash s.sh",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; coproc bash s.sh",
    "echo 'gh pr $(printf mer)ge 1' | /bin/bash",
    "echo 'gh pr $(printf mer)ge 1' | 2>&1 bash",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; 2>&1 bash s.sh",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; >&2 bash s.sh",
    "gh pr view 1; 2>&1 bash x.sh $?",
    "echo 'gh pr $(printf mer)ge 1' > s.sh; coproc x { bash s.sh; }",
    "echo 'gh pr $(printf mer)ge 1'|bash",
    "echo 'gh pr $(printf mer)ge 1' | env bash",
    "echo 'gh pr $(printf mer)ge 1' | sudo sh",
    "echo 'gh pr $(printf mer)ge 1' | sudo -u x bash",
    "echo 'gh pr $(printf mer)ge 1' | command bash",
    "echo 'gh pr $(printf mer)ge 1' | nice -n 5 sh",
    "echo 'gh pr $(printf mer)ge 1' | timeout 5 bash",
    "echo 'gh pr $(printf mer)ge 1' | exec bash",
    "echo 'gh pr $(printf mer)ge 1' | /usr/bin/env X=1 /bin/bash",
    "gh api -X PUT -f a=\\' repos/o/r/pulls/1/$(printf me)rge -f b=\\'",
    "echo x\\ #'\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '\nEOF\n' \\'",
    "echo $[1<<x ]\necho '\nx\ncat <<'EOF'\n'; gh api \"$EP\" -X PUT; echo '\nEOF\n' \\'",
    "echo 3 | xargs gh pr view",
    "parallel gh pr view ::: 1 2",
    'parallel "gh pr view {}" ::: 3',
    "gh pr view 1; echo x | xargs echo $?",
    "gh pr view 1; parallel echo $? ::: a",
    "echo 'gh pr $(printf mer)ge 1' | xargs bash",
    "cat <<'EOF' | xargs -0 sh\ngh pr view \"$N\"\nEOF",
    "seq 1 3 | xargs -I{} az boards work-item show --id {} -o json",
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
    "gh pr {merge,view} 3",
    "gh pr mer\\ge 3",
    "gh pr \\\nmerge 3",
    'gh api "repos/o/r/pulls/$N/merge" -X PUT',
    'curl -X PUT "$URL"',
    'wget "https://api.github.com/repos/o/r/pulls/$N/merge"',
    "curl --url=$URL -X PUT",
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
    "parallel 'gh pr merge {}' ::: 3",
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
    "gh api repos/o/r/pulls/12/merged_by",
    "gh api -X GET repos/o/r/pulls/12/merge",
    # opening or editing a PR with anything beyond flags and plain quoted values
    "gh pr create --body-file b; gh pr merge 1",
    "gh pr edit 12 --add-label x | gh pr merge 12",
    'gh pr create --title "a\\"; gh pr merge 1"',
    "gh pr create --title x; /tmp/g pr merge 1",
    'gh pr create --title "$(/tmp/g pr merge 1)"',
    "gh pr edit 12 --body-file b.md curl -X PUT https://api.github.com/repos/o/r/pulls/12/merge",
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
    # a shell that reads its text again: the file and write rules read inside its quotes
    "bash -c 'gh api -X PUT repos/o/r/pulls/1/$(printf %s mer ge)'",
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
    # special parameters in a simple command that names gh, az, curl or wget, or glued into a word
    "gh pr merge 12 --squash",
    # a parameter that is not one whole double-quoted word in a fixed read-only gh place
    "CMD=merge; gh pr $CMD 12",
    "set -- merge; gh pr $* 1",
    "V=merge; X=V; gh pr ${!X} 1",
    # special parameters outside the commands where they cannot build a word
    "echo merge $!",
    # syntax outside the plain language, where nothing is spared
    "echo merge $_",
    "echo merge $0",
    "echo merge $-",
    "echo merge $@",
    "echo merge $*",
    "echo merge $? #x",
    "echo merge; * $?",
    "echo merge; ?? $?",
    "echo merge; { bash x.sh $?; }",
    "echo merge; ~/x.sh $?",
    "echo merge; ! bash x.sh $?",
    "echo merge $? &",
    'echo "merge (x)" $?',
    "echo 'merge' $?",
    "echo mer\\ge $?",
    "echo merge\r $?",
    "echo merge $? & true",
    "echo merge $? >&2",
    "echo merge $? >(bash)",
    # plain commands where a parameter still counts
    "echo merge | timeout 5 echo $?",
    "echo merge | xargs echo $?",
    "echo merge | parallel echo $?",
    "echo merge | command echo $?",
    "echo merge | exec echo $?",
    "echo merge | time echo $?",
    "echo merge | sudo echo $?",
    "echo merge | ssh host echo $?",
    "echo merge | nohup echo $?",
    "echo merge | nice echo $?",
    "echo merge | X=1 source f $?",
    "echo merge | . f $?",
    'echo merge | "timeout" 5 echo $?',
    "echo merge; /usr/bin/env echo $?",
    'xgh pr view "$N" merge',
    # plain commands whose command word is not on the allowlist
    "echo merge | setsid gh pr list $?",
    "echo merge | X=1 . f $?",
    "echo merge|timeout 5 echo $?",
    "echo merge | timeout\t5 echo $?",
    "echo merge | builtin source f $?",
    "echo merge | watch echo $?",
    "echo merge; /tmp/x/echo $?",
    'echo merge; "echo" $?',
    "X+=1; echo merge $?",
    # parameters the grammar or the rules leave counted
    "echo merge $1",
    "echo merge $? 3>log",
    "echo merge $? &>log",
    "echo merge $? >|log",
    "\x0b echo merge $?",
    "echo merge $? *",
    "echo merge $? {a}",
    "echo merge $? ~",
    "echo merge $? !",
    # a command taken off the list, trap, a path or glued name as the command word, and az or wget
    # as an argument
    "echo merge $? | sort -S 1 --co=sh",
    'echo merge; trap "bash x.sh $?" EXIT',
    "echo merge; ./a=b echo $?",
    "/tmp/x/gh pr view 1; echo merge $?",
    # the merge vocabulary still covers every spelling the rules name
    "$X pr --squash merge 3",
    "$X pr -R o/r merge 3",
    "$X api -X PUT repos/o/r/pulls/3/merge",
    "$X repos pr update --id 4 --status completed",
    "$X repos pr update --id 4 --status=completed",
    "$X repos pr update --id 4 --auto-complete true",
    '$X rest --method patch --uri u --body \'{"status": "completed"}\'',
    "$X alias import aliases.yml",
    "$X alias --clobber set m x",
    "$X api graphql -f query='mutation { mergeBranch(input: {}) { clientMutationId } }'",
    "$X api -X POST repos/o/r/merge-upstream -f branch=main",
    "curl https://example.com/merge-queue",
    "$X repos pr update --id 4 -s completed",
    "$X repos pr update --id 4 --autocomplete true",
    # a merge spelled next to variables still counts
    "seq 1 3 | xargs -I{} gh pr merge {}",
    # a merge word fed through xargs or parallel counts before pr too
    "echo merge 5 | xargs gh pr",
    "printf '%s\\n' merge | xargs -I{} gh pr {} 5",
    "echo merge | xargs gh pr 5",
    "echo merge | parallel gh pr {} 5",
    "echo merge --squash 5 | xargs gh pr",
    'curl -X PUT -u ":$PAT" "$B/pullRequests/5/merge"',
    "az repos pr update --id $ID --status completed",
    "gh pr merge $N",
    "X=merge; gh pr $X 5",
    # the GraphQL merge queue
    (
        'gh api graphql -f query=\'mutation { enqueuePullRequest(input: {pullRequestId: "x"})'
        " { clientMutationId } }'"
    ),
    "gh api graphql -f query='mutation { enqueuePullRequest(input: {}) { mergeQueueEntry { id } } }'",
    (
        "curl -s -H 'Authorization: bearer x' https://api.github.com/graphql"
        ' -d \'{"query": "mutation { enqueuePullRequest(input: {}) { clientMutationId } }"}\''
    ),
    # a merge path spelled next to a parameter
    'curl -s -X PUT "https://api.github.com/repos/o/r/pulls/$N/merge"',
    # commands that run a program from their arguments or data: the whole text counts
    "gh pr view 1; find . -execdir x $? +",
    "echo merge | xargs echo '$?'",
    # a heredoc whose body a shell or an unknown command reads stays shell text
    "cat <<'EOF' | sh\ngh api \"$EP\" -X PUT\nEOF",
    "tee s.sh <<'EOF' && bash s.sh\ngh api \"$EP\" -X PUT\nEOF",
    "cat > s.sh <<'EOF'\ngh api \"$EP\" -X PUT\nEOF\n. s.sh",
    # a heredoc marker inside quotes (as the shell reads them), a group or a substitution, or
    # after a construct the heredoc reading does not follow
    "exec > >(bash)\ncat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF",
    "bash <(cat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF\n)",
    'eval "$(cat <<\'EOF\'\ngh api "$EP" -X PUT\nEOF\n)"',
    "(\ncat <<'EOF'\ngh api \"$EP\" -X PUT\nEOF\n) | sh",
    # a file reference in a gh api or az rest word
    "gh api graphql -F query=@q.graphql",
    "az rest --method patch --uri u --body @b.json",
    # a gh or az subcommand it does not know, spelled with merge
    "gh automerge 5",
    "gh pr_merge 5",
    "gh -R o/r automerge 5",
    "az automerge x",
    "gh --repo=o/r automerge 5",
    "gh extension exec automerge 5",
    "gh ext exec gh-automerge 5",
    # accepted false refusal: a word right after an option may be the subcommand
    "gh -R o/merge-tool pr view 1 | head -3",
    # curl's writing options from another command into a shell that re-reads the text
    (
        "(echo curl -s https://api.github.com/repos/o/r/pulls/1/merg%65; echo -X PUT)"
        " | paste -sd ' ' | sh"
    ),
    (
        "{ echo curl -s https://api.github.com/repos/o/r/pulls/1/merg%65; echo -X PUT; }"
        " | paste -sd ' ' | sh"
    ),
    # auto-complete set through the REST API
    'az rest --method patch --uri u --body \'{"autoCompleteSetBy": {"id": "x"}}\'',
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
    "echo " + "x" * 100_001: "is too long to check",
    "gh pr view 1; find . -execdir x $? +": "sends a writing request with curl or wget",
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
    "gh pr view " + '"$N" ' * 19_000,
    "a=b; " * 19_000 + "echo $?",
    "echo\n" + "\n" * 99_000,
    "|" * 99_000,
    "|a" * 49_000,
    "a" + " " * 99_000,
    "cat <<'A' " * 9_000,
    "cat <<'A'\n" * 9_000,
    "cat <<'A'\nA\n" * 8_000,
    "cat <<'A'\n" + "x\n" * 40_000 + "A",
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

    def test_input_it_cannot_read_is_denied(self):
        for payload in (
            "not json",
            "[1]",
            "{}",
            json.dumps({"tool_input": None}),
            json.dumps({"tool_input": {}}),
            json.dumps({"tool_input": "x"}),
            json.dumps({"tool_input": {"command": 5}}),
            json.dumps({"tool_input": {"command": ["gh", "pr", "view"]}}),
        ):
            with self.subTest(payload=payload):
                out = hook_output(payload)
                assert out is not None, f"{payload} was not denied"
                self.assertEqual(out["permissionDecision"], "deny")
                self.assertIn("could not be checked", out["permissionDecisionReason"])

    def test_an_empty_command_passes(self):
        self.assertIsNone(hook_output(json.dumps({"tool_input": {"command": ""}})))

    def test_a_check_past_the_deadline_is_denied(self):
        patch = "import time\nDEADLINE = 0.3\ndef check(command):\n    time.sleep(30)\n"
        started = time.monotonic()
        out = patched_output(patch, "gh pr view 1")
        self.assertLess(time.monotonic() - started, 10.0)
        assert out is not None, "a check past the deadline was not denied"
        self.assertEqual(out["permissionDecision"], "deny")
        self.assertIn(
            "took too long to check; split or simplify the command", out["permissionDecisionReason"]
        )

    def test_an_error_while_checking_is_denied(self):
        patch = "def check(command):\n    raise RuntimeError('lost the thread')\n"
        out = patched_output(patch, "gh pr view 1")
        assert out is not None, "an error while checking was not denied"
        self.assertEqual(out["permissionDecision"], "deny")
        reason = out["permissionDecisionReason"]
        self.assertIn("could not be checked (RuntimeError: lost the thread)", reason)
        self.assertIn("a bug in the merge hook - report it to the owner", reason)
        self.assertIn("split or simplify the command meanwhile", reason)

    def test_an_error_while_checking_is_named_on_stderr(self):
        patch = "def check(command):\n    raise RuntimeError('lost the thread')\n"
        stderr = patched_run(patch, "gh pr view 1").stderr
        self.assertIn("block_pr_merge: denying the call after an error: RuntimeError", stderr)

    def test_unbalanced_quotes_still_checked(self):
        self.assertEqual(run("gh pr merge 3 --body 'unclosed"), "deny")


if __name__ == "__main__":
    unittest.main()
