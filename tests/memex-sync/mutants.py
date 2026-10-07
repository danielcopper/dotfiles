"""Break one guard at a time on a copy of memex-sync and run the scenario that
should catch it; every mutant must turn its scenario red.

usage: python3 -I mutants.py [memex-sync]
The script defaults to the repo's host-steamdeck/.local/bin/memex-sync. The
mutated copies live in a temporary directory that is removed at the end.
"""

import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.realpath(__file__))
REPO = os.path.realpath(os.path.join(HERE, "..", ".."))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "host-steamdeck/.local/bin/memex-sync")
runner = os.path.join(HERE, "scenarios.sh")
with open(src) as f:
    text = f.read()

FETCH = "fetched=true\nfetch_origin || fetched=false\n"
GUARD_COMMENT = ("# Checked after the fetch, right before the commit: an operation started\n"
                 "# while the fetch waited on the network is caught too.\n")
GUARD = ('if unfinished=$(unfinished_work); then\n'
         '  log "found $unfinished in $repo; nothing done" >&2\n'
         '  notify_once "$busy_marker" "memex-sync (Deck): git operation in progress" \\\n'
         '    "memex-sync found $unfinished in $repo and leaves it alone until that is finished or aborted."\n'
         '  exit 1\n'
         'fi\n')
COMMIT = ("git add --all\n"
          "staged=$(git diff --cached --name-only --no-renames -z | tr -cd '\\0' | wc -c)\n"
          'if [ "$staged" -gt 0 ]; then\n'
          '  git commit --quiet --message "sync(deck): $staged Dateien"\n'
          '  log "committed $staged Dateien"\n'
          "fi\n")

