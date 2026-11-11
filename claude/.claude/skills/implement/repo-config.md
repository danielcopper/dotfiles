# Repo config — the global defaults, the repo's `CLAUDE.md`, and `repo-profile.md`

The facts the pipeline needs about a repository have three homes, by kind:

| Kind | Home | Holds |
|---|---|---|
| Policies that hold everywhere | this file, "Global defaults" | `merge_policy`, `green_definition`, `public_text_drafts` |
| Facts about the repository | the repo's own `CLAUDE.md`, section `## Pipeline` | gate, review checks, worktree task, agent rules |
| The owner's own facts per repo | `~/Memory/<repo>/repo-profile.md` | ownership, board, user gate, departures from a global default — and, for a foreign repo, the repository facts too |

`<repo>` is the basename of the main checkout's root, `basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"`, the name the memory tier already uses; the `CLAUDE.md` read is the one in that root. `/setup-repo` writes the profile and drafts the `## Pipeline` section. A skill that needs the profile and finds none stops and asks the owner to run `/setup-repo`.

## Own or foreign

The profile's `ownership` is `/setup-repo`'s verdict, by the rule in `setup-repo/SKILL.md`, step 2. A skill that needs only the verdict and finds no profile runs `~/.claude/skills/setup-repo/ownership.sh <root>` and reads its answer strictly as that step says; where it gives no verdict, the skill asks the owner. Any skill that would write about the repo states that verdict before it writes: **"own repo"**, or **"foreign repo, writing only to ~/Memory/<repo>/"**.

## Global defaults

Each holds in every repo unless its profile departs from it under `defaults` (schema below).

- **`merge_policy: user`** — green completes the implementation work; the lead reports and waits for the owner to merge. Full-auto is never stored, in a profile or anywhere else: it is a per-run override only when the owner explicitly grants it, so this policy has no departure.
- **`green_definition`** — every required CI check passes; where the repo runs SonarCloud, its quality gate passes and it reports 0 unresolved issues introduced by the PR. Green does not authorize a merge.
- **`public_text_drafts: always`** — PR bodies and new issues are drafted for the owner's approval before posting. The other value, `waived`, posts directly, concise and clean.

## The `## Pipeline` section of the repo's `CLAUDE.md`

In the owner's repos the repository facts live in the repo's `CLAUDE.md`; the lead copies the gate and the agent rules from there into every brief ([`dispatch.md`](dispatch.md)).

```markdown
## Pipeline

- **Gate**: `mise run test`, `mise run gate`
- **Review checks**: `ruff check <files>`, `basedpyright <files>`
- **Worktree task**: `mise run worktree-new`
- **Agent rules**:
  - Scratch files go in the agent's scratchpad, never inside the worktree.
  - Run the gate once; never start a second run while one is still going.
```

