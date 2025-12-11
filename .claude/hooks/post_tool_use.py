#!/usr/bin/env python3
"""
PostToolUse Hook
Triggered after tool execution completes.
Detects and announces errors/warnings.
"""

import json
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

from config import is_hook_enabled, is_tts_enabled
from common import announce, log_json, log_error


def check_for_errors(data):
    """Check if tool execution had errors or warnings."""
    try:
        hook_data = data.get("hookSpecificInput", {})
        tool_name = hook_data.get("tool_name", "unknown")
        tool_result = hook_data.get("tool_result", {})

        if isinstance(tool_result, dict):
            if tool_result.get("error"):
                error_msg = tool_result.get("error", "Unknown error")
                return True, f"{tool_name} error: {error_msg[:50]}"

            if "stderr" in tool_result and tool_result["stderr"]:
                stderr = tool_result["stderr"]
                if any(word in stderr.lower() for word in ["error", "fatal", "failed", "exception"]):
                    return True, f"{tool_name} command failed with errors"

            if "exit_code" in tool_result and tool_result["exit_code"] != 0:
                return True, f"{tool_name} exited with code {tool_result['exit_code']}"

        if isinstance(tool_result, str):
            lower_result = tool_result.lower()
            if any(word in lower_result for word in ["error:", "fatal:", "exception:", "traceback"]):
                return True, f"{tool_name} encountered an error"

        return False, None

    except Exception as e:
        log_error("post_tool_use", f"Error checking error: {e}")
        return False, None


def main():
    """Process post tool use hook."""
    try:
        data = json.load(sys.stdin)

        hook_enabled, tts_enabled = is_hook_enabled("post_tool_use"), is_tts_enabled()
        if not hook_enabled:
            sys.exit(0)

        log_json("post_tool_use.json", data)

        if "--notify" in sys.argv and tts_enabled:
            has_error, error_msg = check_for_errors(data)
            if has_error and error_msg:
                announce(f"Warning: {error_msg}")

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        log_error("post_tool_use", f"Hook error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
