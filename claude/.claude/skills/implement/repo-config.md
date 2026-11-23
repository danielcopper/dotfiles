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

- **`merge_policy: user`** — the owner merges every PR, and this policy has no departure. A session leaves its PR
  open, reports its state and what is left, and stops; after a refusal it does not look for another way to merge,
  complete or auto-complete the PR. Two layers stop a session that merges by mistake; against a command built to get
  past them they promise nothing.
  - The hook `hooks/block_pr_merge.py` reads the whole Bash command text — backslash-newlines joined, quotes and
    backslashes removed — so a form counts wherever it stands: chained with `&&`, `||`, `;`, `|`, `&` or a newline,
    inside `$( )`, backticks or a subshell, in `bash -c`, `sh -c` or `eval`, after `xargs`. A request tool below is
    one of gh, az, curl and wget. The hook refuses:
    - `gh … pr … merge`, `merge` as the `pr` subcommand (options such as `-R o/r` may stand between);
    - `gh alias set` or `gh alias import` whose expansion — the text, the imported file or the heredoc it receives
      — holds `pr` followed by `merge`, or a GraphQL merge mutation (a later `gh <alias>` would not show the merge);
    - a write by gh, curl or wget — a method other than GET or HEAD, or a body (gh's `-f`, `-F`, `--input`; curl's
      `-d`, `--data…`, `--json`, `-F`, `-T`; wget's `--post-…`, `--body-…`) — toward a GitHub `pulls/<n>/merge` or
      `repos/<o>/<r>/merges` endpoint, or with a `merge_method` field; a GET on `pulls/<n>/merge` passes;
    - the GraphQL mutation `mergePullRequest`, `enablePullRequestAutoMerge` or `enqueuePullRequest`, in the text or
      in a body, in a command in which gh, curl or wget stands as a word;
    - `az repos pr update` with `--status completed` (an option prefix such as `--stat` too), and `az repos pr
      update` or `create` with `--auto-complete` set to anything but `false` or `0`;
    - a body holding `"status": "completed"` (or `3`) or `autoCompleteSetBy`, sent by `az rest`, `az devops invoke`,
      curl or wget toward an Azure DevOps pull request itself (`pullrequests/<id>`, any case, or devops invoke's
      `--resource pullRequests`) or by a simple command that spells no target (a URL in a variable).

    A body is the request's own text, the files after `@`, `key=@`, `--input`, `--in-file`, `--body-file`,
    `--post-file`, `--upload-file` and jq's `--rawfile`/`--slurpfile`, and the files `cat` or `<` feeds a request
    tool: in a `$( )` within its pipeline or assigned to a variable it uses (also after `export`, `local`,
    `readonly` or `declare`), through a pipe into it, or as its stdin. A heredoc whose receiving command or a
    pipeline stage after it runs a request tool is a body too, and so is a `<<<` here-string. A heredoc that
    `cat >`, `cat >>` or `tee` writes to a file stands in for that file, found by the word that names it (`$S/b.json`
    and `"$tmp"` too): sent, it is a body; run — as the command word, by `source` or `.`, or by a shell or an
    interpreter — it is read as commands. The command word is found past `VAR=` assignments and the wrappers
    `env`, `sudo`, `nohup`, `exec`, `command`, `time`, `timeout`, `nice`, `ionice`, `stdbuf`, `setsid`, `xargs`
    and `uv run`, with their options and option values (env's `-S` string is read as the command); a heredoc fed
    to a wrapper whose command the hook cannot find is read as commands. Any other file is read from disk as a
    regular file up to 1 MB, with `~` and `$HOME` expanded and a relative path taken from the session's working
    directory only, not from a `cd` earlier in the command; a path the hook cannot resolve or read adds nothing.
    A `<<` marker opens a heredoc only outside quotes and comments, and only when its delimiter line comes.

    It lets through `git merge`, `merge-base` and `merge-tree`, paths and names with "merge", "completed" outside
    an Azure DevOps completion, `gh pr view`, `list`, `checks`, `create`, `edit` and `update-branch`, comments and
    reviews, and a heredoc body fed to a command that only reads it (`cat`, `tee`, `git commit -F -`). A heredoc
    whose receiving command, or a pipeline stage after it, has a shell or an interpreter (`bash`, `sh`, `python`,
    `node`, `ruby`, `perl`, `ssh`) as its command word is read as commands; one a request tool receives is checked
    only as a body, so a PR body from `--body-file -` that names `gh pr merge` passes, while one that names a
    GraphQL merge mutation is refused. A command form spelled as text — a `grep` pattern, a string in a Python
    heredoc, a commit message with `-m` — is refused like a call; a GraphQL mutation name or a completion body
    counts only where a request tool stands as a word in the command. Each refusal names the form it found.

    An error inside the hook, and a command over 1,000,000 characters, refuse the call only when the command holds
    `merge`, `complet` or `enqueue`, naming the error; otherwise the call goes through, and the hook says so in a
    `systemMessage` and on stderr. That is by design: the hook guards against a session's accident, not against an
    attacker who provokes an error.
  - The `deny` list in `~/.claude/settings.json` matches the plain spellings of the merge commands as text — not
    `curl` or `wget`, not a GraphQL query from a file, not a `gh` flag before `pr` — so a Bash call that only mentions
    one (a `grep`, a heredoc, a commit message) is denied too: write such text with an edit tool and keep it out of
    commit messages.

  Out of both layers' sight, and ruled out by this policy alone: a verb or endpoint the shell builds at run time
  (`gh pr $(printf mer)ge`), a shell variable as the verb, the endpoint or the status (`gh pr "$V"`,
  `gh api -X PUT "$EP"`, `--status $S`), a script run from a file whose text is not in the command, Python or Node
  HTTP clients, a gh alias defined before or elsewhere, gh extensions, and a remote workflow that merges when
  started (`gh workflow run …`). Spellings only a deliberate trick would choose are out of scope too: a
  percent-encoded endpoint (`pulls/5/%6Derge`), a backslash for the slash in an Azure DevOps URL, a second request
  after curl's `--next`, and a literal URL in a header next to a target from a variable. A bypass that a command
  written without intent to evade could hit is a finding against the hook; one that only a command built to get
  past it reaches is an accepted gap. `claude/.claude/hooks/merge_corpus.py` in the dotfiles repo (not stowed) is
  the local acceptance run over the transcripts; its docstring says what it counts.
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
