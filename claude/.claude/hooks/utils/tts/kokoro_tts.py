#!/usr/bin/env python3
"""
Kokoro TTS - high-quality local neural TTS via ONNX.
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import get_tts_config
from tts.playback import play_wav

MODELS_DIR = Path(__file__).parent / "models"


def speak(text):
    """Speak text using Kokoro TTS."""
    tts_cfg = get_tts_config()
    model_name = tts_cfg.get("kokoro_model", "kokoro-v1.0.int8")
    voice = tts_cfg.get("voice", "am_michael")

    model_path = MODELS_DIR / f"{model_name}.onnx"
    voices_path = MODELS_DIR / "voices-v1.0.bin"

    if not model_path.exists():
        print(f"Kokoro model not found: {model_path}", file=sys.stderr)
        return False
    if not voices_path.exists():
        print(f"Kokoro voices not found: {voices_path}", file=sys.stderr)
        return False

    try:
        from kokoro_onnx import Kokoro
        import numpy as np
        import soundfile as sf

        kokoro = Kokoro(str(model_path), str(voices_path))
        samples, sr = kokoro.create(text, voice=voice, speed=1.0)

        # Prepend short silence to avoid clipping
        silence = np.zeros(int(sr * 0.15), dtype=samples.dtype)
        samples = np.concatenate([silence, samples])

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        sf.write(tmp_path, samples, sr)

        return play_wav(tmp_path)

    except ImportError as e:
        print(f"Kokoro dependency missing: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Kokoro TTS error: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"
    sys.exit(0 if speak(message) else 1)
