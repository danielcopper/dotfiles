#!/usr/bin/env python3
"""
System sound effect support.
WSL2/Windows: PowerShell SystemSounds via -EncodedCommand
Linux: canberra-gtk-play, paplay, pw-play, aplay
"""

import base64
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import detect_platform, has_command, get_powershell_path

# Map event types to Windows SystemSounds names
_WINDOWS_SOUNDS = {
    "complete": "Asterisk",
    "error": "Hand",
    "attention": "Exclamation",
    "subagent": "Asterisk",
}

# Map event types to freedesktop sound names
_LINUX_SOUNDS = {
    "complete": "complete",
    "error": "dialog-error",
    "attention": "bell",
    "subagent": "message-new-instant",
}


def _encode_ps_command(script):
    """Encode a PowerShell script as Base64 UTF-16LE for -EncodedCommand."""
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def _play_powershell(event_type):
    """Play system sound via PowerShell (WSL2 or Windows)."""
    ps_path = get_powershell_path()
    if not ps_path:
        return False

    sound_name = _WINDOWS_SOUNDS.get(event_type, "Asterisk")
    script = f"[System.Media.SystemSounds]::{sound_name}.Play()"

    try:
        encoded = _encode_ps_command(script)
        result = subprocess.run(
            [ps_path, "-NoProfile", "-EncodedCommand", encoded],
            timeout=5,
            check=False,
            capture_output=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def _play_linux(event_type):
    """Play system sound on Linux using available player."""
    sound_name = _LINUX_SOUNDS.get(event_type, "bell")

    # Try canberra-gtk-play (best integration with desktop themes)
    if has_command("canberra-gtk-play"):
        try:
            result = subprocess.run(
                ["canberra-gtk-play", "-i", sound_name],
                timeout=5, check=False, capture_output=True,
            )
            if result.returncode == 0:
                return True
        except Exception:
            pass

    # Try paplay with freedesktop sound files
    sound_file = f"/usr/share/sounds/freedesktop/stereo/{sound_name}.oga"
    sound_path = Path(sound_file)

    if sound_path.exists():
        for player in ("paplay", "pw-play", "aplay"):
            if has_command(player):
                try:
                    result = subprocess.run(
                        [player, sound_file],
                        timeout=5, check=False, capture_output=True,
                    )
                    if result.returncode == 0:
                        return True
                except Exception:
                    pass

    return False


def play_sound(event_type):
    """
    Play a system sound for the given event type.

    event_type: "complete", "error", "attention", "subagent"
    Returns True if sound was played successfully.
    """
    plat = detect_platform()

    if plat in ("wsl2", "windows"):
        return _play_powershell(event_type)
    else:
        return _play_linux(event_type)
