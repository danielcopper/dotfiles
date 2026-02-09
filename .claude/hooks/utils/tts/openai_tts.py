#!/usr/bin/env python3
"""
OpenAI TTS (Premium)
Uses OpenAI's text-to-speech API for natural-sounding voices.
Requires OPENAI_API_KEY environment variable.

Security: All PowerShell invocations use -EncodedCommand (Base64).
Cross-platform: WSL2 → PowerShell, Linux → paplay/pw-play/ffplay/aplay.
"""

import base64
import os
import sys
import tempfile
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import detect_platform, has_command, get_powershell_path


def _encode_ps_command(script):
    """Encode a PowerShell script as Base64 UTF-16LE for -EncodedCommand."""
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def _play_windows(tmp_path, estimated_seconds):
    """Play MP3 via PowerShell MediaPlayer (WSL2 or Windows)."""
    ps_path = get_powershell_path()
    if not ps_path:
        return False

    plat = detect_platform()

    # Convert path for WSL2
    if plat == "wsl2":
        try:
            result = subprocess.run(
                ["wslpath", "-w", tmp_path],
                capture_output=True, text=True, check=True,
            )
            audio_path = result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            audio_path = tmp_path.replace("/", "\\")
    else:
        audio_path = tmp_path

    # Use -EncodedCommand instead of -Command for injection safety
    script = f"""
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open("{audio_path}")
Start-Sleep -Milliseconds 300
$mediaPlayer.Play()
Start-Sleep -Seconds {int(estimated_seconds)}
$mediaPlayer.Stop()
$mediaPlayer.Close()
"""
    try:
        encoded = _encode_ps_command(script)
        result = subprocess.run(
            [ps_path, "-NoProfile", "-EncodedCommand", encoded],
            timeout=20, check=False, capture_output=True, text=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def _play_linux(tmp_path):
    """Play MP3 on Linux using available player."""
    for player in ("paplay", "pw-play", "ffplay", "aplay"):
        if has_command(player):
            try:
                args = [player]
                if player == "ffplay":
                    args += ["-nodisp", "-autoexit", "-loglevel", "quiet"]
                args.append(tmp_path)
                result = subprocess.run(
                    args, timeout=20, check=False, capture_output=True,
                )
                if result.returncode == 0:
                    return True
            except Exception:
                continue
    return False


def speak(text):
    """Speak text using OpenAI TTS API."""
    try:
        from openai import OpenAI
    except ImportError:
        print("OpenAI library not installed", file=sys.stderr)
        return False

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return False

    try:
        client = OpenAI(api_key=api_key)

        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text,
            speed=1.1,
        )

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name

        # Estimate audio duration (~2.5 words/sec)
        word_count = len(text.split())
        estimated_seconds = max(2, min(word_count / 2.5 + 1, 15))

        plat = detect_platform()
        if plat in ("wsl2", "windows"):
            success = _play_windows(tmp_path, estimated_seconds)
        else:
            success = _play_linux(tmp_path)

        # Clean up
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

        return success

    except Exception as e:
        print(f"OpenAI TTS error: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"
    success = speak(message)
    sys.exit(0 if success else 1)
