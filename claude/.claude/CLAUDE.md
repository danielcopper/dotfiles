# Global Claude Configuration

## Behavior

- When a tool call is rejected/cancelled, **stop immediately**. Do not retry the same or similar command. Wait for the user to tell you how to proceed.

- **Don't be hyper-proactive.** Do exactly what was asked — no more. Don't invent couplings between independent tools ("tool A could read tool B's config"), don't add auto-detection layers, don't build smart fallbacks on top of smart fallbacks. Prefer a dumb default + simple override file over clever runtime logic. If you catch yourself writing a "detects X and automatically does Y" hook, stop and ask whether the user actually wanted that.

- **Planning vs. implementation — scope is the user's decision, not mine.** During planning/ideation, stay in discussion mode. Do not:
  - Start implementing just because several discussion turns have passed
  - Declare things "explicitly not in scope", "separate refactor", or similar — scope is the user's call
  - Skip research or user instructions to save effort
  - Enforce production-code discipline (minimal diffs, tight scope) on personal configs or projects where the user has not asked for it

  Only move to implementation on an explicit green-light verb ("leg los", "mach", "implementier", "schreib", "go"). Treat open questions about the user's own project ("is X inconsistent?", "why is Y like this?") as invitations to discuss options and tradeoffs, not requests for guardrails from me. Even a short "ok" after a question needs a check — does it mean "ok implementiere" or "ok verstanden, weiter diskutieren"?

- **Don't ask about stopping.** Never ask "willst du weitermachen?", "genug für heute?", "Pause?" or similar. Just keep working. The user will say when to stop.

## Environment

- **Line endings:** New files use LF. Existing files keep their current line endings (CRLF or LF) — never bulk-convert.

## Code Navigation

