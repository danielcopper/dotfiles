#!/usr/bin/env bash
# WorktreeCreate hook: creates the worktree at the convention path
# <repo-parent>/<repo>.worktrees/<name> instead of Claude Code's default
# .claude/worktrees/<name>. With this hook, EnterWorktree(name: "<type>/<slug>")
# creates the worktree where the `worktree` skill expects it and enters it
# without an approval prompt.
#
# - "<type>/<slug>" (contains "/"): runs the global `worktree-new` mise task, so
#   path, branch naming and the mise trust + setup step live in one place.
# - Name without "/" (claude --worktree, isolation: "worktree" agents): plain
#   `git worktree add` on a new branch <name> from the current branch of cwd.
#
# Contract: JSON on stdin (name, cwd); the worktree's absolute path is the last
# stdout line; everything else goes to stderr; non-zero exit = creation failed.
set -euo pipefail

die() {
  echo "worktree_create: $*" >&2
  exit 1
}

input="$(cat)"
name="$(jq -r '.name // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
[ -n "$name" ] || die "no worktree name in hook input"
[ -n "$cwd" ] || die "no cwd in hook input"

# --git-common-dir points at the MAIN checkout's .git, also from inside a
# worktree, so every worktree lands in the one shared <repo>.worktrees.
common_git="$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ||
  die "not inside a git repository (cwd: $cwd)"
repo_root="$(dirname "$common_git")"
wt="$(dirname "$repo_root")/$(basename "$repo_root").worktrees/$name"

if [[ "$name" == */* ]]; then
  MISE_ORIGINAL_CWD="$cwd" bash "$HOME/.config/mise/tasks/worktree-new" "${name%%/*}" "${name#*/}" >&2 ||
    die "worktree-new failed for '$name'"
else
  git -C "$cwd" worktree add -b "$name" "$wt" >&2 ||
    die "git worktree add failed for '$name'"
fi

echo "$wt"
