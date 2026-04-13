#!/usr/bin/env python3
"""
Hook configuration utility.
Reads config.toml to determine which hooks are enabled.
Falls back to config.json for backwards compatibility.
"""

import json
import tomllib
from pathlib import Path

CONFIG_TOML = Path.home() / ".claude" / "hooks" / "config.toml"
CONFIG_JSON = Path.home() / ".claude" / "hooks" / "config.json"

_config_cache = None

def get_config():
    """Load and cache configuration."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    try:
        if CONFIG_TOML.exists():
            with open(CONFIG_TOML, 'rb') as f:
                _config_cache = tomllib.load(f)
        elif CONFIG_JSON.exists():
            with open(CONFIG_JSON, 'r') as f:
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
    return tts.get("enabled", True)

def get_tts_config():
    """Get full TTS configuration."""
    config = get_config()
    return config.get("tts", {})

def get_security_config():
    """Get security configuration."""
    config = get_config()
    return config.get("security", {
        "block_dangerous_commands": True,
        "protect_env_files": True,
        "blocked_paths": ["/", "/etc", "/usr"],
        "dangerous_patterns": ["rm -rf", "rm -fr", "rm -r /", "mkfs", "dd if="]
    })

def get_logging_config():
    """Get logging configuration."""
    config = get_config()
    return config.get("logging", {
        "enabled": True,
        "max_entries": 100
    })
