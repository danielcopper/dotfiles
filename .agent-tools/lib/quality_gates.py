#!/usr/bin/env python3
"""Quality gate runner. Auto-detects project type and runs checks.

Tool-agnostic. No Claude Code dependencies.
"""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

_lib_dir = str(Path(__file__).resolve().parent)
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from agent_config import get_quality_gates_config


def _detect_stacks(project_dir):
    """Detect project stacks from files present."""
    stacks = []
    p = Path(project_dir)

    # C#
    if list(p.glob("*.sln")) or list(p.glob("**/*.csproj")):
        stacks.append("csharp")

    # TypeScript (needs both package.json and tsconfig)
    if (p / "package.json").exists() and (p / "tsconfig.json").exists():
        stacks.append("typescript")

    # Python
    if (p / "pyproject.toml").exists() or (p / "setup.py").exists() or (p / "setup.cfg").exists():
        stacks.append("python")

    return stacks


def _has_staged_files(project_dir, extensions):
    """Check if any files with given extensions are staged."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=d"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return True  # Can't determine, assume yes
        for line in result.stdout.strip().splitlines():
            if any(line.endswith(ext) for ext in extensions):
                return True
        return False
    except Exception:
        return True  # Can't determine, assume yes


def _run_gate(name, cmd, cwd, timeout):
    """Run a single quality gate command."""
    start = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = time.monotonic() - start
        return {
            "gate": name,
            "passed": result.returncode == 0,
            "output": (result.stdout + result.stderr)[-2000:],
            "duration_s": round(elapsed, 2),
        }
    except subprocess.TimeoutExpired:
        return {
            "gate": name,
            "passed": False,
            "output": f"Timeout after {timeout}s",
            "duration_s": float(timeout),
        }
    except FileNotFoundError:
        return {
            "gate": name,
            "passed": True,
            "output": "Tool not found, skipped",
            "duration_s": 0,
            "skipped": True,
        }


def _run_csharp_gates(project_dir, config, timeout, staged_only):
    """Run C# quality gates."""
    results = []
    skipped = []

    if staged_only and not _has_staged_files(project_dir, (".cs", ".csproj", ".sln")):
        skipped.append("csharp (no staged files)")
        return results, skipped

    csharp_cfg = config.get("csharp", {})

    if not shutil.which("dotnet"):
        skipped.append("csharp (dotnet not found)")
        return results, skipped

    if csharp_cfg.get("build", True):
        results.append(_run_gate(
            "csharp:build",
            ["dotnet", "build", "--no-restore", "-v", "quiet"],
            project_dir,
            timeout,
        ))

    if csharp_cfg.get("format_check", True):
        # Only run format check if .editorconfig exists
        if (Path(project_dir) / ".editorconfig").exists():
            results.append(_run_gate(
                "csharp:format",
                ["dotnet", "format", "--verify-no-changes", "-v", "quiet"],
                project_dir,
                timeout,
            ))
        else:
            skipped.append("csharp:format (no .editorconfig)")

    return results, skipped


def _run_typescript_gates(project_dir, config, timeout, staged_only):
    """Run TypeScript quality gates."""
    results = []
    skipped = []

    if staged_only and not _has_staged_files(project_dir, (".ts", ".tsx", ".js", ".jsx")):
        skipped.append("typescript (no staged files)")
        return results, skipped

    ts_cfg = config.get("typescript", {})

    if not shutil.which("npx"):
        skipped.append("typescript (npx not found)")
        return results, skipped

    if ts_cfg.get("typecheck", True):
        results.append(_run_gate(
            "typescript:typecheck",
            ["npx", "tsc", "--noEmit"],
            project_dir,
            timeout,
        ))

    if ts_cfg.get("lint", True):
        # Only run if eslint config exists
        p = Path(project_dir)
        eslint_configs = [
            ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml",
            ".eslintrc.yaml", ".eslintrc.cjs", "eslint.config.js",
            "eslint.config.mjs", "eslint.config.cjs",
        ]
        if any((p / c).exists() for c in eslint_configs):
            results.append(_run_gate(
                "typescript:lint",
                ["npx", "eslint", ".", "--max-warnings", "0"],
                project_dir,
                timeout,
            ))
        else:
            skipped.append("typescript:lint (no eslint config)")

    return results, skipped


def _run_python_gates(project_dir, config, timeout, staged_only):
    """Run Python quality gates."""
    results = []
    skipped = []

    if staged_only and not _has_staged_files(project_dir, (".py",)):
        skipped.append("python (no staged files)")
        return results, skipped

    py_cfg = config.get("python", {})

    if py_cfg.get("lint", True):
        if shutil.which("ruff"):
            results.append(_run_gate(
                "python:lint",
                ["ruff", "check", "."],
                project_dir,
                timeout,
            ))
        else:
            skipped.append("python:lint (ruff not found)")

    if py_cfg.get("typecheck", False):
        if shutil.which("mypy"):
            results.append(_run_gate(
                "python:typecheck",
                ["mypy", "."],
                project_dir,
                timeout,
            ))
        elif shutil.which("pyright"):
            results.append(_run_gate(
                "python:typecheck",
                ["pyright", "."],
                project_dir,
                timeout,
            ))
        else:
            skipped.append("python:typecheck (mypy/pyright not found)")

    return results, skipped


def run_quality_gates(project_dir, config=None, staged_only=False):
    """Auto-detect project type and run quality checks.

    Returns:
        {"passed": bool, "results": [...], "skipped": [...]}
    """
    if config is None:
        config = get_quality_gates_config()

    timeout = config.get("timeout_seconds", 60)
    stacks = _detect_stacks(project_dir)

    all_results = []
    all_skipped = []

    if not stacks:
        all_skipped.append("No project type detected")

    runners = {
        "csharp": _run_csharp_gates,
        "typescript": _run_typescript_gates,
        "python": _run_python_gates,
    }

    for stack in stacks:
        runner = runners.get(stack)
        if runner:
            results, skipped = runner(project_dir, config, timeout, staged_only)
            all_results.extend(results)
            all_skipped.extend(skipped)

    # Overall pass: all non-skipped gates must pass
    passed = all(
        r["passed"] for r in all_results if not r.get("skipped")
    )

    return {
        "passed": passed,
        "results": all_results,
        "skipped": all_skipped,
    }
