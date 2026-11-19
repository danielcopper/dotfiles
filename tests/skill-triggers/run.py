"""Check that the model-invoked skills under claude/.claude/skills fire on the
prompts they should and stay quiet on the ones they should not.

The skills come from the frontmatter: every directory with a SKILL.md that
does not set `disable-model-invocation: true` is model-invoked. cases.toml
holds the prompts; each case names the skill that must fire (or "none": no
skill at all) and the skills that must stay quiet. Before anything runs, every
model-invoked skill must fire in one case and stay quiet in another, and a
case may name only model-invoked skills.

Each run is one headless `claude -p` with the case's prompt, its stream-json
read for Skill tool calls. Tools are Skill, Read, Glob and Grep; the run stops
after --max-turns turns or --max-budget-usd. Runs are model calls on your
account: run this after changing a skill description, one run at a time.

Isolation. Each run gets a fresh temporary directory holding HOME (with a copy
of the repo's skills in ~/.claude/skills and nothing else), the working
directory and TMPDIR. The child starts under bwrap with an empty environment
apart from an allowlist, an empty directory mounted over the real home and a
tmpfs over /run/user/<uid>; the claude binary is mounted into the temporary
directory. The child sees none of the real home, so no settings, CLAUDE.md,
memory, plugins or MCP servers load. A file the child writes below the real
home's path lands in that empty directory; such a write fails the run. Every
run also checks the session's init event: all repo skills listed, no plugin
but Claude Code's built-in ones, no MCP server. --check runs the isolation
probe through the same wrapper without a model call, including a canary write
below the real home that the write check must catch.

Credentials. CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY from the
environment is passed on when set. Otherwise the access token of the saved
claude.ai login (~/.claude/.credentials.json, or below CLAUDE_CONFIG_DIR) is
read for each run and handed to the child as CLAUDE_CODE_OAUTH_TOKEN; its
refresh token never leaves the file. An access token close to expiry stops
the run: open an interactive claude session to renew it, or set
CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`.

usage: python3 -I run.py [options] [case ...]
  --list                print the case names
  --check               validate cases.toml and run the isolation probe, no model call
  --model M             model for the runs (default: opus)
  --runs N              runs per case (default: 1); a case passes when every run does
  --max-turns N         turn cap per run (default: 4)
  --max-budget-usd X    cost cap per run (default: 1.00)
  --timeout S           seconds per run (default: 600)
  --keep DIR            write each run's stream-json to DIR/<case>-<run>.jsonl
Without case names every case runs. Exit 0: all passed; 1: a case failed;
2: usage, case file, isolation or credential error.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
from pathlib import Path
from typing import NamedTuple

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SKILLS = REPO / "claude" / ".claude" / "skills"
CASES = HERE / "cases.toml"
TASK = "skill-trigger-test"
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
TOOLS = "Skill,Read,Glob,Grep"
TOKEN_VARS = ("CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY")
# Passed on from the caller's environment when set; everything else is dropped.
PASSED_ON = (
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
)
# Set by the wrapper itself.
OWN_VARS = ("PATH", "HOME", "TMPDIR", "TERM", "DISABLE_AUTOUPDATER")
# Set by the shell the isolation probe runs, not by the wrapper.
SHELL_VARS = ("PWD", "OLDPWD", "SHLVL", "_")
ALLOWED_VARS = set(OWN_VARS + PASSED_ON + TOKEN_VARS + SHELL_VARS)

# The status of one run.
PASS = "PASS"  # the skills fired as the case says
FAIL = "FAIL"  # a skill fired that must stay quiet, or the one that must fire did not
ERROR = "ERROR"  # the run did not finish cleanly, so it says nothing about the skills
ISOLATION = "ISOLATION"  # the session saw more than the sandbox; stops the whole run
AUTH = "AUTH"  # the credential was refused; stops the whole run


class Verdict(NamedTuple):
    """What grade() makes of one run."""

    status: str
    fired: list
    cost: float | None  # None: the run left no result event to read it from
    note: str
    model: str | None = None  # as the session's init event names it


class Stop(Exception):
    """An error that ends the whole run with exit 2."""


def frontmatter(path):
    """The top-level `key: value` pairs between the leading --- lines."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fields = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        m = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", line)
        if m:
            value = m.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            fields[m.group(1)] = value
    return fields


