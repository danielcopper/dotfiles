"""Locating the repository a hook runs in."""

import subprocess
from pathlib import Path


def main_repo_root(cwd) -> Path | None:
    """The main checkout's root for cwd, also from a linked worktree; None outside a repository.

    Uses --git-common-dir rather than --show-toplevel so a worktree resolves to the main
    checkout, whose basename keys the ~/Memory/<repo>/ tier.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    common_dir = result.stdout.strip()
    if result.returncode != 0 or not common_dir:
        return None
    return Path(common_dir).parent
