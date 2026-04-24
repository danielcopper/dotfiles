#!/usr/bin/env python3
"""
Piper TTS - fast local neural TTS.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import get_tts_config
from tts.playback import play_wav

MODELS_DIR = Path(__file__).parent / "models"


def speak(text):
    """Speak text using Piper TTS."""
    tts_cfg = get_tts_config()
    model_name = tts_cfg.get("piper_model", "en_US-lessac-high")
    model_path = MODELS_DIR / f"{model_name}.onnx"
    if not model_path.exists():
        print(f"Piper model not found: {model_path}", file=sys.stderr)
        return False

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            [sys.executable, "-m", "piper",
             "--model", str(model_path),
             "--output_file", tmp_path],
            input=text,
            text=True,
            capture_output=True,
            timeout=10,
        )

        if result.returncode != 0:
            print(f"Piper error: {result.stderr}", file=sys.stderr)
            return False

        return play_wav(tmp_path)

    except subprocess.TimeoutExpired:
        print("Piper TTS timeout", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Piper TTS error: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"
    sys.exit(0 if speak(message) else 1)
