# Repo config — the global defaults, the repo's `CLAUDE.md`, and `repo-profile.md`

The facts the pipeline needs about a repository have three homes, by kind:

| Kind | Home | Holds |
|---|---|---|
| Policies that hold everywhere | this file, "Global defaults" | `merge_policy`, `green_definition`, `public_text_drafts` |
| Facts about the repository | the repo's own `CLAUDE.md`, section `## Pipeline` | gate, review checks, worktree task, agent rules |
| The owner's own facts per repo | `~/Memory/<repo>/repo-profile.md` | ownership, board, user gate, departures from a global default — and, for a foreign repo, the repository facts too |

`<repo>` is the basename of the main checkout's root
(`basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"`), the name the memory tier uses.
`/setup-repo` writes the profile and drafts `## Pipeline`; a skill that needs the profile and finds none asks the owner
to run it.

## Own or foreign

The profile's `ownership` is `/setup-repo`'s verdict. Without a profile, a skill that needs only the verdict runs
`~/.claude/skills/setup-repo/ownership.sh <root>` and reads it as `setup-repo`, step 2, says; no verdict → ask the
owner. Before a skill writes about a repo, it states **"own repo"** or **"foreign repo, writing only to
~/Memory/<repo>/"**.

## Global defaults

Each holds in every repo unless its profile departs from it under `defaults`.

