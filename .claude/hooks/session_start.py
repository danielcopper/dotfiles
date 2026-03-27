#!/usr/bin/env python3
"""
SessionStart Hook
Triggered when a Claude Code session starts, resumes, or clears.
Loads development context and announces session start.
"""

import json
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

def load_config():
    """Load hook configuration."""
    try:
        from config import is_hook_enabled, is_tts_enabled
        return is_hook_enabled("session_start"), is_tts_enabled()
    except ImportError:
        return True, True

def log_session(data):
    """Log session start to JSONL file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "session_start.jsonl"

    try:
        hook_data = data.get("hookSpecificInput", {})
        entry = {
            "timestamp": datetime.now().isoformat(),
            "session_id": data.get("session_id", ""),
            "source": hook_data.get("source", "unknown"),
            "cwd": data.get("cwd", "")
        }
        with open(log_file, 'a') as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass

def get_git_info():
    """Get current git branch and status."""
    try:
        # Get current branch
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=5
        )
        branch = result.stdout.strip() if result.returncode == 0 else None

        # Get uncommitted file count
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        uncommitted = len(result.stdout.strip().split('\n')) if result.stdout.strip() else 0

        return branch, uncommitted
    except Exception:
        return None, 0

def get_context_files():
    """Load context from standard files."""
    context_parts = []

    # Check for context files in priority order
    context_files = [
        Path.cwd() / ".claude" / "CONTEXT.md",
        Path.cwd() / "CONTEXT.md",
        Path.cwd() / "TODO.md",
    ]

    for ctx_file in context_files:
        if ctx_file.exists():
            try:
                content = ctx_file.read_text()[:1000]  # Limit to 1000 chars
                context_parts.append(f"## {ctx_file.name}\n{content}")
            except Exception:
                pass

    return "\n\n".join(context_parts) if context_parts else None

def announce(message, tts_enabled):
    """Announce message via TTS."""
    if not tts_enabled:
        return

    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if tts_script.exists():
            subprocess.run(
                [sys.executable, str(tts_script), message],
                timeout=15,
                check=False,
                capture_output=True
            )
    except Exception:
        pass

def main():
    """Process session start hook."""
    try:
        data = json.load(sys.stdin)
        enabled, tts_enabled = load_config()

        if not enabled:
            sys.exit(0)

        hook_data = data.get("hookSpecificInput", {})
        source = hook_data.get("source", "unknown")

        # Log the session
        log_session(data)

        # Build context if --load-context flag is passed
        if "--load-context" in sys.argv:
            context_parts = []

            # Add git info
            branch, uncommitted = get_git_info()
            if branch:
                git_info = f"Git branch: {branch}"
                if uncommitted > 0:
                    git_info += f" ({uncommitted} uncommitted files)"
                context_parts.append(git_info)

            # Add context files
            file_context = get_context_files()
            if file_context:
                context_parts.append(file_context)

            # Output additional context for Claude
            if context_parts:
                print(json.dumps({
                    "additionalContext": "\n\n".join(context_parts)
                }))

        # Announce if --announce flag is passed
        if "--announce" in sys.argv:
            cwd = Path(data.get("cwd", "")).name or "project"

            if source == "new":
                message = f"Starting new session in {cwd}"
            elif source == "resume":
                message = f"Resuming session in {cwd}"
            else:
                message = f"Session ready in {cwd}"

            announce(message, tts_enabled)

        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
