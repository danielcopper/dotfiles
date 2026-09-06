#!/usr/bin/env python3
"""PreToolUse(Bash) hook: git commands that rewrite history or discard work need explicit approval.

The permission allowlist waves `git push`, `git checkout`, `git branch`
and friends through as a whole, so this hook is what turns their
destructive forms into a prompt ("ask"): force pushes and remote ref
deletes, discarding uncommitted changes (checkout/restore of paths,
reset --hard, clean -f), and dropping stashes, unmerged branches (-D) or
dirty worktrees (--force). Everything else passes and nothing is denied
outright - the user decides.

`git branch -D` is asked about only when a named branch is really at risk:
a branch already merged into the default branch, or one whose upstream
the remote no longer has (a squash-merged PR with delete-on-merge), holds
nothing the deletion would lose, so it passes. A branch that exists only
locally, or is unmerged with its upstream still present, asks. When git
cannot answer (no repository, a timeout), the prompt stays.

Token-based like block_dangerous_bash.py: each `;`/`|`/`&`/newline
segment is inspected on its own, git's global options (-C, -c, ...) are
skipped to find the subcommand, and `git` inside a quoted string keeps
its quote character and doesn't match.
"""

import json
import os
import re
import subprocess
import sys

SEGMENT = re.compile(r"[|;&\r\n]+")
GLOBAL_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}


def invocation(tokens):
    """(subcommand, args) of the first git call in the segment, or None."""
    if "git" not in tokens:
        return None
    rest = tokens[tokens.index("git") + 1:]
    while rest and rest[0].startswith("-"):
        rest = rest[2:] if rest[0] in GLOBAL_OPTIONS_WITH_VALUE else rest[1:]
    return (rest[0], rest[1:]) if rest else None


def hazard(sub, args):
    """Why this invocation needs approval, or None."""
    flags = [a for a in args if a.startswith("-")]
    short = "".join(a[1:] for a in flags if not a.startswith("--"))
    operands = [a for a in args if not a.startswith("-")]
    forced = "--force" in flags or "f" in short

    if sub == "push":
        if any(f.startswith("--force") for f in flags) or "f" in short or any(o.startswith("+") for o in operands):
            return "force push rewrites remote history"
        if "--delete" in flags or "d" in short or "--mirror" in flags or any(o.startswith(":") for o in operands):
            return "push deletes remote refs"
    elif sub == "checkout":
        if "--" in args or "." in operands:
            return "checkout of paths discards uncommitted changes"
    elif sub == "restore":
        staged_only = ("--staged" in flags or "S" in short) and not ("--worktree" in flags or "W" in short)
        if not staged_only:
            return "restore discards uncommitted changes"
    elif sub == "reset":
        if "--hard" in flags:
            return "reset --hard discards uncommitted changes"
    elif sub == "clean":
        if forced and "n" not in short and "--dry-run" not in flags:
            return "clean -f deletes untracked files"
    elif sub == "stash":
        if operands[:1] in (["drop"], ["clear"]):
            return f"stash {operands[0]} is unrecoverable"
    elif sub == "branch":
        if "D" in short or (("--delete" in flags or "d" in short) and forced):
            return "branch -D deletes an unmerged branch"
    elif sub == "worktree":
        if operands[:1] == ["remove"] and forced:
            return "worktree remove --force discards uncommitted changes"
    return None


def target_dir(command, cwd):
    """Best-effort directory the git command runs in, expanded like the shell would."""
    m = re.search(r"(?:^|&&|;)\s*cd\s+([^\s;&|]+)", command) or re.search(r"git\s+-C\s+([^\s;&|]+)", command)
    if not m:
        return cwd or "."
    return os.path.expandvars(os.path.expanduser(m.group(1).strip("'\"")))


def _git(repo, *args):
    """git's completed process, or None when it could not run at all."""
    try:
        return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None


def _upstream_gone(repo, name):
    """True when *name* tracks an upstream branch the remote no longer has."""
    ref = _git(repo, "for-each-ref", "--format=%(upstream)|%(upstream:track)", f"refs/heads/{name}")
    if ref is None or ref.returncode != 0:
        return False
    upstream, _, track = ref.stdout.strip().partition("|")
    if not upstream:
        return False
    if track.strip() == "[gone]":
        return True
    remote, _, branch = upstream.removeprefix("refs/remotes/").partition("/")
    probe = _git(repo, "ls-remote", "--exit-code", "--heads", remote, branch)
    return probe is not None and probe.returncode == 2


def at_risk(names, repo):
    """The branches among *names* a `-D` would really lose, or None when git cannot say."""
    merged = None
    for base in ("origin/HEAD", "main", "master"):
        listed = _git(repo, "branch", "--format=%(refname:short)", "--merged", base)
        if listed is not None and listed.returncode == 0:
            merged = set(listed.stdout.split())
            break
    if merged is None:
        return None
    return [name for name in names if name not in merged and not _upstream_gone(repo, name)]


def check(command, cwd="."):
    for segment in SEGMENT.split(command):
        call = invocation(segment.split())
        if call is None:
            continue
        sub, args = call
        why = hazard(sub, args)
        if why and sub == "branch":
            names = [a for a in args if not a.startswith("-")]
            risky = at_risk(names, target_dir(command, cwd)) if names else None
            if risky == []:
                continue
            if risky:
                why = f"{why} ({', '.join(risky)})"
        if why:
            return f"git {sub}: {why} - approve explicitly"
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    reason = check(command, data.get("cwd") or ".") if command else None
    if reason:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "ask",
                        "permissionDecisionReason": reason,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
