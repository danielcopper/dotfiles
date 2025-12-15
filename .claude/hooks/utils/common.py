#!/usr/bin/env python3
"""
Common utilities for Claude Code hooks.
Shared functions for TTS, logging, and LLM message generation.
"""

import json
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime


# =============================================================================
# TTS
# =============================================================================

def announce(message, timeout=20):
    """Announce message via TTS."""
    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            log_error("common", "TTS script not found")
            return False

        result = subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=timeout,
            check=False,
            capture_output=False
        )

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        log_error("common", f"TTS timeout after {timeout} seconds")
        return False
    except Exception as e:
        log_error("common", f"TTS error: {e}")
        return False


# =============================================================================
# Logging
# =============================================================================

def log_error(hook_name, message):
    """Log error messages to file."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "hook_errors.log"

        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] {hook_name}: {message}\n")
    except Exception:
        pass


def log_json(filename, data, max_entries=100):
    """Log data to a JSON file with rotation."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / filename

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        data['timestamp'] = datetime.now().isoformat()
        logs.append(data)
        logs = logs[-max_entries:]

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

        return True
    except Exception as e:
        log_error("common", f"JSON logging error: {e}")
        return False


# =============================================================================
# LLM Message Generation
# =============================================================================

def generate_llm_message(prompt_type, custom_prompt=None):
    """
    Generate a varied message using LLM.

    prompt_type: One of 'completion', 'notification_permission',
                 'notification_input', 'notification_question',
                 'notification_default', 'subagent', or 'custom'
    custom_prompt: Custom prompt string (required if prompt_type is 'custom')

    Returns: Generated message string, or None on failure
    """
    try:
        from openai import OpenAI

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None

        client = OpenAI(api_key=api_key)
        engineer_name = os.getenv("ENGINEER_NAME", "")

        prompts = {
            "completion": """Generate a short, friendly completion message (under 10 words) that is positive and future focused.
Examples: "Ready for the next challenge!", "All set! What's next?", "Done and dusted! Let's keep going." """,

            "notification_permission": "Generate a short, friendly message (under 10 words) asking someone to review a permission request. Be varied and natural.",

            "notification_input": "Generate a short, friendly message (under 10 words) letting someone know their input is needed. Be varied and natural.",

            "notification_question": "Generate a short, friendly message (under 10 words) letting someone know there's a question waiting. Be varied and natural.",

            "notification_default": "Generate a short, friendly message (under 10 words) to get someone's attention politely. Be varied and natural.",

            "subagent": "Generate a short, friendly message (under 10 words) announcing a sub-task has completed. Be varied and natural.",
        }

        if prompt_type == "custom" and custom_prompt:
            prompt = custom_prompt
        else:
            prompt = prompts.get(prompt_type, prompts["completion"])

        if engineer_name:
            prompt += f"\n\nOptionally personalize it for {engineer_name}."

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
            temperature=0.9
        )

        message = response.choices[0].message.content.strip()
        message = message.strip('"').strip("'")
        return message

    except Exception as e:
        log_error("common", f"LLM generation error: {e}")
        return None


def get_completion_message():
    """Get a task completion message (convenience wrapper)."""
    return generate_llm_message("completion") or "Task complete!"


def get_notification_message(notification_type):
    """Get a notification message based on type (convenience wrapper)."""
    type_map = {
        "permission_needed": "notification_permission",
        "user_input_needed": "notification_input",
        "question": "notification_question",
    }
    prompt_type = type_map.get(notification_type, "notification_default")

    fallbacks = {
        "notification_permission": "Permission needed. Please review.",
        "notification_input": "Input needed. Waiting for you.",
        "notification_question": "Question ready for you.",
        "notification_default": "Attention needed.",
    }

    return generate_llm_message(prompt_type) or fallbacks.get(prompt_type, "Attention needed.")


def get_subagent_message():
    """Get a subagent completion message (convenience wrapper)."""
    return generate_llm_message("subagent") or "Subagent complete!"
