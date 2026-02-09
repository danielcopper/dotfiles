#!/usr/bin/env python3
"""
Hook configuration utility.
Reads config.json to determine which hooks and features are enabled.
"""

import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".claude" / "hooks" / "config.json"

_config_cache = None

_DEFAULT_SECURITY = {
    "block_dangerous_commands": True,
    "protect_sensitive_files": True,
    "blocked_paths": ["/", "/etc", "/usr", "/boot", "/sys", "/proc", "/dev", "/var", "/root"],
    "dangerous_patterns": [
        "rm -rf", "rm -fr", "rm -r /", "mkfs", "dd if=", "> /dev/sd",
        "curl | sh", "curl | bash", "wget | sh", "wget | bash",
        "curl|sh", "curl|bash", "wget|sh", "wget|bash",
        "chmod -R 777", "chown -R", "kill -9 -1", "pkill -9",
        "shred", "truncate -s 0", ":(){ :|:& };:",
    ],
    "sensitive_file_patterns": [
        "\\.env(?!\\.example|\\.sample|\\.template)",
        "credentials\\.json", "id_rsa", "\\.aws/credentials",
        "secrets\\.ya?ml", "\\.pem$", "\\.key$",
    ],
}

_DEFAULT_LOGGING = {
    "enabled": True,
    "max_entries": 100,
    "error_log_max_bytes": 524288,
}


def get_config():
    """Load and cache configuration."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r') as f:
                _config_cache = json.load(f)
        else:
            _config_cache = {}
    except Exception:
        _config_cache = {}

    return _config_cache


def is_hook_enabled(hook_name):
    """Check if a specific hook is enabled."""
    config = get_config()
    hooks = config.get("hooks", {})
    return hooks.get(hook_name, True)


def is_tts_enabled():
    """Check if TTS is enabled."""
    config = get_config()
    tts = config.get("tts", {})
    return tts.get("enabled", False)


def is_toast_enabled():
    """Check if toast notifications are enabled."""
    config = get_config()
    toast = config.get("toast", {})
    return toast.get("enabled", True)


def is_sounds_enabled():
    """Check if sound effects are enabled."""
    config = get_config()
    sounds = config.get("sounds", {})
    return sounds.get("enabled", True)


def is_debounce_enabled():
    """Check if notification debounce is enabled."""
    config = get_config()
    debounce = config.get("debounce", {})
    return debounce.get("enabled", True)


def get_security_config():
    """Get security configuration with defaults."""
    config = get_config()
    security = config.get("security", {})

    result = dict(_DEFAULT_SECURITY)
    result.update(security)

    # Backward compat: old protect_env_files maps to sensitive_file_patterns
    if "protect_env_files" in security and "sensitive_file_patterns" not in security:
        if security["protect_env_files"]:
            result["protect_sensitive_files"] = True

    return result


def get_logging_config():
    """Get logging configuration with defaults."""
    config = get_config()
    logging_cfg = config.get("logging", {})

    result = dict(_DEFAULT_LOGGING)
    result.update(logging_cfg)
    return result


def get_toast_config():
    """Get toast notification configuration."""
    config = get_config()
    return config.get("toast", {"enabled": True, "provider": "auto"})


def get_sounds_config():
    """Get sounds configuration."""
    config = get_config()
    return config.get("sounds", {
        "enabled": True,
        "provider": "auto",
        "events": {
            "complete": "complete",
            "error": "dialog-error",
            "attention": "bell",
            "subagent": "message-new-instant",
        },
    })


def get_debounce_config():
    """Get debounce configuration."""
    config = get_config()
    return config.get("debounce", {"enabled": True, "min_interval_seconds": 5})


def get_auto_approve_config():
    """Get auto-approve configuration."""
    config = get_config()
    return config.get("auto_approve", {
        "safe_reads": True,
        "project_paths_only": True,
    })
