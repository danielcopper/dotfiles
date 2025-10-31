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

def get_subagent_message(data):
    """Generate contextual message about subagent completion."""
    try:
        hook_data = data.get("hookSpecificInput", {})
        agent_type = hook_data.get("subagentType", "unknown")
        description = hook_data.get("description", "")

        # Map agent types to friendly names
        agent_names = {
            "Explore": "Code exploration",
            "Plan": "Planning",
            "focused-coder": "Code implementation",
            "code-quality-reviewer": "Code review",
            "work-planner": "Work planning",
            "workflow-orchestrator": "Workflow orchestration",
            "general-purpose": "General task"
        }

        friendly_name = agent_names.get(agent_type, agent_type)

        if description:
            # Use the description if available
            short_desc = description[:50]
            return f"{friendly_name} complete: {short_desc}"
        else:
            return f"{friendly_name} agent finished."

    except Exception as e:
        print(f"Message generation error: {e}", file=sys.stderr)
        return "Subagent task completed."

def announce(message):
    """Announce message via TTS."""
    try:
        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            return

        subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=20,
            check=False,
            capture_output=True
        )
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)

def main():
    """Process subagent stop hook."""
    try:
        data = json.load(sys.stdin)
        log_subagent_completion(data)

        if "--notify" in sys.argv:
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