def repo_skills():
    """All skill directory names, and the model-invoked ones among them."""
    every, model = [], []
    for d in sorted(SKILLS.iterdir()):
        skill_md = d / "SKILL.md"
        if not skill_md.is_file():
            continue
        every.append(d.name)
        if frontmatter(skill_md).get("disable-model-invocation", "").lower() != "true":
            model.append(d.name)
    if not model:
        raise Stop(f"no model-invoked skill found under {SKILLS}")
    return every, model


def load_cases(model):
    """The cases of cases.toml, after checking them against the model-invoked skills."""
    try:
        data = tomllib.loads(CASES.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as e:
        raise Stop(f"{CASES}: {e}") from None
    cases = data.get("case")
    if set(data) != {"case"} or not isinstance(cases, list) or not cases:
        raise Stop(f"{CASES}: expected only [[case]] tables")
    known = set(model)
    problems, seen = [], set()
    fires_in = {s: [] for s in model}
    quiet_in = {s: [] for s in model}
    for i, case in enumerate(cases, 1):
        name = case.get("name")
        where = f"case {name!r}" if isinstance(name, str) else f"case #{i}"
        extra = set(case) - {"name", "prompt", "fires", "quiet"}
        if extra:
            problems.append(f"{where}: unknown keys {sorted(extra)}")
        if not isinstance(name, str) or not NAME_RE.match(name):
            problems.append(f"{where}: name must match {NAME_RE.pattern}")
        elif name in seen:
            problems.append(f"{where}: name used twice")
        seen.add(name)
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            problems.append(f"{where}: prompt missing")
        fires = case.get("fires")
        quiet = case.get("quiet", [])
        if fires is None and not quiet:
            problems.append(f"{where}: names neither fires nor quiet")
        if fires is not None:
            if fires != "none" and fires not in known:
                problems.append(f"{where}: fires {fires!r} is no model-invoked skill")
            elif fires in fires_in:
                fires_in[fires].append(name)
        if not isinstance(quiet, list) or not all(isinstance(q, str) for q in quiet):
            problems.append(f"{where}: quiet must be a list of skill names")
            continue
        for q in quiet:
            if q not in known:
                problems.append(f"{where}: quiet {q!r} is no model-invoked skill")
            elif q == fires:
                problems.append(f"{where}: {q} must both fire and stay quiet")
            else:
                quiet_in[q].append(name)
    for s in model:
        if not fires_in[s]:
            problems.append(f"skill {s}: no case where it must fire")
        if not quiet_in[s]:
            problems.append(f"skill {s}: no case where it must stay quiet")
    if problems:
        raise Stop(f"{CASES}:\n  " + "\n  ".join(problems))
    return cases


def claude_binary():
    found = shutil.which("claude")
    if not found:
        raise Stop("claude is not on PATH")
    return Path(found).resolve()


def credential_env():
    """The variable that authenticates the child, and where it came from."""
    for var in TOKEN_VARS:
        if os.environ.get(var):
            return {var: os.environ[var]}, f"{var} from the environment"
    config = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    path = config / ".credentials.json"
    try:
        login = json.loads(path.read_text(encoding="utf-8"))["claudeAiOauth"]
        token, expires = login["accessToken"], login["expiresAt"] / 1000
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise Stop(
            f"no credential: neither {' nor '.join(TOKEN_VARS)} is set, and {path} "
            f"has no claude.ai login ({e.__class__.__name__})"
        ) from None
    minutes = (expires - time.time()) / 60
    if minutes < 5:
        raise Stop(
            f"the saved claude.ai login expires in {minutes:.0f} min: open an interactive "
            "claude session to renew it, or set CLAUDE_CODE_OAUTH_TOKEN from "
            "`claude setup-token`"
        )
    return {
        "CLAUDE_CODE_OAUTH_TOKEN": token
    }, f"the saved claude.ai login ({minutes:.0f} min left)"


class Sandbox:
    """A temporary HOME, working directory and TMPDIR, and the bwrap wrapper around them."""

    def __init__(self, every, binary):
        self.root = Path(tempfile.mkdtemp(prefix="skill-trigger-"))
        self.home = self.root / "home"
        self.work = self.root / "work"
        self.tmp = self.root / "tmp"
        self.guard = self.root / "real-home"
        self.claude = self.root / "bin" / "claude"
        for d in (
            self.home / ".claude" / "skills",
            self.work,
            self.tmp,
            self.guard,
            self.claude.parent,
        ):
            d.mkdir(parents=True)
        self.claude.touch()
        for name in every:
            shutil.copytree(SKILLS / name, self.home / ".claude" / "skills" / name)
        self.binary = binary
        self.real_home = Path(os.path.realpath(Path.home()))

    def env(self, extra=None):
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(self.home),
            "TMPDIR": str(self.tmp),
            "TERM": "dumb",
            "DISABLE_AUTOUPDATER": "1",
        }
        env.update({k: os.environ[k] for k in PASSED_ON if k in os.environ})
        env.setdefault("LANG", "C.UTF-8")
        env.update(extra or {})
        return env

    def argv(self, command):
        wrap = [
            "bwrap",
            "--dev-bind",
            "/",
            "/",
            "--bind",
            str(self.guard),
            str(self.real_home),
        ]
        run_user = Path(f"/run/user/{os.getuid()}")
        if run_user.is_dir():
            wrap += ["--tmpfs", str(run_user)]
        # After the real home is covered, so a TMPDIR below it stays reachable.
        wrap += [
            "--bind",
            str(self.root),
            str(self.root),
            "--ro-bind",
            str(self.binary),
            str(self.claude),
            "--chdir",
            str(self.work),
            "--die-with-parent",
            "--",
        ]
        return wrap + command

    def written(self):
        """What the child wrote below the real home's path."""
        return sorted(str(p.relative_to(self.guard)) for p in self.guard.rglob("*"))

    def remove(self):
        shutil.rmtree(self.root, ignore_errors=True)


