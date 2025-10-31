#!/usr/bin/env python3
"""
SubagentStop Hook
Triggered when a subagent completes its task.
Announces completion with subagent details.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

def log_subagent_completion(data):
    """Log subagent completion data to file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "subagent_stop.json"

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

def get_subagent_message(data):
    """Generate subagent completion message - tries LLM first, falls back to simple default."""
    # Try LLM-generated message
    llm_message = get_llm_completion_message()
    if llm_message:
        return llm_message

    # Fallback to simple message
    return "Subagent complete!"

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
            f.write(f"[{timestamp}] subagent_stop: {message}\n")
    except Exception:
        pass  # Fail silently if we can't log

def should_announce(data):
    """Determine if we should announce this subagent completion."""
    try:
        hook_data = data.get("hookSpecificInput", {})
        agent_type = hook_data.get("subagentType", "")
        description = hook_data.get("description", "")

        # Skip agents that are likely background/startup agents
        skip_types = {"general-purpose"}  # Add more types to skip if needed

        if agent_type in skip_types:
            return False

        # Only announce if there's a meaningful description
        # This filters out startup/background agents
        if description and len(description.strip()) > 5:
            return True

        return False

    except Exception:
        return False

def main():
    """Process subagent stop hook."""
    try:
        data = json.load(sys.stdin)
        log_subagent_completion(data)

        if "--notify" in sys.argv and should_announce(data):
            message = get_subagent_message(data)
            announce(message)

    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
