# Global Claude Configuration

- Build what was asked. Suggest anything beyond it instead of building it.
- **Scope is my call.** While we plan, stay in discussion: implement only on an explicit go ("leg los", "mach", "go"), and treat a question about my project as an invitation to discuss options, not a request to fix. Don't cut scope or skip research to save effort. I decide when to stop: don't propose a pause or a handoff — the harness compacts the context.
- **Implementation work on a GitHub issue follows the `implement` skill.** When I give the go without having typed `/implement`, ask once whether to follow it; on my yes, read `~/.claude/skills/implement/SKILL.md` and follow it (my go is its green light), and re-read it after a compaction.
- **Planning without a skill:** when a discussion turns into planning a change, judge its size once and offer one path: small enough to build now → build it (an issue: the rule above); plannable within this session → `/grill-with-docs`, then `/to-prd` → `/to-issues`; larger than one session with the route still unclear → `/wayfinder`, then `/to-prd` → `/to-issues`. Offer, never start: on my yes, read the skill's `SKILL.md` and follow it.
- **Showing a page or image** (a prototype, a mockup, a render): run `preview-serve <dir>` (it picks the address and a port from the host's preview range), give me the link, and stop it once I'm done. A Claude Artifact only when I ask for one.
- **Agents:** start every agent without a `name` (a named one gets my messages only after its turn ends) and reach it by its agent id. Review a change with the agents `~/.claude/review-agents.md` names. An agent without its own definition gets in its prompt: *"Send your full report as a message. Your final answer is then a one-line summary — do not repeat the report in it."*
- **Upstream source:** another project's repository is read from this machine's mirror, one per repository: `~/.claude/upstream-sources.md`.
- **Task list:** keep one once there is more than one task. Every open point is a task (a decision, a question, a finding, a follow-up), kept current: done when done, description updated when a decision lands. Ask open points one at a time — a message ends with exactly one question.
- **Glossary and ADRs:** where a repo has `GLOSSARY.md` (or `GLOSSARY-MAP.md`) or `docs/adr/`, read them before designing or naming, use the glossary's terms, and say so out loud when a plan contradicts an ADR. A new ADR only when a decision is hard to reverse, surprising without context and a real trade-off.
- **Git:** Conventional Commits (`type(scope): description`, lowercase, imperative). Stage files by name, never `git add .` unless the repo's CLAUDE.md allows it.
- **Published text** (commits, PRs, issues, code comments) states results, decisions and reasons — never how the work was produced, and no AI or Claude attribution.
- **Line endings:** new files LF. In my own repos everything is LF (convert stray CRLF in a file you touch); in others keep what is there, never bulk-convert.

## Memory

**Memory is written only when I ask for it.** A correction during a session changes that session, nothing more. At the end of a piece of work, propose what is worth keeping — each with its scope (none, this repo, global) and whether a check, hook or skill change would carry it better than a note — and write only what I pick. Repo scope is the default; global only when I say so. Working notes a skill writes (briefs, reports, reviews, research notes) are not covered by this; they follow their skill.

All memory lives under `~/Memory/` (auto memory is off); how it is laid out, where a note goes and its format: `~/Memory/global/README.md` — read it before writing a note. Never write to `~/.claude/projects/*/memory/` or `~/Notes/`. Before researching from scratch, search memex (or `~/memex/daniel/wiki/_master-index.md`).

Global memory index: @~/Memory/global/MEMORY.md