- **Gate** — the battery: every command passes before a PR, run from the worktree root. Prefer the repo's task runner (mise) over naming tools directly, so the task definitions stay the single source of truth. It covers what CI enforces: a gate that checks less than CI breaks the trust model.
- **Review checks** — the lint and type commands the reviewer runs on changed files only, e.g. `ruff check <files>` (Python), `dotnet format --verify-no-changes` (C#).
- **Worktree task** — optional: a repo task that creates and sets up a worktree at the convention path (type, slug, base). Without it, `git worktree add` at the convention path from the `worktree` skill.
- **Agent rules** — rules beyond the agent definitions, such as where scratch files go, how long the gate takes and that it runs once, its staging, which rule files to read, for the agents that get the brief: the implementer, `reviewer`, `architecture-reviewer` and `prose-reviewer`. Left out when the definitions cover everything.

Where the `CLAUDE.md` already states one of these facts in another section, the `## Pipeline` entry points there instead of repeating it.

## `repo-profile.md`

`~/Memory/<repo>/repo-profile.md` is a memory file: front matter, a heading, and one fenced yaml block.

```markdown
---
name: repo-profile
type: project
description: The owner's pipeline facts for <repo> — ownership, board, user gate, departures from the global defaults
---

# Repo profile — <repo>
```

```yaml
# /setup-repo's verdict ("Own or foreign" above). A foreign repo keeps its
# repository facts here, since nothing may be written into its tree.
ownership: own            # own | foreign

# Optional: left out when the repo has no board. Kinds under "Board" below.
board:
  kind: github
  project_owner: <owner>
  project_number: <n>
  project_id: <PVT_...>
  status_field_id: <PVTSSF_...>
  in_progress_option_id: <hex>
  ready_option_id: <hex>
# board:
#   kind: azure-devops
#   organization: <organization>
#   project: <project>
#   ready_state: <the state name for "ready", e.g. To Do>
#   in_progress_state: <the state name for "in progress", e.g. In Progress>

# What needs the owner's own hands or eyes before a change counts as done —
# a verification only they can run (target hardware, an environment only
# they control), beyond decisions and approvals the skills already route
# to them. Empty if the repo has none. In a convention repo, an issue's
# user-gate items are its `## Done when` criteria marked "(device)".
user_gate: <when and how the owner verifies, or empty>

# Optional: departures from the global defaults, each with its reason.
defaults:
  green_definition: <this repo's bar>   # <reason>

# Foreign repo only: the repository facts the `## Pipeline` section holds
# in the owner's repos, under these names.
gate:
  - <command>
review_checks:
  - <command> <files>
worktree_task: <command>       # optional
agent_rules: |                 # optional
  <free text>
```

## Board

The profile's `board` has a kind, and every board step follows it:

- **`github`** — a GitHub Project; the commands are below.
- **`azure-devops`** — an Azure DevOps project. Reads and moves go through the `azure-devops-boards` skill, under the profile's `ready_state` and `in_progress_state`.
- **No board** (`board` left out) — every board step is skipped, and the skill says so in one line.

Only GitHub's automation moves an item to Done. On an `azure-devops` board a skill asks the owner and moves the item only on their confirmation, as the `azure-devops-boards` skill says; no skill moves one to Done on its own.

### GitHub commands

Resolving the IDs (`/setup-repo`): the project from `gh project list --owner <owner>`; then `project_id` from `gh project view <n> --owner <owner> --format json --jq .id`; `status_field_id` and the option ids from `gh project field-list <n> --owner <owner> --format json` — the field named `Status` and its options for in progress and ready. On a board without such a field or options, ask the owner which ones stand for them.

Reading the items in In Progress and Ready (`/next`): `gh project item-list <n> --owner <owner> --format json --limit <total>`, filtered by status, with `<total>` from `gh project item-list <n> --owner <owner> --format json --limit 1 --jq .totalCount` — without `--limit`, gh returns the first 30 items only. A `<total>` of 0 means an empty board: skip the second call.

Moving an existing issue to In Progress resolves the item id via the issue's `projectItems` connection, then sets Status:

```bash
item_id=$(gh api graphql -f query='{ repository(owner: "<owner>", name: "<repo>") { issue(number: <N>) { projectItems(first: 5) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == <n>) | .id')

gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"<project_id>\", itemId: \"$item_id\", fieldId: \"<status_field_id>\", value: { singleSelectOptionId: \"<in_progress_option_id>\" } }) { projectV2Item { id } } }"
```

Run it for the issue and for its parent epic (the epic move is idempotent — once per epic is enough).

Putting a new issue on the board in Ready (`/plan-epic`, `/to-prd`, `/to-issues`) adds it to the project, then sets Status:

```bash
item_id=$(gh project item-add <n> --owner <owner> --url <issue-url> --format json --jq .id)

gh project item-edit --id "$item_id" --project-id <project_id> --field-id <status_field_id> --single-select-option-id <ready_option_id>
```

Setting a new item's priority (`/plan-epic`, `/to-prd`, `/to-issues`) uses the board's single-select field named `Priority`, looked up when the skill reads the board — its option names are what the skill's plan proposes from:

```bash
gh project field-list <n> --owner <owner> --format json --jq '.fields[] | select(.name == "Priority")'
```

The answer carries the field's `id` and its `options` (`id`, `name`). After the item is in Ready, set the option the owner approved:

```bash
gh project item-edit --id "$item_id" --project-id <project_id> --field-id <priority_field_id> --single-select-option-id <option_id>
```

A board without a field named `Priority` has no priority step: the plan proposes none, and Publish says so in one line.
