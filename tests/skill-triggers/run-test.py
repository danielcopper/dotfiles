"""Tests of run.py that make no model call: grade() on hand-written
stream-json, load_cases() on one broken cases file per guard, the
model-invoked skills read from frontmatter, the summary main() prints around
stand-in runs, and the isolation probe with one part of the wrapper broken at
a time (skipped without bwrap).

HOME points at a temporary directory for the whole file, set before run.py
is loaded. An audit hook records the events named in AUDITED (opens, listings
and changes) whose path lies below the real home; only this repo and the
Python installation are exempt, and a recorded path fails the run after the
tests. It sees this process only: what bwrap and the shells it starts do is
up to the probe tests, which point them at the temporary HOME.

usage: python3 -I run-test.py [unittest option...]
  RUN_PY=<path>/run.py runs the tests against that copy of run.py instead of
  the one beside this file, e.g. a copy with one guard broken on purpose to
  see the test for it fail. The skills and cases the tests read come from
  temporary directories or from this repo, never from beside that copy.
"""

import contextlib
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import TYPE_CHECKING
from unittest import mock

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
REAL_HOME = os.path.realpath(os.path.expanduser("~"))
FAKE_HOME = tempfile.mkdtemp(prefix="skill-trigger-test-home-")
os.environ["HOME"] = FAKE_HOME
os.chdir(FAKE_HOME)
EXEMPT = sorted({str(REPO), sys.prefix, sys.base_prefix, sys.exec_prefix})
# Audited events, with the position of their dir_fd argument where they have one.
AUDITED = {
    "open": None,
    "os.listdir": None,
    "os.scandir": None,
    "os.mkdir": 2,
    "os.rename": 2,
    "os.replace": 2,
    "os.remove": 1,
    "os.rmdir": 1,
    "os.symlink": None,
    "os.link": 2,
    "os.chmod": 2,
    "os.truncate": None,
    "os.utime": 3,
    "shutil.copyfile": None,
    "shutil.copytree": None,
    "shutil.rmtree": None,
}
touched = []


def resolve(path, dir_fd):
    """An absolute path, read against dir_fd where the call has one, else the cwd.

    A relative open() carries no dir_fd in its audit event (shutil.rmtree opens
    that way); it is read against the cwd, which is the temporary HOME.
    """
    path = os.fsdecode(path)
    if not os.path.isabs(path) and isinstance(dir_fd, int):
        path = os.path.join(os.readlink(f"/proc/self/fd/{dir_fd}"), path)
    return os.path.abspath(path)


def below_real_home(path):
    if not (path == REAL_HOME or path.startswith(REAL_HOME + os.sep)):
        return False
    return not any(path == e or path.startswith(e + os.sep) for e in EXEMPT)


def audit(event, args):
    if event not in AUDITED or not args or isinstance(args[0], int) or args[0] is None:
        return
    at = AUDITED[event]
    dir_fd = args[at] if at is not None and len(args) > at else None
    with contextlib.suppress(TypeError, ValueError, OSError):
        path = resolve(args[0], dir_fd)
        if below_real_home(path):
            touched.append(f"{event} {path}")


sys.addaudithook(audit)
sys.dont_write_bytecode = True
if TYPE_CHECKING:
    import run
else:
    _spec = importlib.util.spec_from_file_location(
        "run", os.environ.get("RUN_PY") or HERE / "run.py"
    )
    if _spec is None or _spec.loader is None:
        raise SystemExit("run-test.py: cannot load run.py")
    run = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(run)

EVERY = ["alpha", "beta", "gamma"]  # gamma is user-invoked only
MODEL_INVOKED = ["alpha", "beta"]
MODEL = "claude-test-model"


def init(skills=EVERY, plugins=None, mcp_servers=None):
    if plugins is None:
        plugins = [{"name": "cc-plugin-x", "path": "builtin", "source": "x@builtin"}]
    return {
        "type": "system",
        "subtype": "init",
        "model": MODEL,
        "skills": list(skills),
        "plugins": plugins,
        "mcp_servers": mcp_servers or [],
    }


