---
name: retro
description: "Conduct a retrospective on a coding session."
disable-model-invocation: true
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Call the Skill tool with `writing-for-agents` for the writing style guide.

2. Read the primary sources for the session the user specifies. For a past session this means searching the session logs under `~/.claude/projects/<sanitized-cwd>/*.jsonl` the way `~/.claude/skills/find-session/SKILL.md` describes. If the user doesn't specify a session, default to the current one.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `mise` tasks, its `package.json`/build-tool `lint`/`check` scripts, its CI workflow, the `gate` and `review_checks` in `.claude/agents/workflow.md`), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Default to building the check over writing the rule. Reserve `CODING_STANDARDS.md` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the reviewer agent failed to catch a mistake.
- **CLAUDE.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the CLAUDE.md file is particularly large - in the repo OR the user's global scope (`~/.claude/CLAUDE.md`).
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.
- **Durable learning**: a fact the session paid to discover (a tool quirk, a repo fact, a correction from the user) that no check, pointer or standard can carry. Propose it as an entry in today's daily (`~/Memory/global/daily/<YYYY-MM-DD>.md`, format per CLAUDE.md), never as a durable memory file: promotion to durable memory and the wiki stays with `/memory-dream` and `/memory-promote`, which dedupe against what exists and route it. Reach for this category last: a mistake a check can catch gets the check. _Use when_ the agent re-derived something a past session already knew, or the user had to correct it.

4. Present these candidates to the user, in order of severity. Each names the moment in the session it comes from and the file it would change. Done when every candidate traces to a specific moment; drop any that doesn't.

Retro ends at the list and changes nothing itself: no check, hook, CLAUDE.md line, skill or memory entry is written until the user picks that candidate, and a picked one becomes ordinary work from there. When you need the user's input, ask one question at a time, in prose.

## Reference

### Implementation vs Review

Remember that all work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

You have access to several files in the repo:

- `CLAUDE.md` (`AGENTS.md` in other tools): these files are pushed to the context window of any agent working in this repo. They should be used incredibly sparingly, usually only for **navigation pointers** to other files.
- `CODING_STANDARDS.md`: this file is read during review, not implementation. Add **navigation pointers** to docs folders if the standards file gets more than 1,000 lines long. The `reviewer` agent (`~/.claude/agents/reviewer.md`) reads the repo's CLAUDE.md, not this file: the candidate that starts `CODING_STANDARDS.md` also proposes the pointer that makes the reviewer read it.
- Docs: use docs as references files, pointed to by other files. Look for existing docs before writing new ones.
- Skills: use skills for docs (since their description goes into the agent's context window), or for user-invoked commands. Follow the advice in the `writing-for-agents` skill.
- Memory: retro only feeds today's daily under `~/Memory/global/daily/`; `/memory-dream` and `/memory-promote` own everything durable. Memory stores what happened; the other files change the environment so it can't happen again, which is why they come first.
