#!/usr/bin/env python3
"""
Platform detection for cross-platform hook support.
Detects WSL2, pure Windows, and pure Linux environments.
"""

import os
import platform
import shutil
from functools import lru_cache


@lru_cache(maxsize=1)
def detect_platform():
    """
    Detect the current platform.

    Returns:
        "wsl2" - Linux running under Windows Subsystem for Linux
        "windows" - Native Windows
        "linux" - Native Linux (including Plasma 6, GNOME, etc.)
    """
    if platform.system() == "Windows":
        return "windows"

    if platform.system() == "Linux":
        try:
            release = os.uname().release.lower()
            if "microsoft" in release:
                return "wsl2"
        except Exception:
            pass
        return "linux"

    # macOS or other - treat as linux for compatibility
    return "linux"


@lru_cache(maxsize=32)
def has_command(cmd):
    """Check if a command is available on PATH."""
    return shutil.which(cmd) is not None


@lru_cache(maxsize=1)
def get_powershell_path():
    """
    Get the path to PowerShell executable, or None.

    On WSL2: looks for powershell.exe
    On Windows: looks for powershell.exe or pwsh.exe
    On Linux: None
    """
    plat = detect_platform()

    if plat == "wsl2":
        return shutil.which("powershell.exe")
    elif plat == "windows":
        return shutil.which("pwsh.exe") or shutil.which("powershell.exe")

    return None
