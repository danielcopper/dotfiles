#!/usr/bin/env python3
"""Check commands for hard blocks (force push, deploy, non-local DB).

Tool-agnostic. No Claude Code dependencies.
Returns {"blocked": bool, "reason": str, "policy": "deny"|"warn"}.
"""

import re
import sys
from pathlib import Path

# Ensure sibling modules are importable
_lib_dir = str(Path(__file__).resolve().parent)
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from agent_config import get_hard_blocks_config
from connection_parser import extract_db_targets, is_local_host

# Force push patterns
_FORCE_PUSH = re.compile(
    r"\bgit\s+push\b.*?(?:--force(?:-with-lease)?|-f\b)",
    re.IGNORECASE,
)

# Deploy command patterns
_DEPLOY_PATTERNS = [
    re.compile(r"\baz\s+webapp\s+(?:deploy|up)\b", re.IGNORECASE),
    re.compile(r"\bkubectl\s+(?:apply|create|delete|rollout)\b", re.IGNORECASE),
    re.compile(r"\bdocker\s+push\b", re.IGNORECASE),
    re.compile(r"\bhelm\s+(?:install|upgrade|delete|uninstall)\b", re.IGNORECASE),
]

_NOT_BLOCKED = {"blocked": False, "reason": "", "policy": ""}


def _split_commands(command):
    """Split multi-command string into segments.

    Splits on &&, ;, || but not inside quotes.
    Returns list of command segments plus the original full string.
    """
    # Simple split — doesn't handle nested quotes perfectly,
    # but combined with checking the full string, catches edge cases.
    segments = re.split(r"\s*(?:&&|\|\||;)\s*", command)
    # Always include the full string too (catches patterns in substrings/quotes)
    result = [s.strip() for s in segments if s.strip()]
    if command.strip() not in result:
        result.append(command.strip())
    return result


def _check_force_push(command, policy):
    """Check for git push --force."""
    if policy == "allow":
        return None
    if _FORCE_PUSH.search(command):
        return {
            "blocked": True,
            "reason": "Force push detected. Use regular git push instead.",
            "policy": policy,
        }
    return None


def _check_deploy(command, policy):
    """Check for deploy commands."""
    if policy == "allow":
        return None
    for pattern in _DEPLOY_PATTERNS:
        m = pattern.search(command)
        if m:
            return {
                "blocked": True,
                "reason": f"Deploy command blocked: {m.group(0)}",
                "policy": policy,
            }
    return None


def _check_non_local_db(command, policy, allowed_hosts):
    """Check for non-local database connections."""
    if policy == "allow":
        return None

    targets = extract_db_targets(command)
    for target in targets:
        if not is_local_host(target["host"], allowed_hosts):
            return {
                "blocked": True,
                "reason": (
                    f"Non-local database connection blocked: "
                    f"{target['host']} (via {target['source']}). "
                    f"Allowed hosts: {', '.join(allowed_hosts)}"
                ),
                "policy": policy,
            }
    return None


def check_command(command, config=None):
    """Check a command string for hard blocks.

    Args:
        command: The command string to check.
        config: Optional hard_blocks config dict. Loaded from config.json if None.

    Returns:
        {"blocked": bool, "reason": str, "policy": "deny"|"warn"|""}
    """
    if not command or not command.strip():
        return _NOT_BLOCKED

    if config is None:
        config = get_hard_blocks_config()

    segments = _split_commands(command)

    for segment in segments:
        # Force push
        result = _check_force_push(segment, config.get("force_push", "warn"))
        if result:
            return result

        # Deploy commands
        result = _check_deploy(segment, config.get("deploy", "deny"))
        if result:
            return result

        # Non-local DB
        result = _check_non_local_db(
            segment,
            config.get("non_local_db", "deny"),
            config.get("allowed_db_hosts", ["localhost", "127.0.0.1", "::1", "."]),
        )
        if result:
            return result

    return _NOT_BLOCKED
