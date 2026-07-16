---
name: deps-triage
description: Triage open dependency and chore PRs — CI state, breaking-change check, safe-to-merge classification with reasoning. The user rules on the list; merging the safe ones follows their OK. Argument: none, or "merge" to pre-request merge of everything classified safe.
disable-model-invocation: true
---

Answer "which of the open dependency PRs can be merged?" with a classified list the user can act on in one pass.

## 1. Collect

Open dependency/chore PRs with their state:
`gh pr list --json number,title,author,labels,statusCheckRollup,autoMergeRequest,url` — filter to bot authors (dependabot, renovate) and dependency/chore-labeled or `chore(deps)`-titled PRs.

*Done when:* every open bot/dependency PR is in the working set, not just the first page.

## 2. Judge each PR

- **Version jump** — patch / minor / major, from the title
- **Reach** — dev-only dependency vs runtime/shipped; lockfile-only vs code changes (`gh pr diff <N> --stat`)
- **Breaking changes** — the release notes/changelog in the PR body; for a major bump, actually read them
- **CI** — the check rollup; a red check gets its failure named, not just "red"
- **Auto-merge** — armed but stalled? Name what it's waiting on (a required check that never ran, a stuck workflow)

## 3. Classify and present

Three buckets, each PR with a one-line reasoning:

- **SAFE** — patch/minor, CI green, no breaking notes (dev-deps lean safe; runtime deps need the notes read)
- **LOOK** — major bump, breaking notes, runtime reach, or anything you couldn't verify
- **STUCK** — auto-merge armed but not progressing; include the unstick action

Present the table and wait for the user's ruling. With their OK (or the `merge` argument as the pre-given OK), merge the SAFE bucket per the repo's merge method and report each result.

*Done when:* every open dependency PR is merged, deliberately left open with a named reason, or handed to the user.
