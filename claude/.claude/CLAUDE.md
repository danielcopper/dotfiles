# Global Claude Configuration

## Behavior

- When a tool call is rejected/cancelled, **stop immediately**. Do not retry the same or similar command. Wait for the user to tell you how to proceed.

- **Don't be hyper-proactive.** Do exactly what was asked — no more. Don't invent couplings between independent tools ("tool A could read tool B's config"), don't add auto-detection layers, don't stack smart fallbacks on smart fallbacks. Prefer a dumb default + simple override file over clever runtime logic. If you catch yourself writing a "detects X and automatically does Y" hook, stop and ask whether the user actually wanted that.

- **Planning vs. implementation — scope is the user's decision, not mine.** During planning/ideation stay in discussion mode: don't start implementing just because turns have passed, don't declare things "explicitly not in scope" / "separate refactor" (scope is the user's call), don't skip research or user instructions to save effort, and don't enforce production-code discipline (minimal diffs, tight scope) on personal configs the user hasn't asked to tighten. Move to implementation only on an explicit green-light verb ("leg los", "mach", "implementier", "schreib", "go"). Treat open questions about the user's own project ("is X inconsistent?", "why is Y like this?") as invitations to discuss options and tradeoffs, not requests for guardrails. Even a short "ok" after a question needs a check — does it mean "ok implementiere" or "ok verstanden, weiter diskutieren"?

- **Don't ask about stopping.** Never ask "willst du weitermachen?", "genug für heute?", "Pause?" or similar. Just keep working. The user will say when to stop.

- **Don't expose the agentic process in published artifacts.** How the work was produced — subagents, multi-agent workflows, "architect → implement → review", adversarial-verification / "capstone" passes — must never appear in PR or issue descriptions, commit messages, code comments, or any committed/published text. State the results, decisions, and rationale, not the orchestration used to reach them.

## Environment

- **Line endings:** New files use LF. Existing files keep their current line endings (CRLF or LF) — never bulk-convert.

## Code Navigation

- **Prefer LSP over Grep/Glob/Read for symbol queries** in LSP-covered languages (TS, Python, C#, …) — definitions, references, hover, `documentSymbol`, call hierarchy. Precise, no whole-file reads. Run `LSP findReferences` before renaming or changing a signature. Use Grep/Glob only for text LSP can't reach: comments, string literals, config values, non-LSP languages.
- **`LSP workspaceSymbol` always takes an explicit `query`** — with one it is the fastest repo-wide symbol lookup; an empty query returns nothing from most servers. Reach for `documentSymbol` instead once you already know the file.
- After writing or editing code, check `LSP` diagnostics on the touched files and fix type errors / missing imports before reporting the task done.

## Git

- **Conventional Commits** — `<type>(<scope>): <description>` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `perf`, `style`). Scope optional but preferred; description lowercase, imperative, no period.
- Never include "Co-authored-by", "Generated with", or any similar AI/Claude mention in commit messages.
- **`git add .` is forbidden by default** — stage files individually. A repo may override this in its own CLAUDE.md when its `.gitignore` is known-clean.

## Memory

Anthropic's auto memory is deliberately **disabled** (`autoMemoryEnabled: false`) — all memory flows through the file-based system under `~/.claude/memory/`. Its old store under `~/.claude/projects/<cwd>/memory/` is a merged, read-only archive; never write there. Full structure and slash-command docs: `~/.claude/memory/README.md` (read on demand). Dailies (today + yesterday) and the per-repo index are injected by `~/.claude/hooks/memory_inject.py` at the first tool call; the global index loads below.

When you learn something worth recording, pick the destination:

1. True/useful across projects? → `~/.claude/memory/<rule-name>.md` (one rule per file)
2. Tool-specific quirk? → `~/.claude/memory/tools/<tool>.md`
3. Cross-tool conceptual knowledge? → `~/.claude/memory/domain/<topic>.md`
4. Repo-specific **and public-safe**? → `<repo>/.claude/memory/<file>.md` — committed, and the repo may be public: no secrets or credential recipes, no game/ROM names, no personal device details. Repo-specific but private → global tier with a `<repo>-` filename prefix.
5. Private/WIP or just-noted-today? → `~/.claude/memory/daily/<YYYY-MM-DD>.md` (`## HH:MM — slug` + 3–5 bullets, append-only)

Entry format for feedback/project memories: lead with the rule/fact, then `**Why:**` and `**How to apply:**`. Kebab-case filenames; top-level `type:` frontmatter; `name:` equals the filename slug (`[[wiki-links]]` resolve against it). After creating or modifying a topic file, update its entry in the owning `MEMORY.md` index — new files get a keyword-dense description so future sessions can match prompts to the right file.

Global memory index (topic files load on demand, never eagerly): @~/.claude/memory/MEMORY.md

Slash commands: `/memory-dream`, `/memory-consolidate`, `/memory-promote`.

## Worktrees & branching

**Never use `git checkout -b` in place — always work in a worktree** under `.claude/worktrees/<type>/<slug>`. The full procedure (create, `EnterWorktree`, `mise run worktree-new`, cleanup, rules) lives in the **`worktree` skill** — load it when starting any new branch / feature / task / fix.

## Project documentation discovery

If the current repo has any of the following at its root, treat them as canonical and consult them before designing or naming things:

- **`CONTEXT.md`** — the project's domain glossary. Defines what terms mean *here*. When a term gets resolved during conversation, update `CONTEXT.md` inline — don't batch. It is a glossary, **not** a spec or implementation doc.
- **`CONTEXT-MAP.md`** — present in multi-context monorepos. Points to per-context `CONTEXT.md` files under each module.
- **`docs/adr/`** — Architectural Decision Records, numbered sequentially (`0001-slug.md`, …). Each records why a decision was made and what alternatives were rejected. Read before redesigning in a settled area.

When these files exist: use the glossary's vocabulary in outputs (don't drift to synonyms it explicitly avoids); flag ADR conflicts out loud (*"Contradicts ADR-0007 — but worth reopening because…"*) rather than silently overriding; propose a new ADR only when all three apply — hard-to-reverse, surprising-without-context, **and** a real trade-off. If these files don't exist, proceed silently — don't flag their absence or suggest creating them upfront. They get created lazily during planning sessions (e.g. `/grill-with-docs`) when terms or decisions actually resolve.
