---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices, and publish them to the repo's GitHub Project board. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable GitHub issues using vertical slices (tracer bullets).

Publishes to the GitHub Project board configured per-repo at `.claude/agents/github.md`. Same config is used by `to-prd`.

## Process

### 1. Ensure GitHub Project config

Check `<repo>/.claude/agents/github.md` exists. If missing, bootstrap it:

1. Verify `gh` is installed and authenticated (`gh auth status`). If not, tell the user and stop.
2. Ask the user for the project board URL (e.g. `https://github.com/users/<owner>/projects/<n>` or `https://github.com/orgs/<org>/projects/<n>`).
3. Parse `project_owner` and `project_number` from the URL.
4. Resolve the GraphQL IDs once via `gh project field-list <number> --owner <owner> --format json`:
   - `project_id` (top-level `id`)
   - `status_field_id` (the field whose `name` is `Status`)
   - `ready_option_id` (within Status field options, the option whose `name` is `Ready`)
5. Write `.claude/agents/github.md` with a fenced yaml block containing those values (see `to-prd` SKILL.md for the exact file shape).

If the file exists, parse the yaml block and use those values directly.

### 2. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number or URL) as an argument, fetch it with `gh issue view <ref> --comments` and read its full body and comments.

### 3. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 4. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 5. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 6. Publish

Detect the target repo from `git remote get-url origin` (parse `owner/name`).

For each approved slice, in dependency order (blockers first) so you can reference real issue numbers in the "Blocked by" field:

1. Create the issue:
   ```
   gh issue create -R <owner>/<name> --title "<slice title>" --body-file <tmpfile>
   ```
   Capture the returned issue URL and number.
2. Add the issue to the project:
   ```
   gh project item-add <project_number> --owner <project_owner> --url <issue-url> --format json
   ```
   Capture the returned item `id`.
3. Set Status to Ready:
   ```
   gh project item-edit --id <item-id> --project-id <project_id> --field-id <status_field_id> --single-select-option-id <ready_option_id>
   ```

Use the issue body template below.

<issue-template>
## Parent

A reference to the parent issue (if the source was an existing issue, otherwise omit this section).

## Type

HITL or AFK.

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- #<issue-number> — short title

Or "None — can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.

Report all created issue URLs to the user at the end.