MUTANTS = [
    ("s1_no_changes", "commit even when nothing is staged",
     'if [ "$staged" -gt 0 ]; then', "if true; then"),
    ("s2_three_files", "stage only tracked files",
     "git add --all", "git add --update"),
    ("s3_offline", "fail the run when the fetch fails",
     '  log "offline, $(commits_ahead) commits ahead ($fetch_error)"\n  exit 0',
     '  log "offline, $(commits_ahead) commits ahead ($fetch_error)"\n  exit 1'),
    ("s4_origin_ahead", "merge instead of rebase",
     "! rebase_output=$(git rebase --quiet origin/main 2>&1)",
     "! rebase_output=$(git merge --quiet --no-edit origin/main 2>&1)"),
    ("s5_conflict", "drop the rebase --abort",
     "    git rebase --abort\n", "    :\n"),
    ("s5_conflict", "notify_once notifies every time",
     '  [ ! -e "$1" ] || return 0\n', ""),
    ("s5_conflict", "drop the Authorization header",
     "--header @<(printf 'Authorization: Bearer %s\\n' \"$token\") \\\n    ", ""),
    ("s12_second_conflict_same_day", "conflict branch without --force",
     'git push --quiet --force origin "HEAD:refs/heads/$branch"',
     'git push --quiet origin "HEAD:refs/heads/$branch"'),
    ("s6_conflict_without_ntfy", "no skip when the ntfy files are missing",
     '  [ -r "$config_dir/ntfy_url" ] && [ -r "$config_dir/ntfy_token" ] || return 0\n', ""),
    ("s7_resolved", "keep the conflict marker after a good sync",
     ' "$conflict_marker" "$refused_marker"\n', ' "$refused_marker"\n'),
    ("s8_origin_without_main", "rebase even without origin/main",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n  if ! rebase_output",
     "if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then\n  if ! rebase_output"),
    ("s9_lock_held", "no lock",
     "if ! flock --nonblock 9; then", "if false; then"),
    ("s10_not_a_work_tree", "no work-tree check",
     '!= true ]; then\n  log "$repo is not a git work tree" >&2\n  exit 1',
     '= nope ]; then\n  log "$repo is not a git work tree" >&2\n  exit 1'),
    ("s11_push_refused_by_origin", "take every failed push for a race",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n    log",
     "if true; then\n    log"),
    ("s13_push_refused_by_pre_push_hook", "take every failed push for a race",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n    log",
     "if true; then\n    log"),
    ("s13_push_refused_by_pre_push_hook", "notify_once notifies every time",
     '  [ ! -e "$1" ] || return 0\n', ""),
    ("s13_push_refused_by_pre_push_hook", "keep the refusal marker after a good sync",
     ' "$conflict_marker" "$refused_marker"\n', ' "$conflict_marker"\n'),
    ("s14_push_lost_race", "take every failed push for a refusal",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n    log",
     "if false; then\n    log"),
    ("s15_conflict_branch_push_refused", "keep the refusal marker after the conflict branch got through",
     '  rm -f "$refused_marker"\n  log "local HEAD', '  log "local HEAD'),
    ("s15_conflict_branch_push_refused", "conflict branch refusal stays unreported",
     '|\n    report_refused "$branch"', '|\n    exit 1'),
    # Work left unfinished in the clone.
    ("s16_rebase_in_progress", "no check for unfinished work",
     "if unfinished=$(unfinished_work); then", "if false; then"),
    ("s16_rebase_in_progress", "rebase-merge not checked",
     "rebase-merge:rebase ", ""),
    ("s16_rebase_in_progress", "notify_once notifies every time",
     '  [ ! -e "$1" ] || return 0\n', ""),
    ("s16_rebase_in_progress", "keep the in-progress marker after a good sync",
     'rm -f "$busy_marker" "$fetch_marker"', 'rm -f "$fetch_marker"'),
    ("s17_rebase_apply_in_progress", "rebase-apply not checked",
     "rebase-apply:rebase ", ""),
    ("s18_merge_in_progress", "MERGE_HEAD not checked",
     "MERGE_HEAD:merge ", ""),
    ("s19_cherry_pick_in_progress", "CHERRY_PICK_HEAD not checked",
     "CHERRY_PICK_HEAD:cherry-pick ", ""),
    ("s20_revert_in_progress", "REVERT_HEAD not checked",
     " REVERT_HEAD:revert", ""),
    ("s21_unmerged_files", "unmerged files not checked",
     'if [ -n "$(git ls-files --unmerged)" ]; then', "if false; then"),
    # Fetch: credentials, refusals, reasons.
    ("s22_askpass_never_called", "no empty GIT_ASKPASS",
     "export GIT_ASKPASS=\n", ""),
    ("s23_fetch_401", "no fetch is ever refused",
     "fetch_refused() {\n  grep", "fetch_refused() {\n  false && grep"),
    ("s23_fetch_401", "'could not read Username' not a refusal",
     "could not read (Username|Password)|", ""),
    ("s23_fetch_401", "notify_once notifies every time",
     '  [ ! -e "$1" ] || return 0\n', ""),
    ("s23_fetch_401", "keep the fetch marker after a good sync",
     'rm -f "$busy_marker" "$fetch_marker"', 'rm -f "$busy_marker"'),
    ("s24_fetch_bad_credentials", "'Authentication failed' not a refusal",
     "Authentication failed|", ""),
    ("s25_fetch_403", "'returned error: 403' not a refusal",
     "|returned error: (401|403|404)", ""),
    ("s26_fetch_404", "'repository not found' not a refusal",
     "|repository '.*' not found", ""),
    ("s27_fetch_ssh_denied", "ssh 'Permission denied' not a refusal",
     "|Permission denied \\(publickey", ""),
    ("s28_fetch_no_connection", "every failed fetch is a refusal",
     "fetch_refused() {\n  grep", "fetch_refused() {\n  true || grep"),
    ("s28_fetch_no_connection", "git's stderr not captured",
     "git fetch --quiet origin 2>&1 >/dev/null)", "git fetch --quiet origin 2>/dev/null)"),
    ("s29_fetch_ssh_unresolved", "only the last line of git's stderr",
     """one_line() { awk 'NF { printf "%s%s", sep, $0; sep = " / " }'; }""",
     """one_line() { tail -n 1; }"""),
    # A writer in the clone during the run.
    ("s30_writer_during_rebase", "a rebase git refused is taken for a conflict",
     "    if ! rebase_in_progress; then\n", "    if false; then\n"),
    ("s31_writer_origin_not_ahead", "no fast path: rebase even when HEAD contains origin/main",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n  if ! rebase_output",
     "if has_origin_main; then\n  if ! rebase_output"),
    ("s32_fetch_before_commit", "old order: commit, then fetch",
     FETCH + "\n" + GUARD_COMMENT + GUARD + "\n" + COMMIT,
     GUARD_COMMENT + GUARD + "\n" + COMMIT + FETCH),
    ("s33_merge_started_during_fetch", "check for unfinished work back before the fetch",
     FETCH + "\n" + GUARD_COMMENT + GUARD, GUARD + "\n" + FETCH),
    ("s25_fetch_403", "a refused fetch exits before the commit",
     "fetched=true\nfetch_origin || fetched=false\n",
     "fetched=true\nfetch_origin || fetched=false\nif [ \"$fetched\" = false ] && fetch_refused; then\n  log \"origin refused the fetch: $fetch_error\" >&2\n  notify_once \"$fetch_marker\" \"memex-sync (Deck): fetch refused\" \"Origin refused the Deck's fetch: $fetch_error.\"\n  exit 1\nfi\n"),
]

ok = True
outdir = tempfile.mkdtemp(prefix="memex-sync-mutants.")
for i, (scenario, what, old, new) in enumerate(MUTANTS):
    if text.count(old) != 1:
        print(f"MUTANT {i} ({what}): pattern found {text.count(old)}x, not applied")
        ok = False
        continue
    path = os.path.join(outdir, f"memex-sync.mutant{i}")
    with open(path, "w") as f:
        _ = f.write(text.replace(old, new))
    os.chmod(path, 0o755)
    r = subprocess.run([runner, path, scenario], capture_output=True, text=True)
    first_fail = next((l for l in r.stdout.splitlines() if l.startswith("FAIL")), "")
    verdict = "RED (caught)" if r.returncode != 0 else "GREEN (NOT caught)"
    ok &= r.returncode != 0
    print(f"{scenario} | {what} | {verdict} | {first_fail}")
for name in os.listdir(outdir):
    os.remove(os.path.join(outdir, name))
os.rmdir(outdir)
sys.exit(0 if ok else 1)
