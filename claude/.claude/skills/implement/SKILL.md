---
name: implement
description: "Implement a GitHub issue end-to-end — align, worktree, board, implementer + reviewer agents, gates, PR. Argument: the issue number; append --go to skip the align gate when nothing is unclear."
disable-model-invocation: true
---

Run one GitHub issue through the full pipeline: understand → align → implement → review → PR → green → user handoff. You are the lead: you orchestrate, commit nothing an agent already committed, and own push and PR preparation. Merge remains the user's responsibility unless they explicitly grant full-auto for the current run. Work step by step and keep momentum — the user decides when to stop, so between steps simply continue. This session stays in the main checkout; implementer and reviewer work in the issue's worktree by its absolute path.

A **convention repo** is one whose `CLAUDE.md` has the section `## Where decisions live`; that section states the convention. Steps marked *(convention)* apply only there; in any other repo they are skipped and the rest runs as written.

## 1. Load the repo workflow config

Read `.claude/agents/workflow.md` from the **main checkout** — it may be gitignored, so a sibling worktree need not have it: `$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.claude/agents/workflow.md` (the same goes for `.claude/agents/github.md`). If it is missing, bootstrap it per [`workflow-config.md`](workflow-config.md) before anything else and write it there. Check the main checkout's `CLAUDE.md` for `## Where decisions live`.

*Done when:* gate commands, board config, merge policy, the user gate and any `agent_rules` are loaded, and you know whether this is a convention repo.

## 2. Understand the issue

`gh issue view <N> --comments`, plus its parent epic if it is a sub-issue. *(convention)* Read its `## To decide`, `## Decisions` and `## Done when`, and the epic's `## Decisions` when the issue says "See epic #N". Read the ADRs, docs, and glossary entries the issue area touches, then explore the code far enough to know the blast radius.

*Done when:* you can state the change, its done criteria, and every file area it will touch in your own words.

## 3. Align

Present a compact readiness statement: intended approach, scope, what you'll leave untouched. Ask your open questions **one at a time**, waiting for each answer. Implementation starts on the user's green light.

*(convention)* The answers go into the issue before step 4: draft the issue edit — each answer one line under `## Decisions`, `## To decide` removed (or renamed to `## Decisions`), `## Out of scope` when anything was ruled out — show it to the user, and post it on their approval (`gh issue edit <N> --body-file <file>`). When it turns out there is nothing to decide, the draft is `## Decisions` with "None.". A decision meeting the three ADR criteria in the global `CLAUDE.md` also gets an ADR in `docs/adr/`: the implementer writes it in the same PR from the issue's `## Decisions` (name it in the brief's extras), and the issue links it.

With `--go` (or a standing automode grant from the user) and zero open questions, proceed directly — open questions always stop, in every mode. *(convention)* `--go` also needs a ready issue: no `## To decide` with text, and a `## Decisions` (a "See epic #N" pointer counts).

*Done when:* green light received *(convention)* and the posted issue holds every answer under `## Decisions`.

## 4. Stage the work

- Update main first: `git pull --ff-only` in the main checkout — PRs are merged on the remote, so local main lags behind. If the pull fails (main diverged, or local changes it would overwrite), stop and tell the user.
- Create the worktree for branch `<type>/<N>-<slug>` from main via the config's `worktree_task` (`<worktree_task> <type> <N>-<slug> main`), else with `git worktree add` at the convention path from the `worktree` skill. This session stays in the main checkout. Note the base SHA (`git -C <wt> rev-parse HEAD`).
- Move the issue **and** its parent epic to **In Progress** on the board (commands in [`workflow-config.md`](workflow-config.md)).

*Done when:* the worktree exists, its base SHA is noted, and the board shows both items In Progress.

## 5. Implement

Write the brief to `~/Memory/<repo>/brief-<N>.md` and dispatch the **implementer** agent per [`dispatch.md`](dispatch.md). Route its four-state status as dispatch.md describes; questions and BLOCKED/NEEDS_CONTEXT go to the user, not to your own judgment. *(convention)* An answer that is a decision goes into the issue's `## Decisions` (drafted, approved, posted) before the agent resumes.

*Done when:* status DONE, or DONE_WITH_CONCERNS with every concern resolved with the user.

## 6. Review

