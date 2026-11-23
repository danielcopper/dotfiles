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
    - mentions a PR merge (`pr merge`, a `pulls/<n>/merge` or `/merges` path, the GraphQL merge, auto-merge or
      merge-queue mutation, or with `gh` the word `pr` followed later by the word `merge` — in either order when
      `xargs` or `parallel` stands in the text or a shell reads it again), or runs `gh` or `az`
      with a word that can be the subcommand — past the options, also right after one, where it may be the
      option's value (`gh -R o/merge-tool pr view` is refused) — that is no known subcommand and holds `merge`
      anywhere (`automerge`, `pr_merge`), or runs `gh extension exec` with an extension so named;
    - defines a gh alias (`alias` with `set` or `import`, next to `gh`), or completes an Azure DevOps pull request
      (`az` with `completed` or `auto-complete`, also as the start of a name such as `autoCompleteSetBy`, or
      `devops invoke` writing — an `--http-method` other than GET, or `--in-file`; without a method it reads
      and passes — to `--resource pullRequests` itself, a pull-request resource named for completion or
      merge, a resource built at run time, or no named resource; threads, comments, reviewers, labels and
      statuses pass);
    - holds a simple command — up to the next unquoted `|`, `;`, `&&`, `||`, `&` or newline, with every quoted
      string also read as a command — that runs `gh api`, `az rest`, `az devops invoke` or `az repos pr` (the
      subcommand right after the tool's options, with no quoted word or redirection before it) and reads a request
      from a file (an `@` at the start of a word or after `=`, in re-read or open-quoted text any `@`, an
      `--input`, `--upload-file`, `--config`, `--post-file`, `--body-file`, `--in-file`, `-T`, `-K` or `-i`
      option), or that runs `curl` or `wget` with a writing request (a method other than GET or HEAD, `-d`,
      `--data…`, `--json`, `-F`, `--form`, `-T`, `--upload-file`, `-K`, `--config`, `--post-…`, `--body-…`);
      only that command's words count, not other stages of a pipeline. Either counts only when the target may
      be a merge surface: an Azure `pullRequests/<id>` with nothing after the id (the pull request that
      completion PATCHes), a GitHub `/pulls/<n>/merge` or `/merges`, `graphql` (whose body is not read), a
      target built at run time (`$`, a backtick, for curl also `{` or `[`) or written percent-encoded, or no
      literal target at all (curl and wget without a `://` URL, `-K`/`--config`, wget's `-i`; `gh api` with no
      endpoint word; `az rest` without a URL or path; `az repos pr`). A write to a literal sub-resource — a
      pull request's threads, comments, reviews, reviewers, labels or statuses, or a GitHub pull request
      itself — passes, also with its body from a file. In re-read or open-quoted text the file rule reads the
      whole text and keeps no such exception;
    - mentions `merge` as a word anywhere next to `curl`, `wget`, `gh api`, `az rest`, `az devops invoke` or
      `az repos pr` — not `merged`, `merges`, `merger`, `merge_…`, `merge-base` or `merge-tree`; `mergeBranch` and
      `merge-upstream` count. This rule reads the merge word only, no completion or alias;
    - holds a construct the shell expands at run time (a `$` or a backtick outside single quotes, a `{a,b}` or
      `{a..b}` brace or a `*`, `?` or `[` next to a letter outside any quotes) next to a merge mention — `merge` as
      a word as in the rule above, a completion (`status` or `-s` followed by `completed`, or `auto-complete`), or
      `alias` followed later by `set` or `import` — anywhere in the text, except the parameters named below. A
      run-time construct next to `gh`, `az`, `curl` or `wget` alone does not count, nor do words that `xargs` or
      `parallel` supplies to one of them: the merge must be spelled to be caught. A spelled merge word still
      counts then, before `pr` as well as after it;
    - is nested too deep, too long or holds too many substitutions to check.

    The hook fails closed on itself too. Input that is no JSON object, has no `tool_input` object or no
    `command` string, and any error while checking, are denied as "could not be checked", with the error's
    class and message: a bug in the hook, to report to the owner. A check that runs past five seconds is
    denied as "took too long to check". In both cases, split or simplify the command. Only an empty command
    passes unchecked.

    The run-time rule does not read the body of a heredoc with a quoted delimiter (`<<'D'`, `<<"D"`, `<<\D`,
    also with `<<-`) fed to `cat`, `tee`, `python`, `python3`, or `git commit`, `tag` or `notes` without `-c`,
    when no word of that command is a shell word, at most an output redirection to a plain word follows the
    marker on its line, a line ends the body, and the marker stands outside quotes, comments, other heredoc
    bodies, parentheses, brace groups and substitutions. A backtick, a `$'` string, a `$(`, `${` or backtick
    inside double quotes, a process substitution, `((`, `$[`, `case`, a `{` or `}` that is no command word, a
    backslash escape right before a `#`, a `<<` with no delimiter name after it, a `)` or `}` without its
    opening, or a heredoc without the line that ends it, anywhere in the text, leaves every body counted. All
    other rules read the bodies.

    The run-time rule spares a parameter only when the whole command is plain and runs only listed commands.
    Plain: every word is only the characters `A-Z a-z 0-9 _ . / : , @ % + = -`, or exactly one double-quoted
    `"$NAME"` or `"${NAME}"` (NAME a name, not a digit), or exactly `$?`, `$#` or `$$`, or a double-quoted string
    of those characters, spaces and `$?`, `$#`, `$$`; between the words stand only blanks, `;`, `&&`, `||`, `|`
    and newlines; after the command word (after its subcommand for gh) only the redirections `>`, `>>`, `2>`,
    `2>>` and `<` to a word of those characters, and `2>&1`. Listed: every simple command is only `NAME=word`
    assignments, or its command word after them is, unquoted and without a path, `echo`, `printf`, `test`,
    `true`, `false`, `exit`, `:`, `head`, `tail`, `grep`, `jq`, `wc`, `uniq`, `cut`, `tr` or `cat`, or `gh`
    followed at once by `pr view`, `list`, `status`, `checks` or `diff`, `issue view` or `list`, or `run view`,
    `list` or `watch`; a listed name the shell resolves to a function or alias is trusted unseen. Anything else
    anywhere in the text — another character, quoting, expansion, comment or redirection, or any other command,
    builtin or keyword — makes every parameter count. In such a command the rule does not count a word
    `"$NAME"` or `"${NAME}"` in a simple command that starts with that `gh` form, when the word before it is a
    plain word that is no option.

    When the command hands text to a shell that reads it again — a shell with a `-c` option, `eval`, `<<<`,
    `source` or `.`, or a shell (`bash`, `sh`, `zsh`, `dash`, `ksh`, `ash`, `fish`, `busybox sh`, as a word or
    a path's basename) as the command word of any simple command: after `|`, `|&`, `;`, `&`, a newline, a
    parenthesis or a backtick, past assignments, redirections other than a named or moved descriptor, keywords
    such as `if`, `then`, `do`, `!` and `{`, after a wrapper (`sudo`, `env`, `timeout`, `nice`, `nohup`,
    `command`, `exec`, `time`, `stdbuf`, `setsid`, `ionice`, `doas`) or `coproc` (and a named coproc's name
    before `{`) with or without options, also after `2>&1` or `>&2`, in a process substitution, or plainly
    (`bash s.sh`) — or to a command that runs a program from its arguments or data —
    `trap`, `sort` with `--compress-program`, `find` with `-exec`, `-execdir`, `-ok` or `-okdir`, `xargs`,
    `parallel` — quoting no longer separates anything: the file, write and run-time rules then read the whole
    de-quoted text, next to any `gh`, `az`, `curl` or `wget` (every word decides the write rule; the words of
    the simple commands that name a tool pick its reason), and `$` and backticks count everywhere, no
    parameter is spared and no heredoc body is left out. For the run-time rule, such a word counts only
    outside the heredoc bodies it leaves out. Other gh subcommands (issues, comments, reviews, releases, labels …)
    may read their body from a file. False denials are accepted: a merge mentioned in a message next to one of
    those tools is denied like a call.
  - The `deny` list in `~/.claude/settings.json` matches the plain spellings of the merge commands as text — not
    `curl` or `wget`, not a GraphQL query from a file, not a `gh` flag before `pr` — so a Bash call that only mentions
    one (a `grep`, a heredoc, a commit message) is denied too: write such text with an edit tool and keep it out of
    commit messages.

  A renamed gh, another interpreter, a script file, a config file the command reads, a remote workflow that merges
  when started (`gh workflow run …`), a gh extension, or a merge word the shell builds at run time (such as
  `gh pr $(printf mer)ge` or `gh api "$EP"` with a merge endpoint in `$EP`) stays out of both layers' sight; this
  policy alone rules those out. Shell forms the hook's reading does not follow stay out of its sight too, and this
  policy alone rules them out: a named file descriptor (`{fd}>&2`), a moved one (`3>&1-`), a named `coproc`
  before a keyword, and an apostrophe inside a `#` comment, which hides the text up to the next apostrophe from
  the run-time rule.

  Both layers are built against a session that follows this policy and would merge by mistake; against a command
  built to get past them they promise nothing. A review of the hook judges it by that: a bypass that a command
  written without intent to evade could hit is a finding against the hook or against that rule's sentence; one
  that only a command built to get past the hook reaches goes on the user's list as an accepted gap, and its form
  joins the paragraph before only on the owner's word.
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
