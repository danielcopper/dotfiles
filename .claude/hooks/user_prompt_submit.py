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
    """Log prompt to JSONL file."""
    if not logging_config.get("enabled", True):
        return

    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "user_prompt_submit.jsonl"

    try:
        hook_data = data.get("hookSpecificInput", {})
        prompt = hook_data.get("prompt", "")
        entry = {
            "timestamp": datetime.now().isoformat(),
            "session_id": data.get("session_id", ""),
            "prompt_length": len(prompt),
            "prompt_preview": prompt[:100] + "..." if len(prompt) > 100 else prompt
        }
        with open(log_file, 'a') as f:
            f.write(json.dumps(entry) + "\n")
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


def check_auto_resume():
    """
    Check if /implement workflow needs auto-resume after compact/clear.
    Returns systemMessage if auto-resume is needed, None otherwise.
    """
    marker_file = Path.home() / ".claude" / "feature-progress" / ".auto-resume"

    if not marker_file.exists():
        return None

    try:
        state_file_path = marker_file.read_text().strip()

        # Delete the marker file immediately to prevent re-triggering
        marker_file.unlink()

        # Verify the state file exists
        if state_file_path and Path(state_file_path).exists():
            return (
                f"IMPORTANT: The /implement workflow was interrupted for context compaction. "
                f"You MUST immediately run `/implement --resume` to continue the workflow. "
                f"State file: {state_file_path}. "
                f"Do this BEFORE responding to anything else the user said."
            )
        else:
            return (
                "IMPORTANT: The /implement workflow was interrupted for context compaction. "
                "Run `/implement --resume` to continue (if there's a recent state file in ~/.claude/feature-progress/)."
            )

    except Exception:
        # If anything goes wrong, try to clean up the marker
        try:
            marker_file.unlink()
        except Exception:
            pass
        return None

def main():
    """Process user prompt submit hook."""
    try:
        data = json.load(sys.stdin)
        enabled, logging_config = load_config()

        if not enabled:
            sys.exit(0)

        # Log the prompt
        log_prompt(data, logging_config)

        # Check for /implement auto-resume after compact/clear
        auto_resume_msg = check_auto_resume()
        if auto_resume_msg:
            print(json.dumps({
                "systemMessage": auto_resume_msg
            }))
            sys.exit(0)

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
