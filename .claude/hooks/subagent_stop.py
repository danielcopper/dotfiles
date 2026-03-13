#!/usr/bin/env python3
"""
SubagentStop Hook
Triggered when a subagent completes its task.
Announces completion with toast, sound, and optional TTS.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl, notify_all, run_in_background, get_subagent_message


def handle_subagent_stop(data):
    log_jsonl("subagent_stop.json", data)

    if "--notify" in sys.argv:
        hook_data = data.get("hookSpecificInput", {})
        agent_type = hook_data.get("subagentType", "")
        description = hook_data.get("description", "")

        # Skip background/startup agents
        if agent_type in ("general-purpose",):
            return None

        # Only announce if there's a meaningful description
        if description and len(description.strip()) > 5:
            run_in_background(lambda: _do_notify())

    return None


def _do_notify():
    message = get_subagent_message()
    notify_all("Claude Code", message, "subagent", tts_message=message)


if __name__ == "__main__":
    run_hook("subagent_stop", handle_subagent_stop)
