---
name: epic
description: "Work through an epic's sub-issues as an assembly line — align once on all issues, then run each through the implement pipeline, merging between issues. Argument: the epic issue number."
disable-model-invocation: true
---

Run an epic's open sub-issues to completion, one at a time. The per-issue pipeline is the `implement` skill's — read `~/.claude/skills/implement/SKILL.md` (and its `dispatch.md` / `repo-config.md`) now; this skill only adds the epic-level protocol around it.

## 1. Load

The repo's facts (implement step 1), then the epic: `gh issue view <N> --comments`, its native sub-issues (the Sub-issues panel, via `gh api`), and, where there is a board, the board state for all of them.

*Done when:* every open sub-issue's body has been read, not just listed.

## 2. Get on the same page

Present to the user:

- A **sensible order** for the open sub-issues (dependencies first, risk early)
- The split into **runs autonomously** vs **needs the user** — a verification the profile's `user_gate` names, a decision only they can make, or a step only they can perform
- Your questions about any issue — asked **one at a time**, before any work starts

In a convention repo (see `implement`), epic-level answers go into the epic body's `## Decisions` — drafted, approved, posted — and each sub-issue's `## Decisions` reads "See epic #N", plus its own answers.

The line starts on the user's green light. Questions that surface later stop the line at that issue, in every mode.

*Done when:* order confirmed and green light received.

## 3. Start the epic

Move the **epic** to In Progress on the board (once), as implement step 4 does. Then take the first sub-issue.

## 4. Per sub-issue

Execute the implement pipeline steps 2–10 with these epic-mode adjustments:

- **Align (step 3)** collapses to questions-only: the epic-level alignment already happened, so a sub-issue with no open questions proceeds directly; one with questions stops for the user. In a convention repo "no open questions" means no open question under `## To decide`.
- **Merge between issues**: the sub-issue's PR reaches green and merges (per merge policy) **before** the next sub-issue starts — the next worktree branches from updated main. PRs stay small; every merge leaves main runnable.
- **Issues needing the user** (the step-2 split): prepare everything up to the blocking point, present exactly what's needed (one verification, one decision), and continue with the next autonomous sub-issue while waiting where the order allows.

Between issues: reconcile the board where there is one, give the user a one-line status ("#N merged, next: #M"), and continue.

*Done when (per issue):* PR merged, the board, where there is one, consistent, user gate passed if due.

## 5. Close the epic

When the last sub-issue is Done: verify that all sub-issues are closed and, on a board, in Done as its kind says (`repo-config.md`, "Board"), summarize what shipped, and ask the user to confirm closing the epic — closing decisions stay with the user.

If context runs low anywhere in the line, write `/handoff` — where the line stopped, open PRs, pending tests/decisions, board state where there is a board — and tell the user to compact.
