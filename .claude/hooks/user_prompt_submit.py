#!/usr/bin/env python3
"""
UserPromptSubmit Hook
Triggered when user submits a prompt.
Validates prompts and logs them for audit/analysis.
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
        from config import is_hook_enabled, get_logging_config
        return is_hook_enabled("user_prompt_submit"), get_logging_config()
    except ImportError:
        return True, {"enabled": True, "max_entries": 100}

def log_prompt(data, logging_config):
    """Log prompt to file."""
    if not logging_config.get("enabled", True):
        return

    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "user_prompt_submit.json"

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        hook_data = data.get("hookSpecificInput", {})
        prompt = hook_data.get("prompt", "")

        logs.append({
            "timestamp": datetime.now().isoformat(),
            "session_id": data.get("session_id", ""),
            "prompt_length": len(prompt),
            "prompt_preview": prompt[:100] + "..." if len(prompt) > 100 else prompt
        })

        # Keep last N entries
        max_entries = logging_config.get("max_entries", 100)
        logs = logs[-max_entries:]

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception:
        pass

def validate_prompt(prompt):
    """
    Validate prompt for security concerns.
    Returns (is_valid, reason) tuple.

    Customize blocked_patterns to add your own rules.
    """
    # Add patterns you want to block (currently empty - customize as needed)
    blocked_patterns = [
        # Example patterns (uncomment to enable):
        # r"ignore\s+previous\s+instructions",
        # r"pretend\s+you\s+are",
        # r"jailbreak",
    ]

    prompt_lower = prompt.lower()

    for pattern in blocked_patterns:
        if re.search(pattern, prompt_lower):
            return False, f"Blocked pattern detected"

    return True, None

def main():
    """Process user prompt submit hook."""
    try:
        data = json.load(sys.stdin)
        enabled, logging_config = load_config()

        if not enabled:
            sys.exit(0)

        # Log the prompt
        log_prompt(data, logging_config)

        # Validate if --validate flag is passed
        if "--validate" in sys.argv:
            hook_data = data.get("hookSpecificInput", {})
            prompt = hook_data.get("prompt", "")

            is_valid, reason = validate_prompt(prompt)

            if not is_valid:
                print(json.dumps({
                    "error": f"Prompt validation failed: {reason}"
                }))
                sys.exit(2)

        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
