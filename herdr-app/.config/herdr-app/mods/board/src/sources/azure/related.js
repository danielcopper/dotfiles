// An Azure work item's related items (related.js says what they hold): its
// description, its parent, its children and the pull requests linked to it,
// read when its details open (azureRelated, which makeAzure gives as its
// `related`).
//
// `az boards work-item show --id <n> --expand relations` (the extension's
// show_work_item, dev/boards/work_item.py: client.get_work_item, REST's Work
// Items - Get Work Item with $expand=relations) answers the work item with
// all its fields, System.Description among them where it has one (HTML, as
// Azure keeps it), and its links as REST names them: a child
// "System.LinkTypes.Hierarchy-Forward" with the child's URL, its parent
// "System.LinkTypes.Hierarchy-Reverse" with the parent's, a pull request an
// "ArtifactLink" named "Pull Request" whose URL (which alone tells it from
// another artifact, a branch or a commit) is
// vstfs:///Git/PullRequestId/<project id>%2F<repo id>%2F<pull request id>
// (how az repos pr work-item add writes one, dev/repos/pull_request.py).
// (`az boards work-item relation show` would name the links in words, at the
// cost of one more call for the link types.) A child's or the parent's link
// carries no title or state, so where the item has children or a parent one
// WIQL query by their ids reads them (idsWiql, as the Backlog reads its
// items; az boards query takes flat queries only, no link query); a pull
// request's link carries none either, and reading them would cost a call per
// pull request (az repos pr show), so a pull request's line names its id
// only, with its page. The details panel reads a pull request it goes down
// to with that call (azurePullRequest): `az repos pr show --id <n>` (the
// extension's show_pull_request, dev/repos/pull_request.py:
// GitClient.get_pull_request, REST's GitPullRequest) answers its title,
// status, isDraft, createdBy, sourceRefName and reviewers, each with a vote;
// no checks (Azure's policies would cost another call).

import { BoardError, DRAFT_REVIEW, STATE_LOOKS, isObject, otherLook, report } from "../../shared.js";
import { what } from "../../tools.js";
import { CHILD_LINK, DESCRIPTION, PARENT_LINK, azJson, azOrg, azQueryArgs, idsWiql, parseWorkItems } from "./common.js";

// The work item with its links.
export const azRelatedArgs = (c, id) => ["boards", "work-item", "show", ...azOrg(c.org), "--id", String(id), "--expand", "relations", "-o", "json"];

// The work item's id at the end of a link's URL (…/workItems/<id>); NaN
// for none.
const linkedId = (url) => Number(String(url ?? "").match(/\/workItems\/(\d+)$/i)?.[1]);

// A pull request link's URL → { project, repo, number }, or null.
export function pullRequestOf(url) {
  const m = String(url ?? "").match(/^vstfs:\/\/\/Git\/PullRequestId\/([^/%]+)(?:%2F|\/)([^/%]+)(?:%2F|\/)(\d+)$/i);
  return m ? { project: m[1], repo: m[2], number: Number(m[3]) } : null;
}

// az's answer for azRelatedArgs → { description (HTML, "" for none),
// parent (its id, null for none; the first where it names more), children:
// [ids], prs: [{ project, repo, number }] }, each once, in the order of
// the links.
export function parseRelatedItem(stdout) {
  const json = azJson(stdout, "das Work Item");
  if (!isObject(json) || !Number.isInteger(json.id)) throw new BoardError("Azure lieferte kein Work Item");
  const description = json.fields?.[DESCRIPTION];
  const relations = Array.isArray(json.relations) ? json.relations : [];
  const children = [];
  const prs = [];
  let parent = null;
  for (const r of relations) {
    if (r?.rel === CHILD_LINK) {
      const id = linkedId(r.url);
      if (id && !children.includes(id)) children.push(id);
    } else if (r?.rel === PARENT_LINK) {
      parent ??= linkedId(r.url) || null;
    } else {
      // An artifact link is a pull request by its URL alone.
      const pr = pullRequestOf(r?.url);
      if (pr && !prs.some((p) => p.number === pr.number)) prs.push(pr);
    }
  }
  return { description: typeof description === "string" ? description : "", parent, children, prs };
}

// The children's query answer → their lines (related.js; a work item as
// azWorkItem makes it), in the order of `ids`; one the query does not find
// is left out.
export function parseChildren(stdout, ids, c) {
  const byId = new Map(parseWorkItems(stdout, c).map((wi) => [wi.number, wi]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ ...byId.get(id), draft: false }));
}

