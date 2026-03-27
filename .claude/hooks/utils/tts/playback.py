#!/usr/bin/env python3
"""
Audio playback utilities. Uses paplay (native/WSLg) with PowerShell fallback.
"""

import shutil
import subprocess
from pathlib import Path


def _is_wsl():
    """Check if running in WSL."""
    try:
        return "microsoft" in Path("/proc/version").read_text().lower()
    except Exception:
        return False


def _is_wslg_available():
    """Check if WSLg PulseAudio socket is available."""
    return Path("/mnt/wslg/PulseServer").exists()


def play_wav(wav_path):
    """Play a wav file. Uses paplay (native) if available, falls back to PowerShell."""
    try:
        if shutil.which("paplay") and (_is_wslg_available() or not _is_wsl()):
            return _play_paplay(wav_path)
        if _is_wsl():
            return _play_powershell(wav_path)
        if shutil.which("paplay"):
            return _play_paplay(wav_path)
        if shutil.which("aplay"):
            return _play_paplay(wav_path, cmd="aplay")
        print("No audio player available", file=__import__("sys").stderr)
        return False
    finally:
        try:
            Path(wav_path).unlink(missing_ok=True)
        except Exception:
            pass


def _play_paplay(wav_path, cmd="paplay"):
    """Play via PulseAudio (native Linux or WSLg)."""
    try:
        subprocess.run(
            [cmd, wav_path],
            timeout=15, check=False, capture_output=True,
        )
        return True
    except subprocess.TimeoutExpired:
        return False


def _play_powershell(wav_path):
    """Fallback: play via Windows MediaPlayer (WSL without WSLg)."""
    import wave
    try:
        with wave.open(wav_path, 'rb') as w:
            duration = w.getnframes() / w.getframerate()
    except Exception:
        duration = 3.0
    wait_seconds = int(duration) + 1

    try:
        result = subprocess.run(
            ["wslpath", "-w", wav_path],
            capture_output=True, text=True, check=True,
        )
        win_path = result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        win_path = wav_path

    escaped = win_path.replace("'", "''")
    ps_command = f"""
Add-Type -AssemblyName presentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open('{escaped}')
Start-Sleep -Milliseconds 800
$p.Play()
Start-Sleep -Seconds {wait_seconds}
$p.Stop()
$p.Close()
"""
    try:
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps_command],
            timeout=wait_seconds + 5, check=False, capture_output=True,
        )
        return True
    except subprocess.TimeoutExpired:
        return False
