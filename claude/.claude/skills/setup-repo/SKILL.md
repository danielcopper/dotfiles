---
name: setup-repo
description: "Set up a repository for the issue pipeline — decide own or foreign, detect gate, worktree task and board, ask the rest, then draft the CLAUDE.md `## Pipeline` section and write ~/Memory/<repo>/repo-profile.md. Safe to run again."
disable-model-invocation: true
---

Give a repository what `/implement`, `/epic`, `/next`, `/plan-epic`, `/to-prd`, `/to-issues`, `/grill-with-docs`, `/improve-codebase-architecture` and `/retro` read about it. Where each fact lives, the `## Pipeline` section's shape and the profile's schema are in [`~/.claude/skills/implement/repo-config.md`](../implement/repo-config.md); read it first.

## 1. Locate

Run from any directory of the checkout. The main checkout's root, `<repo>` and the profile path are as `repo-config.md` gives them — but only where that root is the checkout the common dir belongs to: `git -C <root> rev-parse --show-toplevel` prints `<root>`, `git -C <root> rev-parse --path-format=absolute --git-common-dir` prints the common dir the root came from, and, where you started outside a linked worktree (`git rev-parse --path-format=absolute --git-dir` equals `git rev-parse --path-format=absolute --git-common-dir`), `--show-toplevel` from where you started prints `<root>` too. That fails for a bare repository, a worktree of a bare repository, a submodule whose git dir lives in the superproject, and a checkout whose separate git dir does not sit directly in its root; there, stop and ask the owner which repository is meant.

*Done when:* root, `<repo>` and the profile path are known, and whether a profile already exists — or the owner was asked which repository is meant.

## 2. Own or foreign

Run [`ownership.sh`](ownership.sh) `<root>`. A repo is the owner's when it has no remote yet, or when `origin` — ssh and https forms alike — lies under the owner's GitHub account (the script's `GITHUB_HOST` and `GITHUB_OWNER`) or under an owner the machine's own-remotes file names. That file (`~/.config/setup-repo/own-remotes`, or the path in `SETUP_REPO_OWN_REMOTES`) is kept per machine and out of this repository: one `host/owner/` per line on the owner's own forge (Forgejo or Gitea), empty and `#` lines skipped, any other line an error; without the file, only GitHub counts. A repository on the forge is checked through its API with the read token in `FORGEJO_TOKEN`, one token for every forge the file lists; without the token the script gives no verdict. It is foreign when GitHub or the forge reports it a fork or a mirror, even under the owner's account.

Read the answer strictly: **own** only on exit 0 with stdout starting `own:`, **foreign** only on exit 0 with stdout starting `foreign:`. Anything else — exit 2, any other exit status, or other output — is no verdict: show the owner the script's stderr and ask.

State the verdict before writing anything, as `repo-config.md`, "Own or foreign", says.

*Done when:* the verdict is stated.

## 3. Detect

Read what is already there, then look for the rest:

- **Existing facts**: the profile, when step 1 found one; the root's `CLAUDE.md` — a `## Pipeline` section, or a gate, review command or worktree task stated in another section.
- **Gate**: the task runner (`mise tasks ls`, `package.json` scripts, a `Makefile` or `justfile`) and its task that mirrors CI (`gate`, `ci`, `check`), held against `.github/workflows/` or the CI file the repo has, so the gate covers what CI enforces.
- **Review checks**: the linters and type checkers the repo configures (`pyproject.toml`, `eslint.config.*`, `deno.json`, …), as their changed-files commands.
- **Worktree task**: a task that creates a worktree (`worktree-new`).
- **Board kind**, from `origin`'s host, mapped as `~/.claude/skills/pr-review/SKILL.md`, "Platform", maps a remote: GitHub → `github`, Azure DevOps → `azure-devops`, with the organization and project read off the URL: in an https remote as [`pr-review/azure-devops.md`](../pr-review/azure-devops.md) reads a PR URL (on `*.visualstudio.com` the organization is the subdomain), in an ssh remote (`ssh.dev.azure.com:v3/<organization>/<project>/<repo>`, `<organization>@vs-ssh.visualstudio.com:v3/<organization>/<project>/<repo>`) the two segments after `v3/`; any other host, or no remote → no board unless the owner names one.
- **GitHub board IDs**: the project and its IDs, as `repo-config.md`, "GitHub commands", resolves them.

*Done when:* every fact in `repo-config.md`'s `## Pipeline` section and profile schema is either found, with where it was found, or listed as open.

## 4. Ask what is open

Ask the owner only what step 3 left open, one question at a time: typically the user gate, the agent rules, a departure from a global default, which board when there are several or none, and on an `azure-devops` board the state names for ready and in progress.

*Done when:* every fact has a value, or the owner said it has none.

## 5. Write

- **Own repo**: draft the `## Pipeline` section — or, where one exists, the change to it — and show it to the owner. `CLAUDE.md` changes only when the owner asks, through the repo's own process (in a repo that takes changes by pull request, a worktree branch). Then write the profile without the repository facts.
- **Foreign repo**: write the profile with the repository facts too; nothing is written into the repo's tree.

The profile: a new one is written; an existing one is shown as the change this run would make and rewritten on the owner's OK; with no change, say so and write nothing. Give a new profile its entry in `~/Memory/<repo>/MEMORY.md`, and refresh that entry when a run rewrites the profile, as the global `CLAUDE.md`'s memory rules say.

*Done when:* the profile holds this run's facts, or the owner kept the existing one, and in an own repo the `## Pipeline` draft has been shown.