- **`merge_policy: user`** — the owner merges every PR, and this policy has no departure. Two layers block the merge
  paths a session reaches by shell:
  - The hook `hooks/block_pr_merge.py`, a coarse filter that fails closed. It judges the whole Bash command as one
    text: backslash-newlines joined, every quote, backslash and `$'`/`$"` prefix removed, lowercased; the rules
    that name a simple command or a tool's options read the command by the shell's quoting instead. It first
    lets through a whole command that is exactly one read-only
    gh form — optional `VAR=value`, `env` and `timeout N`, then `gh` with an optional `-R`/`--repo`, then `pr view`,
    `list`, `status`, `checks` or `diff`, `issue view` or `list`, `search <word>` or `run <word>`, followed by plain
    words — with no shell syntax, quote or backslash, and no second `gh`, `az`, `curl` or `wget`. It also lets through
    `gh` (optional `-R`/`--repo`) `pr create` or `pr edit` followed by flags and values, `--body-file <path>`
    included, where quoted strings may be values: outside the quotes no shell syntax or backslash, inside double
    quotes no `$`, backtick or backslash, and no second `gh`, `az`, `curl` or `wget`. Any other command is denied
    when its text
    - mentions a PR merge (`pr merge`, a `pulls/<n>/merge` or `/merges` path, the GraphQL merge or auto-merge
      mutation, or with `gh` the word `pr` followed later by the word `merge`);
    - defines a gh alias (`alias` with `set` or `import`, next to `gh`), or completes an Azure DevOps pull request
      (`az` with `completed` or `auto-complete`, or `devops invoke` on pull requests);
    - holds a simple command — up to the next unquoted `|`, `;`, `&&`, `||`, `&` or newline, with every quoted
      string also read as a command — that runs `gh api`, `az rest`, `az devops invoke` or `az repos pr` (the
      subcommand right after the tool's options, with no quoted word or redirection before it) and reads a request
      from a file (an `@`, an `--input`, `--upload-file`, `--config`, `--post-file`, `--body-file`, `--in-file`,
      `-T`, `-K` or `-i` option), or that runs `curl` or `wget` with a writing request (a method other than GET or
      HEAD, `-d`, `--data…`, `--json`, `-F`, `--form`, `-T`, `--upload-file`, `-K`, `--config`, `--post-…`,
      `--body-…`); only that command's words count, not other stages of a pipeline;
    - mentions `merge` anywhere next to `curl`, `wget`, `gh api`, `az rest`, `az devops invoke` or `az repos pr`;
    - runs `gh`, `az`, `curl` or `wget` through `xargs` or `parallel`;
    - holds a construct the shell expands at run time (a `$` or a backtick outside single quotes, a `{a,b}` or
      `{a..b}` brace or a `*`, `?` or `[` next to a letter outside any quotes) next to a mention of `merge`,
      `complet` or `alias`, or next to `gh`, `az`, `curl` or `wget`;
    - is nested too deep, too long or holds too many substitutions to check.

    When the command hands text to a shell that reads it again — a shell with a `-c` option, `eval`, `<<<`,
    `source` or `.`, a pipe into a shell — quoting no longer separates anything: the file, write and run-time rules
    then read the whole de-quoted text, next to any `gh`, `az`, `curl` or `wget`, and `$` and backticks count
    everywhere. Other gh subcommands (issues, comments, reviews, releases, labels …) may read their body from a file. False
    denials are accepted: a merge mentioned in a message next to one of those tools is denied like a call.
  - The `deny` list in `~/.claude/settings.json` matches the plain spellings of the merge commands as text — not
    `curl` or `wget`, not a GraphQL query from a file, not a `gh` flag before `pr` — so a Bash call that only mentions
    one (a `grep`, a heredoc, a commit message) is denied too: write such text with an edit tool and keep it out of
    commit messages.

  A renamed gh, another interpreter, a script file, a config file the command reads, a remote workflow that merges
  when started (`gh workflow run …`), a gh extension, or a word the shell builds at run time from text that spells
  neither `gh`, `az`, `curl` or `wget` nor a merge (such as `{g..g}h pr {m..m}erge`) stays out of both layers'
  sight; this policy alone rules those out.
- **`green_definition`** — every required CI check passes; where the repo runs SonarCloud, its quality gate passes with
  0 unresolved issues the PR introduced.
- **`public_text_drafts: always`** — every public text is drafted for the owner's approval before posting. Two
  exceptions are written directly:
  - An issue edit that records a decision the owner made — in their own issue or the maintainer section of someone
    else's — is written in the format below and named to the owner in one line; ask first only when the wording would
    add something undecided.
  - The lead's pull request and later edits to its body, as `implement`, steps 8 and 9, say.

  The other value, `waived`, posts directly.

## Questions and decisions in an issue

In a repo whose `CLAUDE.md` has `## Where decisions live`, the issue's `## Decisions` is the home of each change's decisions, and an ADR in the repo is linked from that issue.

- **In an issue someone else opened, their text stays as they wrote it.** The questions and decisions go into a section appended below it: a `---` line, then `> [!NOTE]` / `> Added by the maintainer.`, then the sections. Checking off their own `## To decide` items is the only change to their text.
- **`## To decide` is a checkbox list, one question each.** An answered question is checked off and points to its decision (`- [x] … → D1`); the question stays.
- **An open question is an unchecked item or any other text.** Checked items with their indented continuation lines, blank lines and `_No response_` are not open.
- **Decisions are numbered and appended** (`- D1: …`). A decision that changes is struck through, and the new one follows with its date (`- ~~D2: …~~`, then `- D2 (changed YYYY-MM-DD): …`).

## The `## Pipeline` section of the repo's `CLAUDE.md`

In the owner's repos the repository facts live there; the lead copies the gate and the agent rules into every brief
([`dispatch.md`](dispatch.md)). Where another section of the `CLAUDE.md` already states a fact, the entry points there.

```markdown
## Pipeline

- **Gate**: `mise run test`, `mise run gate`
- **Review checks**: `ruff check <files>`, `basedpyright <files>`
- **Worktree task**: `mise run worktree-new`
- **Agent rules**:
  - Scratch files go in the agent's scratchpad, never inside the worktree.
  - Run the gate once; never start a second run while one is still going.
```

- **Gate** — the battery, run from the worktree root before a PR; it covers at least what CI enforces. Prefer the repo's
  task runner over naming tools directly.
- **Review checks** — the lint and type commands the reviewer runs on changed files only.
- **Worktree task** — optional: creates a worktree at the convention path (type, slug, base); without it,
  `git worktree add` at the path the `worktree` skill gives.
- **Agent rules** — rules for the implementer beyond its definition (gate duration, staging, rule files to read);
  left out when there are none.

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

# What only the owner can verify before a change counts as done (target
# hardware, an environment they control); empty if none. In a convention
# repo, an issue's user-gate items are its `## Done when` criteria marked
# "(device)".
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

The profile's `board` kind decides every board step: `github` uses the commands below; `azure-devops` goes through the
`azure-devops-boards` skill, under the profile's `ready_state` and `in_progress_state`; no board skips every board step
and says so in one line. Only GitHub's automation moves an item to Done; on `azure-devops` the owner confirms first, and
no skill moves one to Done on its own.

### GitHub commands

Resolving the IDs (`/setup-repo`): the project from `gh project list --owner <owner>`; then `project_id` from `gh project view <n> --owner <owner> --format json --jq .id`; `status_field_id` and the option ids from `gh project field-list <n> --owner <owner> --format json` — the field named `Status` and its options for in progress and ready. On a board without such a field or options, ask the owner which ones stand for them.

Reading the items in In Progress and Ready (`/next`): `gh project item-list <n> --owner <owner> --format json --limit <total>`, filtered by status, with `<total>` from `gh project item-list <n> --owner <owner> --format json --limit 1 --jq .totalCount` — without `--limit`, gh returns the first 30 items only. A `<total>` of 0 means an empty board: skip the `--limit <total>` call.

Moving an existing issue to In Progress resolves the item id via the issue's `projectItems` connection, then sets Status:

```bash
item_id=$(gh api graphql -f query='{ repository(owner: "<owner>", name: "<repo>") { issue(number: <N>) { projectItems(first: 5) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == <n>) | .id')

gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"<project_id>\", itemId: \"$item_id\", fieldId: \"<status_field_id>\", value: { singleSelectOptionId: \"<in_progress_option_id>\" } }) { projectV2Item { id } } }"
```

Run it for the issue and for its parent epic (the epic move is idempotent — once per epic is enough).

Putting a new issue on the board in Ready (`/to-prd`, `/to-issues`) adds it to the project, then sets Status:

```bash
item_id=$(gh project item-add <n> --owner <owner> --url <issue-url> --format json --jq .id)

gh project item-edit --id "$item_id" --project-id <project_id> --field-id <status_field_id> --single-select-option-id <ready_option_id>
```

Priority (`/to-prd`, `/to-issues`): the board's single-select field named `Priority`, read when the skill
reads the board; its option names are what the plan proposes from:

```bash
gh project field-list <n> --owner <owner> --format json --jq '.fields[] | select(.name == "Priority")'
```

Once the item is in Ready, set the approved option:

```bash
gh project item-edit --id "$item_id" --project-id <project_id> --field-id <priority_field_id> --single-select-option-id <option_id>
```

A board without that field has no priority step, and Publish says so in one line.
