#!/usr/bin/env python3
"""
Hook configuration utility.
Reads config.toml to determine which hooks are enabled.
"""

import tomllib
from pathlib import Path

CONFIG_TOML = Path.home() / ".claude" / "hooks" / "config.toml"

_config_cache = None

def get_config():
    """Load and cache configuration."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    try:
        with open(CONFIG_TOML, 'rb') as f:
            _config_cache = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError):
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

def get_logging_config():
    """Get logging configuration."""
    config = get_config()
    return config.get("logging", {
        "enabled": True,
        "max_entries": 100
    })
