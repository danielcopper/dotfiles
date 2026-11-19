"""Tests of run.py that make no model call: grade() on hand-written
stream-json and the summary main() prints around stand-in runs.

HOME points at a temporary directory for the whole file, set before run.py
is loaded. An audit hook records every open, listing and change of a path
below the real home; only this repo and the Python installation are exempt,
and a recorded path fails the run after the tests.

usage: python3 -I run-test.py [unittest option...]
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
    "os.link": None,
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
_spec = importlib.util.spec_from_file_location(
    "run", os.environ.get("RUN_PY") or HERE / "run.py"
)
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


def grade(events, case, exit_code=0, stderr=""):
    if exit_code == 0 and not stderr:
        return run.grade(lines(*events), case, EVERY)
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

    def test_error_does_not_blame_a_fire_case(self):
        v = grade([init(), text()], FIRES_ALPHA)
        self.assertError(v, "no result event")

    def test_refused_credential(self):
        failed = text("Failed to authenticate")
        failed["error"] = "authentication_failed"
        v = grade([init(), failed, result("success", is_error=True)], QUIET_BETA)
        self.assertEqual(v.status, run.AUTH)

    def test_cost_unknown_without_result(self):
        self.assertIsNone(grade([init(), text()], QUIET_BETA).cost)


class Summary(unittest.TestCase):
    """main() around stand-in runs: no sandbox, no model call."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="skill-trigger-summary-"))
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
        self.saved = {
            k: getattr(run, k)
            for k in (
                "SKILLS",
                "CASES",
                "run_case",
                "isolation_probe",
                "credential_env",
                "claude_binary",
            )
        }
        run.SKILLS, run.CASES = skills, cases
        run.claude_binary = lambda: Path("/bin/true")
        run.isolation_probe = lambda every, binary: None
        run.credential_env = lambda: ({}, "a stand-in")
        self.verdicts = []
        run.run_case = lambda case, every, binary, args: (self.verdicts.pop(0), "")

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(run, k, v)
        shutil.rmtree(self.tmp, ignore_errors=True)

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
        self.assertEqual(code, 1)
        self.assertIn("run 1: ERROR fired none cost unknown", out)
        self.assertIn("cost at least $0.50 (1 run(s) reported none)", out)

    def test_refused_credential_stops_with_exit_2(self):
        self.verdicts = [
            run.Verdict(run.AUTH, [], None, "Failed to authenticate", MODEL)
        ]
        code, _, err = self.main("a")
        self.assertEqual(code, 2)
        self.assertIn("the credential was refused", err)

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
