"""Break one guard at a time on a copy of memex-sync or memex-watch and run the
scenario that should catch it; every mutant must turn its scenario red.

usage: python3 -I mutants.py [memex-sync]
The script defaults to the repo's host-steamdeck/.local/bin/memex-sync;
memex-watch is always the repo's. The mutated copies live in a temporary
directory that is removed at the end.
"""

import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.realpath(__file__))
REPO = os.path.realpath(os.path.join(HERE, "..", ".."))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "host-steamdeck/.local/bin/memex-sync")
watch_src = os.path.join(REPO, "host-steamdeck/.local/bin/memex-watch")
runner = os.path.join(HERE, "scenarios.sh")
with open(src) as f:
    text = f.read()
with open(watch_src) as f:
    watch_text = f.read()

FETCH = "fetched=true\nfetch_origin || fetched=false\n"
GUARD_COMMENT = ("# Checked after the fetch, right before the commit: an operation started\n"
                 "# while the fetch waited on the network is caught too.\n")
GUARD = ('if unfinished=$(unfinished_work); then\n'
         '  log "found $unfinished in $repo; nothing done" >&2\n'
         '  notify_once "$busy_marker" "memex-sync (Deck): git operation in progress" \\\n'
         '    "memex-sync found $unfinished in $repo and leaves it alone until that is finished or aborted."\n'
         '  exit 1\n'
         'fi\n')
# The commit block, from "git add --all" to the end of its if, as it stands in
# the script.
COMMIT_END = '  log "committed $staged files"\nfi\n'
COMMIT = text[text.find("git add --all\n"):text.find(COMMIT_END) + len(COMMIT_END)]

MUTANTS = [
    ("s1_no_changes", "commit even when nothing is staged",
     'if [ "$staged" -gt 0 ]; then', "if true; then"),
    ("s2_three_files", "stage only tracked files",
     "git add --all", "git add --update"),
    ("s3_offline", "fail the run when the fetch fails",
     '  log "offline, $(commits_ahead) commits ahead ($fetch_error)"\n  exit 0',
     '  log "offline, $(commits_ahead) commits ahead ($fetch_error)"\n  exit 1'),
    ("s4_origin_ahead", "merge instead of rebase",
     '(cd "$rebase_tree" && git rebase --quiet origin/main 2>&1)',
     '(cd "$rebase_tree" && git merge --quiet --no-edit origin/main 2>&1)'),
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
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n  head=",
     "if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then\n  head="),
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
    ("s30_writer_during_rebase", "the move discards what was written after the commit",
     'git reset --quiet --keep "$rebased"', 'git reset --quiet --hard "$rebased"'),
    ("s31_writer_origin_not_ahead", "no fast path: rebase even when HEAD contains origin/main",
     "if has_origin_main && ! git merge-base --is-ancestor origin/main HEAD; then\n  head=",
     "if has_origin_main; then\n  head="),
    ("s32_fetch_before_commit", "old order: commit, then fetch",
     FETCH + "\n" + GUARD_COMMENT + GUARD + "\n" + COMMIT,
     GUARD_COMMENT + GUARD + "\n" + COMMIT + FETCH),
    ("s33_merge_started_during_fetch", "check for unfinished work back before the fetch",
     FETCH + "\n" + GUARD_COMMENT + GUARD, GUARD + "\n" + FETCH),
    ("s25_fetch_403", "a refused fetch exits before the commit",
     "fetched=true\nfetch_origin || fetched=false\n",
     "fetched=true\nfetch_origin || fetched=false\nif [ \"$fetched\" = false ] && fetch_refused; then\n  log \"origin refused the fetch: $fetch_error\" >&2\n  notify_once \"$fetch_marker\" \"memex-sync (Deck): fetch refused\" \"Origin refused the Deck's fetch: $fetch_error.\"\n  exit 1\nfi\n"),
    # Commit messages.
    ("s34_message_one_file", "an added file is taken for an update",
     '      A) lines+=("create $path") ;;\n', ""),
    ("s34_message_one_file", "one file gets the several-files subject",
     'if [ "${#lines[@]}" -eq 1 ]; then', "if false; then"),
    ("s35_message_common_dir", "the first file's directory taken for the common one",
     'while [ -n "$common" ] && [ "$dir"', 'while false && [ -n "$common" ] && [ "$dir"'),
    ("s36_message_no_common_dir", "a shared start of names taken for a directory",
     '[[ $dir != "$common"/* ]]', '[[ $dir != "$common"* ]]'),
    ("s36_message_no_common_dir", "' in' even without a common directory",
     '"${common:+ in $common}"', '" in $common"'),
    ("s37_message_rename", "renames detected",
     "git diff --cached --name-status --no-renames -z", "git diff --cached --name-status -z"),
    ("s38_message_delete", "a deleted file is taken for an update",
     '      D) lines+=("delete $path") ;;\n', ""),
    ("s39_message_path_with_space", "the body split at spaces",
     "printf '%s\\n' \"${lines[@]}\"", "printf '%s\\n' ${lines[@]}"),
    ("s51_commit_hooks_skipped", "the commit runs the commit hooks",
     "git commit --quiet --no-verify --file=-", "git commit --quiet --file=-"),
    ("s51_commit_hooks_skipped", "the push skips the pre-push hook",
     "git push --quiet origin HEAD:main", "git push --quiet --no-verify origin HEAD:main"),
    # The rebase in a worktree of its own.
    ("s45_conflict_writes_nothing", "rebase in the clone",
     '(cd "$rebase_tree" && git rebase --quiet origin/main 2>&1)', "(git rebase --quiet origin/main 2>&1)"),
    ("s45_conflict_writes_nothing", "rebase in the clone, aborted on a conflict as before",
     '(cd "$rebase_tree" && git rebase --quiet origin/main 2>&1)',
     "(git rebase --quiet origin/main 2>&1 || { git rebase --abort; false; })"),
    ("s46_stale_rebase_worktree", "a leftover worktree not removed first",
     "  remove_rebase_tree\n  trap remove_rebase_tree EXIT\n", "  trap remove_rebase_tree EXIT\n"),
    ("s46_stale_rebase_worktree", "no prune",
     '  rm -rf "$rebase_tree"\n  git worktree prune\n', '  rm -rf "$rebase_tree"\n'),
    ("s4_origin_ahead", "the worktree left after the run",
     "  trap remove_rebase_tree EXIT\n", ""),
    ("s47_commit_during_rebase", "a commit during the rebase dropped by the move",
     'if [ "$(git rev-parse HEAD)" != "$head" ]; then', "if false; then"),
    ("s48_write_in_the_way", "the move overwrites what was written after the commit",
     'git reset --quiet --keep "$rebased"', 'git reset --quiet --hard "$rebased"'),
    ("s48_write_in_the_way", "a refused move fails the run",
     'the next run retries ($(one_line <<<"$reset_output"))"\n    exit 0',
     'the next run retries ($(one_line <<<"$reset_output"))"\n    exit 1'),
    ("s44_staged_list_fails", "a failed listing taken for no change",
     "<(git diff --cached --name-status --no-renames -z)\nwait $!\n",
     "<(git diff --cached --name-status --no-renames -z)\n"),
]

