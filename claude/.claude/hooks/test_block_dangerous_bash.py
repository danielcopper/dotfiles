#!/usr/bin/env python3
"""Black-box tests for block_dangerous_bash.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_dangerous_bash.py
"""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_dangerous_bash.py")
HOME = os.path.expanduser("~")
CWD = "/home/someone/project"
SCRATCH = "/tmp/claude-1000/-home-someone-project/0c9c6440/scratchpad"


def run(command, cwd=CWD):
    payload = json.dumps({"tool_input": {"command": command}, "cwd": cwd})
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None, ""
    out = json.loads(proc.stdout)["hookSpecificOutput"]
    return out["permissionDecision"], out["permissionDecisionReason"]


PASSES = [
    "ls -la",
    "rm -f file.txt",
    "rm -rf build",
    "rm -rf ./dist/*",
    "rm -rf .claude/worktrees/feat/x",
    f"rm -rf {CWD}/node_modules",
    'rm -rf "$PWD/build"',
    "rm -rf /tmp/foo/bar",
    "rm -rf /var/tmp/x",
    f'set -e\nS="{SCRATCH}/t2"\nrm -rf "$S"; mkdir -p "$S"; cd "$S"\ngit init -q o.git',
    'T=/tmp/tmp.abc && rm -rf "$T"',
    'A=/tmp/x\nB="$A/y"\nrm -rf "${B}"',
    "export T=/tmp/t; rm -rf $T/sub",
    "rm -rf tmpdir\nls /etc",
    "rm datei\nchmod -R 755 /etc",
    "rm -rf tmpdir\ngrep -r foo /usr",
    'echo "rm -rf /"',
    "git rm -r --cached .",
    "find . -name '*.pyc' | xargs rm",
]

ASKS = [
    ("rm -rf /opt/app/releases/old", "not below"),
    ("rm -r /opt/foo", "not below"),
    ("rm -rf ~/.cache/foo", "not below"),
    ('rm -rf "$HOME/.cache/foo"', "not below"),
    ("rm ~/.bashrc", "not below"),
    ("rm -rf ..", "not below"),
    ("rm -rf ../sibling", "not below"),
    ("rm -rf /tmp", "not below"),
    ("rm -rf /tmp/*", "not below"),
    ("rm /etc", "protected"),
    ('rm -rf "$UNDEFINED"', "unresolved"),
    ('T=$(mktemp -d)\nrm -rf "$T"', "unresolved"),
    ("find . -name x -exec rm -rf {} +", "unresolved"),
    ("cat list | xargs rm -rf", "no explicit target"),
    ('S=""\nrm -rf $S', "no explicit target"),
]

DENIES = [
    ("rm -rf /", "'/'"),
    ("rm -rf /*", "'/*'"),
    ("rm -rf --no-preserve-root /", "'/'"),
    ("rm -rf ~", HOME),
    ("rm -rf ~/", HOME),
    ('rm -rf "$HOME"', HOME),
    ('H="$HOME"\nrm -rf "$H"', HOME),
    (f"rm -rf {HOME}", HOME),
    ("rm -rf /etc", "/etc"),
    ("rm -rf /etc/", "/etc"),
    ("rm -rf /usr/*", "/usr/*"),
    ("sudo rm -rf /var", "/var"),
    ("/bin/rm -rf /etc", "/etc"),
    ("\\rm -rf /etc", "/etc"),
    ("rm -rf *", f"{CWD}/*"),
    ("rm -rf ./*", f"{CWD}/*"),
    ("rm -rf .", CWD),
    ('rm -rf "$PWD"', CWD),
    ("rm -rf ../..", "/home"),
    ("rm -rf /tmp/claude-1000/../../home", "/home"),
    ('X=/etc\nrm -rf "$X/../usr"', "/usr"),
    ('S=""\nrm -rf "$S"/', "'/'"),
    ("mkfs.ext4 /dev/sdb1", "disk-wipe"),
    ("dd if=/dev/zero of=/dev/sda bs=1M", "disk-wipe"),
    ("D=/dev/sda\ndd if=/dev/zero of=$D", "disk-wipe"),
    ("wipefs -a /dev/sdb", "disk-wipe"),
    ("cat img > /dev/nvme0n1", "disk-wipe"),
]


class BlockDangerousBash(unittest.TestCase):
    def test_disposable_targets_pass(self):
        for command in PASSES:
            with self.subTest(command=command):
                self.assertEqual(run(command), (None, ""))

    def test_targets_outside_the_disposable_roots_ask(self):
        for command, fragment in ASKS:
            with self.subTest(command=command):
                decision, reason = run(command)
                self.assertEqual(decision, "ask", reason)
                self.assertIn(fragment, reason)

    def test_catastrophic_targets_and_disk_wipes_deny(self):
        for command, fragment in DENIES:
            with self.subTest(command=command):
                decision, reason = run(command)
                self.assertEqual(decision, "deny", reason)
                self.assertIn(fragment, reason)

    def test_unparseable_input_passes(self):
        proc = subprocess.run(
            [sys.executable, str(HOOK)], input="not json", capture_output=True, text=True
        )
        self.assertEqual((proc.returncode, proc.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
