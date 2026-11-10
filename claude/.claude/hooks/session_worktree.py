#!/usr/bin/env python3
"""PostToolUse(Bash) hook: remember the worktree this session created, for the statusline.

A `mise run worktree-new` call (also `mise -C <dir> run worktree-new`) whose
stdout carries the task's success line `✓ worktree ready: <path>  (branch
<branch>, base <base>)` writes `<path>\\n<branch>\\n` to
<dir>/statusline-session-wt/<session_id>, where <dir> is $XDG_RUNTIME_DIR, or
~/.cache/claude without it; statusline.sh reads that file. The last worktree a
session creates wins; anything else writes nothing.

The directory is per user and private (0700): one that is a symlink or owned
by someone else is refused, so nobody else can plant or redirect the file.
A refusal or a failed write is shown to the user as a systemMessage and the
hook still exits 0: stderr of an exit-0 hook reaches nobody, and a missing
statusline chip is no reason to fail the Bash call.
"""

import contextlib
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

WORKTREE_NEW = re.compile(r"\bmise(?:\s+-C\s+\S+)?\s+run\s+worktree-new\b")
READY = re.compile(r"✓ worktree ready: (.+?)  \(branch (\S+), base \S+\)")
SESSION_ID = re.compile(r"[A-Za-z0-9_-]+")


def session_wt_dir():
    """The per-user directory of the session files; statusline.sh resolves the same one."""
    base = os.environ.get("XDG_RUNTIME_DIR") or str(Path.home() / ".cache" / "claude")
    return Path(base) / "statusline-session-wt"


def private_dir(path):
    """Create path as a 0700 directory; True only when it is a real directory this user owns."""
    try:
        path.mkdir(mode=0o700, parents=True)
    except FileExistsError:
        pass
    info = os.lstat(path)
    return stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()


def warn(message):
    """Show message to the user as the hook's systemMessage."""
    print(json.dumps({"systemMessage": f"session_worktree: {message}"}))


def replace_file(target, text):
    """Write text to target through a temp file beside it; the temp file is gone on failure."""
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, target)
    except OSError:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def created_worktree(data):
    """(path, branch) of the last worktree a `mise run worktree-new` call reports ready, else None."""
    command = (data.get("tool_input") or {}).get("command") or ""
    if not WORKTREE_NEW.search(command):
        return None
    response = data.get("tool_response")
    stdout = response.get("stdout") if isinstance(response, dict) else None
    ready = READY.findall(stdout or "")
    return ready[-1] if ready else None


def record(data, out_dir=None):
    """Write the created worktree to the session's file, replacing it atomically."""
    session = data.get("session_id") or ""
    created = created_worktree(data)
    if not created or not SESSION_ID.fullmatch(session):
        return
    out_dir = out_dir or session_wt_dir()
    path, branch = created
    try:
        if not private_dir(out_dir):
            warn(f"refusing {out_dir}: a symlink, not a directory, or not owned by this user")
            return
        replace_file(out_dir / session, f"{path}\n{branch}\n")
    except OSError as e:
        warn(f"could not record the worktree in {out_dir}: {e}")


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return
    record(data)


if __name__ == "__main__":
    main()
