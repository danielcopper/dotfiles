#!/usr/bin/env bash
# Scenario tests for memex-sync and memex-watch against throwaway repos, with
# stand-ins on localhost for ntfy and for origins that refuse; nothing goes to
# the network.
# usage: scenarios.sh [script-under-test] [scenario ...]
#   The script defaults to the repo's host-steamdeck/.local/bin/memex-sync, the
#   scenarios to all of them. WATCH_SUT overrides the memex-watch under test
#   (default host-steamdeck/.local/bin/memex-watch).
# Prints "PASS <scenario>" or "FAIL <scenario>: <check>" per scenario; exits 1
# when any scenario failed. VERBOSE=1 prints every run's output. All state
# lives in a temporary directory that is removed at the end.
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/host-steamdeck/.local/bin/memex-sync
if [ $# -gt 0 ] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/memex-sync-test.XXXXXX")
# The script runs with the PATH its unit sets.
SERVICE_PATH=$(sed -n 's/^Environment=PATH=//p' "$REPO/host-steamdeck/.config/systemd/user/memex-sync.service")
[ -n "$SERVICE_PATH" ] || { echo "no PATH found in memex-sync.service" >&2; exit 2; }
WATCH_SUT=$(readlink -f "${WATCH_SUT:-$REPO/host-steamdeck/.local/bin/memex-watch}")
WATCH_PATH=$(sed -n 's/^Environment=PATH=//p' "$REPO/host-steamdeck/.config/systemd/user/memex-watch.service")
[ -n "$WATCH_PATH" ] || { echo "no PATH found in memex-watch.service" >&2; exit 2; }
# memex-watch's wait for quiet, in seconds; its scenarios are timed for 2.
WATCH_DELAY=2
WATCH_PIDS=()
# The real git, for the wrappers some scenarios put in front of it.
REAL_GIT=$(command -v git)

# Isolate git from the real user: no global config, no global hooks.
export GIT_CONFIG_NOSYSTEM=1
export HOME=$ROOT/home
# Test-side git commands (rebase --continue, cherry-pick --continue) never
# open an editor.
export GIT_EDITOR=true
unset XDG_CONFIG_HOME XDG_STATE_HOME XDG_RUNTIME_DIR
mkdir -p "$HOME"

NTFY_LOG=$ROOT/ntfy.jsonl
: >"$NTFY_LOG"
python3 -I "$HERE/ntfy_stub.py" "$NTFY_LOG" "$ROOT/ntfy.port" &
NTFY_PID=$!
# Origins that answer every request with one HTTP status.
STUB_PIDS=()
for status in 401 403 404; do
  python3 -I "$HERE/http_status_stub.py" "$status" "$ROOT/http$status.port" &
  STUB_PIDS+=($!)
done
cleanup() {
  local pid
  kill "$NTFY_PID" "${STUB_PIDS[@]}" 2>/dev/null
  # A memex-watch still running leads its own process group.
  for pid in "${WATCH_PIDS[@]}"; do kill -- "-$pid" 2>/dev/null; done
  rm -rf "$ROOT"
}
trap cleanup EXIT
for port_file in ntfy.port http401.port http403.port http404.port; do
  for _ in $(seq 50); do [ -s "$ROOT/$port_file" ] && break; sleep 0.1; done
done
NTFY_URL="http://127.0.0.1:$(cat "$ROOT/ntfy.port")/memex-test"
http_origin() { echo "http://127.0.0.1:$(cat "$ROOT/http$1.port")/memex.git"; }

failures=0
fail() { echo "FAIL $SCENARIO: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}

# Fresh world per scenario: bare origin with one commit on main, the clone
# under test ($T/memex) and a second clone ($T/peer) that plays the other side.
new_world() {
  T=$ROOT/$SCENARIO
  mkdir -p "$T/home" "$T/state" "$T/run"
  git init --quiet --bare -b main "$T/origin.git"
  git clone --quiet "$T/origin.git" "$T/seed" 2>/dev/null
  idn "$T/seed"
  printf 'base\n' >"$T/seed/shared.md"
  printf 'one\n' >"$T/seed/a.md"
  git -C "$T/seed" add -A
  git -C "$T/seed" commit --quiet -m init
  git -C "$T/seed" push --quiet origin main
  git clone --quiet "$T/origin.git" "$T/memex"
  idn "$T/memex"
  git clone --quiet "$T/origin.git" "$T/peer"
  idn "$T/peer"
}
idn() { git -C "$1" config user.name test && git -C "$1" config user.email test@example.invalid; }

with_ntfy_files() {
  mkdir -p "$T/home/.config/memex"
  printf '%s\n' "$NTFY_URL" >"$T/home/.config/memex/ntfy_url"
  printf '%s\n' tok123 >"$T/home/.config/memex/ntfy_token"
}

# run_sut: runs the script as the timer would, output in $OUT, exit in $RC.
run_sut() {
  OUT=$(env -i HOME="$T/home" PATH="$SERVICE_PATH" GIT_CONFIG_NOSYSTEM=1 \
    MEMEX_DIR="${MEMEX_DIR_OVERRIDE:-$T/memex}" \
    XDG_STATE_HOME="$T/state" XDG_RUNTIME_DIR="$T/run" \
    "${SUT_ENV[@]}" "$SUT" 2>&1)
  RC=$?
  { echo "\$ memex-sync -> exit $RC"; [ -z "$OUT" ] || printf '%s\n' "$OUT"; } >>"$T/transcript"
}

peer_commit() { # peer_commit <file> <content> <message>
  git -C "$T/peer" pull --quiet --rebase origin main
  printf '%s\n' "$2" >"$T/peer/$1"
  git -C "$T/peer" add -A
  git -C "$T/peer" commit --quiet -m "$3"
  git -C "$T/peer" push --quiet origin HEAD:main
}

origin_sha() { git -C "$T/origin.git" rev-parse --verify --quiet "$1"; }
local_sha() { git -C "$T/memex" rev-parse HEAD; }
count_commits() { git -C "$T/memex" rev-list --count HEAD; }
# The full message of the clone's last commit, trailing newlines stripped.
last_message() { git -C "$T/memex" log -1 --format=%B; }
ntfy_count() { wc -l <"$NTFY_LOG"; }
tree_hash() { (cd "$T/memex" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum); }
eq() { [ "$1" = "$2" ]; }
last_ntfy() { tail -n1 "$NTFY_LOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
SUT_ENV=()
today=$(date +%F)

s1_no_changes() {
  local before
  before=$(count_commits)
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "no new commit" eq "$(count_commits)" "$before"
  check "origin unchanged" eq "$(origin_sha main)" "$(local_sha)"
}

s2_three_files() {
  local before
  before=$(count_commits)
  printf 'new1\n' >"$T/memex/n1.md"
  mkdir -p "$T/memex/sub"
  printf 'new2\n' >"$T/memex/sub/n2.md"
  printf 'changed\n' >"$T/memex/a.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "exactly one new commit" eq "$(count_commits)" "$((before + 1))"
  check "message" eq "$(last_message)" $'deck: 3 files\n\nupdate a.md\ncreate n1.md\ncreate sub/n2.md'
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "work tree clean" eq "$(git -C "$T/memex" status --porcelain)" ""
}

s3_offline() {
  git -C "$T/memex" remote set-url origin "$T/does-not-exist.git"
  printf 'x\n' >"$T/memex/off.md"
  local before
  before=$(count_commits)
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "commit kept locally" eq "$(count_commits)" "$((before + 1))"
  check "offline line with the reason" grep -qE "^memex-sync: offline, 1 commits ahead \(fatal: .*does-not-exist.git.*\)$" <<<"$OUT"
  check "nothing else logged" eq "$(wc -l <<<"$OUT")" 2
}

s4_origin_ahead() {
  peer_commit b.md 'from peer' 'peer: add b'
  local peer_head
  peer_head=$(origin_sha main)
  printf 'local\n' >"$T/memex/c.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "local commit sits on the peer commit" eq "$(git -C "$T/memex" rev-parse HEAD^)" "$peer_head"
  check "linear history" eq "$(git -C "$T/memex" rev-list --merges HEAD)" ""
  check "peer file present" test -f "$T/memex/b.md"
}

# Both sides change shared.md: the rebase cannot go through.
make_conflict() {
  peer_commit shared.md 'peer side' 'peer: edit shared'
  printf 'deck side\n' >"$T/memex/shared.md"
}

s5_conflict() {
  with_ntfy_files
  make_conflict
  local old_head files_before requests_before
  old_head=$(local_sha)
  files_before=$(tree_hash)
  requests_before=$(ntfy_count)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "no rebase left in progress" bash -c "! { [ -d '$T/memex/.git/rebase-merge' ] || [ -d '$T/memex/.git/rebase-apply' ]; }"
  check "still on branch main" eq "$(git -C "$T/memex" symbolic-ref --short -q HEAD)" main
  check "files byte-identical" eq "$(tree_hash)" "$files_before"
  check "HEAD is the sync commit on the old HEAD" eq "$(git -C "$T/memex" rev-parse HEAD^)" "$old_head"
  check "conflict branch on origin = local HEAD" eq "$(origin_sha "conflict/deck-$today")" "$(local_sha)"
  check "origin main untouched by deck" bash -c "[ \"\$(git -C '$T/origin.git' log -1 --format=%s main)\" = 'peer: edit shared' ]"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  check "bearer header" eq "$(last_ntfy authorization)" "Bearer tok123"
  check "message names the branch" grep -q "conflict/deck-$today" <(tail -n1 "$NTFY_LOG")
  check "title names the device" eq "$(last_ntfy title)" "memex-sync (Deck): conflict"
  check "request goes to the topic URL" eq "$(last_ntfy path)" /memex-test
  check "marker present" test -s "$T/state/memex-sync/conflict"

  # Second run, still in conflict, with a new local change.
  printf 'more\n' >"$T/memex/later.md"
  run_sut
  check "second run exit 1 (got $RC)" eq "$RC" 1
  check "conflict branch updated" eq "$(origin_sha "conflict/deck-$today")" "$(local_sha)"
  check "still one ntfy request in total" eq "$(($(ntfy_count) - requests_before))" 1
}

s6_conflict_without_ntfy() {
  make_conflict
  local requests_before
  requests_before=$(ntfy_count)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "conflict branch on origin" eq "$(origin_sha "conflict/deck-$today")" "$(local_sha)"
  check "no ntfy request" eq "$(ntfy_count)" "$requests_before"
  check "nothing said about a notification or a missing file" bash -c "! grep -qiE 'notification|no such file|ntfy' <<<\"\$1\"" _ "$OUT"
}

s7_resolved() {
  s5_conflict
  [ "${FAILED:-0}" = 0 ] || return
  # The other side takes its edit back: origin/main is compatible again.
  peer_commit shared.md 'base' 'peer: revert shared'
  run_sut
  check "exit 0 after resolution (got $RC)" eq "$RC" 0
  check "marker gone" test ! -e "$T/state/memex-sync/conflict"
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "deck content on main" eq "$(git -C "$T/origin.git" show main:shared.md)" "deck side"
  check "conflict branch kept" test -n "$(origin_sha "conflict/deck-$today")"
}

# After a resolved conflict, a new one on the same day reuses the branch name:
# the branch now holds unrelated history and is overwritten, and the cleared
# marker lets this new conflict notify again.
s12_second_conflict_same_day() {
  s7_resolved
  [ "${FAILED:-0}" = 0 ] || return
  local requests_before
  requests_before=$(ntfy_count)
  peer_commit shared.md 'peer again' 'peer: edit shared again'
  printf 'deck again\n' >"$T/memex/shared.md"
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "conflict branch overwritten with local HEAD" eq "$(origin_sha "conflict/deck-$today")" "$(local_sha)"
  check "a new ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
}

# A clone made before origin had any commit: no origin/main to rebase onto.
s8_origin_without_main() {
  rm -rf "$T/origin.git" "$T/memex"
  git init --quiet --bare -b main "$T/origin.git"
  git init --quiet -b main "$T/memex"
  idn "$T/memex"
  git -C "$T/memex" remote add origin "$T/origin.git"
  printf 'first\n' >"$T/memex/first.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "main created on origin" eq "$(origin_sha main)" "$(local_sha)"
}

s9_lock_held() {
  printf 'x\n' >"$T/memex/locked.md"
  local before
  before=$(count_commits)
  exec 8>"$T/run/memex-sync.lock"
  flock 8
  run_sut
  exec 8>&-
  check "exit 0 (got $RC)" eq "$RC" 0
  check "no commit while locked" eq "$(count_commits)" "$before"
  check "skip line" grep -q 'another run holds' <<<"$OUT"
}

s10_not_a_work_tree() {
  mkdir -p "$T/plain"
  MEMEX_DIR_OVERRIDE=$T/plain run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "message" grep -q 'is not a git work tree' <<<"$OUT"
}

# The server refuses the push (pre-receive hook): reported like a conflict.
s11_push_refused_by_origin() {
  with_ntfy_files
  printf '#!/bin/sh\necho "rejected for test" >&2\nexit 1\n' >"$T/origin.git/hooks/pre-receive"
  chmod +x "$T/origin.git/hooks/pre-receive"
  printf 'x\n' >"$T/memex/rej.md"
  local requests_before
  requests_before=$(ntfy_count)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "refusal logged" grep -q "push to main was refused" <<<"$OUT"
  check "commit kept locally" eq "$(last_message)" "deck: create rej.md"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
}

# The local pre-push hook refuses (stands in for the gitleaks hook): one
# notification, quiet while it stays refused, cleared by a good push.
s13_push_refused_by_pre_push_hook() {
  with_ntfy_files
  printf '#!/bin/sh\necho "pre-push: refused for test" >&2\nexit 1\n' >"$T/memex/.git/hooks/pre-push"
  chmod +x "$T/memex/.git/hooks/pre-push"
  printf 'x\n' >"$T/memex/secret.md"
  local requests_before main_before
  requests_before=$(ntfy_count)
  main_before=$(origin_sha main)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "refusal logged" grep -q "push to main was refused" <<<"$OUT"
  check "origin main unchanged" eq "$(origin_sha main)" "$main_before"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  check "message points at the journal" grep -q 'journalctl --user -u memex-sync' <(tail -n1 "$NTFY_LOG")
  check "title names the device" eq "$(last_ntfy title)" "memex-sync (Deck): push refused"
  check "bearer header" eq "$(last_ntfy authorization)" "Bearer tok123"
  check "marker present" test -e "$T/state/memex-sync/push-refused"

  printf 'y\n' >"$T/memex/more.md"
  run_sut
  check "second run exit 1 (got $RC)" eq "$RC" 1
  check "still one ntfy request in total" eq "$(($(ntfy_count) - requests_before))" 1

  rm "$T/memex/.git/hooks/pre-push"
  run_sut
  check "exit 0 once the hook lets it through (got $RC)" eq "$RC" 0
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "marker gone" test ! -e "$T/state/memex-sync/push-refused"
  check "still one ntfy request in total after recovery" eq "$(($(ntfy_count) - requests_before))" 1
}

# Origin moves between our fetch and our push (a peer pushes from inside the
# pre-push hook, once): a race, log only, exit 0, no notification.
s14_push_lost_race() {
  with_ntfy_files
  cat >"$T/memex/.git/hooks/pre-push" <<EOF
#!/bin/sh
[ -e "$T/raced" ] && exit 0
touch "$T/raced"
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE sh -c '
  cd "$T/peer" && git pull --quiet --rebase origin main &&
  echo racer >racer.md && git add racer.md && git commit --quiet -m "peer: race" &&
  git push --quiet origin HEAD:main'
EOF
  chmod +x "$T/memex/.git/hooks/pre-push"
  printf 'x\n' >"$T/memex/race.md"
  local requests_before
  requests_before=$(ntfy_count)
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "race logged" grep -q 'push to origin/main lost a race' <<<"$OUT"
  check "peer won the race" eq "$(git -C "$T/origin.git" log -1 --format=%s main)" "peer: race"
  check "no ntfy request" eq "$(ntfy_count)" "$requests_before"
  check "no marker" test ! -e "$T/state/memex-sync/push-refused"

  run_sut
  check "next run exit 0 (got $RC)" eq "$RC" 0
  check "next run pushed on top of the peer" eq "$(origin_sha main)" "$(local_sha)"
  check "linear history" eq "$(git -C "$T/memex" rev-list --merges HEAD)" ""
}

# A conflict whose branch push is refused by the pre-push hook: reported as
# a refused push once; when the hook lets it through, the conflict is
# reported and the refusal marker cleared.
s15_conflict_branch_push_refused() {
  with_ntfy_files
  printf '#!/bin/sh\necho "pre-push: refused for test" >&2\nexit 1\n' >"$T/memex/.git/hooks/pre-push"
  chmod +x "$T/memex/.git/hooks/pre-push"
  make_conflict
  local requests_before
  requests_before=$(ntfy_count)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "no conflict branch on origin" test -z "$(origin_sha "conflict/deck-$today")"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  check "it names the refused branch" grep -q "push to conflict/deck-$today was refused" <(tail -n1 "$NTFY_LOG")
  check "no conflict marker yet" test ! -e "$T/state/memex-sync/conflict"
  run_sut
  check "second run exit 1 (got $RC)" eq "$RC" 1
  check "still one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  rm "$T/memex/.git/hooks/pre-push"
  run_sut
  check "exit 1 while the conflict stands (got $RC)" eq "$RC" 1
  check "conflict branch on origin" eq "$(origin_sha "conflict/deck-$today")" "$(local_sha)"
  check "conflict now notified" eq "$(($(ntfy_count) - requests_before))" 2
  check "refusal marker cleared" test ! -e "$T/state/memex-sync/push-refused"
}

# --- An operation left in progress in the clone: the run touches nothing. ---

# The peer and the Deck both change shared.md; the Deck has fetched.
diverge() {
  peer_commit shared.md 'peer side' 'peer: edit shared'
  printf 'deck side\n' >"$T/memex/shared.md"
  git -C "$T/memex" commit --quiet -am 'deck: edit shared'
  git -C "$T/memex" fetch --quiet origin
}
# The user resolved the conflict by hand, staged it, and wrote a new note.
resolve_by_hand() {
  printf 'resolved by hand\n' >"$T/memex/shared.md"
  git -C "$T/memex" add shared.md
  printf 'written meanwhile\n' >"$T/memex/new-note.md"
}
snapshot() {
  printf '%s\n' "$(git -C "$T/memex" rev-parse HEAD)" \
    "$(git -C "$T/memex" status --porcelain=v2)" "$(tree_hash)" \
    "$(git -C "$T/origin.git" for-each-ref)"
}
# expect_untouched <git-path that must survive>
expect_untouched() {
  local state requests_before
  state=$(snapshot)
  requests_before=$(ntfy_count)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names what it found" grep -qE "^memex-sync: found (a [a-z-]+ in progress \\($1\\)|unmerged files) in .*; nothing done$" <<<"$OUT"
  check "nothing committed, staged, changed or pushed" eq "$(snapshot)" "$state"
  check "$1 still there" test -e "$(git -C "$T/memex" rev-parse --path-format=absolute --git-path "$1")"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  check "title names the device" eq "$(last_ntfy title)" "memex-sync (Deck): git operation in progress"
  check "marker present" test -e "$T/state/memex-sync/operation-in-progress"
  run_sut
  check "second run exit 1 (got $RC)" eq "$RC" 1
  check "second run touches nothing either" eq "$(snapshot)" "$state"
  check "still one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
}

s16_rebase_in_progress() {
  with_ntfy_files
  diverge
  git -C "$T/memex" rebase origin/main >/dev/null 2>&1
  resolve_by_hand
  expect_untouched rebase-merge
  [ "$FAILED" = 0 ] || return
  # The user finishes the rebase; the next run syncs and clears the marker.
  git -C "$T/memex" rebase --continue >/dev/null 2>&1
  run_sut
  check "exit 0 once the rebase is done (got $RC)" eq "$RC" 0
  check "hand resolution on origin" eq "$(git -C "$T/origin.git" show main:shared.md)" "resolved by hand"
  check "new note on origin" eq "$(git -C "$T/origin.git" show main:new-note.md)" "written meanwhile"
  check "marker gone" test ! -e "$T/state/memex-sync/operation-in-progress"
}

s17_rebase_apply_in_progress() {
  with_ntfy_files
  diverge
  git -C "$T/memex" rebase --apply origin/main >/dev/null 2>&1
  resolve_by_hand
  expect_untouched rebase-apply
}

s18_merge_in_progress() {
  with_ntfy_files
  diverge
  git -C "$T/memex" merge origin/main >/dev/null 2>&1
  resolve_by_hand
  expect_untouched MERGE_HEAD
}

s19_cherry_pick_in_progress() {
  with_ntfy_files
  diverge
  git -C "$T/memex" cherry-pick origin/main >/dev/null 2>&1
  resolve_by_hand
  expect_untouched CHERRY_PICK_HEAD
}

s20_revert_in_progress() {
  with_ntfy_files
  printf 'deck one\n' >"$T/memex/shared.md"
  git -C "$T/memex" commit --quiet -am 'deck: one'
  printf 'deck two\n' >"$T/memex/shared.md"
  git -C "$T/memex" commit --quiet -am 'deck: two'
  git -C "$T/memex" revert HEAD~1 >/dev/null 2>&1
  resolve_by_hand
  expect_untouched REVERT_HEAD
}

# A stash pop that conflicts leaves unmerged files and no operation state.
s21_unmerged_files() {
  with_ntfy_files
  printf 'stashed\n' >"$T/memex/shared.md"
  git -C "$T/memex" stash --quiet
  printf 'committed\n' >"$T/memex/shared.md"
  git -C "$T/memex" commit --quiet -am 'deck: commit'
  git -C "$T/memex" stash pop >/dev/null 2>&1
  check "setup: unmerged files and no operation state" bash -c \
    "[ -n \"\$(git -C '$T/memex' ls-files -u)\" ] && [ ! -e '$T/memex/.git/MERGE_HEAD' ]"
  expect_untouched index
}

# --- Credentials and refusals on fetch. ---

# Runs with the user manager's askpass settings, a stub standing in for the
# desktop dialog.
with_askpass_stub() {
  printf '#!/bin/sh\necho "$*" >>"%s"\necho secret\n' "$T/askpass.log" >"$T/askpass"
  chmod +x "$T/askpass"
  SUT_ENV=(SSH_ASKPASS="$T/askpass" SSH_ASKPASS_REQUIRE=prefer DISPLAY=:99)
}

s22_askpass_never_called() {
  with_ntfy_files
  with_askpass_stub
  git -C "$T/memex" remote set-url origin "$(http_origin 401)"
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "askpass stub never called" test ! -e "$T/askpass.log"
}

# expect_fetch_refused <grep pattern for the reason>
expect_fetch_refused() {
  local requests_before commits_before
  requests_before=$(ntfy_count)
  printf 'x\n' >"$T/memex/during-refusal.md"
  commits_before=$(count_commits)
  run_sut
  check "exit 1 (got $RC)" eq "$RC" 1
  check "the change is still committed" eq "$(count_commits)" "$((commits_before + 1))"
  check "the commit is the sync commit" eq "$(last_message)" "deck: create during-refusal.md"
  check "reason logged" grep -qE "^memex-sync: origin refused the fetch: .*$1" <<<"$OUT"
  check "one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
  check "title names the device" eq "$(last_ntfy title)" "memex-sync (Deck): fetch refused"
  check "message carries the reason" grep -qE "$1" <(last_ntfy body)
  run_sut
  check "second run exit 1 (got $RC)" eq "$RC" 1
  check "still one ntfy request" eq "$(($(ntfy_count) - requests_before))" 1
}

s23_fetch_401() {
  with_ntfy_files
  git -C "$T/memex" remote set-url origin "$(http_origin 401)"
  expect_fetch_refused "could not read Username"
  [ "$FAILED" = 0 ] || return
  # Back to a working origin: the sync goes through and clears the marker.
  git -C "$T/memex" remote set-url origin "$T/origin.git"
  printf 'x\n' >"$T/memex/after.md"
  run_sut
  check "exit 0 with a working origin (got $RC)" eq "$RC" 0
  check "marker gone" test ! -e "$T/state/memex-sync/fetch-refused"
}

s24_fetch_bad_credentials() {
  with_ntfy_files
  git -C "$T/memex" remote set-url origin "$(http_origin 401 | sed 's|//|//deck:wrong@|')"
  expect_fetch_refused "Authentication failed"
}

s25_fetch_403() {
  with_ntfy_files
  git -C "$T/memex" remote set-url origin "$(http_origin 403)"
  expect_fetch_refused "returned error: 403"
}

s26_fetch_404() {
  with_ntfy_files
  git -C "$T/memex" remote set-url origin "$(http_origin 404)"
  expect_fetch_refused "repository '.*' not found"
}

# ssh: a stub client stands in for ssh and says what the real one would.
with_ssh_stub() { # with_ssh_stub <message>
  printf '#!/bin/sh\necho "%s" >&2\nexit 255\n' "$1" >"$T/ssh"
  chmod +x "$T/ssh"
  SUT_ENV+=(GIT_SSH_COMMAND="$T/ssh")
  git -C "$T/memex" remote set-url origin "ssh://git@forge.example.invalid/memex.git"
}

s27_fetch_ssh_denied() {
  with_ntfy_files
  with_ssh_stub "git@forge.example.invalid: Permission denied (publickey)."
  expect_fetch_refused "Permission denied \\(publickey"
}

# Network failures stay log-only.
s28_fetch_no_connection() {
  with_ntfy_files
  git -C "$T/memex" remote set-url origin "http://127.0.0.1:1/memex.git"
  printf 'x\n' >"$T/memex/n.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "reason in the offline line" grep -qE "^memex-sync: offline, 1 commits ahead \(fatal: unable to access .*Could not connect to server\)$" <<<"$OUT"
  check "no ntfy request" eq "$(ntfy_count)" "$NTFY_BEFORE"
}

s29_fetch_ssh_unresolved() {
  with_ntfy_files
  with_ssh_stub "ssh: Could not resolve hostname forge.example.invalid: Name or service not known"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "ssh reason in the offline line" grep -qE "^memex-sync: offline, 0 commits ahead \(ssh: Could not resolve hostname .* / fatal: Could not read from remote repository\..*\)$" <<<"$OUT"
  check "no ntfy request" eq "$(ntfy_count)" "$NTFY_BEFORE"
}

# --- Something writes into the clone while a run is going on. ---

# A git first on the script's PATH that, the first time the script starts a
# rebase, changes a tracked file in the clone, as a concurrent writer would
# between the commit and the rebase. $T/wrote records that it happened.
with_writer_before_rebase() {
  mkdir -p "$T/bin"
  cat >"$T/bin/git" <<EOF
#!/bin/sh
if [ "\$1" = rebase ] && [ "\$2" != --abort ] && [ ! -e "$T/wrote" ]; then
  touch "$T/wrote"
  echo 'written during the run' >>"$T/memex/a.md"
fi
exec "$REAL_GIT" "\$@"
EOF
  chmod +x "$T/bin/git"
  SUT_ENV+=(PATH="$T/bin:$SERVICE_PATH")
}

s30_writer_during_rebase() {
  with_ntfy_files
  with_writer_before_rebase
  peer_commit b.md 'from peer' 'peer: add b'
  local old_head
  old_head=$(local_sha)
  printf 'local\n' >"$T/memex/c.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "the writer did write" test -e "$T/wrote"
  check "refusal logged with git's reason" grep -qE "^memex-sync: working tree changed during the run; the next run retries \(.+\)$" <<<"$OUT"
  check "no conflict branch" test -z "$(origin_sha "conflict/deck-$today")"
  check "no ntfy request" eq "$(ntfy_count)" "$NTFY_BEFORE"
  check "no marker" test -z "$(ls -A "$T/state/memex-sync" 2>/dev/null)"
  check "no rebase left in progress" bash -c "! { [ -d '$T/memex/.git/rebase-merge' ] || [ -d '$T/memex/.git/rebase-apply' ]; }"
  check "sync commit kept on the old HEAD" eq "$(git -C "$T/memex" rev-parse HEAD^)" "$old_head"
  check "stray change left in the tree" eq "$(git -C "$T/memex" status --porcelain)" " M a.md"
  run_sut
  check "next run exit 0 (got $RC)" eq "$RC" 0
  check "next run pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "stray change on origin" grep -q 'written during the run' <(git -C "$T/origin.git" show main:a.md)
  check "linear history" eq "$(git -C "$T/memex" rev-list --merges HEAD)" ""
}

s31_writer_origin_not_ahead() {
  with_ntfy_files
  with_writer_before_rebase
  printf 'local\n' >"$T/memex/c.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "no rebase attempted" test ! -e "$T/wrote"
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  check "only commit and push logged" eq "$OUT" $'memex-sync: committed 1 Dateien\nmemex-sync: pushed 1 commits'
  check "no ntfy request" eq "$(ntfy_count)" "$NTFY_BEFORE"
}

# The fetch runs before the commit: a git first on the script's PATH logs
# each subcommand the script runs.
s32_fetch_before_commit() {
  mkdir -p "$T/bin"
  cat >"$T/bin/git" <<EOF
#!/bin/sh
[ "\$1" = -C ] || echo "\$1" >>"$T/git-calls"
exec "$REAL_GIT" "\$@"
EOF
  chmod +x "$T/bin/git"
  SUT_ENV+=(PATH="$T/bin:$SERVICE_PATH")
  peer_commit b.md 'from peer' 'peer: add b'
  printf 'local\n' >"$T/memex/c.md"
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
  local fetch_at commit_at rebase_at
  fetch_at=$(grep -nx fetch "$T/git-calls" | head -n1 | cut -d: -f1)
  commit_at=$(grep -nx commit "$T/git-calls" | head -n1 | cut -d: -f1)
  rebase_at=$(grep -nx rebase "$T/git-calls" | head -n1 | cut -d: -f1)
  { echo "git subcommands in order:"; paste -sd ' ' "$T/git-calls"; } >>"$T/transcript"
  check "fetch, commit and rebase all ran" test -n "$fetch_at" -a -n "$commit_at" -a -n "$rebase_at"
  check "fetch before commit" test "${fetch_at:-0}" -lt "${commit_at:-0}"
  check "no fetch between commit and rebase" eq "$(sed -n "${commit_at:-1},${rebase_at:-1}p" "$T/git-calls" | grep -cx fetch)" 0
}

# Someone starts a merge while the fetch waits on the network: a git first on
# the script's PATH runs the real fetch, then a merge that stops on a
# conflict. The check right before the commit catches it.
s33_merge_started_during_fetch() {
  with_ntfy_files
  peer_commit shared.md 'peer side' 'peer: edit shared'
  printf 'deck side\n' >"$T/memex/shared.md"
  git -C "$T/memex" commit --quiet -am 'deck: edit shared'
  printf 'written meanwhile\n' >"$T/memex/new-note.md"
  mkdir -p "$T/bin"
  cat >"$T/bin/git" <<EOF
#!/bin/sh
[ "\$1" = fetch ] || exec "$REAL_GIT" "\$@"
"$REAL_GIT" "\$@"
status=\$?
touch "$T/merge-started"
"$REAL_GIT" merge origin/main >/dev/null 2>&1
exit \$status
EOF
  chmod +x "$T/bin/git"
  SUT_ENV+=(PATH="$T/bin:$SERVICE_PATH")
  local head_before commits_before main_before
  head_before=$(local_sha)
  commits_before=$(count_commits)
  main_before=$(origin_sha main)
  run_sut
  check "the merge was started during the fetch" test -e "$T/merge-started"
  check "exit 1 (got $RC)" eq "$RC" 1
  check "names the merge" grep -qx "memex-sync: found a merge in progress (MERGE_HEAD) in $T/memex; nothing done" <<<"$OUT"
  check "MERGE_HEAD still there" test -e "$T/memex/.git/MERGE_HEAD"
  check "nothing committed" eq "$(count_commits):$(local_sha)" "$commits_before:$head_before"
  check "merge state and new note left as they are" eq "$(git -C "$T/memex" status --porcelain)" $'UU shared.md\n?? new-note.md'
  check "origin main unchanged" eq "$(origin_sha main)" "$main_before"
  check "one ntfy request" eq "$(($(ntfy_count) - NTFY_BEFORE))" 1
  check "title names the device" eq "$(last_ntfy title)" "memex-sync (Deck): git operation in progress"
  check "marker present" test -e "$T/state/memex-sync/operation-in-progress"
}

# --- Commit messages. ---

# expect_message <message>: one run, one new commit with that message, pushed.
expect_message() {
  local before
  before=$(count_commits)
  run_sut
  check "exit 0 (got $RC)" eq "$RC" 0
  check "exactly one new commit" eq "$(count_commits)" "$((before + 1))"
  check "message '${1%%$'\n'*}'" eq "$(last_message)" "$1"
  check "pushed" eq "$(origin_sha main)" "$(local_sha)"
}

s34_message_one_file() {
  mkdir -p "$T/memex/daniel/memory"
  printf 'one\n' >"$T/memex/daniel/memory/note.md"
  expect_message "deck: create daniel/memory/note.md"
  printf 'two\n' >>"$T/memex/daniel/memory/note.md"
  expect_message "deck: update daniel/memory/note.md"
}

# The first file lies deeper than the common directory.
s35_message_common_dir() {
  mkdir -p "$T/memex/daniel/memory/global"
  printf 'a\n' >"$T/memex/daniel/memory/global/a.md"
  printf 'c\n' >"$T/memex/daniel/memory/global/c.md"
  printf 'z\n' >"$T/memex/daniel/memory/z.md"
  expect_message $'deck: 3 files in daniel/memory\n\ncreate daniel/memory/global/a.md\ncreate daniel/memory/global/c.md\ncreate daniel/memory/z.md'
}

# notes/ and notes2/ share the start of their names, not a directory.
s36_message_no_common_dir() {
  mkdir -p "$T/memex/notes" "$T/memex/notes2"
  printf 'x\n' >"$T/memex/notes/x.md"
  printf 'y\n' >"$T/memex/notes2/y.md"
  expect_message $'deck: 2 files\n\ncreate notes/x.md\ncreate notes2/y.md'
}

# Same content under a new name, which rename detection would pair up.
s37_message_rename() {
  mkdir -p "$T/memex/daniel/memory"
  printf 'a note long enough to be taken for a rename\n' >"$T/memex/daniel/memory/old.md"
  expect_message "deck: create daniel/memory/old.md"
  mv "$T/memex/daniel/memory/old.md" "$T/memex/daniel/memory/new.md"
  expect_message $'deck: 2 files in daniel/memory\n\ncreate daniel/memory/new.md\ndelete daniel/memory/old.md'
}

s38_message_delete() {
  rm "$T/memex/a.md"
  expect_message "deck: delete a.md"
}

s39_message_path_with_space() {
  mkdir -p "$T/memex/my notes"
  printf 'one\n' >"$T/memex/my notes/a b.md"
  expect_message "deck: create my notes/a b.md"
  printf 'two\n' >>"$T/memex/my notes/a b.md"
  printf 'c\n' >"$T/memex/my notes/c d.md"
  expect_message $'deck: 2 files in my notes\n\nupdate my notes/a b.md\ncreate my notes/c d.md'
}

# --- memex-watch: starts the sync once the clone has been quiet. ---

# start_watch: runs memex-watch in the background as its unit would, with a
# systemctl first on its PATH that records each call in $T/starts, and waits
# until inotifywait has set up its watches.
start_watch() {
  mkdir -p "$T/bin"
  printf '#!/bin/sh\necho "$*" >>"%s"\n' "$T/starts" >"$T/bin/systemctl"
  chmod +x "$T/bin/systemctl"
  : >"$T/starts"
  # setsid: a process group of its own, so stop_watch ends inotifywait too.
  env -i HOME="$T/home" PATH="$T/bin:$WATCH_PATH" \
    MEMEX_DIR="${MEMEX_DIR_OVERRIDE:-$T/memex}" MEMEX_WATCH_DELAY="$WATCH_DELAY" \
    setsid "$WATCH_SUT" >"$T/watch.out" 2>&1 &
  WATCH_PID=$!
  WATCH_PIDS+=("$WATCH_PID")
  for _ in $(seq 50); do grep -q 'Watches established' "$T/watch.out" && break; sleep 0.1; done
}
stop_watch() {
  kill -- "-$WATCH_PID" 2>/dev/null
  wait "$WATCH_PID" 2>/dev/null
  { echo "\$ memex-watch"; cat "$T/watch.out"; } >>"$T/transcript"
}
# wait_watch_exit: waits up to 10 s for memex-watch to end by itself; its exit
# in $RC, $ENDED is 0 when it did end.
wait_watch_exit() {
  ENDED=0
  timeout 10 tail --pid="$WATCH_PID" -f /dev/null || ENDED=$?
  [ "$ENDED" = 0 ] || kill -- "-$WATCH_PID" 2>/dev/null
  wait "$WATCH_PID"
  RC=$?
  { echo "\$ memex-watch -> exit $RC"; cat "$T/watch.out"; } >>"$T/transcript"
}
starts() { wc -l <"$T/starts"; }

# Three writes a second apart, each within the delay of the one before: no
# start until the delay has passed after the last one, then exactly one.
s40_watch_debounce() {
  start_watch
  check "watches established" grep -q 'Watches established' "$T/watch.out"
  local n
  for n in 1 2 3; do
    printf '%s\n' "$n" >"$T/memex/burst.md"
    sleep 1
  done
  check "no start while the changes keep coming" eq "$(starts)" 0
  sleep 2.5
  check "one start once quiet" eq "$(starts)" 1
  check "starts the sync service without waiting for it" eq "$(cat "$T/starts")" "--user start --no-block memex-sync.service"
  printf 'later\n' >"$T/memex/later.md"
  sleep 3
  check "a later change starts it again" eq "$(starts)" 2
  stop_watch
}

# Obsidian's state, git's own files and a commit are no change that counts;
# a note afterwards still is.
s41_watch_ignores_git_and_obsidian() {
  mkdir -p "$T/memex/.obsidian" "$T/memex/daniel"
  start_watch
  printf '{}\n' >"$T/memex/.obsidian/workspace.json"
  mkdir "$T/memex/daniel/.obsidian"
  printf '{}\n' >"$T/memex/daniel/.obsidian/app.json"
  printf 'x\n' >"$T/memex/.git/stray"
  git -C "$T/memex" commit --quiet --allow-empty -m 'test: empty'
  sleep 3
  check "no start" eq "$(starts)" 0
  printf 'note\n' >"$T/memex/daniel/note.md"
  sleep 3
  check "a note still starts it" eq "$(starts)" 1
  stop_watch
}

s42_watch_no_clone() {
  MEMEX_DIR_OVERRIDE=$T/no-such-clone start_watch
  wait_watch_exit
  check "ends by itself" eq "$ENDED" 0
  check "exit 1 (got $RC)" eq "$RC" 1
  check "says why" grep -qx "memex-watch: cannot watch $T/no-such-clone" "$T/watch.out"
  check "no start" eq "$(starts)" 0
}

# inotifywait stops right after a change: the watch ends without a start. A
# stand-in first on the PATH reports one change and exits.
s43_watch_events_end() {
  mkdir -p "$T/bin"
  printf '#!/bin/sh\necho "Watches established." >&2\necho ./note.md\nexit 1\n' >"$T/bin/inotifywait"
  chmod +x "$T/bin/inotifywait"
  start_watch
  wait_watch_exit
  check "ends by itself" eq "$ENDED" 0
  check "exit 1 (got $RC)" eq "$RC" 1
  check "no start" eq "$(starts)" 0
}

# git fails to list the staged files: the run fails instead of taking the
# change for none. A git first on the script's PATH refuses every diff.
s44_staged_list_fails() {
  mkdir -p "$T/bin"
  cat >"$T/bin/git" <<EOF
#!/bin/sh
[ "\$1" = diff ] && { echo "diff refused for test" >&2; exit 128; }
exec "$REAL_GIT" "\$@"
EOF
  chmod +x "$T/bin/git"
  SUT_ENV+=(PATH="$T/bin:$SERVICE_PATH")
  printf 'x\n' >"$T/memex/unlisted.md"
  local before
  before=$(count_commits)
  run_sut
  check "exit 128 (got $RC)" eq "$RC" 128
  check "git's reason shown" grep -q 'diff refused for test' <<<"$OUT"
  check "no commit" eq "$(count_commits)" "$before"
  check "origin unchanged" eq "$(origin_sha main)" "$(local_sha)"
}

all=(s1_no_changes s2_three_files s3_offline s4_origin_ahead s5_conflict s6_conflict_without_ntfy s7_resolved
  s8_origin_without_main s9_lock_held s10_not_a_work_tree s11_push_refused_by_origin s12_second_conflict_same_day
  s13_push_refused_by_pre_push_hook s14_push_lost_race s15_conflict_branch_push_refused
  s16_rebase_in_progress s17_rebase_apply_in_progress s18_merge_in_progress s19_cherry_pick_in_progress
  s20_revert_in_progress s21_unmerged_files s22_askpass_never_called s23_fetch_401 s24_fetch_bad_credentials
  s25_fetch_403 s26_fetch_404 s27_fetch_ssh_denied s28_fetch_no_connection s29_fetch_ssh_unresolved
  s30_writer_during_rebase s31_writer_origin_not_ahead s32_fetch_before_commit
  s33_merge_started_during_fetch s34_message_one_file s35_message_common_dir s36_message_no_common_dir
  s37_message_rename s38_message_delete s39_message_path_with_space
  s40_watch_debounce s41_watch_ignores_git_and_obsidian s42_watch_no_clone s43_watch_events_end
  s44_staged_list_fails)
[ $# -gt 0 ] && all=("$@")
for SCENARIO in "${all[@]}"; do
  FAILED=0
  SUT_ENV=()
  new_world
  NTFY_BEFORE=$(ntfy_count)
  "$SCENARIO"
  if [ "$FAILED" = 0 ]; then echo "PASS $SCENARIO"; else failures=$((failures + 1)); fi
  if [ "$FAILED" != 0 ] || [ -n "${VERBOSE:-}" ]; then sed 's/^/    /' "$T/transcript" 2>/dev/null; fi
done
[ "$failures" = 0 ]
