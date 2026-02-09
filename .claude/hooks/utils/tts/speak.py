#!/usr/bin/env python3
"""
TTS Manager with Priority Fallback and Platform Routing.

Priority:
  1. OpenAI TTS (if OPENAI_API_KEY set)
  2. Platform-native TTS:
     - WSL2/Windows: Windows Speech Synthesis via PowerShell
     - Linux: espeak-ng / spd-say / festival
"""

import os
import sys
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import detect_platform


def speak(text, quiet=False):
    """Speak text using the best available TTS provider."""
    if not text:
        return False

    hooks_dir = Path(__file__).parent

    # Priority 1: OpenAI TTS (if API key is set)
    if os.getenv("OPENAI_API_KEY"):
        openai_script = hooks_dir / "openai_tts.py"
        if openai_script.exists():
            try:
                result = subprocess.run(
                    [sys.executable, str(openai_script), text],
                    timeout=20, check=False, capture_output=True,
                )
                if result.returncode == 0:
                    return True
            except Exception:
                pass

    # Priority 2: Platform-native TTS
    plat = detect_platform()

    if plat in ("wsl2", "windows"):
        windows_script = hooks_dir / "windows_tts.py"
        if windows_script.exists():
            try:
                result = subprocess.run(
                    [sys.executable, str(windows_script), text],
                    timeout=20, check=False, capture_output=True,
                )
                return result.returncode == 0
            except Exception:
                pass
    else:
        # Linux native TTS
        linux_script = hooks_dir / "linux_tts.py"
        if linux_script.exists():
            try:
                result = subprocess.run(
                    [sys.executable, str(linux_script), text],
                    timeout=20, check=False, capture_output=True,
                )
                return result.returncode == 0
            except Exception:
                pass

    if not quiet:
        print("No TTS provider available", file=sys.stderr)
    return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
        success = speak(message)
        sys.exit(0 if success else 1)
    else:
        print("Usage: speak.py <message>", file=sys.stderr)
        sys.exit(1)
