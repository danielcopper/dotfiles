#!/usr/bin/env python3
"""PostToolUse(Bash) hook: remember the worktree this session created, for the statusline.

A `mise run worktree-new` call (also `mise -C <dir> run worktree-new`) whose
stdout carries the task's success line `✓ worktree ready: <path>  (branch
<branch>, base <base>)` writes `<path>\\n<branch>\\n` to
/tmp/statusline-session-wt/<session_id>. statusline.sh shows that branch
instead of the repo-wide newest worktree branch while the path exists. The
last worktree a session creates wins; anything else writes nothing.
"""

import json
import os
import re
import sys
from pathlib import Path

SESSION_WT_DIR = Path("/tmp/statusline-session-wt")
WORKTREE_NEW = re.compile(r"\bmise(?:\s+-C\s+\S+)?\s+run\s+worktree-new\b")
READY = re.compile(r"✓ worktree ready: (.+?)  \(branch (\S+), base \S+\)")
SESSION_ID = re.compile(r"[A-Za-z0-9_-]+")


def created_worktree(data):
    """(path, branch) of the last worktree a `mise run worktree-new` call reports ready, else None."""
    command = (data.get("tool_input") or {}).get("command") or ""
    if not WORKTREE_NEW.search(command):
        return None
    response = data.get("tool_response")
    stdout = response.get("stdout") if isinstance(response, dict) else None
    ready = READY.findall(stdout or "")
    return ready[-1] if ready else None


def record(data, out_dir=SESSION_WT_DIR):
    """Write the created worktree to the session's file, replacing it atomically."""
    session = data.get("session_id") or ""
    created = created_worktree(data)
    if not created or not SESSION_ID.fullmatch(session):
        return
    path, branch = created
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = out_dir / f".{session}.{os.getpid()}"
    tmp.write_text(f"{path}\n{branch}\n")
    os.replace(tmp, out_dir / session)


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return
    record(data)


if __name__ == "__main__":
    main()
