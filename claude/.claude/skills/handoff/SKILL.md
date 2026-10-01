---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to `~/Memory/<repo>/handoff-<slug>.md` (`<repo>` = basename of the main repo root) — persistent, unlike the OS temp dir, which is cleared on restart; never the current workspace.

The document holds status and pointers: where the work stopped, what is open, and where each piece lives. A decision goes into its issue (`## Decisions` in a repo whose `CLAUDE.md` has `## Where decisions live`) — the handoff points there and is never its only home. The agents' working rules live in their definitions (`~/.claude/agents/`); point to those instead of copying them.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
