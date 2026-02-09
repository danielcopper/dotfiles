#!/usr/bin/env python3
"""
Windows TTS via PowerShell (for WSL2 and Windows).
Fallback TTS that works without any API keys.

Security: Text is written to a temp file and read by PowerShell,
avoiding any text interpolation in the command string.
All PowerShell invocations use -EncodedCommand (Base64).
"""

import base64
import os
import sys
import tempfile
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import detect_platform, get_powershell_path


def _encode_ps_command(script):
    """Encode a PowerShell script as Base64 UTF-16LE for -EncodedCommand."""
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def speak(text):
    """Speak text using Windows Speech Synthesis, injection-safe."""
    ps_path = get_powershell_path()
    if not ps_path:
        return False

    plat = detect_platform()

    # Write text to a temp file so PowerShell reads from file (no injection)
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.txt', delete=False, encoding='utf-8'
        ) as tmp:
            tmp.write(text)
            tmp_path = tmp.name

        # Convert path for WSL2
        if plat == "wsl2":
            try:
                result = subprocess.run(
                    ["wslpath", "-w", tmp_path],
                    capture_output=True, text=True, check=True,
                )
                file_path = result.stdout.strip()
            except (subprocess.CalledProcessError, FileNotFoundError):
                file_path = tmp_path.replace("/", "\\")
        else:
            file_path = tmp_path

        script = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 2
$synth.Volume = 80
$text = [System.IO.File]::ReadAllText("{file_path}")
$synth.Speak($text)
"""

        encoded = _encode_ps_command(script)
        result = subprocess.run(
            [ps_path, "-NoProfile", "-EncodedCommand", encoded],
            timeout=15, check=False, capture_output=True, text=True,
        )

        success = result.returncode == 0
        if not success and result.stderr:
            print(f"PowerShell error: {result.stderr}", file=sys.stderr)

        return success

    except subprocess.TimeoutExpired:
        print("Windows TTS timeout after 15 seconds", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Windows TTS error: {e}", file=sys.stderr)
        return False
    finally:
        try:
            os.unlink(tmp_path)
        except (OSError, UnboundLocalError):
            pass


if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"
    success = speak(message)
    sys.exit(0 if success else 1)
