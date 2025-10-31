#!/usr/bin/env python3
"""
Windows TTS via PowerShell (for WSL)
Fallback TTS that works without any API keys.
"""

import subprocess
import sys

def speak(text):
    """Speak text using Windows Speech Synthesis."""
    try:
        # Escape single quotes in text
        escaped_text = text.replace("'", "''")

        # PowerShell command to use Windows TTS
        ps_command = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 2
$synth.Volume = 80
$synth.Speak('{escaped_text}')
"""

        # Execute via PowerShell from WSL
        subprocess.run(
            ["powershell.exe", "-Command", ps_command],
            timeout=15,
            check=False,
            capture_output=True
        )
        return True
    except Exception as e:
        print(f"Windows TTS error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    # Get text from command line or use default
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "Task complete"

    success = speak(message)
    sys.exit(0 if success else 1)
