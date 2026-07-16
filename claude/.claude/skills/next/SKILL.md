---
name: next
description: Recommend the next ticket — reads the project board (Ready + In Progress), open PRs, and recent commits, then commits to one recommendation with reasoning. Argument: an optional focus hint (e.g. "was kleines", "saves", "frontend").
disable-model-invocation: true
---

Answer one question — "what do we work on next?" — with a single, reasoned recommendation. The user decides; this skill never starts the work.

## 1. Read the state

Board config from `.claude/agents/workflow.md` (or `github.md`). Then gather:

- Board items in **In Progress** and **Ready**, with priority and parent epic (`gh project item-list <n> --owner <owner> --format json`, filter by status)
- Open PRs and their check states (`gh pr list --json number,title,statusCheckRollup`)
- The last ~15 commits on main (what momentum exists, what just shipped)

*Done when:* every In Progress and Ready item has been seen with its priority — not just the first page.

## 2. Flag inconsistencies first

Before recommending: In Progress items with no matching open PR or recent commits are possibly stalled or forgotten — name them. Open PRs sitting green and unmerged — name them. These often ARE the real next action.

## 3. Recommend

Commit to **one** primary recommendation, with the reasoning that picked it: priority, epic momentum (finishing an In Progress epic beats starting a new one), dependency order, risk-early, and the user's focus hint if given. Add one line each on the top one or two runners-up and why they lost. A ranked option menu without a commitment is a non-answer.

*Done when:* the user has a pick they can act on — typically one `/implement <N>` or `/epic <N>` away.
