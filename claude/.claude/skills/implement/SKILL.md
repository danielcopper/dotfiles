---
name: implement
description: "Implement a GitHub issue end-to-end — align, worktree, board, implementer + review agents, gates, PR. Argument: the issue number; append --go to skip the align gate when nothing is unclear."
disable-model-invocation: true
---

Run one GitHub issue through the pipeline: understand → align → implement → review → PR → green → handoff. You are the
lead: you orchestrate and own push and PR; agents work in the issue's worktree by its absolute path while you stay in
the main checkout. Keep going between steps.

A **convention repo** has `## Where decisions live` in its `CLAUDE.md`; steps marked *(convention)* apply only there.

## 1. Load the repo's facts

Load them as [`repo-config.md`](repo-config.md) says. No profile, or no gate → stop and ask the user to run
`/setup-repo`.

*Done when:* gate, review checks, worktree task, board, user gate and every departure from a default are known, and
whether this is a convention repo.

## 2. Understand the issue

`gh issue view <N> --comments`, plus its parent epic. *(convention)* Read its `## To decide`, `## Decisions` and
`## Done when`, and the epic's `## Decisions` when it says "See epic #N". Read the area's docs, ADRs and glossary, and
explore the code far enough to know the blast radius.

*Done when:* you can state the change, its done criteria and every area it touches.

## 3. Align

State approach, scope and what stays untouched; ask open questions one at a time; start on the user's go. With `--go`
(or a standing grant) and no open question, go straight on — open questions always stop.

When the issue still has open `## To decide` items, or its answers would coin a glossary term or meet the ADR criteria,
offer a `/grill-with-docs` pass before aligning, and on the user's yes read `~/.claude/skills/grill-with-docs/SKILL.md`
and follow it. The offer is a question, so `--go` stops for it too.

*(convention)* The answers go into the issue before step 4, as `repo-config.md`, "Questions and decisions in an issue",
says, plus `## Out of scope` when anything was ruled out (`## Decisions` with "None." when nothing was to decide);
`--go` also needs an issue with no open question. A decision meeting the ADR criteria gets an ADR where
`grill-with-docs`, "Where they are written", puts it — in the repo the implementer writes it in the PR and the issue
links it, outside the repo you write it unlinked.

*Done when:* the user's go *(convention)* and every answer in the issue.

## 4. Stage the work

`git pull --ff-only` in the main checkout (stop and tell the user if it fails). Create the worktree for
`<type>/<N>-<slug>` from main with the repo's worktree task, else at the path the `worktree` skill gives, and note its
base SHA (`git -C <wt> rev-parse HEAD`). Move the issue and its parent epic to In Progress as
[`repo-config.md`](repo-config.md), "Board", says.

*Done when:* the worktree exists, its base SHA is noted, and the board, where there is one, shows both items In
Progress.

## 5. Implement

Write the brief to `~/Memory/<repo>/brief-<N>.md` and dispatch the implementer per [`dispatch.md`](dispatch.md), which
routes its status. Questions, BLOCKED and NEEDS_CONTEXT go to the user. *(convention)* An answer that is a decision goes
into the issue as `repo-config.md`, "Questions and decisions in an issue", says, before the agent resumes.

*Done when:* DONE, or DONE_WITH_CONCERNS routed as `dispatch.md` says.

## 6. Review

Run the review agents [`review-agents.md`](../../review-agents.md) names, per `dispatch.md`. Re-read `review-agents.md`
before each round: it routes the findings, including the check of each Critical or Important one at its artifact, and
sets the fix rounds and their cap.

*Done when:* every finding sent to the implementer is addressed or, after the round cap, on the user's list, and the
user has ruled on that list.

## 7. Gate evidence, once

The lead runs the full gate once, on the final state of the branch after the review rounds, when no other heavy run is
going on the machine; the implementer reports only the checks for what it changed and "gate owed". Only code changed
after the gate gets its affected commands re-run, by whoever changed it.

*Done when:* evidence exists for the exact final state of the branch.

## 8. Pull request

Draft the PR — conventional-commit title, `Closes #<N>`, one sentence per small by-catch fix, docs per the repo's policy
(updated in the PR, or its opt-out with a reason) — post it as `public_text_drafts` in
[`repo-config.md`](repo-config.md) says, then push and open it.

*(convention)* The body becomes the squash commit: a prose summary, `## Decisions` one line each (a sub-issue: "See epic
#N" plus its own), and `Closes #<N>`; one issue per PR. A fix without decisions takes the label `no-decisions` and keeps
`## Decisions` with "None." — the text `decisions: none` is for outside contributors, who cannot set labels.

*Done when:* the PR is open with approved text.

## 9. Watch to green

Poll `gh pr checks` until `green_definition` (`repo-config.md`) holds. A failure goes back to the implementer, or you fix
it when trivial; a fix that changes behaviour gets its delta reviewed as a fix round (`review-agents.md`). After a
rebase onto a moved main, `git -C <wt> push --force-with-lease`. *(convention)* A red `decisions` check names its rule:
a missing `## Decisions` or an open question is fixed in the linked issue, and editing it re-runs the check; the other
rules are fixed in the PR.

At green, run the profile's `user_gate` where it applies. Prepare it in full from the issue, its decisions and the
change, and send it as one message the user runs start to finish: the starting state, the exact steps, the expected
result after each step, and what to report back. Then stop for the user's verdict. *(convention)* Then add one
sentence with the result to the PR body, drafted as `public_text_drafts` says.

Merging follows `merge_policy` (`repo-config.md`), and only after the user gate.

*Done when:* green, the user gate passed *(convention)* with its result in the PR body, and the PR handed over or merged
as `merge_policy` allows.

## 10. Close the loop

After the merge: check the issue closed and, where there is a board, reached Done (the epic stays In Progress while
siblings are open); remove worktree and branch per the `worktree` skill; move the issue's working files
(`~/Memory/<repo>/<kind>-<N>[-<suffix>].md`) to `archive/<N>-<slug>/`, each with this line first after its front matter:
`Historical — working notes for #N, merged <date>. Not current. What holds now: the issue, the PR body, docs/ and ADRs.`
File the issues the user chose for large by-catch as `public_text_drafts` says, in the Planned change shape (`## Today`,
`## Wanted`, `## To decide`, `## Done when`), with generic data shapes and glossary terms.

*Done when:* the board is consistent, those issues are filed, and the working files are archived (a run that ends
before the merge skips this).