Produce the diff artifact and dispatch the **reviewer** agent with the issue and the brief, per [`dispatch.md`](dispatch.md) — a fresh reviewer each round. When the change is unusually complex or critical, offer the user a Fable-model reviewer and spawn it only on their confirmation.

Route the verdict:

- **Needs fixes** → fix-dispatch to the implementer, then re-review. Repeat until **Approved**.
- **Minor findings that remain** → present them all to the user; they decide fix-now, follow-up, or drop.
- **Follow-up work discovered** → draft issues for the user's approval in the Planned change shape (`## Today`, `## Wanted`, `## To decide`, `## Done when`), with generic data shapes and glossary vocabulary; the workflow that produced them stays out of the text. The current PR keeps its scope.

*Done when:* verdict is Approved and the user has ruled on every remaining finding.

## 7. Gate evidence, once

The battery runs once per code state. The implementer's final battery report is the evidence — judge it, don't repeat it. Only code that changed after that report (a lead-side fix, a review amendment the implementer didn't re-verify) gets its affected commands re-run, by whoever changed it.

*Done when:* battery evidence exists for the exact final state of the branch.

## 8. Pull request

Draft the PR: conventional-commit title, body with `Closes #<N>`, docs handled per repo policy (updated in the same PR, or the repo's explicit opt-out with a one-line reason). Present the draft and wait for approval — skip the wait only when the user has waived drafts. Then push and open the PR.

*(convention)* The body becomes the squash commit body, so it holds: a prose summary, `## Decisions` with the final decisions one line each (a sub-issue: "See epic #N" plus its own), and `Closes #<N>`. A docs opt-out (the repo's docs-check marker) may also sit in the body. Every PR closes exactly one issue. A small fix without decisions opts out with the label `no-decisions` and keeps `## Decisions` with "None."; the text `decisions: none` is for outside contributors, who cannot set labels — the owner uses the label so the opt-out stays out of the squash commit.

*Done when:* the PR is open with approved text.

## 9. Watch to green

Poll `gh pr checks`. Failures get a fix loop: dispatch back to the implementer (or fix directly when trivial), commit, focused re-verify. When the implementer rebased onto a moved main, push with `git -C <wt> push --force-with-lease`. The bar is the config's `green_definition` — typically CI green **and** the quality gate green with **0 new issues**. *(convention)* The `decisions` check is among the required checks; it reads the linked issue, and an edit of that issue re-runs it.

At green, run any applicable `user_gate`: prepare it fully (state prep done, exact steps, expected result) and stop for the user's verdict. The pass is required before the PR is merge-ready. *(convention)* After the pass, draft one sentence with the device-check result for the PR body's summary — public text, so shown for approval per `public_text_drafts` — then edit the body (`gh pr edit <PR> --body-file <file>`).

Green means the automated implementation work is complete; it is not merge authorization. With the default `user` policy, report the evidence and wait for the user to merge. Merge only when the user explicitly asks for this merge, or grants full-auto for the current run, and the user gate has passed; the merge goes through a permission prompt. Do not infer full-auto from an earlier issue or session.

*Done when:* the PR is green, any user gate has passed *(convention)* and its result stands in the PR body, and the PR is handed to the user or merged under an explicit current-run full-auto grant.

## 10. Close the loop

- After a merge, verify that automation closed the issue and moved it to Done; the epic stays In Progress while siblings remain open. At user handoff before merge, leave the issue In Progress and state that automation will close it after the user's merge.
- After the merge, clean up the worktree and branch per the `worktree` skill.
- Once the merge is confirmed (the user says so, or `gh pr view <PR> --json state` shows `MERGED`), move the issue's working files in `~/Memory/<repo>/` (brief, report, findings, reviews, inventory, design, handoff) to `~/Memory/<repo>/archive/<N>-<slug>/`. Working files carry the issue number in their name — `<kind>-<N>[-<suffix>].md` — so this step finds them. Each gets this line as its first line after any YAML front matter: `Historical — working notes for #N, merged <date>. Not current. What holds now: the issue, the PR body, docs/ and ADRs.` The repo's `MEMORY.md` lists `archive/` in one line only: historical working notes, not current.
- File the approved follow-up issues.
- If context is running low, write `/handoff` (status and pointers: where we stopped, open PRs, pending tests, board state) and tell the user to compact.

*Done when:* board consistent, any required user gate passed, follow-ups filed, and — once the merge is confirmed — working files archived. A run that ends at the handoff before the merge is complete without the archive step.
