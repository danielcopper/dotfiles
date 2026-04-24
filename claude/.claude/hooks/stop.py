#!/usr/bin/env python3
"""
Stop Hook
Triggered when Claude finishes responding.
Announces task completion with varied LLM-generated messages.
"""

import json
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

from config import is_hook_enabled, is_tts_enabled
from common import announce, log_json, log_error, get_completion_message


def main():
    """Process stop hook."""
    try:
        data = json.load(sys.stdin)

        hook_enabled, tts_enabled = is_hook_enabled("stop"), is_tts_enabled()
        if not hook_enabled:
            sys.exit(0)

        log_json("stop.json", data)

        if "--notify" in sys.argv and tts_enabled:
            message = get_completion_message()
            announce(message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        log_error("stop", f"Hook error: {e}")
        sys.exit(0)


if __name__ == "__main__":
    main()
