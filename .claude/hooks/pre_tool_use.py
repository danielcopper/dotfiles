#!/usr/bin/env python3
"""
PreToolUse Hook - Security Guard
Intercepts tool calls before execution to block dangerous operations.

Output format: JSON with hookSpecificOutput containing permissionDecision.
Always exits 0 — decision communicated via stdout JSON.
"""

import json
import os
import re
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

from config import get_security_config, get_auto_approve_config
from common import run_hook, log_jsonl, log_error


def _make_decision(decision, reason):
    """Build the hook-specific output dict."""
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }


def _normalize_command(command):
    """Normalize a command string for pattern matching."""
    home = os.path.expanduser("~")
    normalized = command.replace("$HOME", home)
    normalized = normalized.replace("${HOME}", home)
    normalized = normalized.replace("~", home)

    # Strip common path prefixes
    for prefix in ("/usr/bin/", "/bin/", "/usr/local/bin/", "/usr/sbin/", "/sbin/"):
        normalized = normalized.replace(prefix, "")

    return normalized


def _check_subshell_in_rm(command):
    """Detect $(…) or backticks in rm context."""
    if not re.search(r'\brm\b', command, re.IGNORECASE):
        return False
    if re.search(r'\$\(', command) or re.search(r'`[^`]+`', command):
        return True
    return False


def _is_dangerous_command(command, config):
    """Check if command matches any dangerous pattern."""
    if not config.get("block_dangerous_commands", True):
        return False, None

    normalized = _normalize_command(command)
    normalized_lower = normalized.lower()

    # Check configured dangerous patterns (case-insensitive)
    patterns = config.get("dangerous_patterns", [])
    for pattern in patterns:
        pat_lower = pattern.lower()
        # Direct substring match
        if pat_lower in normalized_lower:
            return True, f"Blocked dangerous pattern: {pattern}"
        # For pipe patterns like "curl | sh", check with regex
        # allowing arbitrary args between the command and the pipe
        if "|" in pat_lower:
            parts = [p.strip() for p in pat_lower.split("|", 1)]
            if len(parts) == 2:
                regex = re.escape(parts[0]) + r'.*\|\s*' + re.escape(parts[1])
                if re.search(regex, normalized_lower):
                    return True, f"Blocked dangerous pattern: {pattern}"

    # Check for rm with recursive flags targeting dangerous paths
    blocked_paths = config.get("blocked_paths", [])
    rm_match = re.search(
        r'\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+)+(.+)',
        normalized,
    )
    if rm_match:
        target = rm_match.group(2).strip()
        for bp in blocked_paths:
            if target == bp or target.startswith(bp + "/"):
                # Allow /home/user paths
                if "/home/" in target:
                    continue
                return True, f"Blocked recursive delete on: {bp}"

    # rm -rf with wildcards
    if re.search(r'\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+\*', normalized):
        return True, "Blocked recursive delete with wildcard"

    # Subshell expansion in rm
    if _check_subshell_in_rm(normalized):
        return True, "Blocked rm with subshell expansion"

    return False, None


def _check_sensitive_files(tool_name, input_data, config):
    """Check if operation accesses sensitive files using regex patterns."""
    if not config.get("protect_sensitive_files", True):
        return False, None

    file_tools = {"Read", "Edit", "Write", "Bash"}
    if tool_name not in file_tools:
        return False, None

    # Gather all paths to check
    paths_to_check = []
    if isinstance(input_data, dict):
        for key in ("file_path", "path", "command"):
            val = input_data.get(key, "")
            if val:
                paths_to_check.append(val)
    elif isinstance(input_data, str):
        paths_to_check.append(input_data)

    patterns = config.get("sensitive_file_patterns", [])
    for path_str in paths_to_check:
        for pattern in patterns:
            if re.search(pattern, path_str, re.IGNORECASE):
                return True, f"Blocked access to sensitive file matching: {pattern}"

    return False, None


