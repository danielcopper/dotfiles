#!/usr/bin/env python3
"""
PreCompact Hook
Triggered before Claude compacts the conversation context.
Backs up the current transcript for audit/analysis.
"""

import json
import sys
import shutil
from pathlib import Path
from datetime import datetime

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent / "utils"))

def load_config():
    """Load hook configuration."""
    try:
        from config import is_hook_enabled
        return is_hook_enabled("pre_compact")
    except ImportError:
        return True

def backup_transcript(data):
    """Backup current transcript before compaction."""
    backup_dir = Path.home() / ".claude" / "hooks" / "backups" / "transcripts"
    backup_dir.mkdir(parents=True, exist_ok=True)

    try:
        session_id = data.get("session_id", "unknown")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save the full hook data as backup
        backup_file = backup_dir / f"pre_compact_{session_id}_{timestamp}.json"

        with open(backup_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id,
                "data": data
            }, f, indent=2)

        # Clean up old backups (keep last 20)
        backups = sorted(backup_dir.glob("pre_compact_*.json"))
        for old_backup in backups[:-20]:
            try:
                old_backup.unlink()
            except Exception:
                pass

        return True

    except Exception as e:
        print(f"Backup error: {e}", file=sys.stderr)
        return False

def log_compaction(data):
    """Log compaction event to JSONL file."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "pre_compact.jsonl"

    try:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "session_id": data.get("session_id", ""),
            "cwd": data.get("cwd", "")
        }
        with open(log_file, 'a') as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass

def main():
    """Process pre-compact hook."""
    try:
        data = json.load(sys.stdin)
        enabled = load_config()

        if not enabled:
            sys.exit(0)

        # Log the compaction event
        log_compaction(data)

        # Backup transcript if --backup flag is passed
        if "--backup" in sys.argv:
            backup_transcript(data)

        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
