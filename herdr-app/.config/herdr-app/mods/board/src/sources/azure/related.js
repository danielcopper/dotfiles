// An Azure work item's related items (related.js says what they hold): its
// description, its parent, its children and the pull requests linked to
// it, read when
// its details open (azureRelated, which makeAzure gives as its `related`).
//
// `az boards work-item show --id <n> --expand relations` (the extension's
// show_work_item, dev/boards/work_item.py: client.get_work_item, REST's
// Work Items - Get Work Item with $expand=relations) answers the work item
// with all its fields, System.Description among them where it has one
// (HTML, as Azure keeps it), and its links as REST names them: a child
// "System.LinkTypes.Hierarchy-Forward" with the child's URL, its parent
// "System.LinkTypes.Hierarchy-Reverse" with the parent's, a pull request
// an "ArtifactLink" named "Pull Request" whose URL (which alone tells it
// from another artifact, a branch or a commit) is
// vstfs:///Git/PullRequestId/<project id>%2F<repo id>%2F<pull request id>
// (how az repos pr work-item add writes one, dev/repos/pull_request.py).
// (`az boards work-item relation show` would name the links in words, at
// the cost of one more call for the link types.) A child's or the parent's
// link carries no title or state, so where the item has children or a
// parent one WIQL query by their ids reads them (idsWiql, as the Backlog
// reads its items; az boards query takes flat queries only, no link
// query); a pull request's link carries
// none either, and reading them would cost a call per pull request (az
// repos pr show), so a pull request's line names its id only, with its
// page.

import { BoardError, isObject, report } from "../../shared.js";
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

// The related items of the work item `item` in the team context `c`
// (related.js): one az call, and one query more where it has children or
// a parent. A failed query shows its reason in the children's place and
// the parent's and marks the read to be repeated after the next refresh
// (retry). `az(args)` runs az.
export async function loadAzureRelated(az, c, item) {
  const read = parseRelatedItem(await az(azRelatedArgs(c, item.number)));
  const parentIds = read.parent === null ? [] : [read.parent];
  const ids = [...read.children, ...parentIds];
  let children = section(read.children.length, []);
  let parents = section(parentIds.length, []);
  let retry = false;
  if (ids.length) {
    try {
      const out = await az(azQueryArgs(c, idsWiql(ids)));
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

// The Azure source's `related` (related.js): a work item with an id has
// some to read.
export const azureRelated = (az) => ({
  reads: (item) => item.kind === "workitem" && Number.isInteger(item.number),
  load: (item, view) => loadAzureRelated(az, view.context, item),
});
