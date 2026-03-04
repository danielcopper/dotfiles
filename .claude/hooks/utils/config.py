#!/usr/bin/env python3
"""
Hook configuration utility.
Reads config.json to determine which hooks and features are enabled.

Supports two config locations (checked in order):
1. ~/.agent-tools/config.json (new centralized config)
2. ~/.claude/hooks/config.json (legacy)

And two structures:
- New: Claude-specific settings under "claude" key
- Old: flat structure with all keys at top level
"""

import json
from pathlib import Path

_NEW_CONFIG_PATH = Path.home() / ".agent-tools" / "config.json"
_OLD_CONFIG_PATH = Path.home() / ".claude" / "hooks" / "config.json"

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


def _resolve_config_path():
    """Find the config file. New location takes priority."""
    if _NEW_CONFIG_PATH.exists():
        return _NEW_CONFIG_PATH
    return _OLD_CONFIG_PATH


CONFIG_PATH = _resolve_config_path()


def get_config():
    """Load and cache configuration."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    try:
        # Re-resolve in case files were created after module load
        path = _resolve_config_path()
        if path.exists():
            with open(path, "r") as f:
                _config_cache = json.load(f)
        else:
            _config_cache = {}
    except Exception:
        _config_cache = {}

    return _config_cache


def _is_new_structure(config):
    """Detect if config uses the new nested structure."""
    return "claude" in config


def _get_claude_section(config, key, default=None):
    """Get a Claude-specific config value from either structure.

    New structure: config["claude"][key] or config["claude"]["notifications"][key]
    Old structure: config[key]
    """
    if default is None:
        default = {}

    if _is_new_structure(config):
        claude = config.get("claude", {})
        # Notification sub-keys live under "notifications"
        if key in ("tts", "toast", "sounds", "debounce"):
            return claude.get("notifications", {}).get(key, default)
        return claude.get(key, default)

    return config.get(key, default)


def is_hook_enabled(hook_name):
    """Check if a specific hook is enabled."""
    config = get_config()
    hooks = _get_claude_section(config, "hooks", {})
    return hooks.get(hook_name, True)


def is_tts_enabled():
    """Check if TTS is enabled."""
    config = get_config()
    tts = _get_claude_section(config, "tts", {})
    return tts.get("enabled", False)


def is_toast_enabled():
    """Check if toast notifications are enabled."""
    config = get_config()
    toast = _get_claude_section(config, "toast", {})
    return toast.get("enabled", True)


def is_sounds_enabled():
    """Check if sound effects are enabled."""
    config = get_config()
    sounds = _get_claude_section(config, "sounds", {})
    return sounds.get("enabled", True)


def is_debounce_enabled():
    """Check if notification debounce is enabled."""
    config = get_config()
    debounce = _get_claude_section(config, "debounce", {})
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
    logging_cfg = _get_claude_section(config, "logging", {})

    result = dict(_DEFAULT_LOGGING)
    result.update(logging_cfg)
    return result


def get_toast_config():
    """Get toast notification configuration."""
    config = get_config()
    return _get_claude_section(config, "toast", {"enabled": True, "provider": "auto"})


def get_sounds_config():
    """Get sounds configuration."""
    config = get_config()
    return _get_claude_section(config, "sounds", {
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
    return _get_claude_section(config, "debounce", {"enabled": True, "min_interval_seconds": 5})


def get_auto_approve_config():
    """Get auto-approve configuration."""
    config = get_config()
    return _get_claude_section(config, "auto_approve", {
        "safe_reads": True,
        "project_paths_only": True,
    })
