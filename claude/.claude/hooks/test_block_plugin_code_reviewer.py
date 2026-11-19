#!/usr/bin/env python3
"""Black-box tests for block_plugin_code_reviewer.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_plugin_code_reviewer.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_plugin_code_reviewer.py")


def run(payload):
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None
    return json.loads(proc.stdout)["hookSpecificOutput"]


def spawn(subagent):
    return run(json.dumps({"tool_input": {"subagent_type": subagent, "prompt": "review"}}))


ROUTED = {
    "pr-review-toolkit:code-reviewer": "reviewer",
    "pr-review-toolkit:pr-test-analyzer": "test-reviewer",
    "pr-review-toolkit:silent-failure-hunter": "failure-reviewer",
    "pr-review-toolkit:type-design-analyzer": "type-reviewer",
}

PASSES = [
    "reviewer",
    "test-reviewer",
    "security-reviewer",
    "pr-review-toolkit:code-simplifier",
    "pr-review-toolkit:comment-analyzer",
    "general-purpose",
    "",
]


class RoutesRetiredAgents(unittest.TestCase):
    def test_denies_each_retired_agent_naming_its_replacement(self):
        for retired, replacement in ROUTED.items():
            with self.subTest(retired=retired):
                out = spawn(retired)
                assert out is not None, f"{retired} was not denied"
                self.assertEqual(out["hookEventName"], "PreToolUse")
                self.assertEqual(out["permissionDecision"], "deny")
                self.assertIn(f'subagent_type "{replacement}"', out["permissionDecisionReason"])


class LeavesOthersAlone(unittest.TestCase):
    def test_passes_other_agents(self):
        for subagent in PASSES:
            with self.subTest(subagent=subagent):
                self.assertIsNone(spawn(subagent))

    def test_passes_unreadable_input(self):
        self.assertIsNone(run("not json"))
        self.assertIsNone(run(json.dumps({})))


if __name__ == "__main__":
    unittest.main()
