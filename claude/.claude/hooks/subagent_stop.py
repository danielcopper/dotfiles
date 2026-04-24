#!/usr/bin/env python3
"""
SubagentStop Hook
Triggered when a subagent completes its task.
Announces completion with varied LLM-generated messages.
"""

import json
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

from config import is_hook_enabled, is_tts_enabled
from common import announce, log_json, log_error, get_subagent_message


def should_announce(data):
    """Determine if we should announce this subagent completion."""
    try:
        hook_data = data.get("hookSpecificInput", {})
        agent_type = hook_data.get("subagentType", "")
        description = hook_data.get("description", "")

        # Skip background/startup agents
        skip_types = {"general-purpose"}
        if agent_type in skip_types:
            return False

        # Only announce if there's a meaningful description
        if description and len(description.strip()) > 5:
            return True

        return False
    except Exception:
        return False


def main():
    """Process subagent stop hook."""
    try:
        data = json.load(sys.stdin)

        hook_enabled, tts_enabled = is_hook_enabled("subagent_stop"), is_tts_enabled()
        if not hook_enabled:
            sys.exit(0)

        log_json("subagent_stop.json", data)

        if "--notify" in sys.argv and tts_enabled and should_announce(data):
            message = get_subagent_message()
            announce(message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        log_error("subagent_stop", f"Hook error: {e}")
        sys.exit(0)


if __name__ == "__main__":
    main()
