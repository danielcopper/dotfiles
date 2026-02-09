#!/usr/bin/env python3
"""
Linux TTS using native speech synthesis tools.
Tries espeak-ng, spd-say, festival in order.
Uses subprocess with list args (no shell injection risk).
"""

import sys
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import has_command


def speak(text):
    """Speak text using the best available Linux TTS."""
    if not text:
        return False

    # Try espeak-ng (most common)
    if has_command("espeak-ng"):
        try:
            result = subprocess.run(
                ["espeak-ng", text],
                timeout=15, check=False, capture_output=True,
            )
            if result.returncode == 0:
                return True
        except Exception:
            pass

    # Try spd-say (speech-dispatcher)
    if has_command("spd-say"):
        try:
            result = subprocess.run(
                ["spd-say", "--wait", text],
                timeout=15, check=False, capture_output=True,
            )
            if result.returncode == 0:
                return True
        except Exception:
            pass

    # Try festival
    if has_command("festival"):
        try:
            result = subprocess.run(
                ["festival", "--tts"],
                input=text, text=True,
                timeout=15, check=False, capture_output=True,
            )
            if result.returncode == 0:
                return True
        except Exception:
            pass

    return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"
    success = speak(message)
    sys.exit(0 if success else 1)
