#!/usr/bin/env python3
"""
Stop Hook
Triggered when Claude finishes responding.
Announces task completion with context about what was done.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

def log_completion(data):
    """Log completion data to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "stop.json"

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        data['timestamp'] = datetime.now().isoformat()
        logs.append(data)

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception as e:
        print(f"Logging error: {e}", file=sys.stderr)

def get_completion_message(data):
    """Generate contextual completion message based on what Claude did."""
    try:
        hook_data = data.get("hookSpecificInput", {})

        # Try to get information about what tools were used
        transcript = data.get("transcript", [])

        # Count tool uses
        tools_used = []
        for event in transcript:
            if isinstance(event, dict) and event.get("type") == "tool_use":
                tool_name = event.get("name", "")
                if tool_name and tool_name not in tools_used:
                    tools_used.append(tool_name)

        # Generate message based on tools used
        if "Write" in tools_used or "Edit" in tools_used:
            return "Code changes completed. Files have been modified."
        elif "Bash" in tools_used:
            return "Command execution completed."
        elif "Read" in tools_used and len(tools_used) == 1:
            return "File analysis complete."
        elif "Grep" in tools_used or "Glob" in tools_used:
            return "Search completed."
        elif "Task" in tools_used:
            return "Agent task completed."
        elif tools_used:
            return f"Task complete. Used: {', '.join(tools_used[:3])}."
        else:
            return "Response complete."

    except Exception as e:
        print(f"Message generation error: {e}", file=sys.stderr)
        return "Task complete."

def announce(message):
    """Announce message via TTS."""
    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            return

        subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=20,
            check=False,
            capture_output=True
        )
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)

def main():
    """Process stop hook."""
    try:
        data = json.load(sys.stdin)
        log_completion(data)

        if "--notify" in sys.argv:
            message = get_completion_message(data)
            announce(message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
