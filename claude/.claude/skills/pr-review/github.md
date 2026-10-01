# GitHub

Phase 1, re-review lookups and Phase 5 of [`SKILL.md`](SKILL.md) for GitHub.

PR URL: `https://github.com/<owner>/<repo>/pull/<n>`. Everything runs through `gh`, which must be installed and authenticated - check `gh auth status` first; if it fails, stop and ask the user to set it up (`gh auth login`). The `{owner}/{repo}` placeholders in `gh api` paths resolve from the current checkout, so the repo check below runs before any of them.

## Phase 1 - Fetch the PR

**Repo check first:** `gh repo view --json nameWithOwner -q .nameWithOwner` must equal the `<owner>/<repo>` of the PR URL (case-insensitive). On mismatch, stop. For a bare number the PR resolves against this checkout, so the check holds by construction.

Then run these in parallel:

- **Metadata:** `gh pr view <n|url> --json number,title,author,state,isDraft,body,baseRefName,headRefName,headRefOid,isCrossRepository,url,closingIssuesReferences` - `headRefOid` is `HEAD_SHA`.
- **Linked issues:** each entry of `closingIssuesReferences` (closing keywords and issues linked in the Development sidebar) - `gh issue view <url> --json title,body`. An issue the body only mentions ("refs #12") is not in that list; read it too when the body names it as the spec. When an issue's `## Decisions` says "See epic #N", read the epic the same way.
- **The user:** `gh api user --jq .login` - the user's comments and reviews are those whose `user` matches it.
- **Existing feedback:**
  - line comments: `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate --jq '.[] | {id, user: .user.login, path, line, body, in_reply_to_id, commit_id}'`
  - reviews: `gh api repos/{owner}/{repo}/pulls/<n>/reviews --paginate --jq '.[] | {id, user: .user.login, state, commit_id, body}'`
  - conversation comments: `gh api repos/{owner}/{repo}/issues/<n>/comments --paginate --jq '.[] | {id, user: .user.login, body}'`

Then fetch both refs. Take the head from `refs/pull/<n>/head`, not the branch - it also exists for fork PRs (`isCrossRepository`), whose branch is not on `origin`:

```bash
git fetch origin refs/heads/<base>:refs/remotes/origin/<base> refs/pull/<n>/head:refs/remotes/origin/pr/<n>
```

`BASE=origin/<base>`.

**Convention repo:** `git show "$BASE":CLAUDE.md | grep -qx '## Where decisions live'` succeeds. Then the spec includes the linked issues' and the epic's `## Decisions` and `## Done when` (headings count at level 2 or 3).

## Re-review lookups

- **`LAST_SHA`:** the `commit_id` of the user's latest review (reviews come back in chronological order).
- **Earlier threads:** the user's line comments with `in_reply_to_id` null; replies are the comments whose `in_reply_to_id` points at them. Resolution state exists only in GraphQL - match `fullDatabaseId` (a string) against the REST comment `id`:

  ```bash
  gh api graphql -F owner='{owner}' -F repo='{repo}' -F n=<n> -f query='
    query($owner: String!, $repo: String!, $n: Int!) {
      repository(owner: $owner, name: $repo) { pullRequest(number: $n) {
        reviewThreads(first: 100) { nodes { isResolved isOutdated comments(first: 1) { nodes { fullDatabaseId } } } }
      } } }'
  ```

  `isResolved` is the author's claim, not evidence.

## Phase 5 - Posting comments

Nothing goes out during Phase 4. An approved comment is recorded in its task's Outcome (final text, path, line) and waits. When the user has ruled on every task, show the whole batch - one short review body plus each comment with its anchor - and on their go submit it as **one review**:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "<one line, approved by the user>",
  "comments": [
    { "path": "src/x.ts", "line": 42, "side": "RIGHT", "body": "<markdown>" },
    { "path": "src/y.ts", "start_line": 10, "start_side": "RIGHT", "line": 14, "side": "RIGHT", "body": "<markdown>" }
  ]
}
```

```bash
gh api repos/{owner}/{repo}/pulls/<n>/reviews --method POST --input review.json
```

`event` is always `COMMENT`. Each `line` must fall inside a diff hunk at `commit_id`, otherwise the whole review is rejected with 422 - move that ask onto a changed line or into the body, and resend after the user's OK.

Replies on earlier threads (re-review) cannot ride in the review; after it, post each approved reply with `gh api repos/{owner}/{repo}/pulls/<n>/comments/<comment_id>/replies -f body='<markdown>'`.

After posting, report the review's `html_url` and each comment's link: `gh api repos/{owner}/{repo}/pulls/<n>/reviews/<review_id>/comments --jq '.[] | {path, line, html_url}'`.
