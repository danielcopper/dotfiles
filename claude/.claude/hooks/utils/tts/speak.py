#!/usr/bin/env python3
"""
TTS Manager - dispatches to configured provider.

Provider is read from ~/.claude/hooks/config.toml under [tts].provider.
Supported: "kokoro", "piper", "windows"
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import get_tts_config

TTS_DIR = Path(__file__).parent

PROVIDERS = {
    "kokoro": TTS_DIR / "kokoro_tts.py",
    "piper": TTS_DIR / "piper_tts.py",
    "windows": TTS_DIR / "windows_tts.py",
}

FALLBACK_ORDER = ["kokoro", "piper", "windows"]


def get_provider():
    """Read configured TTS provider from config."""
    return get_tts_config().get("provider", "kokoro")


def speak(text):
    """Speak text using the configured provider, with fallback."""
    if not text:
        return False

    provider = get_provider()

    # Build try-order: configured provider first, then fallbacks
    order = [provider] + [p for p in FALLBACK_ORDER if p != provider]

    for name in order:
        script = PROVIDERS.get(name)
        if not script or not script.exists():
            continue

        try:
            # Import and call directly (avoids subprocess overhead)
            import importlib.util
            spec = importlib.util.spec_from_file_location(name, str(script))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            if mod.speak(text):
                return True
        except Exception as e:
            print(f"{name} TTS failed: {e}", file=sys.stderr)
            continue

    print("All TTS providers failed", file=sys.stderr)
    return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
        sys.exit(0 if speak(message) else 1)
    else:
        print("Usage: speak.py <message>", file=sys.stderr)
        sys.exit(1)
