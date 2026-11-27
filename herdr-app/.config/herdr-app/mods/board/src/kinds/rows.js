// A GitHub row as a saved state keeps it (a table's, an Issues tab's).

// GitHub's address of an issue or pull request.
export const itemUrl = (row) => `https://github.com/${row.repo}/${row.kind === "pr" ? "pull" : "issues"}/${row.number}`;

// A row without its itemId and without its url where that is GitHub's
// address of it; and such a row with its url back, its itemId null, as
// outside a project.
export const keptGithubRow = ({ itemId, url, ...row }) => ({ ...row, ...(url === itemUrl(row) ? {} : { url }) });
export const githubRowBack = (row) => ({ ...row, itemId: null, url: Object.hasOwn(row, "url") ? row.url : itemUrl(row) });
