#!/usr/bin/env python3
"""
Notification Hook
Triggered when Claude needs user input or sends notifications.
Announces via toast, sound, and optional TTS with varied messages.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl, notify_all, get_notification_message


def handle_notification(data):
    log_jsonl("notification.json", data)

    if "--notify" in sys.argv:
        hook_data = data.get("hookSpecificInput", {})
        notification_type = hook_data.get("type", "unknown")
        message_text = hook_data.get("message", "")

        # Skip generic waiting messages
        if "waiting" in message_text.lower() and "claude" in message_text.lower():
            return None

        # Map to notification type for LLM
        if "question" in message_text.lower():
            notification_type = "question"

        tts_message = get_notification_message(notification_type)
        notify_all("Claude Code", tts_message, "attention", tts_message=tts_message)

    return None


if __name__ == "__main__":
    run_hook("notification", handle_notification)
