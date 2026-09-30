# Azure DevOps

Phase 1, re-review lookups and Phase 5 of [`SKILL.md`](SKILL.md) for Azure DevOps. More REST quirks: `~/.claude/memory/tools/azure-devops.md`.

PR URLs: `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>` or `https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<id>` - same org either way. REST base used below:

```
B=https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repoId>
```

`az` has org/project defaults (`az devops configure -l`); pass `--org https://dev.azure.com/<org>` when the PR's org differs.

## Auth

**PAT first.** `AZURE_DEVOPS_EXT_PAT` is set in the environment (check `[ -n "$AZURE_DEVOPS_EXT_PAT" ]`). `az repos` / `az boards` pick it up directly; use them where they cover the call. For REST, authenticate as HTTP Basic with an empty user:

```bash
curl -s -u ":$AZURE_DEVOPS_EXT_PAT" "$B/pullRequests/<id>/threads?api-version=7.1"
```

Reference the variable only - never echo, print or interpolate the PAT's value.

**Fallback, only when the PAT is unset:** an AAD bearer token, sent as `-H "Authorization: Bearer $TOKEN"`:

```bash
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
```

If it has expired (`AADSTS70043` or similar), ask the user to run `! az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default` and wait. **Do not** suggest `--use-device-code`.

## Phase 1 - Fetch the PR

Run these in parallel:

- **Metadata:** `az repos pr show --id <id> -o json` - `title`, `createdBy.displayName`, `sourceRefName`, `targetRefName`, `status`, `description`, `repository.id` (for `B`), `lastMergeSourceCommit.commitId` (= `HEAD_SHA`).
- **Linked work items:** `az repos pr work-item list --id <id> -o json` - per item `fields."System.Title"`, `fields."System.Description"` (HTML), and `fields."Microsoft.VSTS.Common.AcceptanceCriteria"` when present. A Task usually has no criteria; then read its parent too: `az boards work-item show --id <wi> --expand none --fields System.Parent -o json`, then the parent with `--fields System.Title,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria` (`--fields` needs `--expand none`).
- **The user:** `curl ... "https://dev.azure.com/<org>/_apis/connectionData" | jq -r .authenticatedUser.id` - the user's threads are the text threads whose `comments[0].author.id` matches it.
- **Threads:** `curl ... "$B/pullRequests/<id>/threads?api-version=7.1"` - keep threads whose `comments[0].commentType` is `text` (the rest are system events). Anchor is `threadContext.filePath` + `rightFileStart.line`; `status` is `active`, `fixed`, `closed`, `wontFix`, `byDesign` or `pending`.
- **Iterations:** `curl ... "$B/pullRequests/<id>/iterations?api-version=7.1"` - each has `id` and `sourceRefCommit.commitId`.

**Repo check:** `git remote get-url origin` must name the same org, project and repo as `repository.remoteUrl` or `repository.sshUrl` from the metadata. Compare those three case-insensitively, not the whole string - an https origin may lack the `<org>@` prefix, and a `*.visualstudio.com` clone has a different host. On mismatch, stop.

Then fetch both refs (strip `refs/heads/` from the ref names):

```bash
git fetch origin refs/heads/<target>:refs/remotes/origin/<target> refs/heads/<source>:refs/remotes/origin/<source>
```

`BASE=origin/<target>`. `HEAD_SHA` comes from the metadata, not the branch tip, so the review stays pinned to one commit even if the author pushes meanwhile.

## Re-review lookups

- **`LAST_SHA`:** take the highest `pullRequestThreadContext.iterationContext.secondComparingIteration` across the user's threads, and use that iteration's `sourceRefCommit.commitId`. The user may have reviewed a later iteration without commenting - that is why SKILL.md has you confirm it.
- **Per earlier thread**, pass the reviewer the anchor, the comment text, the author's replies (`comments[1..]`) and `status` - a `fixed` status is the author's claim, not evidence.

## Phase 5 - Posting comments

Each approved comment goes out immediately as its own thread, anchored on `file:line` (right side). Write the body to a temp file and POST it:

```json
{
  "comments": [{ "parentCommentId": 0, "content": "<markdown>", "commentType": 1 }],
  "status": 1,
  "threadContext": {
    "filePath": "/path/from/repo/root.cs",
    "rightFileStart": { "line": 42, "offset": 1 },
    "rightFileEnd": { "line": 42, "offset": 1 }
  }
}
```

```bash
curl -s -u ":$AZURE_DEVOPS_EXT_PAT" -H "Content-Type: application/json" -X POST \
  --data @thread.json "$B/pullRequests/<id>/threads?api-version=7.1"
```

A reply on an earlier thread (re-review) is a POST of `{"parentCommentId": 1, "content": "<markdown>", "commentType": 1}` to `$B/pullRequests/<id>/threads/<threadId>/comments?api-version=7.1`.

After posting, report **Thread ID**, **anchor** (`file:line`), and a direct link:
`https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>?_a=files&discussionId=<threadId>`

In comment text, `#N` links a work item and `!N` a pull request - reference another PR as `!<id>`.
