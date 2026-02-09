#!/usr/bin/env python3
"""
SessionEnd Hook / Cleanup Utility
Logs session end and cleans up stale temp files.

If SessionEnd is not a recognized hook event, this can be run
manually as a cleanup utility.
"""

import glob
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl


def _cleanup_temp_files():
    """Remove stale claude-hooks temp files (older than 1 hour)."""
    tmp_dir = tempfile.gettempdir()
    now = time.time()
    one_hour = 3600

    for pattern in ("claude-hooks-*", "claude-hooks-notify-*"):
        for path in glob.glob(os.path.join(tmp_dir, pattern)):
            try:
                if now - os.path.getmtime(path) > one_hour:
                    os.unlink(path)
            except OSError:
                pass


def handle_session_end(data):
    log_jsonl("session_end.json", {
        "session_id": data.get("session_id", ""),
        "cwd": data.get("cwd", ""),
    })

    _cleanup_temp_files()
    return None


if __name__ == "__main__":
    run_hook("session_end", handle_session_end)
