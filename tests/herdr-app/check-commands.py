#!/usr/bin/env python3
"""Check the herdr commands and mods that this repo's mods and keys.json name.

Reads the commands herdr documents, in the run() comment of herdr.d.ts
and the "## Commands" section of AGENTS.md, and checks every .js file of
every mod under herdr-app/.config/herdr-app/mods/, comments included:

- every quoted string shaped like a command, `word.word` with letters,
  `_` or `-` after the dot (`pane.zoom`, `panes.zoom`, `pane.zoom-in`),
  wherever it stands: a run() call, or a table such as the leader's that
  hands it to run() later. It must be a documented command or one of
  the names in NOT_COMMANDS. A `<mod>.<command>` for a mod's nextCommand()
  goes there too: allowing every `<mod>.` would let a typo such as
  `tabs.next` pass, since herdr ships a mod named tabs;
- the first argument of every run() call given as a literal, whatever its
  shape, by the same rule;
- every mod named by mod.open (`"mod.open", { name: "picker" }`) or
  openOverlay (`openOverlay({ mod: "file-popup", ... })`), keys quoted or
  not: it must be a mod folder in this repo or in the live mods folder.
  An openOverlay( call whose object has no literal `mod` at its top level
  (a `mod` inside its props does not count) fails too, so the check does
  not support openOverlay({ layout }); no mod here uses it;
- the mod of a tab.new or pane.split run() call that names a literal `mod`
  at its top level (`run("tab.new", { name: "Board", mod: "board" })`),
  by the same rule; one without a `mod` opens a terminal and passes.

It also checks every action in the package's keys.json, the other place
that names commands: `name` or `name:value` must be a documented command
(`mod.open:<mod>` naming an existing mod), `send:` and `terminal` pass,
and a `<mod>.<command>` must name an existing mod whose .js files quote
that command, the string its nextCommand() returns.

The documented set is read from prose, so it also holds a few names that
are no commands (herdr.pinned, herdr.right, selection.end); that only lets
those exact strings pass.

Usage: python3 -I check-commands.py [herdr-app home]
       (default ~/.config/herdr-app; mise run herdr-app-check runs it)
Prints one line per finding and exits 1 when there is any, 0 otherwise.
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MODS = REPO / "herdr-app/.config/herdr-app/mods"
KEYS = REPO / "herdr-app/.config/herdr-app/keys.json"

# Shaped like commands but none: shared-state keys, and the mod commands
# that mods send with run().
NOT_COMMANDS = {"focus.history", "leader.state", "workspace.panels", "leader.send_prefix", "board.focus"}
# File names in the prose (keys.json, mod.json) are no commands.
FILE_TYPES = {"js", "json", "md", "svg", "png", "ts", "toml"}

DOCUMENTED = re.compile(r"\b([a-z]+)\.([a-z_]+(?:\|[a-z_]+)*)\b")
SHAPED = re.compile(r"""(["'`])([A-Za-z]+\.[A-Za-z_-]+)\1""")
RUN = re.compile(r"""\brun\(\s*(["'`])([^"'`]*)\1""")
# The app commands whose `mod` argument opens a mod.
MOD_COMMANDS = {"tab.new", "pane.split"}
Q = r"""["'`]"""
MOD_OPEN = re.compile(rf"""{Q}mod\.open{Q}\s*,\s*\{{\s*{Q}?name{Q}?\s*:\s*{Q}([^"'`]+){Q}""")
OPEN_OVERLAY = re.compile(r"\bopenOverlay\(")
MOD_ARG = re.compile(rf"""{Q}?\bmod{Q}?\s*:\s*{Q}([^"'`]+){Q}""")


def call_top_level(text, start):
    """The arguments of the call whose "(" is at `start`, up to its ")",
    without strings' contents breaking the count and without anything
    nested deeper than the first object (`props: { ... }` drops out)."""
    depth, braces, out, i, quote = 0, 0, [], start, None
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                if braces <= 1:
                    out.append(text[i : i + 2])
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                break
        elif c == "{":
            braces += 1
            if braces == 2:
                out.append("{")
        elif c == "}":
            braces -= 1
        if braces <= 1:
            out.append(c)
        i += 1
    return "".join(out)


def documented(home):
    """Command names from herdr.d.ts's run() comment and AGENTS.md's Commands."""
    dts = (home / "herdr.d.ts").read_text()
    start = dts.index("Runs a command, the same ones keys.json binds")
    run_doc = dts[start : dts.index("export function run(", start)]
    agents = (home / "AGENTS.md").read_text()
    start = agents.index("\n## Commands\n")
    commands_doc = agents[start : agents.index("\n## ", start + 1)]
    names = set()
    for text in (run_doc, commands_doc):
        # `layout.toggle|show|hide` names three commands.
        for space, verbs in DOCUMENTED.findall(text):
            if len(space) > 1:
                names.update(f"{space}.{verb}" for verb in verbs.split("|") if verb not in FILE_TYPES)
    return names


def mod_sources(home, mod):
    """The .js files of a mod, from this repo or else the live mods folder."""
    for folder in (MODS / mod, home / "mods" / mod):
        if folder.is_dir():
            return [p.read_text() for p in sorted(folder.glob("*.js"))]
    return []


def check_keys(known, home, mods, checked):
    """Findings for keys.json's actions."""
    where = KEYS.relative_to(REPO)
    findings = []
    for section, bindings in json.loads(KEYS.read_text()).items():
        for key, action in bindings.items():
            name, _, value = (action.get("command", "") if isinstance(action, dict) else action).partition(":")
            if name in ("send", "terminal"):
                continue
            checked.add(name)
            at = f"{where}: {section} {key}"
            if name in known:
                if name == "mod.open" and value and value not in mods:
                    findings.append(f"{at}: no mod named {value!r}")
                continue
            mod, _, command = name.partition(".")
            quoted = re.compile(rf"""(["'`]){re.escape(command)}\1""")
            if mod in mods and command and any(quoted.search(text) for text in mod_sources(home, mod)):
                continue
            findings.append(f"{at}: unknown command {name!r}")
    return findings


def main():
    home = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / ".config/herdr-app"
    known = documented(home)
    mods = {p.name for p in MODS.iterdir() if p.is_dir()}
    mods |= {p.name for p in (home / "mods").iterdir() if (p / "main.js").exists()}

    findings = []
    checked = set()
    for source in sorted(MODS.glob("*/*.js")):
        text = source.read_text()
        where = source.relative_to(REPO)
        names = [value for _, value in SHAPED.findall(text)] + [value for _, value in RUN.findall(text)]
        for name in names:
            checked.add(name)
            if name not in known and name not in NOT_COMMANDS:
                findings.append(f"{where}: unknown app command {name!r}")
        opened = []
        for call in OPEN_OVERLAY.finditer(text):
            found = MOD_ARG.search(call_top_level(text, call.end() - 1))
            if found:
                opened.append(found.group(1))
            else:
                findings.append(f"{where}: openOverlay( without a literal mod at offset {call.start()}")
        for call in RUN.finditer(text):
            if call.group(2) in MOD_COMMANDS:
                found = MOD_ARG.search(call_top_level(text, text.index("(", call.start())))
                if found:
                    opened.append(found.group(1))
        for name in MOD_OPEN.findall(text) + opened:
            checked.add(f"mod {name}")
            if name not in mods:
                findings.append(f"{where}: no mod named {name!r}")
    findings += check_keys(known, home, mods, checked)
    for finding in dict.fromkeys(findings):
        print(f"FAIL {finding}")
    if findings:
        return 1
    print(f"PASS {len(checked)} commands and mod names, {len(known)} documented commands")
    return 0


if __name__ == "__main__":
    sys.exit(main())
