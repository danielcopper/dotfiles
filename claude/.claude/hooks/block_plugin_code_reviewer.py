#!/usr/bin/env python3
"""PreToolUse(Agent) hook: route code review to the custom reviewer agent.

pr-review-toolkit's generic code-reviewer is retired in favor of
~/.claude/agents/reviewer.md (fresh-context spec+quality review,
confidence-scored findings, hard verdict). Denies spawning the plugin
agent and points the caller at `reviewer`; the plugin's specialist
agents stay available.
"""

import json
import sys

RETIRED = "pr-review-toolkit:code-reviewer"


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    subagent = (data.get("tool_input") or {}).get("subagent_type") or ""
    if subagent != RETIRED:
        return 0
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "pr-review-toolkit's generic code-reviewer is retired "
                        'here. Spawn the custom agent instead: subagent_type '
                        '"reviewer" (fresh-context spec+quality review, '
                        "confidence-scored findings, hard verdict). The "
                        "plugin's specialists (silent-failure-hunter, "
                        "type-design-analyzer, pr-test-analyzer, "
                        "comment-analyzer) remain available."
                    ),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
