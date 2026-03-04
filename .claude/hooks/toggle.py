#!/usr/bin/env python3
"""
Hook Toggle Utility
Easily enable/disable hooks and notification features from the command line.

Supports both config locations:
1. ~/.agent-tools/config.json (new centralized config)
2. ~/.claude/hooks/config.json (legacy)

Usage:
    python toggle.py                    # Show status of all hooks
    python toggle.py <hook> on|off      # Enable/disable specific hook
    python toggle.py all on|off         # Enable/disable all hooks
    python toggle.py tts on|off         # Enable/disable TTS
    python toggle.py toast on|off       # Enable/disable toast notifications
    python toggle.py sounds on|off      # Enable/disable sound effects
    python toggle.py debounce on|off    # Enable/disable debounce
    python toggle.py notify on|off      # All 3 notification methods at once
"""

import json
import sys
from pathlib import Path

_NEW_CONFIG_PATH = Path.home() / ".agent-tools" / "config.json"
_OLD_CONFIG_PATH = Path.home() / ".claude" / "hooks" / "config.json"

ALL_HOOKS = [
    "notification", "stop", "subagent_stop", "subagent_start",
    "post_tool_use", "pre_tool_use", "user_prompt_submit",
    "session_start", "session_end", "pre_compact",
]

FEATURE_TOGGLES = ["tts", "toast", "sounds", "debounce", "notify"]

VALID_TARGETS = ALL_HOOKS + FEATURE_TOGGLES + ["all"]


def _resolve_config_path():
    """Find the config file. New location takes priority."""
    if _NEW_CONFIG_PATH.exists():
        return _NEW_CONFIG_PATH
    return _OLD_CONFIG_PATH


def _is_new_structure(config):
    """Detect if config uses the new nested structure."""
    return "claude" in config


def load_config():
    """Load configuration."""
    path = _resolve_config_path()
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return {"hooks": {}, "tts": {"enabled": False}, "toast": {"enabled": True}, "sounds": {"enabled": True}}


def save_config(config):
    """Save configuration to the resolved path."""
    path = _resolve_config_path()
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")


def _get_claude_section(config, key, default=None):
    """Get a Claude-specific config value from either structure."""
    if default is None:
        default = {}
    if _is_new_structure(config):
        claude = config.get("claude", {})
        if key in ("tts", "toast", "sounds", "debounce"):
            return claude.get("notifications", {}).get(key, default)
        return claude.get(key, default)
    return config.get(key, default)


def _set_claude_value(config, section, key, value):
    """Set a Claude-specific config value in either structure."""
    if _is_new_structure(config):
        claude = config.setdefault("claude", {})
        if section in ("tts", "toast", "sounds", "debounce"):
            notifications = claude.setdefault("notifications", {})
            notifications.setdefault(section, {})[key] = value
        else:
            claude.setdefault(section, {})[key] = value
    else:
        config.setdefault(section, {})[key] = value


def show_status():
    """Display current status of all hooks and features."""
    config = load_config()
    hooks = _get_claude_section(config, "hooks", {})

    print("\n=== Hook Status ===\n")
    for hook in ALL_HOOKS:
        status = hooks.get(hook, True)
        icon = "[ON] " if status else "[OFF]"
        print(f"  {icon} {hook}")

    print("\n=== Notification Methods ===\n")
    features = [
        ("TTS (Text-to-Speech)", _get_claude_section(config, "tts", {}).get("enabled", False)),
        ("Toast Notifications", _get_claude_section(config, "toast", {}).get("enabled", True)),
        ("Sound Effects", _get_claude_section(config, "sounds", {}).get("enabled", True)),
    ]
    for name, enabled in features:
        icon = "[ON] " if enabled else "[OFF]"
        print(f"  {icon} {name}")

    print("\n=== Other ===\n")
    debounce_cfg = _get_claude_section(config, "debounce", {})
    debounce = debounce_cfg.get("enabled", True)
    interval = debounce_cfg.get("min_interval_seconds", 5)
    print(f"  {'[ON] ' if debounce else '[OFF]'} Debounce ({interval}s interval)")

    # Show hard blocks status if available
    security = config.get("security", {})
    hard_blocks = security.get("hard_blocks", {})
    if hard_blocks:
        print("\n=== Hard Blocks ===\n")
        for key in ("force_push", "deploy", "non_local_db"):
            policy = hard_blocks.get(key, "deny")
            print(f"  [{policy.upper():4s}] {key}")

    print(f"\n=== Usage ===\n")
    print(f"  python {Path(__file__).name} <hook_name> on|off")
    print(f"  python {Path(__file__).name} all on|off")
    print(f"  python {Path(__file__).name} tts|toast|sounds|debounce on|off")
    print(f"  python {Path(__file__).name} notify on|off    # all 3 methods")
    print()


def toggle(target, enable):
    """Toggle a hook or feature."""
    config = load_config()

    if target == "all":
        if _is_new_structure(config):
            hooks = config.setdefault("claude", {}).setdefault("hooks", {})
        else:
            hooks = config.setdefault("hooks", {})
        for hook in ALL_HOOKS:
            hooks[hook] = enable
        print(f"All hooks {'enabled' if enable else 'disabled'}")

    elif target == "notify":
        for section in ("tts", "toast", "sounds"):
            _set_claude_value(config, section, "enabled", enable)
        print(f"All notification methods {'enabled' if enable else 'disabled'}")

    elif target in ("tts", "toast", "sounds", "debounce"):
        _set_claude_value(config, target, "enabled", enable)
        label = {
            "tts": "TTS",
            "toast": "Toast notifications",
            "sounds": "Sound effects",
            "debounce": "Debounce",
        }[target]
        print(f"{label} {'enabled' if enable else 'disabled'}")

    else:
        # It's a hook name
        if _is_new_structure(config):
            hooks = config.setdefault("claude", {}).setdefault("hooks", {})
        else:
            hooks = config.setdefault("hooks", {})
        hooks[target] = enable
        print(f"Hook '{target}' {'enabled' if enable else 'disabled'}")

    save_config(config)


def main():
    if len(sys.argv) == 1:
        show_status()
        return

    if len(sys.argv) != 3:
        print("Usage: python toggle.py <target> <on|off>")
        print(f"Targets: {', '.join(VALID_TARGETS)}")
        sys.exit(1)

    target = sys.argv[1].lower()
    action = sys.argv[2].lower()

    if action not in ("on", "off"):
        print("Action must be 'on' or 'off'")
        sys.exit(1)

    if target not in VALID_TARGETS:
        print(f"Unknown target: {target}")
        print(f"Valid targets: {', '.join(VALID_TARGETS)}")
        sys.exit(1)

    toggle(target, action == "on")


if __name__ == "__main__":
    main()
