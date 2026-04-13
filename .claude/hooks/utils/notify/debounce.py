#!/usr/bin/env python3
"""
Notification debounce to prevent spam.
Uses a timestamp file to rate-limit notifications.
"""

import os
import time
import tempfile
from pathlib import Path

_TIMESTAMP_FILE = Path(tempfile.gettempdir()) / "claude-hooks-last-notify.ts"


def should_notify(min_interval_seconds=5):
    """
    Check if enough time has passed since the last notification.

    Returns True if we should notify (interval exceeded or no previous record).
    """
    try:
        if _TIMESTAMP_FILE.exists():
            last_ts = float(_TIMESTAMP_FILE.read_text().strip())
            elapsed = time.time() - last_ts
            return elapsed >= min_interval_seconds
    except (ValueError, OSError):
        pass

    return True


def mark_notified():
    """Record the current time as the last notification timestamp."""
    try:
        # Atomic write: write to temp file, then rename
        fd, tmp_path = tempfile.mkstemp(
            dir=_TIMESTAMP_FILE.parent,
            prefix="claude-hooks-notify-",
        )
        try:
            os.write(fd, str(time.time()).encode())
        finally:
            os.close(fd)
        os.replace(tmp_path, str(_TIMESTAMP_FILE))
    except OSError:
        pass
