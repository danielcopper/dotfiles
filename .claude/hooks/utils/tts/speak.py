#!/usr/bin/env python3
"""
TTS Manager with Priority Fallback
Tries OpenAI TTS first, falls back to Windows TTS.
"""

import os
import sys
import subprocess
from pathlib import Path

def get_tts_script():
    """Determine which TTS script to use based on availability."""
    hooks_dir = Path.home() / ".claude" / "hooks" / "utils" / "tts"

    # Priority 1: OpenAI TTS (if API key is set)
    if os.getenv("OPENAI_API_KEY"):
        openai_script = hooks_dir / "openai_tts.py"
        if openai_script.exists():
            return str(openai_script), "OpenAI"

    # Priority 2: Windows TTS (always available on WSL)
    windows_script = hooks_dir / "windows_tts.py"
    if windows_script.exists():
        return str(windows_script), "Windows"

    return None, None

def speak(text, quiet=False):
    """Speak text using the best available TTS provider."""
    if not text:
        return False

    script, provider = get_tts_script()

    if not script:
        if not quiet:
            print("No TTS provider available", file=sys.stderr)
        return False

    try:
        if not quiet:
            print(f"🔊 Using {provider} TTS: {text[:50]}...", file=sys.stderr)

        result = subprocess.run(
            [sys.executable, script, text],
            timeout=20,
            check=False,
            capture_output=True
        )

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        if not quiet:
            print("TTS timeout", file=sys.stderr)
        return False
    except Exception as e:
        if not quiet:
            print(f"TTS error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
        success = speak(message)
        sys.exit(0 if success else 1)
    else:
        print("Usage: speak.py <message>", file=sys.stderr)
        sys.exit(1)
