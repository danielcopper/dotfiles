#!/usr/bin/env python3
"""
Notification Hook
Triggered when Claude needs user input or sends notifications.
Announces via TTS with varied LLM-generated messages.
"""

import json
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

from config import is_hook_enabled, is_tts_enabled
from common import announce, log_json, log_error, get_notification_message


def main():
    """Process notification hook."""
    try:
        data = json.load(sys.stdin)

        hook_enabled, tts_enabled = is_hook_enabled("notification"), is_tts_enabled()
        if not hook_enabled:
            sys.exit(0)

        # Log the notification
        log_json("notification.json", data)

        # Announce if TTS enabled
        if "--notify" in sys.argv and tts_enabled:
            hook_data = data.get("hookSpecificInput", {})
            notification_type = hook_data.get("type", "unknown")
            message_text = hook_data.get("message", "")

            # Skip generic waiting messages
            if "waiting" in message_text.lower() and "claude" in message_text.lower():
                return

            # Map to notification type for LLM
            if "question" in message_text.lower():
                notification_type = "question"

            tts_message = get_notification_message(notification_type)
            announce(tts_message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        log_error("notification", f"Hook error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
