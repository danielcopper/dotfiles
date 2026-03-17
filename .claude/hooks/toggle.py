#!/usr/bin/env python3
"""
Hook Toggle Utility
Easily enable/disable hooks from the command line.

Usage:
    python toggle.py                    # Show status of all hooks
    python toggle.py <hook> on|off      # Enable/disable specific hook
    python toggle.py all on|off         # Enable/disable all hooks
    python toggle.py tts on|off         # Enable/disable TTS

Examples:
    python toggle.py pre_tool_use off   # Disable security hook
    python toggle.py notification on    # Enable notifications
    python toggle.py all off            # Disable all hooks
    python toggle.py tts off            # Mute all TTS
"""

import json
import sys
from pathlib import Path

CONFIG_PATH = Path.home() / ".claude" / "hooks" / "config.json"

def load_config():
    """Load configuration."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {"hooks": {}, "tts": {"enabled": True}}

def save_config(config):
    """Save configuration."""
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)

def show_status():
    """Display current hook status."""
    config = load_config()
    hooks = config.get("hooks", {})
    tts = config.get("tts", {})

    print("\n=== Hook Status ===\n")

    all_hooks = [
        "notification", "stop", "subagent_stop", "post_tool_use",
        "pre_tool_use", "user_prompt_submit", "session_start", "pre_compact"
    ]

    for hook in all_hooks:
        status = hooks.get(hook, True)
        icon = "[ON] " if status else "[OFF]"
        print(f"  {icon} {hook}")

    print(f"\n=== TTS ===\n")
    tts_status = tts.get("enabled", True)
    print(f"  {'[ON] ' if tts_status else '[OFF]'} Text-to-Speech")

    print(f"\n=== Usage ===\n")
    print(f"  python {Path(__file__).name} <hook_name> on|off")
    print(f"  python {Path(__file__).name} all on|off")
    print(f"  python {Path(__file__).name} tts on|off")
    print()

def toggle_hook(hook_name, enable):
    """Toggle a specific hook."""
    config = load_config()

    if "hooks" not in config:
        config["hooks"] = {}

    if hook_name == "all":
        all_hooks = [
            "notification", "stop", "subagent_stop", "post_tool_use",
            "pre_tool_use", "user_prompt_submit", "session_start", "pre_compact"
        ]
        for hook in all_hooks:
            config["hooks"][hook] = enable
        print(f"All hooks {'enabled' if enable else 'disabled'}")
    elif hook_name == "tts":
        if "tts" not in config:
            config["tts"] = {}
        config["tts"]["enabled"] = enable
        print(f"TTS {'enabled' if enable else 'disabled'}")
    else:
        config["hooks"][hook_name] = enable
        print(f"Hook '{hook_name}' {'enabled' if enable else 'disabled'}")

    save_config(config)

def main():
    if len(sys.argv) == 1:
        show_status()
        return

    if len(sys.argv) != 3:
        print("Usage: python toggle.py <hook_name|all|tts> <on|off>")
        sys.exit(1)

    hook_name = sys.argv[1].lower()
    action = sys.argv[2].lower()

    if action not in ["on", "off"]:
        print("Action must be 'on' or 'off'")
        sys.exit(1)

    enable = action == "on"

    valid_hooks = [
        "notification", "stop", "subagent_stop", "post_tool_use",
        "pre_tool_use", "user_prompt_submit", "session_start", "pre_compact",
        "all", "tts"
    ]

    if hook_name not in valid_hooks:
        print(f"Unknown hook: {hook_name}")
        print(f"Valid hooks: {', '.join(valid_hooks)}")
        sys.exit(1)

    toggle_hook(hook_name, enable)

if __name__ == "__main__":
    main()
