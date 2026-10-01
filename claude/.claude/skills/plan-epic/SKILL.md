---
name: plan-epic
description: "Plan an epic from a loose idea, discussion, or existing issue — discussion first, then native sub-issues on the board as drafts for approval. Produces a plan and issues, never code. Argument: a topic, an issue number, or nothing (uses the conversation)."
disable-model-invocation: true
---

Turn an idea into an epic with grabbable sub-issues. This skill ends in issues on the board — implementation belongs to `/implement` and `/epic`, after the user starts them.

## 1. Gather

Whatever exists: the conversation so far, the referenced issue (`gh issue view <N> --comments`), the code area, `CONTEXT.md` and the ADRs it touches.

*Done when:* you know the goal, the constraints, and the affected architecture well enough to challenge the plan, not just transcribe it.

## 2. Discuss

Stay in discussion mode: sharpen goals, surface trade-offs, challenge weak spots — one question at a time. When the plan is architecture-bearing or contentious, offer a `/grill-me` or `/grill-with-docs` pass before slicing.

Record the outcome for the epic body: each question under `## To decide` as a checkbox (`- [ ] …`); each answer under `## Decisions` as a numbered entry (`- D1: …`), its question checked off and pointing to it (`- [x] … → D1`). For a decision meeting the three ADR criteria in the global `CLAUDE.md`, offer an ADR in `docs/adr/`, linked from the epic.

*Done when:* the user confirms the plan is settled, every answer stands under `## Decisions`, and every question under `## To decide`, checked off with its `→ Dn` or still open.

## 3. Slice

Cut the plan into sub-issues:

- **Vertical tracer bullets** by default — each slice cuts through all layers end-to-end and leaves main runnable when merged.
- **Expand→contract** for wide mechanical refactors whose blast radius breaks call sites repo-wide: add the new beside the old, migrate call sites in blast-radius-sized batches (each batch its own issue), remove the old last.

Each sub-issue must be self-contained for a cold agent. Its body has the headings `## Today`, `## Wanted`, `## Decisions`, `## To decide`, `## Done when`, and `## Out of scope` when anything is ruled out. `## Decisions` reads "See epic #N" plus the slice's own decisions — the epic's decisions are referenced, not copied. `## To decide` holds the slice's open questions as checkboxes (`- [ ] …`), or is left out. Bodies use the project's glossary vocabulary and generic data shapes — a concrete example is an anonymized shape, and the workflow that produced the plan stays out of the text.

*Done when:* every slice is independently mergeable and no requirement of the plan is unassigned.

## 4. Draft for approval

Present the epic body and every sub-issue draft to the user, with a proposed order (dependencies first, risk early). Rework until approved.

## 5. Publish

On approval: create the epic and the sub-issues, link them **natively** — parent via GitHub's Sub-issues API (`gh api graphql`), blocked-by via the issue-dependency API (command in the `to-issues` skill, Publish step); body-text lists are not the mechanism — put everything in the board's **Ready** column with priority and assignee set (board config: the `board` block in `.claude/agents/workflow.md`, or `.claude/agents/github.md` where that's the file the repo has).

*Done when:* the board shows the epic with all sub-issues in Ready, natively linked as sub-issues and by blocked-by, and the user has the recommended starting order — typically as a `/epic <N>` away.
