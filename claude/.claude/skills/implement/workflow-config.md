# Repo workflow config — `.claude/agents/workflow.md`

Per-repo facts the pipeline needs. The skill stays generic; everything repo-specific lives in this file, next to the board config that `to-issues`/`to-prd` keep in `.claude/agents/github.md`.

## Schema

The file holds one fenced yaml block:

```yaml
# Battery: every command must pass before a PR. Run from the worktree root.
# Prefer the repo's task runner (mise) over naming tools directly — the task
# definitions stay the single source of truth. The battery must cover what CI
# enforces: a gate that checks less than CI breaks the trust model.
gate:
  - mise run test
  - mise run gate          # a task that mirrors CI (lint + typecheck + build)

# Lint/type commands the reviewer runs on changed files only, e.g.
# "ruff check <files>" (Python), "dotnet format --verify-no-changes" (C#).
review_checks:
  - <linter> <files>
  - <type checker> <files>

# Board: where items move when work starts. IDs resolved once, cached here.
# ready_option_id is used by /plan-epic when publishing new issues.
board:
  project_owner: <owner>
  project_number: <n>
  project_id: <PVT_...>
  status_field_id: <PVTSSF_...>
  in_progress_option_id: <hex>
  ready_option_id: <hex>

# Optional repo task that creates + sets up a worktree (type + slug + base).
worktree_task: mise run worktree-new

# auto-when-green: lead merges once green_definition holds, except merge_exceptions.
# ask: lead reports green and waits.
merge_policy: auto-when-green
merge_exceptions:
  - .github/workflows/**        # user's token scope, user merges

# What "green" means before merge.
green_definition: CI green AND Sonar quality gate green with 0 new issues

# always: PR bodies + new issues are drafted for approval before posting.
# waived: post directly, concise and clean.
public_text_drafts: always

# What needs the user's own hands or eyes before a change counts as done —
# a verification only they can run (target hardware, an environment only
# they control), beyond decisions and approvals the skills already route
# to them. Empty if the repo has none.
user_gate: <when and how the user verifies, or empty>
```

## Bootstrap (config missing)

1. **Gate**: derive candidates from the repo's CLAUDE.md build/test section and `mise.toml` tasks.
2. **Board**: reuse `project_owner` / `project_number` / `project_id` / `status_field_id` from `.claude/agents/github.md` if present; resolve the In-Progress option id via `gh project field-list <n> --owner <owner> --format json`.
3. **Policies**: propose `merge_policy`, `merge_exceptions`, `public_text_drafts`, `user_gate` from what the user has said in this repo; anything unknown, ask.
4. Present the drafted yaml to the user, write the file on their OK, and continue the pipeline.

## Board moves

Resolve the item id via the issue's `projectItems` connection, then set Status:

```bash
item_id=$(gh api graphql -f query='{ repository(owner: "<owner>", name: "<repo>") { issue(number: <N>) { projectItems(first: 5) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == <n>) | .id')

gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"<project_id>\", itemId: \"$item_id\", fieldId: \"<status_field_id>\", value: { singleSelectOptionId: \"<in_progress_option_id>\" } }) { projectV2Item { id } } }"
```

Run it for the issue and for its parent epic (the epic move is idempotent — once per epic is enough).
