#!/usr/bin/env python3
"""Black-box tests for block_disk_wipe.py: feed it hook input, assert the decision.

Run: python3 claude/.claude/hooks/test_block_disk_wipe.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_disk_wipe.py")


def run(command):
    payload = json.dumps({"tool_input": {"command": command}, "cwd": "/home/someone/project"})
    proc = subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, check=True
    )
    if not proc.stdout.strip():
        return None
    return json.loads(proc.stdout)["hookSpecificOutput"]["permissionDecision"]


PASSES = [
    "ls -la",
    "rm -rf build",
    "git reset --hard origin/main",
    "dd if=/dev/zero of=/tmp/blank.img bs=1M count=10",
    "echo hi > /dev/null",
    "cat /dev/sda1 | head -c 512",
    "echo 'never run mkfs on this' > notes.txt",
    "cat > notes.md <<'EOF'\nmkfs.ext4 and wipefs are the disk-wipe commands\nEOF",
    "grep -n mkfs hooks/block_disk_wipe.py",
    "git commit -m 'feat: deny mkfs and wipefs'",
]

DENIED = [
    "mkfs.ext4 /dev/sda1",
    "mkfs -t xfs /dev/nvme0n1p2",
    "dd if=/dev/zero of=/dev/sda bs=1M",
    "sudo dd if=image.iso of=/dev/mmcblk0",
    "wipefs -a /dev/sdb",
    "cat image.img > /dev/nvme0n1",
    "ls; mkfs.vfat /dev/sdc1",
    "/usr/sbin/mkfs.btrfs /dev/sdd",
    "sudo -n env FOO=1 wipefs --all /dev/sde",
    "cat image.img >/dev/sdb",
]


class DiskWipe(unittest.TestCase):
    def test_passes(self):
        for command in PASSES:
            with self.subTest(command=command):
                self.assertIsNone(run(command))

    def test_denied(self):
        for command in DENIED:
            with self.subTest(command=command):
                self.assertEqual(run(command), "deny")

    def test_garbage_input_passes(self):
        proc = subprocess.run([sys.executable, str(HOOK)], input="not json", capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, "")


if __name__ == "__main__":
    unittest.main()