def _check_blocked_paths(tool_name, input_data, config):
    """Check if operation targets blocked paths for write operations."""
    blocked = config.get("blocked_paths", [])
    if not blocked:
        return False, None

    file_path = ""
    if isinstance(input_data, dict):
        file_path = input_data.get("file_path", "") or input_data.get("path", "")
    elif isinstance(input_data, str):
        file_path = input_data

    if not file_path:
        return False, None

    if tool_name in ("Write", "Edit"):
        normalized = _normalize_command(file_path)
        for blocked_path in blocked:
            if normalized == blocked_path or normalized.startswith(blocked_path + "/"):
                if "/home/" in normalized or normalized.startswith(os.path.expanduser("~")):
                    continue
                return True, f"Blocked write to protected path: {blocked_path}"

    return False, None


def _check_auto_approve(tool_name, input_data, cwd):
    """Check if operation can be auto-approved as a safe read."""
    auto_cfg = get_auto_approve_config()
    if not auto_cfg.get("safe_reads", True):
        return False

    safe_read_tools = {"Read", "Glob", "Grep"}
    if tool_name not in safe_read_tools:
        return False

    # Get the path being accessed
    file_path = ""
    if isinstance(input_data, dict):
        file_path = input_data.get("file_path", "") or input_data.get("path", "") or input_data.get("pattern", "")

    if not file_path:
        return True  # No path to check, allow

    # Project paths only check
    if auto_cfg.get("project_paths_only", True) and cwd:
        resolved = str(Path(file_path).resolve()) if file_path.startswith("/") else file_path
        cwd_resolved = str(Path(cwd).resolve())
        if resolved.startswith(cwd_resolved):
            return True

    return False


def handle_pre_tool_use(data):
    """Main handler for pre-tool-use events."""
    hook_data = data.get("hookSpecificInput", {})
    tool_name = hook_data.get("tool_name", "")
    tool_input = hook_data.get("tool_input", {})
    cwd = data.get("cwd", "")

    security_config = get_security_config()

    # Check for auto-approve (safe reads)
    if _check_auto_approve(tool_name, tool_input, cwd):
        log_jsonl("pre_tool_use.json", {
            "event": "auto_approved",
            "tool": tool_name,
        })
        return _make_decision("allow", "Safe read operation in project directory")

    # Check Bash commands for dangerous patterns
    if tool_name == "Bash":
        command = tool_input.get("command", "") if isinstance(tool_input, dict) else str(tool_input)
        blocked, reason = _is_dangerous_command(command, security_config)
        if blocked:
            log_jsonl("pre_tool_use.json", {
                "event": "blocked",
                "tool": tool_name,
                "reason": reason,
            })
            return _make_decision("deny", reason)

        # Hard blocks from agent-tools
        try:
            _at = str(Path.home() / ".agent-tools" / "lib")
            if _at not in sys.path:
                sys.path.insert(0, _at)
            from command_checker import check_command
            result = check_command(command)
            if result["blocked"]:
                log_jsonl("pre_tool_use.json", {
                    "event": "blocked_by_agent_tools",
                    "tool": tool_name,
                    "reason": result["reason"],
                    "policy": result["policy"],
                })
                if result["policy"] == "deny":
                    return _make_decision("deny", result["reason"])
                # policy == "warn": return None → Claude shows its own "ask" prompt
        except ImportError:
            pass  # agent-tools not installed

    # Check sensitive file access
    blocked, reason = _check_sensitive_files(tool_name, tool_input, security_config)
    if blocked:
        log_jsonl("pre_tool_use.json", {
            "event": "blocked",
            "tool": tool_name,
            "reason": reason,
        })
        return _make_decision("deny", reason)

    # Check blocked paths for write operations
    blocked, reason = _check_blocked_paths(tool_name, tool_input, security_config)
    if blocked:
        log_jsonl("pre_tool_use.json", {
            "event": "blocked",
            "tool": tool_name,
            "reason": reason,
        })
        return _make_decision("deny", reason)

    # Log allowed operations
    log_jsonl("pre_tool_use.json", {
        "event": "allowed",
        "tool": tool_name,
    })

    return None


if __name__ == "__main__":
    run_hook("pre_tool_use", handle_pre_tool_use)
