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
        # Properly escape all PowerShell special characters
        # Order matters: escape backticks first, then other special chars
        escaped_text = text.replace("`", "``")  # Escape backticks first
        escaped_text = escaped_text.replace("$", "`$")  # Escape dollar signs
        escaped_text = escaped_text.replace('"', '`"')  # Escape double quotes
        escaped_text = escaped_text.replace("'", "''")  # Escape single quotes (PowerShell style)

        # Remove or escape control characters that could break the command
        escaped_text = escaped_text.replace("\n", " ").replace("\r", " ")
        escaped_text = escaped_text.replace("\t", " ")

        # Use double-quoted string in PowerShell for better escaping support
        ps_command = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 2
$synth.Volume = 80
$synth.Speak("{escaped_text}")
"""

        # Execute via PowerShell from WSL
        result = subprocess.run(
            ["powershell.exe", "-Command", ps_command],
            timeout=15,
            check=False,
            capture_output=True,
            text=True
        )

        # Check for errors in stderr
        if result.returncode != 0 and result.stderr:
            print(f"PowerShell error: {result.stderr}", file=sys.stderr)
            return False

        return True
    except subprocess.TimeoutExpired:
        print("Windows TTS timeout after 15 seconds", file=sys.stderr)
        return False
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