When working with code in a language that has LSP coverage (TypeScript, Python, C#, …):

- **Prefer LSP over Grep/Glob/Read for symbol queries** — faster, precise, no whole-file reads.
  - `LSP goToDefinition` / `goToImplementation` — jump to source
  - `LSP findReferences` — every usage across the codebase
  - `LSP hover` — type/signature info without reading the file
  - `LSP documentSymbol` — overview of a single file's structure
  - `LSP incomingCalls` / `outgoingCalls` — call hierarchy (prepare first via `prepareCallHierarchy`)
- **Before renaming or changing a function signature**, run `LSP findReferences` first to know every call site.
- **Use Grep/Glob** only for text/pattern searches LSP can't satisfy: comments, string literals, config values, non-LSP languages.
- **Avoid `LSP workspaceSymbol`** — the tool schema exposes no `query` parameter (anthropics/claude-code#17149), so it dumps the entire workspace and burns context. Use `documentSymbol` on a likely file + Grep for path narrowing instead.
- After writing or editing code, check `LSP` diagnostics on the touched files. Fix type errors and missing imports immediately, before reporting the task done.

## Git

- **Conventional Commits** — always use the format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `perf`, `style`
  - Scope is optional but preferred (e.g., `feat(relay): add SSE endpoint`)
  - Description is lowercase, imperative, no period
- Never include "Co-authored by", "Generated with", or any similar AI/Claude mentions in commit messages
- `git add .` is forbidden — always add files individually

## Worktree Workflow

When asked to create a new branch or work on a new feature/task:

1. **Never use `git checkout -b` in place** — always create a worktree
2. **Create:** `git worktree add .worktrees/<type>/<slug> -b <type>/<slug> <base-branch>`
   - Types: `feature/`, `fix/`, `refactor/`, `chore/`, `docs/`
   - If a ticket number exists (Azure DevOps, GitHub issue), prefix the slug: `<type>/<ticket>-<slug>`
   - Examples:
     - `git worktree add .worktrees/feature/oauth-login -b feature/oauth-login main`
     - `git worktree add .worktrees/feature/123-oauth-login -b feature/123-oauth-login main`
3. **Work** inside the new worktree for all changes on that branch
4. **Cleanup:** `git worktree remove .worktrees/<type>/<slug> && git branch -d <type>/<slug>`

Rules:

- Worktrees live in `.worktrees/` inside the repo root (globally gitignored)
- Base branch is the current branch unless specified otherwise
- Never modify files outside the assigned worktree
- Push from inside the worktree — `git push` works normally (same remote/origin)

## Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

- Regular git repo at `~/dotfiles/`. Remote: `origin` (use `git remote get-url origin` to check).
- **Single branch** workflow; per-host differences live in `host-<class>/` packages.
- Top-level dirs are stow packages (one per app: `bash/`, `git/`, `tmux/`, …).
- `host-<class>/` packages carry per-host addenda (`.bashrc.local`, `.gitconfig.local`) and class-specific overrides where merge isn't possible (e.g. Claude `settings.json`).
- Files in `$HOME` are symlinks into the repo — edit anywhere; `cd ~/dotfiles && git diff` surfaces the change.
- Re-link after structural changes: `cd ~/dotfiles && stow -R <pkg>`.
- Bootstrap a fresh machine: `cd ~/dotfiles && ./bootstrap.sh <arch|steamdeck|wsl-arch>` (installs OS packages from `packages/<class>.pkglist`, then runs stow for the right set).
- Secrets (API keys, `SQLCMDPASSWORD`) live in untracked `~/.bashrc.secrets`, sourced at the end of shared `.bashrc`.

## Infrastructure

### SQL Server

Container: `sqlserver2022` · Host: `localhost:1433` · User: `sa`

- Password is exported as `SQLCMDPASSWORD` from untracked `~/.bashrc.secrets` (sourced by shared `.bashrc`) — no `-P` flag needed
- Use `sqlcmd` directly: `sqlcmd -S localhost -U sa -C`
- Single quotes in `-Q` work normally: `-Q "SELECT * FROM t WHERE name = 'alice'"`

## Memory

Routing rules and full structure: `~/.claude/memory/README.md` (auto-injected at first tool call by `~/.claude/hooks/memory_inject.py`).

Three stores:

- `~/.claude/memory/` — global personal (general/tools/domain/daily, gitignored content)
- `<repo>/.claude/memory/` — project-shared, committed in the repo
- `~/.claude/projects/<cwd>/memory/` — Anthropic's auto-memory; **never write here**, read-only continuity

Slash commands: `/memory-dream`, `/memory-consolidate`, `/memory-promote`.

## Project documentation discovery

If the current repo has any of the following at its root, treat them as canonical and consult them before designing or naming things:

- **`CONTEXT.md`** — the project's domain glossary. Defines what terms mean *here*. When a term gets resolved during conversation, update `CONTEXT.md` inline — don't batch. It is a glossary, **not** a spec or implementation doc.
- **`CONTEXT-MAP.md`** — present in multi-context monorepos. Points to per-context `CONTEXT.md` files under each module.
- **`docs/adr/`** — Architectural Decision Records, numbered sequentially (`0001-slug.md`, `0002-slug.md`, …). Each ADR records why a decision was made and what alternatives were rejected. Read before redesigning in a settled area.

Rules when these files exist:

- **Use the glossary's vocabulary in outputs.** When naming a domain concept in an issue title, test name, refactor proposal, or PR description, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.
- **Flag ADR conflicts explicitly.** If a proposed design contradicts an existing ADR, surface the contradiction out loud (e.g. *"Contradicts ADR-0007 — but worth reopening because…"*); don't silently override.
- **Only propose a new ADR when all three apply**: hard-to-reverse, surprising-without-context, **and** a real trade-off. If any leg is missing, skip it.

If these files don't exist, proceed silently — don't flag their absence or suggest creating them upfront. They get created lazily during planning sessions (e.g. `/grill-with-docs`) when terms or decisions actually resolve.
