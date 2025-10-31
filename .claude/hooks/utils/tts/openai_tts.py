#!/usr/bin/env python3
"""
OpenAI TTS (Premium)
Uses OpenAI's text-to-speech API for natural-sounding voices.
Requires OPENAI_API_KEY environment variable.
"""

import os
import sys
import tempfile
import subprocess

def speak(text):
    """Speak text using OpenAI TTS API."""
    try:
        from openai import OpenAI
    except ImportError:
        print("OpenAI library not installed. Install with: pip install openai", file=sys.stderr)
        return False

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY not set", file=sys.stderr)
        return False

    try:
        client = OpenAI(api_key=api_key)

        # Generate speech
        response = client.audio.speech.create(
            model="tts-1",  # or "tts-1-hd" for higher quality
            voice="nova",   # alloy, echo, fable, onyx, nova, shimmer
            input=text,
            speed=1.1
        )

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name

        # Play audio using Windows Media Player via PowerShell
        ps_command = f"""
$player = New-Object System.Media.SoundPlayer
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open('{tmp_path.replace("/", "\\")}')
$mediaPlayer.Play()
Start-Sleep -Seconds 5
$mediaPlayer.Close()
"""

        subprocess.run(
            ["powershell.exe", "-Command", ps_command],
            timeout=20,
            check=False,
            capture_output=True
        )

        # Clean up
        try:
            os.unlink(tmp_path)
        except:
            pass

        return True

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
