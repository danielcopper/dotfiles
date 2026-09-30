---
name: to-prd
description: Turn the current conversation context into a PRD and publish it to the repo's GitHub Project board. Use when user wants to create a PRD from the current context.
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

The skill publishes to a GitHub Project board configured per-repo at `.claude/agents/github.md`. Same config is used by `to-issues`.

## Process

### 1. Ensure GitHub Project config

Check `<repo>/.claude/agents/github.md` exists. If missing, bootstrap it:

1. Verify `gh` is installed and authenticated (`gh auth status`). If not, tell the user and stop.
2. Ask the user: "Welches Project board für dieses Repo? URL bitte (z.B. `https://github.com/users/<owner>/projects/<n>` oder `https://github.com/orgs/<org>/projects/<n>`)."
3. Parse `project_owner` and `project_number` from the URL.
4. Resolve the GraphQL IDs once via `gh project field-list <number> --owner <owner> --format json`:
   - `project_id` (top-level `id`)
   - `status_field_id` (the field whose `name` is `Status`)
   - `ready_option_id` (within Status field options, the option whose `name` is `Ready`)
   - If `Status` or `Ready` don't exist on the board, ask the user for the correct field/option name and re-resolve.
5. Write `.claude/agents/github.md`:

   ````markdown
   # GitHub Project config

   Used by `to-prd` and `to-issues`. Re-run either skill if you rename the Status field or Ready option to refresh cached IDs.

   ```yaml
   project_url: https://github.com/users/<owner>/projects/<n>
   project_owner: <owner>
   project_number: <n>
   project_id: PVT_...
   status_field: Status
   status_field_id: PVTSSF_...
   ready_value: Ready
   ready_option_id: ...
   ```
   ````

If the file exists, parse the yaml block and use those values directly.

### 2. Explore and synthesize

Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

### 3. Sketch the test seams

Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

### 4. Write the PRD

Use the template below.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- The seams at which the feature will be tested, as agreed in step 3, and why those seams
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>

### 5. Publish

1. Detect the target repo from `git remote get-url origin` (parse `owner/name`).
2. Create the issue:
   ```
   gh issue create -R <owner>/<name> --title "<PRD title>" --body-file <tmpfile>
   ```
   Capture the returned issue URL.
3. Add the issue to the project:
   ```
   gh project item-add <project_number> --owner <project_owner> --url <issue-url> --format json
   ```
   Capture the returned item `id`.
4. Set Status to Ready:
   ```
   gh project item-edit --id <item-id> --project-id <project_id> --field-id <status_field_id> --single-select-option-id <ready_option_id>
   ```
5. Report the issue URL to the user.