def skill_call(name):
    return {
        "type": "assistant",
        "message": {
            "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": name}}]
        },
    }


def text(words="ok"):
    return {
        "type": "assistant",
        "message": {"content": [{"type": "text", "text": words}]},
    }


def result(subtype="success", is_error=False, cost=0.25, **extra):
    event = {"type": "result", "subtype": subtype, "is_error": is_error, **extra}
    if cost is not None:
        event["total_cost_usd"] = cost
    return event


def lines(*events):
    return [json.dumps(e) for e in events]


def grade(events, case, exit_code: int | None = 0, stderr: str = ""):
    return run.grade(lines(*events), case, EVERY, exit_code, stderr)


FIRES_ALPHA = {"name": "c", "fires": "alpha", "quiet": ["beta"]}
QUIET_BETA = {"name": "c", "quiet": ["beta"]}
NONE = {"name": "c", "fires": "none"}


class GradeSkills(unittest.TestCase):
    def test_expected_skill_fires(self):
        v = grade([init(), skill_call("alpha"), text(), result()], FIRES_ALPHA)
        self.assertEqual(v.status, run.PASS)
        self.assertEqual(v.fired, ["alpha"])

    def test_expected_skill_missing_fails(self):
        v = grade([init(), text(), result()], FIRES_ALPHA)
        self.assertEqual(v.status, run.FAIL)
        self.assertIn("alpha did not fire", v.note)

    def test_quiet_skill_called_fails(self):
        v = grade([init(), skill_call("beta"), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.FAIL)
        self.assertIn("beta must stay quiet", v.note)

    def test_quiet_skill_called_with_namespace_fails(self):
        v = grade([init(), skill_call("plug:beta"), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.FAIL)
        self.assertEqual(v.fired, ["beta"])

    def test_quiet_case_without_calls_passes(self):
        v = grade([init(), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.PASS)

    def test_any_call_on_fires_none_fails(self):
        v = grade([init(), skill_call("gamma"), text(), result()], NONE)
        self.assertEqual(v.status, run.FAIL)
        self.assertIn("no skill may fire", v.note)

    def test_fires_none_without_calls_passes(self):
        v = grade([init(), text(), result()], NONE)
        self.assertEqual(v.status, run.PASS)

    def test_model_and_cost_come_from_the_stream(self):
        v = grade([init(), text(), result(cost=0.5)], QUIET_BETA)
        self.assertEqual((v.model, v.cost), (MODEL, 0.5))

    def test_turn_cap_is_graded(self):
        # The CLI marks error_max_turns is_error and exits 1; the cap is ours.
        v = grade(
            [init(), text(), result("error_max_turns", is_error=True)],
            QUIET_BETA,
            exit_code=1,
        )
        self.assertEqual(v.status, run.PASS)
        self.assertIn("error_max_turns", v.note)


class GradeIsolation(unittest.TestCase):
    def test_foreign_plugin(self):
        plugins = [{"name": "mine", "path": "/somewhere", "source": "mine@market"}]
        v = grade([init(plugins=plugins), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.ISOLATION)
        self.assertIn("mine", v.note)

    def test_mcp_server(self):
        v = grade([init(mcp_servers=[{"name": "srv"}]), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.ISOLATION)
        self.assertIn("srv", v.note)

    def test_repo_skill_missing_from_session(self):
        v = grade([init(skills=["alpha"]), text(), result()], QUIET_BETA)
        self.assertEqual(v.status, run.ISOLATION)
        self.assertIn("beta", v.note)


class GradeErrors(unittest.TestCase):
    """A run that did not end cleanly says nothing about the skills."""

    def assertError(self, v, words):
        self.assertEqual(v.status, run.ERROR)
        self.assertIn(words, v.note)

    def test_no_init_event(self):
        self.assertError(grade([text(), result()], QUIET_BETA), "no init event")

    def test_error_result(self):
        v = grade(
            [init(), text(), result("success", is_error=True, result="boom")],
            QUIET_BETA,
        )
        self.assertError(v, "boom")

    def test_error_during_execution(self):
        v = grade([init(), text(), result("error_during_execution")], QUIET_BETA)
        self.assertError(v, "error_during_execution")

    def test_missing_result_event(self):
        self.assertError(grade([init(), text()], QUIET_BETA), "no result event")

    def test_non_zero_exit(self):
        v = grade([init(), text(), result()], QUIET_BETA, exit_code=3, stderr="bad\n")
        self.assertError(v, "exited 3: bad")

    def test_timeout(self):
        v = grade([init(), text()], QUIET_BETA, exit_code=None, stderr="after 9s")
        self.assertError(v, "timed out: after 9s")

    def test_api_error_message(self):
        failed = text("API Error: 529 overloaded")
        failed["error"] = "overloaded"
        v = grade([init(), failed, result()], QUIET_BETA)
        self.assertError(v, "overloaded")

    def test_api_error_flag(self):
        failed = text("API Error: 500")
        failed["isApiErrorMessage"] = True
        v = grade([init(), failed, result()], QUIET_BETA)
        self.assertError(v, "API Error: 500")

    def test_clean_result_without_a_reply(self):
        self.assertError(grade([init(), result()], QUIET_BETA), "no reply")

    def test_error_does_not_blame_a_fire_case(self):
        v = grade([init(), text()], FIRES_ALPHA)
        self.assertError(v, "no result event")

    def test_account_credential_and_model_errors_stop(self):
        kinds = (
            "authentication_failed",
            "oauth_org_not_allowed",
            "account_on_hold",
            "verification_required",
            "billing_error",
            "cloud_credential_error",
            "model_not_found",
        )
        for kind in kinds:
            with self.subTest(kind=kind):
                failed = text(f"API Error: {kind}")
                failed["error"] = kind
                v = grade(
                    [init(), failed, result("success", is_error=True)], QUIET_BETA
                )
                self.assertEqual(v.status, run.STOP)
                self.assertEqual(v.note, f"{kind} (API Error: {kind})")

    def test_passing_errors_do_not_stop(self):
        for kind in ("rate_limit", "overloaded", "server_error", "unknown"):
            with self.subTest(kind=kind):
                failed = text("API Error")
                failed["error"] = kind
                self.assertError(grade([init(), failed, result()], QUIET_BETA), kind)

    def test_cost_unknown_without_result(self):
        self.assertIsNone(grade([init(), text()], QUIET_BETA).cost)


VALID_CASES = """
[[case]]
name = "a"
prompt = "p"
fires = "alpha"
quiet = ["beta"]

[[case]]
name = "b"
prompt = "p"
fires = "beta"
quiet = ["alpha"]
"""


class Swapping(unittest.TestCase):
    """A test case that swaps attributes for the length of one test."""

    def swap(self, name, value, target=None):
        patcher = mock.patch.object(run if target is None else target, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def temporary(self, prefix):
        path = Path(tempfile.mkdtemp(prefix=prefix))
        self.addCleanup(shutil.rmtree, path, True)
        return path


class LoadCases(Swapping):
    """One broken cases file per guard; each must stop with its message."""

    def setUp(self):
        self.tmp = self.temporary("skill-trigger-cases-")
        self.swap("CASES", self.tmp / "cases.toml")

    def load(self, toml):
        run.CASES.write_text(toml)
        return run.load_cases(MODEL_INVOKED)

    def assertStops(self, toml, words):
        with self.assertRaises(run.Stop) as caught:
            self.load(toml)
        self.assertIn(words, str(caught.exception))

    def test_valid_file_loads(self):
        self.assertEqual([c["name"] for c in self.load(VALID_CASES)], ["a", "b"])

    def test_invalid_toml(self):
        self.assertStops("[[case]\n", str(run.CASES))

    def test_other_top_level_key(self):
        self.assertStops('other = "x"\n' + VALID_CASES, "expected only [[case]] tables")

    def test_no_cases(self):
        self.assertStops("", "expected only [[case]] tables")

    def test_case_not_a_table(self):
        self.assertStops("case = [1]\n", "case #1: not a table")

    def test_unknown_key(self):
        self.assertStops(VALID_CASES + "runs = 3\n", "unknown keys ['runs']")

    def test_bad_name(self):
        self.assertStops(
            VALID_CASES.replace('name = "a"', 'name = "a-1"'), "name must match"
        )

    def test_name_used_twice(self):
        self.assertStops(
            VALID_CASES.replace('name = "b"', 'name = "a"'), "name used twice"
        )

    def test_prompt_missing(self):
        self.assertStops(
            VALID_CASES.replace('prompt = "p"', 'prompt = "  "', 1), "prompt missing"
        )

    def test_neither_fires_nor_quiet(self):
        extra = '[[case]]\nname = "c"\nprompt = "p"\n'
        self.assertStops(VALID_CASES + extra, "names neither fires nor quiet")

    def test_fires_not_a_string(self):
        self.assertStops(
            VALID_CASES.replace('fires = "alpha"', 'fires = ["alpha"]'),
            "fires must be a skill name",
        )

    def test_fires_user_invoked_skill(self):
        self.assertStops(
            VALID_CASES.replace('fires = "alpha"', 'fires = "gamma"'),
            "fires 'gamma' is no model-invoked skill",
        )

    def test_quiet_not_a_list(self):
        self.assertStops(
            VALID_CASES.replace('quiet = ["beta"]', 'quiet = "beta"'),
            "quiet must be a list of skill names",
        )

    def test_quiet_unknown_skill(self):
        self.assertStops(
            VALID_CASES.replace('quiet = ["beta"]', 'quiet = ["beta", "delta"]'),
            "quiet 'delta' is no model-invoked skill",
        )

    def test_fires_and_quiet_same_skill(self):
        self.assertStops(
            VALID_CASES.replace('quiet = ["beta"]', 'quiet = ["alpha", "beta"]'),
            "alpha must both fire and stay quiet",
        )

    def test_skill_without_fire_case(self):
        self.assertStops(
            VALID_CASES.replace('fires = "beta"', 'fires = "none"'),
            "skill beta: no case where it must fire",
        )

    def test_skill_without_quiet_case(self):
        self.assertStops(
            VALID_CASES.replace('quiet = ["alpha"]', "quiet = []"),
            "skill alpha: no case where it must stay quiet",
        )


class RepoFiles(Swapping):
    def setUp(self):
        self.tmp = self.temporary("skill-trigger-skills-")

    def test_model_invoked_skills_come_from_the_frontmatter(self):
        for name, flag in (("alpha", ""), ("beta", "'false'"), ("gamma", "true")):
            (self.tmp / name).mkdir()
            line = f"disable-model-invocation: {flag}\n" if flag else ""
            (self.tmp / name / "SKILL.md").write_text(f"---\nname: {name}\n{line}---\n")
        (self.tmp / "no-skill").mkdir()
        self.swap("SKILLS", self.tmp)
        self.assertEqual(run.repo_skills(), (EVERY, MODEL_INVOKED))

    def test_repo_cases_cover_the_repo_skills(self):
        self.swap("SKILLS", REPO / "claude" / ".claude" / "skills")
        self.swap("CASES", HERE / "cases.toml")
        _, model = run.repo_skills()
        self.assertTrue(run.load_cases(model))


BWRAP = shutil.which("bwrap")
RUN_USER = run.run_user_dir()


@unittest.skipUnless(BWRAP, "bwrap is not on PATH")
class Probe(Swapping):
    """The isolation probe with one part of the wrapper broken at a time.

    The home it guards is this file's temporary HOME, so a broken home mount
    exposes and writes only there.
    """

    argv = staticmethod(run.Sandbox.argv)
    env = staticmethod(run.Sandbox.env)

    def setUp(self):
        self.tmp = self.temporary("skill-trigger-probe-")
        (self.tmp / "alpha").mkdir()
        (self.tmp / "alpha" / "SKILL.md").write_text("---\nname: alpha\n---\n")
        Path(FAKE_HOME, "marker").write_text("x")
        self.swap("SKILLS", self.tmp)

    def probe(self):
        run.isolation_probe(["alpha"], Path("/bin/true").resolve())

    def assertProbeStops(self, words):
        with self.assertRaises(run.Stop) as caught:
            self.probe()
        self.assertIn(words, str(caught.exception))

    def drop(self, flag, value):
        """Remove one wrapper option and its arguments from the bwrap command."""
        argv = self.argv
        width = {"--tmpfs": 2, "--bind": 3}[flag]

        def without(box, command):
            wrap = argv(box, command)
            for i, arg in enumerate(wrap):
                if arg == flag and value in wrap[i + 1 : i + width]:
                    return wrap[:i] + wrap[i + width :]
            raise AssertionError(f"{flag} {value} not in the wrapper")

        self.swap("argv", without, run.Sandbox)

    def test_intact_wrapper_passes(self):
        self.probe()

    def test_real_home_not_covered(self):
        self.drop("--bind", FAKE_HOME)
        self.assertProbeStops("the real home shows")
        self.assertFalse(Path(FAKE_HOME, ".skill-trigger-canary").exists())

    def test_write_check_watches_the_mount_over_home(self):
        # Home stays hidden, but behind a directory the write check does not read.
        argv, elsewhere = self.argv, self.tmp / "elsewhere"
        elsewhere.mkdir()

        def other_dir(box, command):
            return [
                str(elsewhere) if a == str(box.guard) else a for a in argv(box, command)
            ]

        self.swap("argv", other_dir, run.Sandbox)
        self.assertProbeStops("the write check saw [], not the canary")

    @unittest.skipUnless(
        RUN_USER is not None and any(RUN_USER.iterdir()), "no /run/user entry"
    )
    def test_run_user_not_covered(self):
        assert RUN_USER is not None
        self.drop("--tmpfs", str(RUN_USER))
        self.assertProbeStops(f"{RUN_USER} shows")

    def test_variable_beyond_the_allowlist(self):
        env = self.env
        self.swap(
            "env",
            lambda box, extra=None: {**env(box, extra), "CLAUDECODE": "1"},
            run.Sandbox,
        )
        self.assertProbeStops("variables beyond the allowlist: ['CLAUDECODE']")

    def test_home_not_swapped(self):
        env = self.env
        self.swap(
            "env",
            lambda box, extra=None: {**env(box, extra), "HOME": FAKE_HOME},
            run.Sandbox,
        )
        self.assertProbeStops("HOME is")


class Summary(Swapping):
    """main() around stand-in runs: no sandbox, no model call."""

    def setUp(self):
        self.tmp = self.temporary("skill-trigger-summary-")
        skills = self.tmp / "skills"
        for name in EVERY:
            (skills / name).mkdir(parents=True)
            flag = "disable-model-invocation: true\n" if name == "gamma" else ""
            (skills / name / "SKILL.md").write_text(f"---\nname: {name}\n{flag}---\n")
        cases = self.tmp / "cases.toml"
        cases.write_text(
            '[[case]]\nname = "a"\nprompt = "p"\nfires = "alpha"\nquiet = ["beta"]\n'
            '[[case]]\nname = "b"\nprompt = "p"\nfires = "beta"\nquiet = ["alpha"]\n'
        )
        self.swap("SKILLS", skills)
        self.swap("CASES", cases)
        self.swap("claude_binary", lambda: Path("/bin/true"))
        self.swap("isolation_probe", lambda every, binary: None)
        self.swap("credential_env", lambda: ({}, "a stand-in"))
        self.verdicts = []
        self.swap(
            "run_case", lambda case, every, binary, args: (self.verdicts.pop(0), "")
        )

    def main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        old = sys.argv
        sys.argv = ["run.py", *argv]
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = run.main()
        finally:
            sys.argv = old
        return code, out.getvalue(), err.getvalue()

    def test_known_costs_add_up(self):
        self.verdicts = [
            run.Verdict(run.PASS, ["alpha"], 0.25, "", MODEL),
            run.Verdict(run.PASS, ["beta"], 0.5, "", MODEL),
        ]
        code, out, _ = self.main()
        self.assertEqual(code, 0)
        self.assertIn(f"2 of 2 cases passed on {MODEL}, cost $0.75,", out)

    def test_unknown_cost_makes_the_total_a_lower_bound(self):
        self.verdicts = [
            run.Verdict(run.ERROR, [], None, "no result event", MODEL),
            run.Verdict(run.PASS, ["beta"], 0.5, "", MODEL),
        ]
        code, out, _ = self.main()
        self.assertEqual(code, 2)
        self.assertIn("run 1: ERROR fired none cost unknown", out)
        self.assertIn("cost at least $0.50 (1 run(s) reported none)", out)

    def test_case_with_only_errors_is_an_error_and_exits_2(self):
        self.verdicts = [
            run.Verdict(run.PASS, ["alpha"], 0.1, "", MODEL),
            run.Verdict(run.ERROR, [], 0.1, "timed out", MODEL),
            run.Verdict(run.PASS, ["beta"], 0.1, "", MODEL),
            run.Verdict(run.PASS, ["beta"], 0.1, "", MODEL),
        ]
        code, out, _ = self.main("--runs", "2")
        self.assertEqual(code, 2)
        self.assertIn("ERROR a 1/2:", out)
        self.assertIn("PASS b 2/2:", out)
        self.assertIn("1 of 2 cases passed", out)
        self.assertIn("no clean run to grade: a", out)
        self.assertNotIn("failed:", out)

    def test_a_failure_beside_errors_fails_the_case(self):
        self.verdicts = [
            run.Verdict(run.FAIL, ["beta"], 0.1, "beta must stay quiet", MODEL),
            run.Verdict(run.ERROR, [], 0.1, "timed out", MODEL),
            run.Verdict(run.ERROR, [], 0.1, "timed out", MODEL),
            run.Verdict(run.ERROR, [], 0.1, "timed out", MODEL),
        ]
        code, out, _ = self.main("--runs", "2")
        self.assertEqual(code, 1)
        self.assertIn("FAIL a 0/2:", out)
        self.assertIn("ERROR b 0/2:", out)
        self.assertIn("failed: a", out)
        self.assertIn("no clean run to grade: b", out)

    def test_crash_exits_2(self):
        def crash(case, every, binary, args):
            raise LookupError("a bug in the runner")

        self.swap("run_case", crash)
        code, _, err = self.main("a")
        self.assertEqual(code, 2)
        self.assertIn("LookupError: a bug in the runner", err)
        self.assertIn("stopped by an unexpected error", err)

    def test_stop_kind_stops_with_exit_2(self):
        self.verdicts = [run.Verdict(run.STOP, [], None, "billing_error", MODEL)]
        code, _, err = self.main("a")
        self.assertEqual(code, 2)
        self.assertIn("a: no run can go on: billing_error", err)

    def test_broken_isolation_stops_with_exit_2(self):
        self.verdicts = [run.Verdict(run.ISOLATION, [], 0.1, "plugins loaded", MODEL)]
        code, _, err = self.main("a")
        self.assertEqual(code, 2)
        self.assertIn("isolation broken", err)


if __name__ == "__main__":
    try:
        program = unittest.main(exit=False)
        failed = not program.result.wasSuccessful()
    finally:
        os.chdir("/")
        shutil.rmtree(FAKE_HOME, ignore_errors=True)
    if touched:
        print("run-test.py: touched below the real home:", file=sys.stderr)
        for entry in sorted(set(touched)):
            print(f"  {entry}", file=sys.stderr)
    sys.exit(1 if failed or touched else 0)
