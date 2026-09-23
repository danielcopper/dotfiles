---
name: toolbox
description: Router over my skills — names each one and when to reach for it. Start here when unsure which skill fits.
disable-model-invocation: true
---

Match the current situation against this index and recommend the right skill(s). User-invoked skills you can only point at — the user types them. Model-invoked skills you may fire directly once the user confirms.

## Issue & epic pipeline (user-invoked)

- `/next [hint]` — what to work on next: reads board + PRs + commits, commits to one recommendation
- `/implement <N> [--go]` — one GitHub issue end-to-end: align → worktree + board → implementer → reviewer → PR → watch to green → merge per policy
- `/epic <N>` — assembly line over an epic's native sub-issues; merge between issues, fresh worktree from updated main
- `/plan-epic [topic|N]` — idea → discussion → native sub-issues in Ready; produces a plan and issues, never code
- `/handoff` — compact the session into a handoff doc (context nearly full, or the work continues in a fresh session)

## Planning & design

- `/grill-me` — stress-test a plan by relentless interview, one question at a time
- `/grill-with-docs` — the same, challenged against CONTEXT.md and ADRs, updating them inline as decisions crystallise
- `/to-prd` — turn the current conversation into a PRD on the project board
- `/to-issues` — break a plan/PRD into tracer-bullet issues on the board
- `/improve-codebase-architecture` — find deepening and consolidation opportunities in a codebase
- `/zoom-out` — explain how the code at hand fits the bigger picture

## Quality & debugging

- `/diagnose` — disciplined loop for hard bugs and perf regressions: reproduce → minimise → hypothesise → instrument → fix
- `/tdd` — red-green test-first development
- `/pr-review` — collaborative Azure DevOps PR review with empirical finding validation
- Bundled, worth remembering: `/code-review` (review the current diff), `/simplify` (cleanup pass on changed code), `/verify` (drive the change end-to-end in the real app)

## Memory

- `/memory-dream` — triage daily logs: propose promotions to durable memory
- `/memory-consolidate` — full sweep: dream, then dedupe/merge durables and refresh the index
- `/memory-promote` — move one specific entry to a durable destination

## Maintenance

- `/deps-triage [merge]` — classify open dependency/chore PRs: SAFE / LOOK / STUCK, with reasoning; merges the safe ones on OK
- `/find-session <term>` — find past sessions by issue number or topic, with resume commands

## Meta & recurring

- `/writing-great-skills` — the vocabulary for authoring and reviewing skills; read it before writing one
- `/loop <interval> <prompt|skill>` — run something on a recurring interval (e.g. `/loop 1h /deps-triage`)
- `/deep-research <question>` — multi-source, fact-checked research report
