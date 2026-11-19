#!/usr/bin/env python3
"""PreToolUse(Agent) hook: route retired pr-review-toolkit agents to the own ones.

The plugin's generic code-reviewer and its test, silent-failure and
type-design specialists are replaced by the agents under
~/.claude/agents/ that ~/.claude/review-agents.md names. Denies spawning
a retired plugin agent and names its replacement; the plugin's other
agents pass.
"""

import json
import sys

REPLACED_BY = {
    "pr-review-toolkit:code-reviewer": "reviewer",
    "pr-review-toolkit:pr-test-analyzer": "test-reviewer",
    "pr-review-toolkit:silent-failure-hunter": "failure-reviewer",
    "pr-review-toolkit:type-design-analyzer": "type-reviewer",
}


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    subagent = (data.get("tool_input") or {}).get("subagent_type") or ""
    replacement = REPLACED_BY.get(subagent)
    if replacement is None:
        return 0
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        f"{subagent} is retired here. Spawn the own agent "
                        f'instead: subagent_type "{replacement}" '
                        f"(~/.claude/agents/{replacement}.md); "
                        "~/.claude/review-agents.md says which review "
                        "agents run and what each gets."
                    ),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