# memex-watch: (scenario, what, old, new), applied to memex-watch.
WATCH_MUTANTS = [
    ("s40_watch_debounce", "no debounce: start the sync a fixed delay after each change",
     "  quiet_for_delay || break\n", '  sleep "$delay"\n'),
    ("s40_watch_debounce", "wait for the sync service to finish",
     "systemctl --user start --no-block memex-sync.service", "systemctl --user start memex-sync.service"),
    ("s40_watch_debounce", "inotifywait's own messages in the journal",
     "inotifywait --quiet --monitor", "inotifywait --monitor"),
    ("s41_watch_ignores_git_and_obsidian", "no filter",
     "[[ $path =~ $ignored ]] || printf", "printf"),
    ("s41_watch_ignores_git_and_obsidian", ".git not ignored",
     r"\.(git|obsidian)(/|$)", r"\.(obsidian)(/|$)"),
    ("s41_watch_ignores_git_and_obsidian", ".obsidian not ignored",
     r"\.(git|obsidian)(/|$)", r"\.(git)(/|$)"),
    ("s41_watch_ignores_git_and_obsidian", ".obsidian ignored only at the top",
     r"^/(.*/)?\.(git", r"^/\.(git"),
    ("s41_watch_ignores_git_and_obsidian", "inotifywait's own messages in the journal",
     "inotifywait --quiet --monitor", "inotifywait --monitor"),
    ("s42_watch_no_clone", "no clone ends the watch with exit 0",
     '  log "cannot watch $repo: no such directory" >&2\n  exit 1',
     '  log "cannot watch $repo: no such directory" >&2\n  exit 0'),
    ("s43_watch_events_end", "the end of the changes taken for quiet",
     '  [ "$status" -gt 128 ]\n', "  true\n"),
    ("s43_watch_events_end", "the end of the changes ends the watch with exit 0",
     'log "stopped watching $root" >&2\nexit 1', 'log "stopped watching $root" >&2\nexit 0'),
    ("s49_watch_clone_deleted", "the clone's deletion not watched",
     "close_write,create,delete,move,delete_self,move_self", "close_write,create,delete,move,move_self"),
    ("s49_watch_clone_deleted", "the clone's deletion does not end the watch",
     "          return\n", "          :\n"),
    ("s49_watch_clone_deleted", "working directory inside the clone",
     'root=$(readlink -f -- "$repo")\n', 'root=$(readlink -f -- "$repo")\ncd "$root"\n'),
    ("s50_watch_clone_moved", "the clone's move not watched",
     "close_write,create,delete,move,delete_self,move_self", "close_write,create,delete,move,delete_self"),
]

ok = True
outdir = tempfile.mkdtemp(prefix="memex-sync-mutants.")
runs = [("memex-sync", text, m) for m in MUTANTS] + [("memex-watch", watch_text, m) for m in WATCH_MUTANTS]
for i, (target, source, (scenario, what, old, new)) in enumerate(runs):
    if source.count(old) != 1:
        print(f"MUTANT {i} ({what}): pattern found {source.count(old)}x in {target}, not applied")
        ok = False
        continue
    path = os.path.join(outdir, f"{target}.mutant{i}")
    with open(path, "w") as f:
        _ = f.write(source.replace(old, new))
    os.chmod(path, 0o755)
    if target == "memex-watch":
        r = subprocess.run([runner, src, scenario], capture_output=True, text=True,
                           env={**os.environ, "WATCH_SUT": path})
    else:
        r = subprocess.run([runner, path, scenario], capture_output=True, text=True)
    first_fail = next((l for l in r.stdout.splitlines() if l.startswith("FAIL")), "")
    verdict = "RED (caught)" if r.returncode != 0 else "GREEN (NOT caught)"
    ok &= r.returncode != 0
    print(f"{scenario} | {what} | {verdict} | {first_fail}")
for name in os.listdir(outdir):
    os.remove(os.path.join(outdir, name))
os.rmdir(outdir)
sys.exit(0 if ok else 1)
