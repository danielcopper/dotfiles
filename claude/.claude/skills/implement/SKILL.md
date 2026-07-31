---
name: implement
description: Implement a GitHub issue end-to-end — align, worktree, board, implementer + reviewer agents, gates, PR. Argument: the issue number; append --go to skip the align gate when nothing is unclear.
disable-model-invocation: true
---

Run one GitHub issue through the full pipeline: understand → align → implement → review → PR → green → user handoff. You are the lead: you orchestrate, commit nothing an agent already committed, and own push and PR preparation. Merge remains the user's responsibility unless they explicitly grant full-auto for the current run. Work step by step and keep momentum — the user decides when to stop, so between steps simply continue.

## 1. Load the repo workflow config

Read `.claude/agents/workflow.md` in the repo root. If it is missing, bootstrap it per [`workflow-config.md`](workflow-config.md) before anything else.

*Done when:* gate commands, board config, merge policy, and the user gate are loaded.

## 2. Understand the issue

`gh issue view <N> --comments`, plus its parent epic if it is a sub-issue. Read the ADRs, docs, and glossary entries the issue area touches, then explore the code far enough to know the blast radius.

*Done when:* you can state the change, its acceptance criteria, and every file area it will touch in your own words.

## 3. Align

Present a compact readiness statement: intended approach, scope, what you'll leave untouched. Ask your open questions **one at a time**, waiting for each answer. Implementation starts on the user's green light.

With `--go` (or a standing automode grant from the user) and zero open questions, proceed directly — open questions always stop, in every mode.

*Done when:* green light received.

## 4. Stage the work

- Create the worktree `<type>/<N>-<slug>` from main (via the repo's worktree task if the config names one) and enter it.
- Move the issue **and** its parent epic to **In Progress** on the board (commands in [`workflow-config.md`](workflow-config.md)).

*Done when:* the session is in the worktree and the board shows both items In Progress.

## 5. Implement

Write the task brief to a file and dispatch the **implementer** agent per [`dispatch.md`](dispatch.md). Route its four-state status as dispatch.md describes; questions and BLOCKED/NEEDS_CONTEXT go to the user, not to your own judgment.

*Done when:* status DONE, or DONE_WITH_CONCERNS with every concern resolved with the user.

## 6. Review

Produce the diff artifact and dispatch the **reviewer** agent per [`dispatch.md`](dispatch.md) — a fresh reviewer each round. When the change is unusually complex or critical, offer the user a Fable-model reviewer and spawn it only on their confirmation.

Route the verdict:

- **Needs fixes** → fix-dispatch to the implementer, then re-review. Repeat until **Approved**.
- **Minor findings that remain** → present them all to the user; they decide fix-now, follow-up, or drop.
- **Follow-up work discovered** → draft issues for the user's approval (generic data shapes, glossary vocabulary; the workflow that produced them stays out of the text). The current PR keeps its scope.

*Done when:* verdict is Approved and the user has ruled on every remaining finding.

## 7. Gate evidence, once

The battery runs once per code state. The implementer's final battery report is the evidence — judge it, don't repeat it. Only code that changed after that report (a lead-side fix, a review amendment the implementer didn't re-verify) gets its affected commands re-run, by whoever changed it.

*Done when:* battery evidence exists for the exact final state of the branch.

## 8. Pull request

Draft the PR: conventional-commit title, body with `Closes #<N>`, docs handled per repo policy (updated in the same PR, or the repo's explicit opt-out with a one-line reason). Present the draft and wait for approval — skip the wait only when the user has waived drafts. Then push and open the PR.

*Done when:* the PR is open with approved text.

## 9. Watch to green

Poll `gh pr checks`. Failures get a fix loop: dispatch back to the implementer (or fix directly when trivial), commit, focused re-verify. The bar is the config's `green_definition` — typically CI green **and** the quality gate green with **0 new issues**.

At green, run any applicable `user_gate`: prepare it fully (state prep done, exact steps, expected result) and stop for the user's verdict. The pass is required before the PR is merge-ready.

Green means the automated implementation work is complete; it is not merge authorization. With the default `user` policy, report the evidence and wait for the user to merge. Merge only when the user explicitly grants full-auto for the current run and the user gate has passed. Do not infer full-auto from an earlier issue or session.

*Done when:* the PR is green, any user gate has passed, and the PR is handed to the user or merged under an explicit current-run full-auto grant.

## 10. Close the loop

- After a merge, verify that automation closed the issue and moved it to Done; the epic stays In Progress while siblings remain open. At user handoff before merge, leave the issue In Progress and state that automation will close it after the user's merge.
- File the approved follow-up issues.
- If context is running low, write `/handoff` (where we stopped, open PRs, pending tests, board state) and tell the user to compact.

*Done when:* board consistent, any required user gate passed, follow-ups filed.
