#!/usr/bin/env python3
"""Tests for check-commands.py, each in a throwaway copy of the repo layout:
the checker beside its tests/herdr-app/, a mods folder with the mods a case
writes, an empty keys.json, and a herdr-app home whose herdr.d.ts and
AGENTS.md document a few commands. Nothing of the real home is read.

Usage: python3 -I check-commands-test.py   (mise run herdr-app-check --test)
"""

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CHECKER = Path(__file__).resolve().with_name("check-commands.py")

DTS = """/**
 * Runs a command, the same ones keys.json binds. Tabs: tab.new {name?, mod?}, pane.split {direction, mod?},
 * mod.open {name}.
 */
export function run(name: string): null;
"""
AGENTS = "# Herdr app\n\n## Commands\n\n- `tab.new`, `pane.split`, `mod.open`.\n\n## More\n"


def check(mods):
    """Runs the checker over `mods` ({name: main.js text}); returns (exit, output)."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "tests/herdr-app").mkdir(parents=True)
        shutil.copy(CHECKER, root / "tests/herdr-app/check-commands.py")
        package = root / "herdr-app/.config/herdr-app"
        for name, text in mods.items():
            (package / "mods" / name).mkdir(parents=True)
            (package / "mods" / name / "main.js").write_text(text)
        (package / "keys.json").write_text("{}")
        home = root / "home"
        (home / "mods").mkdir(parents=True)
        (home / "herdr.d.ts").write_text(DTS)
        (home / "AGENTS.md").write_text(AGENTS)
        r = subprocess.run([sys.executable, "-I", str(root / "tests/herdr-app/check-commands.py"), str(home)],
                           capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr


class ModInNewTabs(unittest.TestCase):
    def test_tab_new_with_a_missing_mod_fails(self):
        code, out = check({"a": 'run("tab.new", { name: "A", mod: "nosuch" });'})
        self.assertEqual(code, 1, out)
        self.assertIn("mods/a/main.js: no mod named 'nosuch'", out)

    def test_pane_split_with_a_missing_mod_fails(self):
        code, out = check({"a": 'run("pane.split", { direction: "right", mod: "gone" });'})
        self.assertEqual(code, 1, out)
        self.assertIn("no mod named 'gone'", out)

    def test_an_existing_mod_passes(self):
        code, out = check({"a": 'run("tab.new", { name: "A", mod: "b" });', "b": "// b"})
        self.assertEqual(code, 0, out)
        self.assertIn("PASS", out)

    def test_a_mod_inside_props_is_not_the_tabs(self):
        code, out = check({"a": 'run("tab.new", { props: { mod: "nosuch" }, name: "A" });'})
        self.assertEqual(code, 0, out)
        code, out = check({"a": 'run("tab.new", { props: { mod: "nosuch" }, mod: "b" });', "b": "// b"})
        self.assertEqual(code, 0, out)


if __name__ == "__main__":
    unittest.main()
