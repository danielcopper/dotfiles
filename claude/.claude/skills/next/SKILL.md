---
name: next
description: 'Recommend the next ticket — reads the project board (Ready + In Progress), open PRs, and recent commits, then commits to one recommendation with reasoning. Argument: an optional focus hint (e.g. "was kleines", "saves", "frontend").'
disable-model-invocation: true
---

Answer one question — "what do we work on next?" — with a single, reasoned recommendation. The user decides; this skill never starts the work.

## 1. Read the state

The board from the repo's profile ([`~/.claude/skills/implement/repo-config.md`](../implement/repo-config.md)); if the profile is missing, stop and ask the user to run `/setup-repo`. Then gather:

- Board items in **In Progress** and **Ready**, with priority and parent epic — on a `github` board as `repo-config.md`, "GitHub commands", reads them; on an `azure-devops` board the items in the profile's `in_progress_state` and `ready_state`, read as `repo-config.md`, "Board", says
- The body of each Ready issue (`gh issue view <N> --json body`)
- Open PRs and their check states (`gh pr list --json number,title,statusCheckRollup`)
- The last ~15 commits on main (what momentum exists, what just shipped)

*Done when:* every In Progress and Ready item has been seen with its priority — not just the first page — or, with no board, that is said in one line.

## 2. Flag inconsistencies first

Before recommending: In Progress items with no matching open PR or recent commits are possibly stalled or forgotten — name them. Open PRs sitting green and unmerged — name them. These often ARE the real next action.

A Ready issue with an open question under `## To decide` (or `### To decide`) is not startable — name it with its open questions. It can be the pick only as "decide these first", never as a straight `/implement`.

## 3. Recommend

Commit to **one** primary recommendation, with the reasoning that picked it: priority, epic momentum (finishing an In Progress epic beats starting a new one), dependency order, risk-early, and the user's focus hint if given. Add one line each on the top one or two runners-up and why they lost. A ranked option menu without a commitment is a non-answer.

*Done when:* the user has a pick they can act on — typically one `/implement <N>` or `/epic <N>` away.
