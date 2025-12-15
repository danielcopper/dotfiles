#!/usr/bin/env python3
"""
PreToolUse Hook - Security Guard
Intercepts tool calls before execution to block dangerous operations.
Protects against: rm -rf, .env file access, and other destructive commands.
"""

import json
import sys
import re
from pathlib import Path
from datetime import datetime

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

def load_config():
    """Load hook configuration."""
    try:
        from config import is_hook_enabled, get_security_config
        return is_hook_enabled("pre_tool_use"), get_security_config()
    except ImportError:
        return True, {
            "block_dangerous_commands": True,
            "protect_env_files": True,
            "blocked_paths": ["/", "/etc", "/usr"],
            "dangerous_patterns": ["rm -rf", "rm -fr", "rm -r /", "mkfs", "dd if=", "> /dev/sd"]
        }

def log_event(event_type, details):
    """Log security events to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "pre_tool_use.json"

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        logs.append({
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            "details": details
        })

        # Keep last 100 entries
        logs = logs[-100:]

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception:
        pass

def is_dangerous_rm_command(command, config):
    """Check if command is a dangerous rm operation."""
    if not config.get("block_dangerous_commands", True):
        return False, None

    patterns = config.get("dangerous_patterns", [])
    command_lower = command.lower()

    for pattern in patterns:
        if pattern.lower() in command_lower:
            return True, f"Blocked dangerous pattern: {pattern}"

    # Check for rm with recursive flags targeting dangerous paths
    rm_pattern = r'rm\s+(-[rfRF]+\s+)*(/|~|\*|/home|/root|/etc|/usr|/var|/boot)'
    if re.search(rm_pattern, command):
        return True, "Blocked recursive delete on sensitive path"

    # Check for rm -rf with wildcards
    if re.search(r'rm\s+-[rfRF]*\s+\*', command):
        return True, "Blocked recursive delete with wildcard"

    return False, None

def is_env_file_access(tool_name, input_data, config):
    """Check if operation accesses .env files."""
    if not config.get("protect_env_files", True):
        return False, None

    # Tools that access files
    file_tools = ["Read", "Edit", "Write", "Bash"]
    if tool_name not in file_tools:
        return False, None

    # Get the file path from various input formats
    file_path = ""
    if isinstance(input_data, dict):
        file_path = input_data.get("file_path", "") or input_data.get("path", "") or input_data.get("command", "")
    elif isinstance(input_data, str):
        file_path = input_data

    # Check for .env file access (but allow .env.example, .env.sample)
    if re.search(r'\.env(?!\.example|\.sample|\.template)', file_path):
        return True, "Blocked access to .env file"

    return False, None

def check_blocked_paths(tool_name, input_data, config):
    """Check if operation targets blocked paths."""
    blocked = config.get("blocked_paths", [])
    if not blocked:
        return False, None

    file_path = ""
    if isinstance(input_data, dict):
        file_path = input_data.get("file_path", "") or input_data.get("path", "")
    elif isinstance(input_data, str):
        file_path = input_data

    # Only block exact matches to root paths for write operations
    if tool_name in ["Write", "Edit"]:
        for blocked_path in blocked:
            if file_path == blocked_path or file_path.startswith(blocked_path + "/"):
                # But allow /home/user paths
                if "/home/" in file_path or file_path.startswith("~"):
                    continue
                return True, f"Blocked write to protected path: {blocked_path}"

    return False, None

def main():
    """Process pre-tool-use hook."""
    try:
        data = json.load(sys.stdin)
        enabled, security_config = load_config()

        if not enabled:
            sys.exit(0)

        hook_data = data.get("hookSpecificInput", {})
        tool_name = hook_data.get("tool_name", "")
        tool_input = hook_data.get("tool_input", {})

        # Check for dangerous operations
        blocked = False
        reason = None

        # Check Bash commands
        if tool_name == "Bash":
            command = tool_input.get("command", "") if isinstance(tool_input, dict) else str(tool_input)
            blocked, reason = is_dangerous_rm_command(command, security_config)

        # Check .env file access
        if not blocked:
            blocked, reason = is_env_file_access(tool_name, tool_input, security_config)

        # Check blocked paths
        if not blocked:
            blocked, reason = check_blocked_paths(tool_name, tool_input, security_config)

        # Log the event
        log_event("blocked" if blocked else "allowed", {
            "tool": tool_name,
            "blocked": blocked,
            "reason": reason
        })

        if blocked:
            # Exit code 2 blocks the tool with an error message
            print(json.dumps({
                "error": f"Security block: {reason}"
            }))
            sys.exit(2)

        # Exit 0 allows the tool to proceed
        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)  # Allow on parse error
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(0)  # Allow on error (fail open)

if __name__ == "__main__":
    main()
