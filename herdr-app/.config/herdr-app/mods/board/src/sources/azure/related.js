// An Azure work item's related items (related.js says what they hold): its
// description, its children and the pull requests linked to it, read when
// its details open (azureRelated, which makeAzure gives as its `related`).
//
// `az boards work-item show --id <n> --expand relations` (the extension's
// show_work_item, dev/boards/work_item.py: client.get_work_item, REST's
// Work Items - Get Work Item with $expand=relations) answers the work item
// with all its fields, System.Description among them where it has one
// (HTML, as Azure keeps it), and its links as REST names them: a child
// "System.LinkTypes.Hierarchy-Forward" with the child's URL, a pull request
// an "ArtifactLink" named "Pull Request" whose URL is
// vstfs:///Git/PullRequestId/<project id>%2F<repo id>%2F<pull request id>
// (how az repos pr work-item add writes one, dev/repos/pull_request.py).
// (`az boards work-item relation show` would name the links in words, at
// the cost of one more call for the link types.) A child's link carries no
// title or state, so where the item has children one WIQL query by their
// ids reads those (az boards query takes flat queries only, no link
// query); a pull request's link carries none either, and reading them would
// cost a call per pull request (az repos pr show), so a pull request's line
// names its id only, with its page.

import { BoardError, isObject, report } from "../../shared.js";
import { SYSTEM, azJson, azList, azOrg, azQueryArgs, workItemUrl } from "./common.js";

// The calls: the work item with its links, and its children's fields.
export const azRelatedArgs = (c, id) => ["boards", "work-item", "show", ...azOrg(c.org), "--id", String(id), "--expand", "relations", "-o", "json"];
export const CHILD_LINK = `${SYSTEM}LinkTypes.Hierarchy-Forward`;
export const childrenWiql = (ids) =>
  `SELECT [${SYSTEM}Id], [${SYSTEM}Title], [${SYSTEM}WorkItemType], [${SYSTEM}State] FROM WorkItems WHERE [${SYSTEM}Id] IN (${ids.join(", ")}) ORDER BY [${SYSTEM}Id]`;

// The work item's id at the end of a link's URL (…/workItems/<id>), or null.
const linkedId = (url) => {
  const id = Number(String(url ?? "").match(/\/workItems\/(\d+)$/i)?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// A pull request link's URL → { project, repo, number }, or null.
export function pullRequestOf(url) {
  const m = String(url ?? "").match(/^vstfs:\/\/\/Git\/PullRequestId\/([^/%]+)(?:%2F|\/)([^/%]+)(?:%2F|\/)(\d+)$/i);
  return m ? { project: m[1], repo: m[2], number: Number(m[3]) } : null;
}

// az's answer for azRelatedArgs → { description (HTML, "" for none),
// children: [ids], prs: [{ project, repo, number }] }, each once, in the
// order of the links.
export function parseRelatedItem(stdout) {
  const json = azJson(stdout, "den Work Item");
  if (!isObject(json) || !Number.isInteger(json.id)) throw new BoardError("Azure lieferte keinen Work Item");
  const description = json.fields?.[`${SYSTEM}Description`];
  const relations = Array.isArray(json.relations) ? json.relations : [];
  const children = [];
  const prs = [];
  for (const r of relations) {
    if (r?.rel === CHILD_LINK) {
      const id = linkedId(r.url);
      if (id && !children.includes(id)) children.push(id);
    } else if (r?.rel === "ArtifactLink" && r.attributes?.name === "Pull Request") {
      const pr = pullRequestOf(r.url);
      if (pr && !prs.some((p) => p.number === pr.number)) prs.push(pr);
    }
  }
  return { description: typeof description === "string" ? description : "", children, prs };
}

// A child, of az boards query's answer, as a line (related.js); its state's
// color and whether it is done (Completed or Removed) from `states` (the
// view's data.meta.states, [] for none).
function childLine(wi, c, states) {
  const f = (name) => wi.fields?.[SYSTEM + name] ?? null;
  const state = f("State");
  const known = states.find((s) => s.name === state);
  return {
    kind: "workitem", source: "azure", number: wi.id, title: f("Title") ?? "", type: f("WorkItemType"), url: workItemUrl(c, wi.id),
    state: state ?? "ohne Status", color: known?.color ?? "muted", done: known?.category === "Completed" || known?.category === "Removed", draft: false,
  };
}

// The children's query answer → their lines, in the order of `ids`.
export function parseChildren(stdout, ids, c, states = []) {
  const list = azList(azJson(stdout, "die untergeordneten Work Items", []));
  if (!list) throw new BoardError("Azure lieferte keine untergeordneten Work Items");
  const byId = new Map(list.filter((wi) => Number.isInteger(wi?.id)).map((wi) => [wi.id, wi]));
  return ids.filter((id) => byId.has(id)).map((id) => childLine(byId.get(id), c, states));
}

// A pull request's line: its id and its page, no title or state (see the
// header).
export const pullRequestLine = (c, pr) => ({
  kind: "pr", source: "azure", number: pr.number, title: "Pull Request", type: null, draft: false, done: false, state: "verknüpft", color: "muted",
  url: `${c.org}/${encodeURIComponent(pr.project)}/_git/${encodeURIComponent(pr.repo)}/pullrequest/${pr.number}`,
});

const section = (count, lines, error = null) => ({ count, sent: lines.length, cut: false, hidden: error ? 0 : count - lines.length, error, lines });

// The related items of the work item `item` in the team context `c`
// (related.js): one az call, and one query more where it has children (a
// failed query shows its reason in the children's place). `states`: the
// view's states, for the children's colors. `az(args)` runs az.
export async function loadAzureRelated(az, c, item, states = []) {
  const read = parseRelatedItem(await az(azRelatedArgs(c, item.number)));
  let children = section(read.children.length, []);
  if (read.children.length) {
    try {
      children = section(read.children.length, parseChildren(await az(azQueryArgs(c, childrenWiql(read.children))), read.children, c, states));
    } catch (e) {
      children = section(read.children.length, [], report(e));
    }
  }
  return {
    description: read.description,
    format: "html",
    subIssues: children,
    prs: section(read.prs.length, read.prs.map((pr) => pullRequestLine(c, pr))),
    warnings: [],
  };
}

// The Azure source's `related` (related.js): a work item with an id has
// some to read.
export const azureRelated = (az) => ({
  reads: (item) => item?.source === "azure" && item.kind === "workitem" && Number.isInteger(item.number),
  load: (item, view, data) => loadAzureRelated(az, view.context, item, data?.meta?.states ?? []),
});
