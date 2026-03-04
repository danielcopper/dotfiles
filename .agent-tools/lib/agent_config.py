#!/usr/bin/env python3
"""Shared config loader for ~/.agent-tools/

Tool-agnostic configuration. No Claude Code hook protocol dependencies.
"""

import json
from pathlib import Path

_AGENT_TOOLS_CONFIG = Path.home() / ".agent-tools" / "config.json"
_LEGACY_CONFIG = Path.home() / ".claude" / "hooks" / "config.json"

_config_cache = None

_DEFAULT_HARD_BLOCKS = {
    "force_push": "warn",
    "deploy": "deny",
    "non_local_db": "deny",
    "allowed_db_hosts": ["localhost", "127.0.0.1", "::1", "host.docker.internal", "."],
    "allowed_db_ports": [1433],
}

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
    "hard_blocks": _DEFAULT_HARD_BLOCKS,
}

_DEFAULT_QUALITY_GATES = {
    "timeout_seconds": 60,
    "csharp": {"build": True, "format_check": True},
    "typescript": {"typecheck": True, "lint": True},
    "python": {"lint": True, "typecheck": False},
}


def get_config():
    """Load and cache configuration from disk."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    for path in (_AGENT_TOOLS_CONFIG, _LEGACY_CONFIG):
        try:
            if path.exists():
                with open(path, "r") as f:
                    _config_cache = json.load(f)
                return _config_cache
        except Exception:
            continue

    _config_cache = {}
    return _config_cache


def get_security_config():
    """Get security configuration with defaults."""
    config = get_config()
    security = config.get("security", {})

    result = dict(_DEFAULT_SECURITY)
    result.update(security)

    # Merge hard_blocks sub-dict properly
    default_hb = dict(_DEFAULT_HARD_BLOCKS)
    default_hb.update(security.get("hard_blocks", {}))
    result["hard_blocks"] = default_hb

    return result


def get_hard_blocks_config():
    """Get hard blocks configuration."""
    return get_security_config()["hard_blocks"]


def get_quality_gates_config():
    """Get quality gates configuration with defaults."""
    config = get_config()
    gates = config.get("quality_gates", {})

    result = dict(_DEFAULT_QUALITY_GATES)
    result.update(gates)
    return result
