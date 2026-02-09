#!/usr/bin/env python3
"""
PostToolUse Hook
Triggered after tool execution completes.
Detects errors/warnings and sends notifications.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl, notify_all, log_error


def _check_for_errors(data):
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
                if any(word in stderr.lower() for word in ("error", "fatal", "failed", "exception")):
                    return True, f"{tool_name} command failed with errors"

            if "exit_code" in tool_result and tool_result["exit_code"] != 0:
                return True, f"{tool_name} exited with code {tool_result['exit_code']}"

        if isinstance(tool_result, str):
            lower_result = tool_result.lower()
            if any(word in lower_result for word in ("error:", "fatal:", "exception:", "traceback")):
                return True, f"{tool_name} encountered an error"

        return False, None

    except Exception as e:
        log_error("post_tool_use", f"Error checking errors: {e}")
        return False, None


def handle_post_tool_use(data):
    log_jsonl("post_tool_use.json", data)

    if "--notify" in sys.argv:
        has_error, error_msg = _check_for_errors(data)
        if has_error and error_msg:
            notify_all("Claude Code", f"Warning: {error_msg}", "error", tts_message=f"Warning: {error_msg}")

    return None


if __name__ == "__main__":
    run_hook("post_tool_use", handle_post_tool_use)
