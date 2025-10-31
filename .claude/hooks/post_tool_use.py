#!/usr/bin/env python3
"""
PostToolUse Hook
Triggered after tool execution completes.
Detects and announces errors/warnings.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

def log_tool_use(data):
    """Log tool use data to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "post_tool_use.json"

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        data['timestamp'] = datetime.now().isoformat()
        logs.append(data)

        # Keep only last 100 entries to prevent log bloat
        logs = logs[-100:]

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception as e:
        print(f"Logging error: {e}", file=sys.stderr)

def check_for_errors(data):
    """Check if tool execution had errors or warnings."""
    try:
        hook_data = data.get("hookSpecificInput", {})
        tool_name = hook_data.get("tool_name", "unknown")
        tool_result = hook_data.get("tool_result", {})

        # Check for error indicators
        if isinstance(tool_result, dict):
            # Check for error field
            if tool_result.get("error"):
                error_msg = tool_result.get("error", "Unknown error")
                return True, f"{tool_name} error: {error_msg[:50]}"

            # Check for stderr in bash results
            if "stderr" in tool_result and tool_result["stderr"]:
                stderr = tool_result["stderr"]
                if any(word in stderr.lower() for word in ["error", "fatal", "failed", "exception"]):
                    return True, f"{tool_name} command failed with errors"

            # Check for non-zero exit codes
            if "exit_code" in tool_result and tool_result["exit_code"] != 0:
                return True, f"{tool_name} exited with code {tool_result['exit_code']}"

        # Check string results for error keywords
        if isinstance(tool_result, str):
            lower_result = tool_result.lower()
            if any(word in lower_result for word in ["error:", "fatal:", "exception:", "traceback"]):
                return True, f"{tool_name} encountered an error"

        return False, None

    except Exception as e:
        print(f"Error checking error: {e}", file=sys.stderr)
        return False, None

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
    """Process post tool use hook."""
    try:
        data = json.load(sys.stdin)
        log_tool_use(data)

        if "--notify" in sys.argv:
            has_error, error_msg = check_for_errors(data)

            if has_error and error_msg:
                announce(f"Warning: {error_msg}")

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
