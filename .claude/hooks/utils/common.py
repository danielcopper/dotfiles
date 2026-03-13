#!/usr/bin/env python3
"""
Common utilities for Claude Code hooks.
Shared functions for TTS, notifications, logging, and LLM message generation.
"""

import json
import os
import signal
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Session context — set by run_hook(), read by log_jsonl()
_session_context = {}


# =============================================================================
# Notifications (unified: toast + sounds + TTS + debounce)
# =============================================================================

def notify_all(title, message, event_type, tts_message=None):
    """
    Send all enabled notification types, respecting debounce.

    title: Toast notification title
    message: Toast notification body / fallback text
    event_type: Sound event type ("complete", "error", "attention", "subagent")
    tts_message: Optional override for TTS text (defaults to message)
    """
    try:
        from config import is_toast_enabled, is_sounds_enabled, is_tts_enabled, is_debounce_enabled, get_debounce_config

        # Check debounce first
        if is_debounce_enabled():
            from notify.debounce import should_notify, mark_notified
            debounce_cfg = get_debounce_config()
            interval = debounce_cfg.get("min_interval_seconds", 5)
            if not should_notify(interval):
                return

        # Toast notification
        if is_toast_enabled():
            try:
                from notify.toast import show_toast
                show_toast(title, message)
            except Exception as e:
                log_error("notify", f"Toast error: {e}")

        # Sound effect
        if is_sounds_enabled():
            try:
                from notify.sound import play_sound
                play_sound(event_type)
            except Exception as e:
                log_error("notify", f"Sound error: {e}")

        # TTS
        if is_tts_enabled():
            announce(tts_message or message)

        # Mark notified for debounce
        if is_debounce_enabled():
            from notify.debounce import mark_notified
            mark_notified()

    except Exception as e:
        log_error("notify_all", f"Error: {e}")


def run_in_background(fn):
    """
    Run fn in a forked background process. Returns immediately in parent.
    Use for fire-and-forget work (notifications, TTS) that shouldn't block the hook.
    """
    try:
        pid = os.fork()
    except OSError:
        fn()  # Fallback: run synchronously
        return

    if pid != 0:
        # Parent: don't wait for child, just return
        # Ignore SIGCHLD to auto-reap (avoid zombies)
        signal.signal(signal.SIGCHLD, signal.SIG_IGN)
        return

    # Child: detach stdio so we don't interfere with hook JSON output
    try:
        devnull_fd = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull_fd, 0)
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        if devnull_fd > 2:
            os.close(devnull_fd)
        fn()
    except Exception:
        pass
    finally:
        os._exit(0)


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
# Hook Runner
# =============================================================================

def run_hook(hook_name, handler_fn):
    """
    Standard wrapper for hook scripts. Eliminates boilerplate.

    Reads JSON from stdin, checks if hook is enabled, calls handler_fn(data),
    and handles output/errors consistently.

    handler_fn(data) should:
      - Return a dict to output as JSON to stdout
      - Return None for no output
      - Raise exceptions on error (they'll be caught and logged)
    """
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    # Capture session context for log correlation
    global _session_context
    _session_context = {
        "session_id": data.get("session_id", ""),
        "cwd": data.get("cwd", ""),
        "hook": hook_name,
    }

    try:
        from config import is_hook_enabled
        if not is_hook_enabled(hook_name):
            sys.exit(0)
    except ImportError:
        pass

    try:
        result = handler_fn(data)
        if isinstance(result, dict):
            print(json.dumps(result))
    except Exception as e:
        log_error(hook_name, f"Hook error: {e}")

    sys.exit(0)


# =============================================================================
# Logging
# =============================================================================

def log_error(hook_name, message):
    """Log error messages to file with rotation."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "hook_errors.log"

        # Rotate if too large
        try:
            from config import get_logging_config
            max_bytes = get_logging_config().get("error_log_max_bytes", 524288)
        except ImportError:
            max_bytes = 524288

        if log_file.exists() and log_file.stat().st_size > max_bytes:
            rotated = log_dir / "hook_errors.log.1"
            try:
                log_file.rename(rotated)
            except OSError:
                pass

        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] {hook_name}: {message}\n")
    except Exception:
        pass


def log_jsonl(filename, data, max_bytes=524288):
    """
    Log data as one JSON-per-line (JSONL). Append-only, rotates by file size.
    """
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / filename

    data['timestamp'] = datetime.now().isoformat()

    # Inject session context for log correlation
    if _session_context:
        for key in ("session_id", "cwd", "hook"):
            if key not in data and _session_context.get(key):
                data[key] = _session_context[key]

    try:
        # Rotate if file too large
        try:
            if log_file.stat().st_size > max_bytes:
                rotated = log_dir / (filename + ".1")
                log_file.rename(rotated)
        except OSError:
            pass

        with open(log_file, 'a') as f:
            f.write(json.dumps(data, separators=(',', ':')) + '\n')

        return True
    except Exception as e:
        log_error("common", f"JSON logging error: {e}")
        return False


# Backward compat alias
log_json = log_jsonl


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
