#!/usr/bin/env python3
"""
Notification Hook
Triggered when Claude needs user input or sends notifications.
Announces via TTS with detailed context.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

def log_notification(data):
    """Log notification data to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "notification.json"

    try:
        # Read existing logs
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        # Add timestamp
        data['timestamp'] = datetime.now().isoformat()

        # Append new log
        logs.append(data)

        # Write back
        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception as e:
        print(f"Logging error: {e}", file=sys.stderr)

def announce(message):
    """Announce message via TTS."""
    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            log_error("TTS script not found")
            return

        result = subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=20,
            check=False,
            capture_output=False  # Don't suppress output - let errors show
        )

        if result.returncode != 0:
            log_error(f"TTS failed with exit code {result.returncode}")
    except subprocess.TimeoutExpired:
        log_error("TTS timeout after 20 seconds")
    except Exception as e:
        log_error(f"TTS error: {e}")

def log_error(message):
    """Log error messages to file."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "hook_errors.log"

        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] notification: {message}\n")
    except Exception:
        pass  # Fail silently if we can't log

def main():
    """Process notification hook."""
    try:
        # Read JSON from stdin
        data = json.load(sys.stdin)

        # Log the notification
        log_notification(data)

        # Check if TTS is enabled via command line flag
        if "--notify" in sys.argv:
            # Get notification details
            hook_data = data.get("hookSpecificInput", {})
            notification_type = hook_data.get("type", "unknown")
            message_text = hook_data.get("message", "")

            # Skip generic waiting messages
            if "waiting" in message_text.lower() and "claude" in message_text.lower():
                return

            # Create contextual message based on notification type
            if notification_type == "permission_needed":
                tts_message = "Permission needed. Please review the request."
            elif notification_type == "user_input_needed":
                tts_message = "Input needed. Claude is waiting for your response."
            elif "question" in message_text.lower():
                tts_message = "Question ready. Please provide your answer."
            elif message_text:
                # Use first sentence of the message
                first_sentence = message_text.split('.')[0][:100]
                tts_message = f"Notification: {first_sentence}"
            else:
                tts_message = "Claude needs your attention."

            announce(tts_message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
