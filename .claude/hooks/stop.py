#!/usr/bin/env python3
"""
Stop Hook
Triggered when Claude finishes responding.
Announces task completion with context about what was done.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

def log_completion(data):
    """Log completion data to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "stop.json"

    try:
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = []

        data['timestamp'] = datetime.now().isoformat()
        logs.append(data)

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    except Exception as e:
        print(f"Logging error: {e}", file=sys.stderr)

def get_llm_completion_message():
    """Try to generate completion message using LLM."""
    try:
        llm_script = Path.home() / ".claude" / "hooks" / "utils" / "llm" / "openai_completion.py"
        if not llm_script.exists():
            return None

        result = subprocess.run(
            [sys.executable, str(llm_script)],
            timeout=10,
            check=False,
            capture_output=True,
            text=True
        )

        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    except subprocess.TimeoutExpired:
        print("LLM completion timeout", file=sys.stderr)
    except Exception as e:
        print(f"LLM completion error: {e}", file=sys.stderr)

    return None

def get_completion_message(data):
    """Generate completion message - tries LLM first, falls back to simple default."""
    # Try LLM-generated message
    llm_message = get_llm_completion_message()
    if llm_message:
        return llm_message

    # Fallback to simple generic message
    return "Task complete!"

def announce(message):
    """Announce message via TTS."""
    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            log_error("TTS script not found")
            return

        result = subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=20,
            check=False,
            capture_output=False  # Don't suppress output - let errors show
        )

        if result.returncode != 0:
            log_error(f"TTS failed with exit code {result.returncode}")
    except subprocess.TimeoutExpired:
        log_error("TTS timeout after 20 seconds")
    except Exception as e:
        log_error(f"TTS error: {e}")

def log_error(message):
    """Log error messages to file."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "hook_errors.log"

        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] stop: {message}\n")
    except Exception:
        pass  # Fail silently if we can't log

def main():
    """Process stop hook."""
    try:
        data = json.load(sys.stdin)
        log_completion(data)

        if "--notify" in sys.argv:
            message = get_completion_message(data)
            announce(message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
