#!/usr/bin/env python3
"""
Desktop toast notification support.
WSL2/Windows: PowerShell with -EncodedCommand
Linux: notify-send
"""

import base64
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from platform_info import detect_platform, has_command, get_powershell_path


def _encode_ps_command(script):
    """Encode a PowerShell script as Base64 UTF-16LE for -EncodedCommand."""
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def _toast_powershell(title, message, timeout_ms=5000):
    """Show toast via PowerShell (WSL2 or Windows)."""
    ps_path = get_powershell_path()
    if not ps_path:
        return False

    # Try Windows.UI.Notifications first (modern toast), fallback to balloon tip
    script = f"""
try {{
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
    $template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>{title}</text>
            <text>{message}</text>
        </binding>
    </visual>
</toast>
"@
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Code").Show($toast)
}} catch {{
    Add-Type -AssemblyName System.Windows.Forms
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.BalloonTipTitle = "{title}"
    $notify.BalloonTipText = "{message}"
    $notify.Visible = $true
    $notify.ShowBalloonTip({timeout_ms})
    Start-Sleep -Milliseconds 500
    $notify.Dispose()
}}
"""
    try:
        encoded = _encode_ps_command(script)
        result = subprocess.run(
            [ps_path, "-NoProfile", "-EncodedCommand", encoded],
            timeout=10,
            check=False,
            capture_output=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def _toast_linux(title, message, timeout_ms=5000):
    """Show toast via notify-send on Linux."""
    if not has_command("notify-send"):
        return False

    try:
        result = subprocess.run(
            [
                "notify-send",
                "--app-name=Claude Code",
                "-t", str(timeout_ms),
                title,
                message,
            ],
            timeout=5,
            check=False,
            capture_output=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def show_toast(title, message, timeout_ms=5000):
    """
    Show a desktop toast notification.

    Returns True if the notification was shown successfully.
    """
    plat = detect_platform()

    if plat in ("wsl2", "windows"):
        return _toast_powershell(title, message, timeout_ms)
    else:
        return _toast_linux(title, message, timeout_ms)
