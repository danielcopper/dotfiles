#!/usr/bin/env python3
"""
PreCompact Hook
Triggered before Claude compacts the conversation context.
Backs up the current transcript for audit/analysis.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent / "utils"))

from common import run_hook, log_jsonl


def _backup_transcript(data):
    """Backup current transcript before compaction."""
    backup_dir = Path.home() / ".claude" / "hooks" / "backups" / "transcripts"
    backup_dir.mkdir(parents=True, exist_ok=True)

    session_id = data.get("session_id", "unknown")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"pre_compact_{session_id}_{timestamp}.json"

    with open(backup_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "data": data,
        }, f, indent=2)

    # Clean up old backups (keep last 20)
    backups = sorted(backup_dir.glob("pre_compact_*.json"))
    for old_backup in backups[:-20]:
        try:
            old_backup.unlink()
        except Exception:
            pass


def handle_pre_compact(data):
    log_jsonl("pre_compact.json", {
        "session_id": data.get("session_id", ""),
        "cwd": data.get("cwd", ""),
    })

    if "--backup" in sys.argv:
        _backup_transcript(data)

    return None


if __name__ == "__main__":
    run_hook("pre_compact", handle_pre_compact)