// A pull request's line: its id and its page, no title or state (see the
// header).
export const pullRequestLine = (c, pr) => ({
  kind: "pr", source: "azure", number: pr.number, title: "Pull Request", type: null, draft: false, state: "verknüpft",
  url: `${c.org}/${encodeURIComponent(pr.project)}/_git/${encodeURIComponent(pr.repo)}/pullrequest/${pr.number}`,
});

// A section of `count` items, of which `lines` can be read (related.js);
// those that cannot are ones the query did not find.
const section = (count, lines, error = null) => ({
  count, sent: lines.length, cut: false, hidden: error ? 0 : count - lines.length, hiddenAs: "nicht gefunden", error, lines,
});

// The related items of the work item `item` in the team tab `c`
// (related.js): one az call, and one query more where it has children or
// a parent. A failed query shows its reason in the children's place and
// the parent's and marks the read to be repeated after the next refresh
// (retry). `az(args, options)` runs az, for the view `view`.
export async function loadAzureRelated(az, c, item, view = null) {
  const read = parseRelatedItem(await az(azRelatedArgs(c, item.number), what(view, "related")));
  const parentIds = read.parent === null ? [] : [read.parent];
  const ids = [...read.children, ...parentIds];
  let children = section(read.children.length, []);
  let parents = section(parentIds.length, []);
  let retry = false;
  if (ids.length) {
    try {
      const out = await az(azQueryArgs(c, idsWiql(ids)), what(view, "related-items"));
      children = section(read.children.length, parseChildren(out, read.children, c));
      parents = section(parentIds.length, parseChildren(out, parentIds, c));
    } catch (e) {
      const why = report(e);
      children = section(read.children.length, [], read.children.length ? why : null);
      parents = section(parentIds.length, [], parentIds.length ? why : null);
      retry = true;
    }
  }
  return {
    description: read.description,
    format: "html",
    parents,
    subIssues: children,
    prs: section(read.prs.length, read.prs.map((pr) => pullRequestLine(c, pr))),
    warnings: [],
    retry,
  };
}

// A pull request by its id.
export const azPullRequestArgs = (c, id) => ["repos", "pr", "show", ...azOrg(c.org), "--id", String(id), "-o", "json"];

// A pull request's status as a line shows it (STATE_LOOKS).
const PULL_REQUEST_LOOKS = { active: STATE_LOOKS.open, completed: STATE_LOOKS.merged, abandoned: STATE_LOOKS.closed };

// The reviewers' votes as a review label, as GitHub's review decision is
// one (reviewLabel): a draft DRAFT_REVIEW; else Azure's own votes, the
// strongest first: -10 "abgelehnt", -5 "wartet auf Autor", 10 or 5
// "freigegeben"; none (no vote yet, or no reviewer) says nothing.
export function azureReview(reviewers, draft) {
  if (draft) return DRAFT_REVIEW;
  const votes = (Array.isArray(reviewers) ? reviewers : []).map((r) => r?.vote);
  if (votes.includes(-10)) return "abgelehnt";
  if (votes.includes(-5)) return "wartet auf Autor";
  return votes.some((v) => v >= 5) ? "freigegeben" : "";
}

// az's answer for azPullRequestArgs → the pull request's details
// (related.js, pullRequest): its title, state, draft mark, author, review,
// source branch and azureRepo (not `repo`, which is GitHub's owner/name).
export function parseAzurePullRequest(stdout) {
  const json = azJson(stdout, "den Pull Request");
  if (!isObject(json) || !Number.isInteger(json.pullRequestId)) throw new BoardError("Azure lieferte keinen Pull Request");
  const state = PULL_REQUEST_LOOKS[json.status] ?? otherLook(json.status);
  return {
    ...(typeof json.title === "string" ? { title: json.title } : {}),
    ...state,
    draft: json.isDraft === true,
    author: json.createdBy?.displayName ?? null,
    review: azureReview(json.reviewers, json.isDraft === true),
    branch: String(json.sourceRefName ?? "").replace(/^refs\/heads\//, "") || null,
    azureRepo: typeof json.repository?.name === "string" ? json.repository.name : null,
  };
}

// The Azure source's `pullRequest` (related.js): a pull request with an
// id, read in the view's organisation.
export const azurePullRequest = (az) => ({
  reads: (item) => item.kind === "pr" && Number.isInteger(item.number),
  load: async (item, view) => parseAzurePullRequest(await az(azPullRequestArgs(view.tab, item.number), what(view, "pull-request"))),
});

// The Azure source's `related` (related.js): a work item with an id has
// some to read.
export const azureRelated = (az) => ({
  reads: (item) => item.kind === "workitem" && Number.isInteger(item.number),
  load: (item, view) => loadAzureRelated(az, view.tab, item, view),
});