def isolation_probe(every, binary):
    """Run a shell through the wrapper and check what it sees; raise Stop on a leak."""
    if not shutil.which("bwrap"):
        raise Stop("bwrap is not on PATH; the runs need it to hide the real home")
    box = Sandbox(every, binary)
    canary = ".skill-trigger-canary"
    try:
        env = box.env()
        script = 'printf "%s\\n" "$HOME"; ls -A "$1"; echo ---; env; : > "$1/$2"'
        proc = subprocess.run(
            box.argv(["/bin/sh", "-c", script, "sh", str(box.real_home), canary]),
            check=False,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise Stop(
                f"isolation probe exited {proc.returncode}: {proc.stderr.strip()}"
            )
        head, _, env_out = proc.stdout.partition("---\n")
        lines = head.splitlines()
        problems = []
        if not lines or lines[0] != str(box.home):
            problems.append(f"HOME is {lines[0] if lines else None!r}, not {box.home}")
        if lines[1:]:
            problems.append(f"the real home shows {lines[1:]}")
        seen = {line.split("=", 1)[0] for line in env_out.splitlines() if "=" in line}
        leaked = seen - ALLOWED_VARS
        if leaked:
            problems.append(f"variables beyond the allowlist: {sorted(leaked)}")
        if box.written() != [canary]:
            problems.append(f"the write check saw {box.written()}, not the canary")
        if (box.real_home / canary).exists():
            (box.real_home / canary).unlink()
            problems.append("the canary reached the real home")
        if problems:
            raise Stop("isolation probe:\n  " + "\n  ".join(problems))
    finally:
        box.remove()


def grade(lines, case, every, exit_code=0, stderr=""):
    """The Verdict on one run, from its stream-json lines, exit code and stderr.

    exit_code None means the run timed out. Only a run that ended cleanly is
    graded on its skills: a result event with subtype success and is_error
    false, or the turn cap of error_max_turns, and no API error on the way.
    Anything else is an ERROR, which says nothing about the skills.
    """
    init, result, fired, replied, api_errors = None, None, [], False, []
    for line in lines:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        kind = event.get("type")
        if kind == "system" and event.get("subtype") == "init" and init is None:
            init = event
        elif kind == "result":
            result = event
        elif kind == "assistant":
            content = (event.get("message") or {}).get("content") or []
            error = event.get("error")
            if (
                error
                or event.get("is_api_error_message")
                or event.get("isApiErrorMessage")
            ):
                text = " ".join(
                    b.get("text", "") for b in content if isinstance(b, dict)
                )
                api_errors.append((str(error or "api_error"), text.strip()))
                continue
            replied = True
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use" and block.get("name") == "Skill":
                    skill = str((block.get("input") or {}).get("skill", ""))
                    fired.append(skill.split(":")[-1])
    cost = (result or {}).get("total_cost_usd")
    model = (init or {}).get("model")
    tail = stderr.strip().splitlines()[-1][:200] if stderr.strip() else ""

    def error(reason):
        return Verdict(
            ERROR, fired, cost, f"{reason}: {tail}" if tail else reason, model
        )

    if init is None:
        return error("no init event")
    missing = sorted(set(every) - set(init.get("skills") or []))
    foreign = [
        p.get("name") for p in init.get("plugins") or [] if p.get("path") != "builtin"
    ]
    leaks = []
    if missing:
        leaks.append(f"skills missing from the session: {missing}")
    if foreign:
        leaks.append(f"plugins loaded: {foreign}")
    if init.get("mcp_servers"):
        leaks.append(
            f"MCP servers loaded: {[s.get('name') for s in init['mcp_servers']]}"
        )
    if leaks:
        return Verdict(ISOLATION, fired, cost, "; ".join(leaks), model)
    if any(kind == "authentication_failed" for kind, _ in api_errors):
        text = next(
            text for kind, text in api_errors if kind == "authentication_failed"
        )
        return Verdict(AUTH, fired, cost, text[:200] or "authentication_failed", model)
    if api_errors:
        kind, text = api_errors[0]
        return error(f"API error {kind}" + (f" ({text[:200]})" if text else ""))
    if exit_code is None:
        return error("timed out")
    if result is None:
        return error("no result event")
    subtype = result.get("subtype")
    capped = subtype == "error_max_turns"
    if not capped and (subtype != "success" or result.get("is_error")):
        reason = result.get("result") or "; ".join(map(str, result.get("errors") or []))
        return error(f"[{subtype}] {str(reason)[:200]}".rstrip())
    if exit_code != 0 and not capped:
        return error(f"exited {exit_code}")
    if not replied:
        return error("no reply")
    fires, quiet = case.get("fires"), case.get("quiet", [])
    problems = []
    if fires == "none" and fired:
        problems.append("no skill may fire")
    elif fires not in (None, "none") and fires not in fired:
        problems.append(f"{fires} did not fire")
    loud = [q for q in quiet if q in fired]
    if loud:
        problems.append(f"{', '.join(loud)} must stay quiet")
    note = "; ".join(problems)
    if capped:
        note = f"{note} [{subtype}]" if note else f"[{subtype}]"
    return Verdict(FAIL if problems else PASS, fired, cost, note, model)


def run_case(case, every, binary, args):
    """One run of a case: its Verdict and the raw stream."""
    creds, _ = credential_env()
    box = Sandbox(every, binary)
    try:
        command = [
            str(box.claude),
            "-p",
            case["prompt"],
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            args.model,
            "--tools",
            TOOLS,
            "--allowedTools",
            TOOLS,
            "--max-turns",
            str(args.max_turns),
            "--max-budget-usd",
            str(args.max_budget_usd),
            "--strict-mcp-config",
            "--no-session-persistence",
        ]
        try:
            proc = subprocess.run(
                box.argv(command),
                check=False,
                env=box.env(creds),
                capture_output=True,
                text=True,
                timeout=args.timeout,
                stdin=subprocess.DEVNULL,
            )
            out, err, code = proc.stdout, proc.stderr, proc.returncode
        except subprocess.TimeoutExpired as e:
            out = e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
            err, code = f"after {args.timeout}s", None
        verdict = grade(out.splitlines(), case, every, code, err)
        written = box.written()
        if written:
            verdict = verdict._replace(
                status=ISOLATION, note=f"wrote below the real home: {written}"
            )
        return verdict, out
    finally:
        box.remove()


def main():
    parser = argparse.ArgumentParser(prog="run.py", add_help=True)
    parser.add_argument("cases", nargs="*")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--model", default="opus")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--max-turns", type=int, default=4)
    parser.add_argument("--max-budget-usd", type=float, default=1.00)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--keep", type=Path)
    args = parser.parse_args()
    if (
        args.runs < 1
        or args.max_turns < 1
        or args.timeout < 1
        or args.max_budget_usd <= 0
    ):
        parser.error(
            "--runs, --max-turns, --timeout and --max-budget-usd must be positive"
        )
    try:
        every, model = repo_skills()
        cases = load_cases(model)
        if args.list:
            print("\n".join(c["name"] for c in cases))
            return 0
        by_name = {c["name"]: c for c in cases}
        unknown = [n for n in args.cases if n not in by_name]
        if unknown:
            raise Stop(f"no such case: {', '.join(unknown)}")
        chosen = [by_name[n] for n in args.cases] if args.cases else cases
        binary = claude_binary()
        isolation_probe(every, binary)
        if args.check:
            print(
                f"{TASK}: {len(cases)} cases cover {len(model)} model-invoked skills; isolation probe passed"
            )
            return 0
        _, source = credential_env()
        version = subprocess.run(
            [str(binary), "--version"], check=False, capture_output=True, text=True
        ).stdout.strip()
        print(
            f"{TASK}: {len(chosen)} of {len(cases)} cases, {args.runs} run(s) each, claude {version}, "
            f"--model {args.model}, credential: {source}"
        )
        if args.keep:
            args.keep.mkdir(parents=True, exist_ok=True)
        failed, total_cost, unknown_cost, resolved = [], 0.0, 0, set()
        for case in chosen:
            passes, notes = 0, []
            for n in range(1, args.runs + 1):
                verdict, out = run_case(case, every, binary, args)
                if verdict.cost is None:
                    unknown_cost += 1
                else:
                    total_cost += verdict.cost
                if args.keep:
                    (args.keep / f"{case['name']}-{n}.jsonl").write_text(
                        out, encoding="utf-8"
                    )
                resolved.add(verdict.model)
                if verdict.status == ISOLATION:
                    raise Stop(f"{case['name']}: isolation broken: {verdict.note}")
                if verdict.status == AUTH:
                    raise Stop(
                        f"{case['name']}: the credential was refused: {verdict.note}"
                    )
                if verdict.status == PASS:
                    passes += 1
                shown = ", ".join(verdict.fired) or "none"
                cost = (
                    "cost unknown" if verdict.cost is None else f"${verdict.cost:.3f}"
                )
                notes.append(
                    f"run {n}: {verdict.status} fired {shown} {cost}"
                    + (f" ({verdict.note})" if verdict.note else "")
                )
            outcome = PASS if passes == args.runs else FAIL
            if outcome == FAIL:
                failed.append(case["name"])
            print(
                f"{outcome} {case['name']} {passes}/{args.runs}: " + "; ".join(notes),
                flush=True,
            )
        models = ", ".join(sorted(m for m in resolved if m)) or "unknown"
        cost = f"cost ${total_cost:.2f}"
        if unknown_cost:
            cost = (
                f"cost at least ${total_cost:.2f} ({unknown_cost} run(s) reported none)"
            )
        print(
            f"{TASK}: {len(chosen) - len(failed)} of {len(chosen)} cases passed on {models}, "
            f"{cost}, the CLI's list-price estimate"
        )
        if failed:
            print(f"{TASK}: failed: {' '.join(failed)}")
            return 1
        return 0
    except Stop as e:
        print(f"{TASK}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
