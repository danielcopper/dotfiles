#!/usr/bin/env python3
"""
Hook Toggle Utility
Easily enable/disable hooks and notification features from the command line.

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

CONFIG_PATH = Path.home() / ".claude" / "hooks" / "config.json"

ALL_HOOKS = [
    "notification", "stop", "subagent_stop", "subagent_start",
    "post_tool_use", "pre_tool_use", "user_prompt_submit",
    "session_start", "session_end", "pre_compact",
]

FEATURE_TOGGLES = ["tts", "toast", "sounds", "debounce", "notify"]

VALID_TARGETS = ALL_HOOKS + FEATURE_TOGGLES + ["all"]


def load_config():
    """Load configuration."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {"hooks": {}, "tts": {"enabled": False}, "toast": {"enabled": True}, "sounds": {"enabled": True}}


def save_config(config):
    """Save configuration."""
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)
    f.close()


def show_status():
    """Display current status of all hooks and features."""
    config = load_config()
    hooks = config.get("hooks", {})

    print("\n=== Hook Status ===\n")
    for hook in ALL_HOOKS:
        status = hooks.get(hook, True)
        icon = "[ON] " if status else "[OFF]"
        print(f"  {icon} {hook}")

    print("\n=== Notification Methods ===\n")
    features = [
        ("TTS (Text-to-Speech)", config.get("tts", {}).get("enabled", False)),
        ("Toast Notifications", config.get("toast", {}).get("enabled", True)),
        ("Sound Effects", config.get("sounds", {}).get("enabled", True)),
    ]
    for name, enabled in features:
        icon = "[ON] " if enabled else "[OFF]"
        print(f"  {icon} {name}")

    print("\n=== Other ===\n")
    debounce = config.get("debounce", {}).get("enabled", True)
    interval = config.get("debounce", {}).get("min_interval_seconds", 5)
    print(f"  {'[ON] ' if debounce else '[OFF]'} Debounce ({interval}s interval)")

    print(f"\n=== Usage ===\n")
    print(f"  python {Path(__file__).name} <hook_name> on|off")
    print(f"  python {Path(__file__).name} all on|off")
    print(f"  python {Path(__file__).name} tts|toast|sounds|debounce on|off")
    print(f"  python {Path(__file__).name} notify on|off    # all 3 methods")
    print()


def _ensure_key(config, section, default=None):
    """Ensure a config section exists."""
    if section not in config:
        config[section] = default if default is not None else {}


def toggle(target, enable):
    """Toggle a hook or feature."""
    config = load_config()

    if target == "all":
        _ensure_key(config, "hooks", {})
        for hook in ALL_HOOKS:
            config["hooks"][hook] = enable
        print(f"All hooks {'enabled' if enable else 'disabled'}")

    elif target == "notify":
        for section in ("tts", "toast", "sounds"):
            _ensure_key(config, section, {})
            config[section]["enabled"] = enable
        print(f"All notification methods {'enabled' if enable else 'disabled'}")

    elif target == "tts":
        _ensure_key(config, "tts", {})
        config["tts"]["enabled"] = enable
        print(f"TTS {'enabled' if enable else 'disabled'}")

    elif target == "toast":
        _ensure_key(config, "toast", {})
        config["toast"]["enabled"] = enable
        print(f"Toast notifications {'enabled' if enable else 'disabled'}")

    elif target == "sounds":
        _ensure_key(config, "sounds", {})
        config["sounds"]["enabled"] = enable
        print(f"Sound effects {'enabled' if enable else 'disabled'}")

    elif target == "debounce":
        _ensure_key(config, "debounce", {})
        config["debounce"]["enabled"] = enable
        print(f"Debounce {'enabled' if enable else 'disabled'}")

    else:
        # It's a hook name
        _ensure_key(config, "hooks", {})
        config["hooks"][target] = enable
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
