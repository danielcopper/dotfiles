#!/usr/bin/env python3
"""
SubagentStart Hook
Triggered when a subagent is launched.
Logs agent type and description (no notification — too noisy).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl


def handle_subagent_start(data):
    hook_data = data.get("hookSpecificInput", {})

    log_jsonl("subagent_start.json", {
        "session_id": data.get("session_id", ""),
        "agent_type": hook_data.get("subagentType", ""),
        "description": hook_data.get("description", ""),
    })

    return None


if __name__ == "__main__":
    run_hook("subagent_start", handle_subagent_start)
