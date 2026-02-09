#!/usr/bin/env python3
"""
SessionStart Hook
Triggered when a Claude Code session starts, resumes, or clears.
Loads development context and announces session start.
"""

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl, notify_all


def _get_git_info():
    """Get current git branch and status."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=5,
        )
        branch = result.stdout.strip() if result.returncode == 0 else None

        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, timeout=5,
        )
        uncommitted = len(result.stdout.strip().split('\n')) if result.stdout.strip() else 0

        return branch, uncommitted
    except Exception:
        return None, 0


def _get_context_files():
    """Load context from standard files."""
    context_parts = []

    context_files = [
        Path.cwd() / ".claude" / "CONTEXT.md",
        Path.cwd() / "CONTEXT.md",
        Path.cwd() / "TODO.md",
    ]

    for ctx_file in context_files:
        if ctx_file.exists():
            try:
                content = ctx_file.read_text()[:1000]
                context_parts.append(f"## {ctx_file.name}\n{content}")
            except Exception:
                pass

    return "\n\n".join(context_parts) if context_parts else None


def handle_session_start(data):
    hook_data = data.get("hookSpecificInput", {})
    source = hook_data.get("source", "unknown")

    log_jsonl("session_start.json", {
        "session_id": data.get("session_id", ""),
        "source": source,
        "cwd": data.get("cwd", ""),
    })

    result = {}

    # Build context if --load-context flag is passed
    if "--load-context" in sys.argv:
        context_parts = []

        branch, uncommitted = _get_git_info()
        if branch:
            git_info = f"Git branch: {branch}"
            if uncommitted > 0:
                git_info += f" ({uncommitted} uncommitted files)"
            context_parts.append(git_info)

        file_context = _get_context_files()
        if file_context:
            context_parts.append(file_context)

        if context_parts:
            result["additionalContext"] = "\n\n".join(context_parts)

    # Announce if --announce flag is passed
    if "--announce" in sys.argv:
        cwd = Path(data.get("cwd", "")).name or "project"

        if source == "new":
            message = f"Starting new session in {cwd}"
        elif source == "resume":
            message = f"Resuming session in {cwd}"
        else:
            message = f"Session ready in {cwd}"

        notify_all("Claude Code", message, "attention", tts_message=message)

    return result if result else None


if __name__ == "__main__":
    run_hook("session_start", handle_session_start)
