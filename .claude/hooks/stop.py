#!/usr/bin/env python3
"""
Stop Hook
Triggered when Claude finishes responding.
Announces task completion with toast, sound, and optional TTS.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl, notify_all, get_completion_message


def handle_stop(data):
    log_jsonl("stop.json", data)

    if "--notify" in sys.argv:
        message = get_completion_message()
        notify_all("Claude Code", message, "complete", tts_message=message)

    return None


if __name__ == "__main__":
    run_hook("stop", handle_stop)
