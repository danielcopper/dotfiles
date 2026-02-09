#!/usr/bin/env python3
"""
UserPromptSubmit Hook
Triggered when user submits a prompt.
Validates prompts and logs them for audit/analysis.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl


def _log_prompt(data):
    """Log prompt preview to file."""
    hook_data = data.get("hookSpecificInput", {})
    prompt = hook_data.get("prompt", "")

    log_jsonl("user_prompt_submit.json", {
        "session_id": data.get("session_id", ""),
        "prompt_length": len(prompt),
        "prompt_preview": prompt[:100] + "..." if len(prompt) > 100 else prompt,
    })


def _validate_prompt(prompt):
    """
    Validate prompt for security concerns.
    Returns (is_valid, reason) tuple.
    """
    blocked_patterns = [
        # Example patterns (uncomment to enable):
        # r"ignore\s+previous\s+instructions",
        # r"pretend\s+you\s+are",
        # r"jailbreak",
    ]

    prompt_lower = prompt.lower()
    for pattern in blocked_patterns:
        if re.search(pattern, prompt_lower):
            return False, "Blocked pattern detected"

    return True, None


def _check_auto_resume():
    """
    Check if /implement workflow needs auto-resume after compact/clear.
    Returns systemMessage if auto-resume is needed, None otherwise.
    """
    marker_file = Path.home() / ".claude" / "feature-progress" / ".auto-resume"

    if not marker_file.exists():
        return None

    try:
        state_file_path = marker_file.read_text().strip()
        marker_file.unlink()

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
        try:
            marker_file.unlink()
        except Exception:
            pass
        return None


def handle_user_prompt_submit(data):
    _log_prompt(data)

    # Check for /implement auto-resume
    auto_resume_msg = _check_auto_resume()
    if auto_resume_msg:
        return {"systemMessage": auto_resume_msg}

    # Validate if --validate flag is passed
    if "--validate" in sys.argv:
        hook_data = data.get("hookSpecificInput", {})
        prompt = hook_data.get("prompt", "")

        is_valid, reason = _validate_prompt(prompt)
        if not is_valid:
            return {"error": f"Prompt validation failed: {reason}"}

    return None


if __name__ == "__main__":
    run_hook("user_prompt_submit", handle_user_prompt_submit)
