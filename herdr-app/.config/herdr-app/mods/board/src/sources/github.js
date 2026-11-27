// GitHub: the queries for a Projects v2 project (its views and fields) and
// a view's items, a pull request list, their parsing, the column mutation,
// what gh's answers and failures mean, and the source as the board uses it
// (makeGithub).

import { CONFIG_NAME, BoardError, DRAFT_REVIEW, NOTIFIED, PAGE, STATE_LOOKS, errorText, failure, firstLine, foldedName, isText, otherLook, personName, readMemo, repoShortName, SECTION_TONES } from "../shared.js";
import { NO_LIVE } from "../loading.js";
import { GH_TIMEOUT, call, what } from "../tools.js";
import { repoOwnership } from "../kinds/list.js";
import { GITHUB_COLORS, NO_VALUE, fromOf, groupsOf, orderEntry, readable, readByName, valueOf, viewOrder } from "../kinds/fields.js";
import { kindOf } from "../kinds/index.js";

// A filter term on a project's field: GitHub's filters take the field's name
// in lower case, spaces as dashes, and values in quotes (measured for
// Status only).
const fieldKey = (field) => field.toLowerCase().replace(/\s+/g, "-");
const quoted = (value) => `"${value.replace(/"/g, "")}"`;

// A layout of a project's view as the board names it (viewKind): GitHub's
// name without "_LAYOUT", in lower case ("board", "table", "roadmap").
const viewLayout = (layout) => String(layout ?? "").replace(/_LAYOUT$/, "").toLowerCase();

// How many of a project's fields and views a read takes (GitHub keeps at
// most 50 fields a project), and of a view's sort keys; a view groups by
// one field at most, for its columns and for its groups (a board's
// swimlanes).
export const PROJECT_FIELDS = 50;
export const PROJECT_VIEWS = 50;
export const SORT_KEYS = 5;

const FIELD_REF = "... on ProjectV2FieldCommon { id name }";

// One GraphQL request for a project as its views show it: its fields (with
// their options and iterations) and its views in GitHub's order, each with
// its layout, filter, column field, group field, sort keys and visible
// fields in their order; and the login gh runs as. The header of main.js
// says what it costs.
export const PROJECT_QUERY = `query($login: String!, $number: Int!) {
  viewer { login }
  repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        id title url
        fields(first: ${PROJECT_FIELDS}) { nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name color } }
          ... on ProjectV2IterationField { configuration { iterations { id title startDate } completedIterations { id title startDate } } }
        } }
        views(first: ${PROJECT_VIEWS}, orderBy: { field: POSITION, direction: ASC }) { nodes {
          number name layout filter
          verticalGroupByFields(first: 1) { nodes { ${FIELD_REF} } }
          groupByFields(first: 1) { nodes { ${FIELD_REF} } }
          sortByFields(first: ${SORT_KEYS}) { nodes { direction field { ${FIELD_REF} } } }
          configuration { visibleFields(first: ${PROJECT_FIELDS}) { nodes { ${FIELD_REF} } } }
        } }
      }
    }
  }
}`;

export const githubProjectArgs = (view) => ["api", "graphql", "-f", `query=${PROJECT_QUERY}`, "-f", `login=${view.address.owner}`, "-F", `number=${view.address.number}`];

const PROJECT_PATH = ["repositoryOwner", "projectV2"];

// A field's iterations in their order, the completed ones first, each with
// whether it is completed.
function iterationsOf(config) {
  const of = (list, completed) => (Array.isArray(list) ? list : []).filter((i) => typeof i?.id === "string").map((i) => ({ id: i.id, title: i.title ?? i.id, startDate: i.startDate ?? "", completed }));
  return [...of(config?.completedIterations, true), ...of(config?.iterations, false)].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

function projectField(node) {
  const field = { id: node.id, name: node.name, type: node.dataType ?? null };
  if (Array.isArray(node.options)) field.options = node.options.map((o) => ({ id: o.id, name: o.name, color: o.color ?? null }));
  if (node.configuration) field.iterations = iterationsOf(node.configuration);
  return field;
}

const fieldIdsOf = (conn) => (Array.isArray(conn?.nodes) ? conn.nodes : []).map((n) => n?.id).filter(Boolean);

function parseViewNode(node) {
  return {
    number: node.number,
    name: node.name ?? `Ansicht ${node.number}`,
    layout: viewLayout(node.layout),
    filter: typeof node.filter === "string" ? node.filter : "",
    column: fieldIdsOf(node.verticalGroupByFields)[0] ?? null,
    group: fieldIdsOf(node.groupByFields)[0] ?? null,
    sorts: (Array.isArray(node.sortByFields?.nodes) ? node.sortByFields.nodes : [])
      .filter((s) => s?.field?.id)
      .map((s) => ({ field: s.field.id, direction: s.direction === "DESC" ? "DESC" : "ASC" })),
    visibleFields: fieldIdsOf(node.configuration?.visibleFields),
  };
}

// gh's answer for githubProjectArgs (and its GraphQL errors) → the project
// as its views show it: { id, title, url, viewer, fields: [{ id, name, type
// (GitHub's dataType), options? (a single-select field's), iterations? (an
// iteration field's, in their order) }], views: [{ number, name, layout
// ("board", "table", "roadmap" or another's name: viewLayout), filter,
// column, group (a field's id, or null), sorts: [{ field, direction }],
// visibleFields (their ids, in their order) }] }. A project that is not
// there is explained by the error at its path.
export function parseGithubProject(json, view, errors = []) {
  const { owner, number } = view.address;
  const ownerNode = json?.data?.repositoryOwner;
  const why = (e) => firstLine(e.message);
  if (!ownerNode) {
    const e = errorAt(errors, ["repositoryOwner"]);
    throw new BoardError(e && e.type !== "NOT_FOUND" ? `GitHub: ${why(e)}` : `GitHub kennt „${owner}“ nicht`);
  }
  const project = ownerNode.projectV2;
  if (!project) {
    const e = errorAt(errors, PROJECT_PATH);
    if (e?.type === "NOT_FOUND") throw new BoardError(`Projekt ${number} von ${owner} nicht gefunden – „number“ in ${CONFIG_NAME}.json prüfen`);
    throw new BoardError(e ? `Projekt ${number} von ${owner}: ${why(e)}` : `Projekt ${number} von ${owner} nicht gefunden oder kein Zugriff`);
  }
  for (const part of ["fields", "views"]) {
    if (Array.isArray(project[part]?.nodes)) continue;
    const e = errorAt(errors, [...PROJECT_PATH, part]);
    throw new BoardError(e ? `Projekt „${project.title}“: ${why(e)}` : `Projekt „${project.title}“ lieferte seine ${part === "fields" ? "Felder" : "Ansichten"} nicht`);
  }
  return {
    id: project.id,
    title: project.title,
    url: project.url,
    viewer: json.data.viewer?.login ?? null,
    fields: project.fields.nodes.filter((n) => n?.id && typeof n.name === "string").map(projectField),
    views: project.views.nodes.filter((n) => Number.isInteger(n?.number)).map(parseViewNode),
  };
}

// What the board keeps of a project between reads (Board.learnProject): its
// title, address and views, in GitHub's order, as the switch shows them,
// of any layout (one the board does not draw too); and what the store
// holds of it read back so (null for anything else, as for none).
const metaView = (v) => ({ number: v.number, name: v.name, layout: v.layout, filter: v.filter });
export const projectMeta = (project) => ({ title: project.title, url: project.url, views: project.views.map(metaView) });
export function readProjectMeta(value) {
  const views = value?.views;
  if (typeof value?.title !== "string" || !Array.isArray(views)) return null;
  const valid = views.every((v) => Number.isInteger(v?.number) && typeof v.name === "string" && isText(v.layout) && typeof v.filter === "string");
  return valid ? { title: value.title, url: typeof value.url === "string" ? value.url : null, views: views.map(metaView) } : null;
}

// The fields a board's columns can stand on, which a move sets.
const COLUMN_TYPES = ["SINGLE_SELECT", "ITERATION"];

// The field a board view without its own column field takes, as GitHub
// does.
const STATUS_FIELD = "Status";

// The single-select field a card's priority comes from, where the project
// has one by that name (GitHub's template field).
export const PRIORITY_FIELD = "Priority";

// A view's group field ("Group by": a board's swimlanes, a table's groups)
// and its sort keys where the board can read them, and the names of those
// it cannot (`unreadable`: a field of a kind it does not read).
function viewOrderFields(byId, shown) {
  const unreadable = [];
  const usable = (field) => {
    if (!field) return null;
    if (readable(field)) return field;
    unreadable.push(field.name);
    return null;
  };
  const group = usable(byId.get(shown.group));
  const sorts = shown.sorts.map((s) => ({ field: usable(byId.get(s.field)), direction: s.direction })).filter((s) => s.field);
  return { group, sorts, unreadable };
}

const VALUE_FIELDS = `
    ... on ProjectV2ItemFieldSingleSelectValue { optionId name color }
    ... on ProjectV2ItemFieldIterationValue { iterationId title startDate }
    ... on ProjectV2ItemFieldNumberValue { number }
    ... on ProjectV2ItemFieldDateValue { date }
    ... on ProjectV2ItemFieldTextValue { text }`;
const OPTION_VALUE = " ... on ProjectV2ItemFieldSingleSelectValue { optionId name color }";
// What the items' query reads of a value by its field's kind, where that is
// not VALUE_FIELDS: of linked pull requests their count, a connection.
const VALUE_SELECTS = { LINKED_PULL_REQUESTS: " ... on ProjectV2ItemFieldPullRequestValue { pullRequests(first: 0) { totalCount } }" };

// A field the items' query reads by name: the key of its value in an item
// (UNALIASED: fieldValueByName's own), the variable that names it and what
// the query reads of it.
const UNALIASED = "fieldValueByName";
const queryRead = (field, key, variable = key, select = VALUE_SELECTS[field.type] ?? VALUE_FIELDS) => ({ field, key, variable, select });
const valueReads = (fields) => fields.map((f, i) => queryRead(f, `v${i}`));

// How the board reads and draws the project view `shown` (one of
// project.views) as a board: its column field (the view's, else "Status",
// `ownColumn` false then), its group field and sort keys (viewOrderFields),
// the priority field, and the fields its items' query reads by name
// (`queried`: the column's, the priority's and those of the other fields it
// orders by, `values`); `leftOut(hidden)`: the hidden columns its query
// leaves out; `parse`: parseGithubBoard by it.
export function boardPlan(project, shown) {
  const byId = new Map(project.fields.map((f) => [f.id, f]));
  const own = byId.get(shown.column);
  const ownColumn = Boolean(own && COLUMN_TYPES.includes(own.type));
  const column = ownColumn ? own : project.fields.find((f) => f.name === STATUS_FIELD && f.type === "SINGLE_SELECT") ?? null;
  if (!column) throw new BoardError(`Ansicht „${shown.name}“ von „${project.title}“ hat kein Feld für ihre Spalten (ein Auswahl- oder Iterationsfeld)`);
  const { group, sorts, unreadable } = viewOrderFields(byId, shown);
  const priority = project.fields.find((f) => f.name === PRIORITY_FIELD && f.type === "SINGLE_SELECT") ?? null;
  const values = [...new Set([group, ...sorts.map((s) => s.field)].filter((f) => f && readByName(f) && f !== column && f !== priority))];
  const queried = [queryRead(column, UNALIASED, "column", VALUE_FIELDS), ...(priority ? [queryRead(priority, "priority", "priority", OPTION_VALUE)] : []), ...valueReads(values)];
  const plan = { project, shown, column, ownColumn, group, sorts, priority, values, unreadable, queried };
  plan.leftOut = (hidden) => [...hidden].filter((n) => n !== noValueName(plan));
  plan.parse = (json, view, hidden, errors) => parseGithubBoard(json, view, hidden, errors, plan);
  return plan;
}

const ROADMAP_TYPES = ["DATE", "ITERATION"];

// The fields a table view shows: Title first, as on GitHub, then the view's
// visible fields in their order; for a roadmap, whose visible fields
// GitHub's API does not give, the project's date and iteration fields and
// Status.
function tableFields(project, shown, byId) {
  const title = project.fields.find((f) => f.type === "TITLE") ?? { id: "title", name: "Title", type: "TITLE" };
  const status = project.fields.find((f) => f.name === STATUS_FIELD && f.type === "SINGLE_SELECT");
  const after = shown.layout === "roadmap"
    ? [...project.fields.filter((f) => ROADMAP_TYPES.includes(f.type)), ...(status ? [status] : [])]
    : shown.visibleFields.map((id) => byId.get(id)).filter(Boolean);
  return [title, ...after.filter((f) => f.type !== "TITLE")];
}

// How the board reads and draws the project view `shown` as a table (a
// table or a roadmap view): its fields (tableFields; `blank`: the names of
// those of a kind the board does not read, whose cells stay empty), its
// group field and sort keys (viewOrderFields), and the fields its items'
// query reads by name (`values`, `queried`); its query leaves out no column;
// `parse`: parseGithubTable by it.
export function tablePlan(project, shown) {
  const byId = new Map(project.fields.map((f) => [f.id, f]));
  const fields = tableFields(project, shown, byId);
  const { group, sorts, unreadable } = viewOrderFields(byId, shown);
  const values = [...new Set([...fields, group, ...sorts.map((s) => s.field)].filter((f) => f && readByName(f)))];
  const blank = fields.filter((f) => !readable(f)).map((f) => f.name);
  const plan = { project, shown, group, sorts, values, unreadable, fields, blank, queried: valueReads(values), leftOut: () => [] };
  plan.parse = (json, view, _hidden, errors) => parseGithubTable(json, view, errors, plan);
  return plan;
}

// What a card reads of an issue (githubCard), on a project and in an
// Issues tab alike.
const ISSUE_FIELDS = `id number title url issueType { name color } repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login name } } milestone { title }
      parent { number title repository { nameWithOwner } } subIssuesSummary { total completed }`;

const CONTENT_FIELDS = `
  content {
    __typename
    ... on Issue { ${ISSUE_FIELDS} }
    ... on PullRequest { id number title url headRefName repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login name } } milestone { title }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } } }
    ... on DraftIssue { title creator { login } assignees(first: 5) { nodes { login name } } }
  }`;

// An item's fields as the items' query reads them: the values the plan
// reads by name and the content.
function itemFields(plan) {
  const selections = plan.queried.map((r) => `\n  ${r.key === UNALIASED ? "" : `${r.key}: `}fieldValueByName(name: $${r.variable}) {${r.select} }`).join("");
  return `
  id${selections}${CONTENT_FIELDS}`;
}

const filterWith = (plan, term) => [plan.shown.filter, term].filter(Boolean).join(" ");

// The column without a value is always shown: its name asks GitHub for
// nothing.
const noValueName = (plan) => `Ohne ${plan.column.name}`;

// The filter of a view's items: the view's, with the hidden columns its
// query leaves out (plan.leftOut).
function itemsFilter(plan, hidden) {
  const names = plan.leftOut(hidden);
  return filterWith(plan, names.length ? `-${fieldKey(plan.column.name)}:${names.map(quoted).join(",")}` : "");
}

// The items a view's query reads: the page after `count` items, from the
// cursor $after where `paged` (a page after the first; `count` may be 0
// there, after an empty first page), PAGE at most and no more than the
// view's limit leaves, with whether more follow and where they start.
function itemsSelection(view, plan, count, paged) {
  const after = paged ? ", after: $after" : "";
  return `items(first: ${Math.min(PAGE, view.limit - count)}${after}, query: $filter) { totalCount pageInfo { hasNextPage endCursor } nodes {${itemFields(plan)} } }`;
}

// A view's items' query: its variables after the ones every page has, and
// what it reads of the project.
function itemsQuery(plan, vars, project) {
  const own = plan.queried.map((r) => `, $${r.variable}: String!`).join("");
  return `query($login: String!, $number: Int!, $filter: String!${own}${vars}) {
  repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        ${project}
      }
    }
  }
}`;
}

function itemsArgs(view, plan, hidden, doc) {
  return [
    "api", "graphql", "-f", `query=${doc}`, "-f", `login=${view.address.owner}`, "-F", `number=${view.address.number}`,
    "-f", `filter=${itemsFilter(plan, hidden)}`,
    ...plan.queried.flatMap((r) => ["-f", `${r.variable}=${r.field.name}`]),
  ];
}

// The first page of a view's items, as its plan says to read them, and the
// counts of the hidden columns its query leaves out (first: 0), for the
// column menu.
export function githubItemsArgs(view, plan, hidden) {
  const names = plan.leftOut(hidden);
  const counts = names.map((_, i) => `\n        h${i}: items(first: 0, query: $h${i}) { totalCount }`).join("");
  const vars = names.map((_, i) => `, $h${i}: String!`).join("");
  const doc = itemsQuery(plan, vars, `id title url
        ${itemsSelection(view, plan, 0, false)}${counts}`);
  return [...itemsArgs(view, plan, hidden, doc), ...names.flatMap((n, i) => ["-f", `h${i}=${filterWith(plan, `${fieldKey(plan.column.name)}:${quoted(n)}`)}`])];
}

// One GraphQL request for the page of a view's items after the cursor
// `after`, `count` items read before it: the same items as the first page's
// query, and the project's title.
export function githubItemsPageArgs(view, plan, hidden, after, count) {
  return [...itemsArgs(view, plan, hidden, itemsQuery(plan, ", $after: String!", `title ${itemsSelection(view, plan, count, true)}`)), "-f", `after=${after}`];
}

// Where a view's items stand in its answers.
const ITEMS_PATH = [...PROJECT_PATH, "items"];

// The error that explains a page without its items: the deepest one on the
// way to them (the owner's, the project's, the items' own), else the
// page's first; null for none.
function pageError(errors) {
  const onTheWay = errors.filter((e) => Array.isArray(e.path) && e.path.every((p, i) => p === ITEMS_PATH[i]));
  return onTheWay.sort((a, b) => b.path.length - a.path.length)[0] ?? errors[0] ?? null;
}

// A connection GitHub sends in pages (addPage, nextPage, pageCount): where
// it stands in an answer (`of`), the key of its total, its name in an
// error (`label`, of the first page's answer; `noun`, its entries), and
// why a page lacks it (`missing`: that page's GraphQL errors and how many
// came before).
export const PROJECT_ITEMS = {
  of: (json) => json?.data?.repositoryOwner?.projectV2?.items,
  totalKey: "totalCount",
  label: (json) => `Projekt „${json.data.repositoryOwner.projectV2.title}“`,
  noun: "Einträgen",
  missing(label, errors, count) {
    const e = pageError(errors);
    return e ? `${label}: ${firstLine(e.message)}` : `${label} lieferte die Einträge nach den ersten ${count} nicht`;
  },
};

// The answer `json` with the entries of the next page's answer `page` (and
// its GraphQL errors) added, each once (one that moved between two reads
// may come twice), and that page's pageInfo, which says whether more
// follow. A page without them is explained by `missing`. One that says
// more follow but adds none or names the same cursor again is taken for
// GitHub's paging stuck, and fails.
export function addPage(paged, json, page, errors = []) {
  const conn = paged.of(json);
  const next = paged.of(page);
  if (!Array.isArray(next?.nodes)) throw new BoardError(paged.missing(paged.label(json), errors, conn.nodes.length));
  const seen = new Set(conn.nodes.map((n) => n?.id));
  const added = next.nodes.filter((n) => !seen.has(n?.id));
  if (next.pageInfo?.hasNextPage && (!added.length || next.pageInfo.endCursor === conn.pageInfo?.endCursor)) {
    throw new BoardError(`${paged.label(json)}: GitHub kam nach ${conn.nodes.length} ${paged.noun} nicht weiter`);
  }
  conn.nodes.push(...added);
  conn.pageInfo = next.pageInfo;
  return json;
}

// The page after the answer `json`, { after, count } (its cursor and how
// many entries came before it), where GitHub says one follows and the
// view's limit leaves room for it; else null. One that follows without a
// cursor to start from fails.
export function nextPage(paged, json, view) {
  const conn = paged.of(json);
  if (!Array.isArray(conn?.nodes) || !conn.pageInfo?.hasNextPage || conn.nodes.length >= view.limit) return null;
  const after = conn.pageInfo.endCursor;
  if (typeof after !== "string") throw new BoardError(`${paged.label(json)}: GitHub nannte nach ${conn.nodes.length} ${paged.noun} nicht, wo die nächsten beginnen`);
  return { after, count: conn.nodes.length };
}

// How many pages the read of `json` takes by its total, one at least and
// `calls` at most.
export const pageCount = (paged, json, calls) => Math.min(calls, Math.max(1, Math.ceil((paged.of(json)?.[paged.totalKey] ?? 0) / PAGE)));

// The logins of the people a pull request asks to review; a team's request,
// or one whose reviewer is gone, names no one.
const reviewerLogins = (requests) => (requests?.nodes ?? []).map((r) => r?.requestedReviewer?.login).filter(Boolean);

// A label's color as GitHub gives it (rrggbb, no #) → "#rrggbb", or null.
export const labelColor = (color) => (/^[0-9a-f]{6}$/i.test(color ?? "") ? `#${color.toLowerCase()}` : null);

// A card's labels' colors by label name (labelColor; the tone is drawn from
// the theme, tones.js hueTone).
const labelColors = (labels) => Object.fromEntries((labels?.nodes ?? []).map((l) => [l.name, labelColor(l.color)]));

// People as the board names them (personName), and their logins apart.
const peopleOf = (nodes) => {
  const people = (nodes ?? []).filter((p) => typeof p?.login === "string");
  return { names: people.map(personName), logins: people.map((p) => p.login) };
};

// An item's assignees: { assignees (names), assigneeLogins }.
const assigneesOf = (nodes) => {
  const { names, logins } = peopleOf(nodes);
  return { assignees: names, assigneeLogins: logins };
};

function githubPriority(value) {
  if (typeof value?.name !== "string" || !value.name) return null;
  return { name: value.name, color: GITHUB_COLORS[value.color] ?? "muted" };
}

const foreignMark = (owners, repo, flag = "foreign") => (repoOwnership(repo, owners) === "foreign" ? { [flag]: true } : {});

function githubCard(node, owners, plan) {
  const c = node.content ?? {};
  const repo = c.repository?.nameWithOwner ?? "";
  return {
    key: node.id ?? c.id,
    // The project item's id, which a move names; null outside a project.
    itemId: node.id,
    source: "github",
    kind: c.__typename === "PullRequest" ? "pr" : c.__typename === "DraftIssue" ? "draft" : "issue",
    number: c.number ?? null,
    repo,
    repoShort: repoShortName(repo),
    ...foreignMark(owners, repo),
    title: c.title ?? "(kein Zugriff)",
    url: c.url ?? null,
    labels: (c.labels?.nodes ?? []).map((l) => l.name),
    labelColors: labelColors(c.labels),
    ...assigneesOf(c.assignees?.nodes),
    // The issue's or pull request's own id, which an assignment names (the
    // query asks no draft's).
    contentId: c.id ?? null,
    author: c.author?.login ?? c.creator?.login ?? null,
    reviewers: reviewerLogins(c.reviewRequests),
    type: c.issueType?.name ?? null,
    typeColor: GITHUB_COLORS[c.issueType?.color] ?? null,
    parent: c.parent?.number ?? null,
    parentTitle: c.parent?.title ?? null,
    parentRepo: c.parent?.repository?.nameWithOwner ?? null,
    ...(c.parent ? foreignMark(owners, c.parent.repository?.nameWithOwner ?? repo, "parentForeign") : {}),
    milestone: c.milestone?.title ?? null,
    priority: plan.priority ? githubPriority(node.priority) : null,
    sub: c.subIssuesSummary?.total ? { total: c.subIssuesSummary.total, done: c.subIssuesSummary.completed } : null,
    branch: c.headRefName ?? null,
  };
}

// The GraphQL error whose path starts with `path`, or null.
export function errorAt(errors, path) {
  return errorsAt(errors, path)[0] ?? null;
}

// Every GraphQL error whose path starts with `path`.
export const errorsAt = (errors, path) => (errors ?? []).filter((e) => Array.isArray(e.path) && path.every((p, i) => e.path[i] === p));

function nodeValue(plan, node, card, field) {
  const read = plan.queried.find((r) => r.field === field);
  return valueOf(field, read ? node[read.key] : null, card);
}

function boardColumns(plan, hidden, answer, held) {
  const field = plan.column;
  const names = plan.leftOut(hidden);
  const base = field.type === "ITERATION"
    ? field.iterations.filter((i) => !i.completed || held.has(i.id) || hidden.has(i.title)).map((i) => ({ id: i.id, name: i.title, color: "muted" }))
    : field.options.map((o) => ({ id: o.id, name: o.name, color: GITHUB_COLORS[o.color] ?? "muted" }));
  return base.map((c) => ({
    ...c,
    hidden: hidden.has(c.name),
    cardsNotRead: hidden.has(c.name),
    count: hidden.has(c.name) ? answer[`h${names.indexOf(c.name)}`]?.totalCount ?? null : 0,
    target: true,
    cards: [],
  }));
}

function answerItems(json, errors, project) {
  const items = json?.data?.repositoryOwner?.projectV2?.items;
  if (Array.isArray(items?.nodes)) return items;
  const e = errorAt(errors, ITEMS_PATH) ?? errorAt(errors, PROJECT_PATH);
  throw new BoardError(e ? `Projekt „${project.title}“: ${firstLine(e.message)}` : `Projekt „${project.title}“ lieferte keine Einträge`);
}

function itemEntry(plan, node, view, order) {
  const card = githubCard(node, view.owners, plan);
  return { node, card, ...orderEntry(order, plan.group, plan.sorts, (field) => nodeValue(plan, node, card, field)) };
}

// gh's answers for a board (githubItemsArgs and its pages, joined by
// addPage; and the GraphQL errors that came with them), read as
// boardPlan says (`plan`) → the board shape's data (ui/shapes/board.js):
// columns from the column field, each card in its column (one without a
// value in a column "Ohne <field>" before them, which takes no card), in
// the view's order (viewOrder), and the swimlanes, each card's `lane`,
// where the view groups.
export function parseGithubBoard(json, view, hidden, errors, plan) {
  const { project, shown } = plan;
  const items = answerItems(json, errors, project);
  const answer = json.data.repositoryOwner.projectV2;
  const cards = items.nodes.filter(Boolean).map((node, order) => {
    const entry = itemEntry(plan, node, view, order);
    return { ...entry, column: nodeValue(plan, node, entry.card, plan.column)?.key ?? null };
  });
  const columns = boardColumns(plan, hidden, answer, new Set(cards.map((c) => c.column)));
  const byId = new Map(columns.map((c) => [c.id, c]));
  const lanes = plan.group ? groupsOf(plan.group, cards) : null;
  const ordered = viewOrder(cards, lanes, plan.sorts);
  if (ordered.some((c) => !byId.has(c.column))) {
    const none = { id: NO_VALUE, name: noValueName(plan), color: "dim", hidden: false, cardsNotRead: false, count: 0, target: false, cards: [] };
    columns.unshift(none);
    byId.set(NO_VALUE, none);
  }
  for (const c of ordered) {
    const col = byId.get(byId.has(c.column) ? c.column : NO_VALUE);
    col.cards.push({ ...c.card, column: col.id, ...(lanes ? { lane: c.group } : {}) });
    if (!col.hidden) col.count++;
  }
  return {
    shape: "board",
    meta: {
      projectId: project.id,
      fieldId: plan.column.id,
      fieldName: plan.column.name,
      fieldType: plan.column.type,
      ownColumn: plan.ownColumn,
      title: project.title,
      url: project.url,
      view: shown.number,
      filter: shown.filter,
      query: itemsFilter(plan, hidden),
      unreadable: plan.unreadable,
    },
    columns,
    lanes,
    total: items.totalCount,
    limited: items.pageInfo?.hasNextPage ?? false,
    viewer: project.viewer,
    count: items.nodes.length,
  };
}

const tableField = (f) => ({ id: f.id, name: f.name, type: f.type, from: fromOf(f) });
const tableCell = (value) => (value ? { name: value.name, ...(value.color ? { color: value.color } : {}) } : null);

// gh's answers for a table or roadmap view, as for a board (above), read as
// tablePlan says (`plan`) → the table shape's data (ui/shapes/table.js): {
// shape: "table", meta, fields: [{ id, name, type (GitHub's dataType),
// from (fromOf) }] (tablePlan's, Title first), groupBy (the group field
// in that form, null without), sortBy ([{ field in that form, direction
// }]), groups ([{ id, name, color }] in the group field's order, "Ohne
// <field>" last; null without), rows (the cards in the view's order,
// viewOrder, each with its place in GitHub's order `order`, its `group` where
// the view groups, its sort keys' `ranks` and its `cells`, one per field:
// the value of one read by name, { name, color? }, else null), total,
// limited, viewer, count }.
export function parseGithubTable(json, view, errors, plan) {
  const { project, shown } = plan;
  const items = answerItems(json, errors, project);
  const entries = items.nodes.filter(Boolean).map((node, order) => itemEntry(plan, node, view, order));
  const groups = plan.group ? groupsOf(plan.group, entries) : null;
  const rows = viewOrder(entries, groups, plan.sorts).map((e) => ({
    ...e.card,
    order: e.order,
    ...(groups ? { group: e.group } : {}),
    ranks: e.ranks,
    cells: plan.fields.map((f) => (readByName(f) ? tableCell(nodeValue(plan, e.node, e.card, f)) : null)),
  }));
  return {
    shape: "table",
    meta: {
      projectId: project.id,
      title: project.title,
      url: project.url,
      view: shown.number,
      layout: shown.layout,
      filter: shown.filter,
      unreadable: plan.unreadable,
      blank: plan.blank,
    },
    fields: plan.fields.map(tableField),
    groupBy: plan.group ? tableField(plan.group) : null,
    sortBy: plan.sorts.map((s) => ({ field: tableField(s.field), direction: s.direction })),
    groups,
    rows,
    total: items.totalCount,
    limited: items.pageInfo?.hasNextPage ?? false,
    viewer: project.viewer,
    count: items.nodes.length,
  };
}

// An Issues tab's repos, as its repo menu offers them: the owner's own
// with issues on, archived ones left out, by name, REPOS_PAGES pages of
// PAGE at most; and whether the owner is a user or an organisation, which
// its search names (issuesQuery).
export const REPOS_PAGES = 10;
export const ISSUE_REPOS_QUERY = `query($login: String!, $after: String) {
  repositoryOwner(login: $login) {
    __typename
    repositories(first: ${PAGE}, after: $after, ownerAffiliations: [OWNER], hasIssuesEnabled: true, isArchived: false, orderBy: { field: NAME, direction: ASC }) {
      pageInfo { hasNextPage endCursor } nodes { nameWithOwner }
    }
  }
}`;

export const githubIssueReposArgs = (owner, after = null) =>
  ["api", "graphql", "-f", `query=${ISSUE_REPOS_QUERY}`, "-f", `login=${owner}`, ...(after ? ["-f", `after=${after}`] : [])];

// gh's answer for githubIssueReposArgs (and its GraphQL errors) → { org
// (the owner is an organisation), repos (their names with the owner), after
// (the cursor of the next page, null for none) }.
export function parseIssueRepos(json, owner, errors = []) {
  const node = json?.data?.repositoryOwner;
  const repos = node?.repositories;
  if (!Array.isArray(repos?.nodes)) {
    const e = errorAt(errors, ["repositoryOwner"]);
    throw new BoardError(e ? `GitHub: ${firstLine(e.message)}` : `GitHub kennt „${owner}“ nicht`);
  }
  return {
    org: node.__typename === "Organization",
    repos: repos.nodes.map((n) => n?.nameWithOwner).filter(isText),
    after: repos.pageInfo?.hasNextPage ? repos.pageInfo.endCursor ?? null : null,
  };
}

// The search of an Issues tab's view: the owner's issues in the state it
// shows, archived repos and those `hidden` left out where the owner's
// `repos` have them, newest updated first. GitHub's search scopes by user:
// or org: (docs.github.com, "Searching issues and pull requests").
export function issuesQuery(view, org, hidden, repos) {
  const known = new Set(repos.map(foldedName));
  const left = [...hidden].filter((r) => known.has(foldedName(r))).map((r) => `-repo:${r}`);
  return [`is:issue ${org ? "org" : "user"}:${view.owner} archived:false is:${view.issueState} sort:updated-desc`, ...left].join(" ");
}

export const ISSUES_QUERY = `query($q: String!, $first: Int!, $after: String) {
  viewer { login }
  search(type: ISSUE, first: $first, after: $after, query: $q) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { ${ISSUE_FIELDS} stateReason updatedAt } }
  }
}`;

export const githubIssuesArgs = (view, query, count = 0, after = null) => [
  "api", "graphql", "-f", `query=${ISSUES_QUERY}`, "-f", `q=${query}`, "-F", `first=${Math.min(PAGE, view.limit - count)}`, ...(after ? ["-f", `after=${after}`] : []),
];

const SEARCH_LABEL = "Die Suche nach Issues";

// Why an answer lacks its search: the error on the way to it, else the
// answer's first; `why` where it has none.
function searchMissing(errors, why) {
  const e = errorAt(errors, ["search"]) ?? errors[0];
  return e ? `${SEARCH_LABEL}: ${firstLine(e.message)}` : `${SEARCH_LABEL} ${why}`;
}

export const ISSUE_SEARCH = {
  of: (json) => json?.data?.search,
  totalKey: "issueCount",
  label: () => SEARCH_LABEL,
  noun: "Issues",
  missing: (label, errors, count) => searchMissing(errors, `lieferte die Issues nach den ersten ${count} nicht`),
};

function searchOf(json, errors) {
  const search = ISSUE_SEARCH.of(json);
  if (Array.isArray(search?.nodes)) return search;
  throw new BoardError(searchMissing(errors, "fehlt in GitHubs Antwort"));
}

const NO_PLAN = { priority: null };

// gh's answers for an Issues tab's view (githubIssuesArgs and its pages,
// joined by addPage) → the issues shape's data (ui/shapes/issues.js): {
// shape: "issues", meta: { owner, state, query }, repos (the owner's,
// parseIssueRepos), rows (githubCard's cards in GitHub's order, each with
// its stateReason and updatedAt), readHidden (the repos turned off as the
// read began), hideRepos, owners, total, limited, count, viewer }. A search
// that stops at its cap says no more follow: a total above what came is cut
// too.
export function parseGithubIssues(json, view, { repos, hidden, query }, errors = []) {
  const search = searchOf(json, errors);
  const rows = search.nodes.filter((n) => n?.id).map((issue) => ({
    ...githubCard({ id: null, content: { ...issue, __typename: "Issue" } }, view.owners, NO_PLAN),
    stateReason: issue.stateReason ?? null,
    updatedAt: issue.updatedAt ?? null,
  }));
  const total = search.issueCount ?? rows.length;
  return {
    shape: "issues",
    meta: { owner: view.owner, state: view.issueState, query },
    repos,
    rows,
    readHidden: [...hidden],
    hideRepos: [...view.hideRepos],
    owners: view.owners,
    total,
    limited: Boolean(search.pageInfo?.hasNextPage) || total > search.nodes.length,
    count: search.nodes.length,
    viewer: json.data.viewer?.login ?? null,
  };
}

// The mutation's field, and the path its own GraphQL errors carry.
const MOVE_FIELD = "updateProjectV2ItemFieldValue";
export const MOVE_PATH = [MOVE_FIELD];
const moveMutation = (value) => `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  ${MOVE_FIELD}(input: { projectId: $project, itemId: $item, fieldId: $field, value: { ${value}: $option } }) {
    projectV2Item { id }
  }
}`;
// A column of a single-select field is an option, one of an iteration
// field an iteration.
export const MOVE_MUTATION = moveMutation("singleSelectOptionId");
export const MOVE_ITERATION_MUTATION = moveMutation("iterationId");

// gh arguments that set a card's column field to a column's option or
// iteration.
export function githubMoveArgs(meta, card, column) {
  return [
    "api", "graphql", "-f", `query=${meta.fieldType === "ITERATION" ? MOVE_ITERATION_MUTATION : MOVE_MUTATION}`, "-f", `project=${meta.projectId}`, "-f", `item=${card.itemId}`,
    "-f", `field=${meta.fieldId}`, "-f", `option=${column.id}`,
  ];
}

// A mutation's answer must name the item it changed; anything else leaves
// open whether the change landed.
export function checkMoveResult(json, card) {
  if (json?.data?.[MOVE_FIELD]?.projectV2Item?.id !== card.itemId) {
    throw failure("GitHub hat die Änderung nicht bestätigt", { write: true, unclear: true });
  }
}

// How many review threads of a pull request a PR list reads: FIRST_THREADS
// in its one request, REVIEW_THREADS in the follow-up for those with more
// (githubThreadsArgs); of each thread how many comments, the last ones; how
// many of the viewer's reviews, the last ones; and of each how many
// comments, the first ones (prAttention).
export const FIRST_THREADS = 10;
export const REVIEW_THREADS = 50;
export const THREAD_COMMENTS = 10;
export const VIEWER_REVIEWS = 5;
export const REVIEW_COMMENTS = 10;
// How many pull requests one follow-up for more threads reads by their ids:
// GitHub's most, as for a page (PAGE).
export const THREAD_IDS = PAGE;

const threadsSelection = (first) =>
  `reviewThreads(first: ${first}) { totalCount nodes { isResolved comments(last: ${THREAD_COMMENTS}) { nodes { author { login } createdAt publishedAt } } } }`;

// A pull request's fields as a row of a PR list shows it (prRow), which
// the details panel shows of a pull request it goes down to too. The head
// commit's oid is prAttention's; it stands here, where its checks are read.
const PR_ROW_FIELDS = `
      id number title url isDraft createdAt updatedAt headRefName reviewDecision
      repository { nameWithOwner } author { login }
      assignees(first: 10) { nodes { login name } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state contexts(first: 0) {
        checkRunCountsByState { state count } statusContextCountsByState { state count } } } } } }`;

// What a PR list reads of a pull request besides its row's fields, to tell
// whether the viewer has to act on it (prAttention). The states leave out
// pending reviews. The details panel's pull request a level down does
// without these fields.
const PR_ATTENTION_FIELDS = `
      mergeable
      reviews(last: ${VIEWER_REVIEWS}, author: $login, states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]) { nodes {
        state body submittedAt author { login } commit { oid } comments(first: ${REVIEW_COMMENTS}) { totalCount nodes { replyTo { id } } } } }
      ${threadsSelection(FIRST_THREADS)}`;

const PR_FIELDS = `
  issueCount
  nodes {
    ... on PullRequest {${PR_ATTENTION_FIELDS}${PR_ROW_FIELDS}
    }
  }`;

// A pull request as PR_ROW_FIELDS reads it → the fields of its row;
// `lost`: whether GitHub sent an error at its commits, where its checks
// stand (checksSummary).
function prRow(pr, lost = false) {
  const repo = pr.repository.nameWithOwner;
  return {
    number: pr.number,
    repo,
    repoShort: repoShortName(repo),
    title: pr.title,
    url: pr.url,
    author: pr.author?.login ?? "?",
    draft: pr.isDraft,
    review: reviewLabel(pr.reviewDecision, pr.isDraft),
    checks: checksSummary(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup ?? null, lost),
    updatedAt: pr.updatedAt,
    createdAt: pr.createdAt,
    branch: pr.headRefName,
    labels: [],
    ...assigneesOf(pr.assignees?.nodes),
    reviewers: reviewerLogins(pr.reviewRequests),
  };
}

// The words for an own pull request's open threads: `n` read, `more` where
// GitHub has threads it did not send, which may be open too ("3+ offene
// Threads").
const threadsText = (n, more) => (n === 1 && !more ? "1 offener Thread" : `${n}${more ? "+" : ""} offene Threads`);

// What the details say of a part of a pull request the list could not read
// whole (prAttention's unread).
export const UNREAD = {
  threads: "Review-Threads fehlen",
  moreThreads: (read) => `mehr als ${read} Review-Threads`,
  reviews: "Reviews fehlen",
  reviewKind: "deine letzten Reviews nicht ganz gelesen",
  head: "letzter Commit fehlt",
};

// Whether a review of the viewer's counts as one, as opposed to a reply in
// a thread alone, which GitHub files as a COMMENTED review of its own: true,
// false, or null where GitHub sent too little to tell.
function realReview(review) {
  if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) return true;
  if (review.state !== "COMMENTED") return null;
  const comments = review.comments?.nodes;
  if (Array.isArray(comments) && comments.some((c) => c?.replyTo === null)) return true;
  if (typeof review.body !== "string") return null;
  if (review.body !== "") return true;
  return Array.isArray(comments) && review.comments.totalCount === comments.length && comments.every((c) => c?.replyTo) ? false : null;
}

// Of `reviews` the one given last; where GitHub sent no time to tell, the
// later in its order.
const lastGiven = (reviews) => reviews.reduce((last, r) => (last && Date.parse(r.submittedAt) < Date.parse(last.submittedAt) ? last : r), null);

// Whether the `viewer` has to act on the pull request `pr` (its `row`
// read; `asked`: whether a search that asks for one's review, or a team's
// one is in, found it; `errors`: GitHub's errors at its path): { attention,
// waiting, unread }. attention: the reasons, as the row names them (the
// README's GitHub PR list paragraph lists them), NOTIFIED first where
// `notified` (an unread notification of gh's own user names it), also where
// the viewer is unknown; none else where the viewer has nothing to do, or
// is unknown. waiting: someone else's pull request one reviewed, all of it
// read, that asks nothing of one and is not notified ("wartet auf Autor").
// unread: what of it the list could not read whole, so that no reason, nor
// "nothing to do", can be told for sure: those errors' first lines (also
// where the viewer is unknown) and UNREAD's parts. `pending`: its follow-up
// for more threads is still to come, which leaves it unsure but not unread.
// `login`: whose reviews the request asked for, none for anyone's.
function prAttention(pr, row, viewer, asked, errors, { pending = false, login = null, notified = false } = {}) {
  const unread = errors.map((e) => firstLine(e.message)).filter(Boolean);
  const acts = (reasons, waiting) => ({ attention: notified ? [NOTIFIED, ...reasons] : reasons, waiting: waiting && !notified, unread });
  if (!viewer) return acts([], false);
  const threads = pr.reviewThreads;
  const nodes = Array.isArray(threads?.nodes) ? threads.nodes : null;
  if (!nodes || nodes.some((t) => !Array.isArray(t?.comments?.nodes))) unread.push(UNREAD.threads);
  const more = Boolean(nodes) && (threads.totalCount ?? 0) > nodes.length;
  if (more && !pending) unread.push(UNREAD.moreThreads(nodes.length));
  const sure = () => !unread.length && !pending;
  const open = (nodes ?? []).filter((t) => t && !t.isResolved).map((t) => t.comments?.nodes ?? []);
  const authorOf = (comment) => comment?.author?.login ?? null;
  const awaitsViewer = (comments) => comments.length > 0 && authorOf(comments.at(-1)) !== viewer;
  const reasons = [];
  if (pr.author?.login === viewer) {
    const unanswered = open.filter(awaitsViewer).length;
    if (pr.reviewDecision === "CHANGES_REQUESTED") reasons.push(REVIEW.CHANGES_REQUESTED);
    if (unanswered) reasons.push(threadsText(unanswered, more));
    if (row.checks.state === "failed") reasons.push("Checks rot");
    if (pr.mergeable === "CONFLICTING") reasons.push("Konflikt");
    const ready = !pr.isDraft && [null, "APPROVED"].includes(pr.reviewDecision ?? null) && ["passed", "none"].includes(row.checks.state) && pr.mergeable === "MERGEABLE";
    if (!reasons.length && sure() && ready) reasons.push("bereit zum Mergen");
    return acts(reasons, false);
  }
  // The reviews of `login`, anyone's without it: unread where they may be
  // another's than the viewer's.
  const mine = (!login || login === viewer) && Array.isArray(pr.reviews?.nodes) && pr.reviews.nodes.every((r) => r && r.author?.login === viewer);
  const reviews = mine ? pr.reviews.nodes : null;
  if (!reviews) unread.push(UNREAD.reviews);
  // The last review of the viewer's that counts, one GitHub sent too little
  // of to tell counted as one (realReview); and the last that surely counts.
  // A dismissed review is none.
  const kept = (r) => (r?.state === "DISMISSED" ? null : r);
  const review = kept(lastGiven((reviews ?? []).filter((r) => realReview(r) !== false)));
  const sureReview = kept(lastGiven((reviews ?? []).filter((r) => realReview(r) === true)));
  const head = pr.commits?.nodes?.[0]?.commit?.oid ?? null;
  if (review && !head) unread.push(UNREAD.head);
  const requested = asked || row.reviewers.includes(viewer);
  // A time missing on either side parses as NaN, which no comparison holds
  // for: the reply counts.
  const before = (comments, r) => Date.parse(comments.at(-1)?.publishedAt ?? comments.at(-1)?.createdAt) <= Date.parse(r?.submittedAt);
  const reasonsBy = (r) => [
    requested && !r && "Review angefragt",
    r && head && r.commit?.oid !== head && "neue Commits seit deinem Review",
    // A head unknown is no review's commit, so it gives no reason.
    requested && r && r.commit?.oid === head && "Review erneut angefragt",
    open.some((comments) => comments.some((c) => authorOf(c) === viewer) && awaitsViewer(comments) && !before(comments, r)) && "Antwort erwartet",
  ].filter(Boolean);
  reasons.push(...reasonsBy(review));
  const told = (r, said) => JSON.stringify([said, Boolean(r) && !said.length]);
  if (told(review, reasons) !== told(sureReview, reasonsBy(sureReview))) unread.push(UNREAD.reviewKind);
  return acts(reasons, Boolean(review) && !requested && !reasons.length && sure());
}

// One GraphQL request for a list view: one search per section (`s0`, `s1`,
// …), and the login gh runs as. Each pull request's reviews are `login`'s;
// without it, anyone's (GitHub drops an argument whose variable is unset).
export function githubListArgs(view, login) {
  const searches = view.sections.map((_, i) => `s${i}: search(type: ISSUE, first: ${view.limit}, query: $q${i}) { ${PR_FIELDS} }`);
  const vars = ["$login: String", ...view.sections.map((_, i) => `$q${i}: String!`)].join(", ");
  const doc = `query(${vars}) {\nviewer { login }\n${searches.join("\n")}\n}`;
  return ["api", "graphql", "-f", `query=${doc}`, ...(login ? ["-f", `login=${login}`] : []), ...view.sections.flatMap((s, i) => ["-f", `q${i}=${s.query}`])];
}

// Unread ones only without `all`; 50 a page is GitHub's most; gh's --paginate joins the pages.
export const NOTIFICATIONS_PATH = "notifications?per_page=50";
export const githubNotificationsArgs = () => ["api", "--paginate", NOTIFICATIONS_PATH];

const notifiedKey = (repo, number) => `${foldedName(repo)}#${number}`;
const PULL_URL = /\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/;

export function notifiedPrs(json) {
  if (!Array.isArray(json)) throw new BoardError("GitHub schickte keine Liste von Benachrichtigungen");
  const keys = new Set();
  let unnamed = 0;
  for (const entry of json) {
    if (entry?.unread !== true || entry.subject?.type !== "PullRequest") continue;
    const m = typeof entry.subject.url === "string" ? entry.subject.url.match(PULL_URL) : null;
    if (m) keys.add(notifiedKey(`${m[1]}/${m[2]}`, Number(m[3])));
    else unnamed++;
  }
  return { keys, unnamed };
}

export const notifiedUnknown = (why) => `GitHub-Benachrichtigungen nicht abgerufen, keine Markierung „${NOTIFIED}“: ${why}`;
export const notifiedUnnamed = (n) =>
  n === 1 ? "1 ungelesene Benachrichtigung zu einem Pull Request ohne lesbare Adresse" : `${n} ungelesene Benachrichtigungen zu Pull Requests ohne lesbare Adresse`;

// One GraphQL request for the login gh runs as, which a list's request
// needs before its answer names it (githubListArgs).
export const VIEWER_QUERY = "query { viewer { login } }";
export const githubViewerArgs = () => ["api", "graphql", "-f", `query=${VIEWER_QUERY}`];

// The ids of the pull requests in a list's answer `json` (githubListArgs,
// for `view`) with more review threads than it read, each once.
export function moreThreadIds(json, view) {
  const ids = view.sections.flatMap((_, i) => json?.data?.[`s${i}`]?.nodes ?? [])
    .filter((pr) => pr?.id && Array.isArray(pr.reviewThreads?.nodes) && (pr.reviewThreads.totalCount ?? 0) > pr.reviewThreads.nodes.length)
    .map((pr) => pr.id);
  return [...new Set(ids)];
}

// One GraphQL request for the first REVIEW_THREADS review threads of the
// pull requests `ids` (moreThreadIds, at most THREAD_IDS of them), by their
// ids; the header of main.js says what it costs.
export const THREADS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) { ... on PullRequest { id ${threadsSelection(REVIEW_THREADS)} } }
}`;

export const githubThreadsArgs = (ids) => ["api", "graphql", "-f", `query=${THREADS_QUERY}`, ...ids.flatMap((id) => ["-f", `ids[]=${id}`])];

// The follow-up's answer `page` (githubThreadsArgs for `ids`, with its
// GraphQL errors `pageErrors`; null where it `failed`, with why) laid into
// the list's answer `json`: each pull request it read gets the threads it
// sent, wherever the list holds it. For one it did not read, an error at
// its threads in the list's terms, where the list holds it first (the row
// that shows it), so that its row is unread (prAttention) and says why;
// those errors are returned.
export function addThreads(json, view, ids, page, pageErrors, failed = null) {
  const found = new Map();
  const why = new Map();
  ids.forEach((id, k) => {
    const node = page?.data?.nodes?.[k];
    const e = errorAt(pageErrors, ["nodes", k]);
    if (!e && node?.id === id && Array.isArray(node.reviewThreads?.nodes)) found.set(id, node.reviewThreads);
    else why.set(id, failed ?? (e ? `Review-Threads: ${firstLine(e.message)}` : "GitHub schickte die weiteren Review-Threads nicht"));
  });
  const errors = [];
  view.sections.forEach((_, i) => (json?.data?.[`s${i}`]?.nodes ?? []).forEach((pr, j) => {
    if (found.has(pr?.id)) pr.reviewThreads = found.get(pr.id);
    else if (why.has(pr?.id)) {
      errors.push({ path: [`s${i}`, "nodes", j, "reviewThreads"], message: why.get(pr.id) });
      why.delete(pr.id);
    }
  }));
  return errors;
}

// Check counts by GitHub's states, check runs and status contexts together.
const CHECK_KIND = {
  SUCCESS: "passed", FAILURE: "failed", ERROR: "failed", TIMED_OUT: "failed", CANCELLED: "failed", STARTUP_FAILURE: "failed",
  ACTION_REQUIRED: "failed", IN_PROGRESS: "pending", PENDING: "pending", QUEUED: "pending", WAITING: "pending", EXPECTED: "pending",
  SKIPPED: "skipped", NEUTRAL: "skipped", STALE: "skipped",
};

// A pull request's checks from its head commit's statusCheckRollup: their
// counts, state, short and long text; none without a rollup. Where GitHub
// sent an error at or under the commits they stand in (`lost`), the rollup
// or its counts may be gone: they are unread, "?".
export function checksSummary(rollup, lost = false) {
  const n = { passed: 0, failed: 0, pending: 0, skipped: 0 };
  if (lost) return { ...n, state: "unread", short: "?", text: "Checks nicht gelesen" };
  const contexts = rollup?.contexts;
  for (const { state, count } of [...(contexts?.checkRunCountsByState ?? []), ...(contexts?.statusContextCountsByState ?? [])]) {
    const kind = CHECK_KIND[state];
    if (kind) n[kind] += count;
  }
  const total = n.passed + n.failed + n.pending + n.skipped;
  if (!rollup || !total) return { ...n, state: "none", short: "—", text: "keine Checks" };
  const state = n.failed ? "failed" : n.pending ? "pending" : "passed";
  const short = n.failed ? `✗ ${n.failed}` : n.pending ? `◷ ${n.pending}` : `✓ ${n.passed}`;
  const text = [
    n.passed && `${n.passed} bestanden`, n.failed && `${n.failed} fehlgeschlagen`, n.pending && `${n.pending} laufen`,
    n.skipped && `${n.skipped} übersprungen`,
  ].filter(Boolean).join(" · ");
  return { ...n, state, short, text };
}

// GitHub's review decision as a label. No decision is also what a repo
// without required reviews reports, so it shows nothing.
const REVIEW = { APPROVED: "freigegeben", CHANGES_REQUESTED: "Änderungen gewünscht", REVIEW_REQUIRED: "noch kein Review" };
export const reviewLabel = (decision, draft) => (draft ? DRAFT_REVIEW : REVIEW[decision] ?? "");

// Whether the search `query` sets one of the qualifiers `names` to @me,
// not negated (by a leading - or NOT).
function setsMe(query, names) {
  const words = String(query ?? "").split(/\s+/);
  const me = new RegExp(`^(${names.join("|")}):@me$`, "i");
  return words.some((w, i) => me.test(w) && words[i - 1]?.toUpperCase() !== "NOT");
}

// The qualifiers by which a search asks for one's review.
const ASKING = ["review-requested", "user-review-requested"];

// Whether a search holds only one's own pull requests, as "nur meine" counts
// them: it has author, assignee, reviewed-by or one of ASKING set to @me,
// not negated (a pull request one reviewed counts as one's own). involves,
// mentions, commenter and the like do not count.
export const ownSearch = (query) => setsMe(query, ["author", "assignee", "reviewed-by", ...ASKING]);

// Whether every pull request a search finds asks for one's review, or a
// team's one is in: it sets one of ASKING to @me, not negated
// (prAttention's asked). A review asked of a team shows only in such a
// search; the answer names no person for it.
export const askingSearch = (query) => setsMe(query, ASKING);

export function parseGithubList(json, view, errors = [], { pending = null, login = null, notified = null } = {}) {
  const seen = new Set();
  const viewer = json?.data?.viewer?.login ?? null;
  const shown = new Set();
  const nodesOf = (i) => (Array.isArray(json?.data?.[`s${i}`]?.nodes) ? json.data[`s${i}`].nodes : []);
  const asking = new Set(view.sections.flatMap((s, i) => (askingSearch(s.query) ? nodesOf(i) : [])).map((pr) => pr?.id).filter(Boolean));
  const sections = view.sections.map((s, i) => {
    const ownQuery = ownSearch(s.query);
    const found = json?.data?.[`s${i}`];
    if (!Array.isArray(found?.nodes)) {
      const e = errorAt(errors, [`s${i}`]);
      throw new BoardError(e ? `Die Suche „${s.query}“: ${firstLine(e.message)}` : `Die Suche „${s.query}“ fehlt in GitHubs Antwort`);
    }
    const rows = [];
    const notRead = [];
    let skipped = 0;
    found.nodes.forEach((pr, j) => {
      const path = [`s${i}`, "nodes", j];
      const at = errorsAt(errors, path);
      if (!pr?.id) {
        at.forEach((e) => shown.add(e));
        if (at.length) notRead.push(firstLine(at[0].message));
        else skipped++;
        return;
      }
      if (seen.has(pr.id)) return;
      seen.add(pr.id);
      const row = prRow(pr, Boolean(errorAt(at, [...path, "commits"])));
      if (repoOwnership(row.repo, view.owners) === "other") return;
      at.forEach((e) => shown.add(e));
      const waits = Boolean(pending?.has(pr.id));
      const acts = prAttention(pr, row, viewer, asking.has(pr.id), at, { pending: waits, login, notified: Boolean(notified?.has(notifiedKey(row.repo, row.number))) });
      rows.push({ key: pr.id, source: "github", kind: "pr", ...row, ...acts, ownByQuery: ownQuery, ...foreignMark(view.owners, row.repo), ...(waits ? { threadsPending: true } : {}) });
    });
    // Array's sort keeps the order of rows it ranks alike.
    rows.sort((a, b) => Number(b.attention.length > 0) - Number(a.attention.length > 0));
    return {
      name: s.name, color: SECTION_TONES[s.tone] ?? "muted", count: found.issueCount, fetched: found.nodes.length, limited: found.issueCount > found.nodes.length,
      skipped, notRead, rows,
    };
  });
  return {
    shape: "prs", sections, viewer, owners: view.owners,
    warnings: errors.filter((e) => !shown.has(e)).map((e) => firstLine(e.message)).filter(Boolean),
  };
}

// How many sub-issues and linked pull requests an issue's related items
// read.
export const SUB_ISSUES = 50;
export const LINKED_PRS = 20;

// One GraphQL request for the items related to an issue: its sub-issues
// (the first SUB_ISSUES and how many it has; how many are done the board's
// own query reads, as the item's sub) and the pull requests linked to it.
// closedByPullRequestsReferences is GitHub's field for the pull requests
// that close the issue when merged: those linked by a closing keyword in
// their text and those linked by hand in the issue's Development sidebar
// ("List of open pull requests referenced from this issue",
// docs.github.com/en/graphql/reference/issues; userLinkedOnly and
// excludeUserLinked pick one of the two kinds). It lists open ones only
// unless includeClosedPrs, which adds the merged and closed ones. A pull
// request that only mentions the issue is not in it. The same request reads
// the issue's description: `body` ("Identifies the body of the issue"), the
// text as it was written, in Markdown, which the details draw formatted;
// `bodyText` is the body "rendered to text", and how that keeps line breaks
// the reference does not say. It reads the issue's parent too (`parent`,
// the issue it is a sub-issue of; null for none), for its line in the
// details.
export const RELATED_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      body
      parent { number title state url repository { nameWithOwner } }
      subIssues(first: ${SUB_ISSUES}) {
        totalCount pageInfo { hasNextPage } nodes { number title state url repository { nameWithOwner } }
      }
      closedByPullRequestsReferences(first: ${LINKED_PRS}, includeClosedPrs: true) {
        totalCount pageInfo { hasNextPage } nodes { number title state isDraft url repository { nameWithOwner } }
      }
    }
  }
}`;

export function githubRelatedArgs(item) {
  const [owner, name] = item.repo.split("/");
  return ["api", "graphql", "-f", `query=${RELATED_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${item.number}`];
}

// GitHub's state of an issue or a pull request as a line shows it
// (STATE_LOOKS).
const GITHUB_LOOKS = { OPEN: STATE_LOOKS.open, CLOSED: STATE_LOOKS.closed, MERGED: STATE_LOOKS.merged };
const lookOf = (state) => GITHUB_LOOKS[state] ?? otherLook(state);

// The error for an issue or pull request `item` that GitHub's answer does
// not hold: the error at its path, where GitHub sent one.
function notFound(errors, item) {
  const e = errorAt(errors, ["repository"]);
  return new BoardError(e ? `GitHub: ${firstLine(e.message)}` : `GitHub kennt ${item.repo}#${item.number} nicht`);
}

// A sub-issue, a linked pull request or the parent as a line (related.js).
function relatedLine(node, kind, owners) {
  const repo = node.repository?.nameWithOwner ?? "";
  const state = lookOf(node.state);
  return {
    kind,
    source: "github",
    repo,
    repoShort: repoShortName(repo),
    ...foreignMark(owners, repo),
    number: node.number,
    title: node.title ?? "(kein Zugriff)",
    url: node.url ?? null,
    ...state,
    draft: node.isDraft === true,
  };
}

// Where each section's connection stands in the answer.
const RELATED_PATHS = {
  parent: ["repository", "issue", "parent"], subIssues: ["repository", "issue", "subIssues"], prs: ["repository", "issue", "closedByPullRequestsReferences"],
};

// A connection of the answer as a section (related.js), and the error it
// shows (`shown`, null for none). One GitHub did not send, or whose nodes
// it did not send, shows the error at that path in their place.
function relatedSection(conn, kind, path, errors, owners) {
  if (!conn || !Array.isArray(conn.nodes)) {
    const shown = errorAt(errors, conn ? [...path, "nodes"] : path);
    const error = shown ? `GitHub: ${firstLine(shown.message)}` : "GitHub schickte sie nicht";
    return { section: { count: conn?.totalCount ?? null, sent: 0, cut: false, hidden: 0, error, lines: [] }, shown };
  }
  const lines = conn.nodes.filter((n) => Number.isInteger(n?.number)).map((n) => relatedLine(n, kind, owners));
  const section = {
    count: conn.totalCount ?? lines.length, sent: conn.nodes.length, cut: Boolean(conn.pageInfo?.hasNextPage), hidden: conn.nodes.length - lines.length,
    error: null, lines,
  };
  return { section, shown: null };
}

// The issue's parent as a section of one line, or of none where it has
// none; where GitHub sent none for an error at its path, that error, which
// it shows (`shown`), and no count.
function parentSection(issue, errors, owners) {
  const node = issue.parent;
  if (Number.isInteger(node?.number)) return { section: { count: 1, sent: 1, cut: false, hidden: 0, error: null, lines: [relatedLine(node, "issue", owners)] }, shown: null };
  const shown = errorAt(errors, RELATED_PATHS.parent);
  const error = shown ? `GitHub: ${firstLine(shown.message)}` : null;
  return { section: { count: shown ? null : 0, sent: 0, cut: false, hidden: 0, error, lines: [] }, shown };
}

// gh's answer for githubRelatedArgs (and the GraphQL errors that came with
// its data) → { description, parents, subIssues, prs, warnings }
// (related.js). A missing issue is explained by the error at its path. An
// error is a section's own only where the section shows it, in place of what
// GitHub did not send; all others are warnings (a node GitHub sent as null
// counts as hidden, and its error is one of them).
export function parseGithubRelated(json, item, owners, errors = []) {
  const issue = json?.data?.repository?.issue;
  if (!issue) throw notFound(errors, item);
  const parents = parentSection(issue, errors, owners);
  const subIssues = relatedSection(issue.subIssues, "issue", RELATED_PATHS.subIssues, errors, owners);
  const prs = relatedSection(issue.closedByPullRequestsReferences, "pr", RELATED_PATHS.prs, errors, owners);
  const shown = [parents.shown, subIssues.shown, prs.shown];
  return {
    description: typeof issue.body === "string" ? issue.body : "",
    format: "markdown",
    parents: parents.section,
    subIssues: subIssues.section,
    prs: prs.section,
    warnings: errors.filter((e) => !shown.includes(e)).map((e) => firstLine(e.message)).filter(Boolean),
  };
}

// One GraphQL request for a pull request the details panel goes down to
// (related.js, pullRequest): by its repo and number, the fields a PR
// list's row shows (PR_ROW_FIELDS; not PR_ATTENTION_FIELDS, which only the
// list reads), and its state, which a row does not show.
export const PULL_REQUEST_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state${PR_ROW_FIELDS}
    }
  }
}`;

export function githubPullRequestArgs(item) {
  const [owner, name] = item.repo.split("/");
  return ["api", "graphql", "-f", `query=${PULL_REQUEST_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${item.number}`];
}

// gh's answer for githubPullRequestArgs (and the GraphQL errors that came
// with its data) → the pull request's details (related.js, pullRequest):
// its row (prRow; its checks unread where an error is at its commits), its
// state as a line has it, and the errors that came with it as warnings (a
// part GitHub did not send, such as its checks). A missing pull request is
// explained by the error at its path.
export function parseGithubPullRequest(json, item, errors = []) {
  const pr = json?.data?.repository?.pullRequest;
  if (!pr) throw notFound(errors, item);
  return { ...prRow(pr, Boolean(errorAt(errors, ["repository", "pullRequest", "commits"]))), ...lookOf(pr.state), warnings: errors.map((e) => firstLine(e.message)).filter(Boolean) };
}

// The people an issue's or pull request's repo can assign (GitHub's
// assignableUsers: those with access to it, the first ASSIGNABLE), and who
// gh is, as the assignee picker offers them.
export const ASSIGNABLE = 100;
export const ASSIGNABLE_QUERY = `query($owner: String!, $name: String!) {
  viewer { id login name }
  repository(owner: $owner, name: $name) { assignableUsers(first: ${ASSIGNABLE}) { totalCount nodes { id login name } } }
}`;

export function githubAssignableArgs(item) {
  const [owner, name] = item.repo.split("/");
  return ["api", "graphql", "-f", `query=${ASSIGNABLE_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`];
}

// A person of GitHub's answer as the picker offers one: { id, login, name }
// (name: personName).
const githubPerson = (p) => ({ id: p.id, login: p.login, name: personName(p) });

// gh's answer for githubAssignableArgs (and its GraphQL errors) → { me (the
// viewer, me: true; null where GitHub did not name it), people (the others,
// by name), note (how many GitHub did not send, or null) }. A missing repo
// is explained by the error at its path.
export function parseAssignable(json, item, errors = []) {
  const users = json?.data?.repository?.assignableUsers;
  if (!Array.isArray(users?.nodes)) {
    const e = errorAt(errors, ["repository"]);
    throw new BoardError(e ? `GitHub: ${firstLine(e.message)}` : `GitHub kennt ${item.repo} nicht`);
  }
  const viewer = json.data.viewer;
  const me = viewer?.id && viewer.login ? { ...githubPerson(viewer), me: true } : null;
  const sent = users.nodes.filter((p) => p?.id && p.login);
  const people = sent.filter((p) => p.login !== me?.login).map(githubPerson).sort((a, b) => a.name.localeCompare(b.name));
  const total = users.totalCount ?? sent.length;
  return { me, people, note: total > users.nodes.length ? `erste ${users.nodes.length} von ${total}` : null };
}

// The mutation that replaces an item's assignees, by its kind: its field,
// the node it answers with, and the name of the item's id in its input.
const ASSIGN = { issue: ["updateIssue", "issue", "id"], pr: ["updatePullRequest", "pullRequest", "pullRequestId"] };
const assignMutation = ([field, node, idName]) => `mutation($id: ID!, $assignees: [ID!]!) {
  ${field}(input: { ${idName}: $id, assigneeIds: $assignees }) { ${node} { id assignees(first: 10) { nodes { login name } } } }
}`;
export const assignPath = (item) => [ASSIGN[item.kind][0]];

// gh arguments that make `person` ({ id }) the only assignee of an issue or
// pull request, or none for null (gh's `key[]` without a value is an empty
// list).
export function githubAssignArgs(item, person) {
  return ["api", "graphql", "-f", `query=${assignMutation(ASSIGN[item.kind])}`, "-f", `id=${item.contentId}`, "-f", person ? `assignees[]=${person.id}` : "assignees[]"];
}

// The mutation's answer must name the item and, as its assignees, exactly
// `person` (none for null); then → { names, logins } as it names them, else
// it is open whether the change landed.
export function checkAssigned(json, item, person) {
  const [field, node] = ASSIGN[item.kind];
  const done = json?.data?.[field]?.[node];
  const nodes = done?.assignees?.nodes;
  const got = peopleOf(nodes);
  const want = person ? [person.login] : [];
  if (done?.id !== item.contentId || !Array.isArray(nodes) || got.logins.join("\n") !== want.join("\n")) {
    throw failure("GitHub hat die Zuweisung nicht bestätigt", { write: true, unclear: true });
  }
  return got;
}

// gh's network failures, as Go's net package and gh word them. NOT_SENT: the
// request never reached GitHub (gh prints a failed DNS lookup as "error
// connecting to <host>"; a failed dial, refused or timed out, never
// connected). SENT_FAILURE: the
// connection broke or timed out after it was made, so a write may have
// landed.
const NOT_SENT = /^error connecting to |dial tcp/im;
const SENT_FAILURE = /connection reset|i\/o timeout|Client\.Timeout|\bEOF\b|http2|stream error|context deadline exceeded/i;
// GitHub's words for a request it did not finish in time (GraphQL and REST).
const SERVER_TIMEOUT = /This may be the result of a timeout|couldn't respond to your request in time/i;
const NEEDS_SCOPE = /This API operation needs the "([^"]+)" scope/;
// GitHub's refusal to a fine-grained or app token; its notifications take only a classic token or gh's own login.
const TOKEN_KIND = /Resource not accessible by (personal access token|integration)/;
const missingScope = (scope) => new BoardError(`Dem gh-Token fehlt der Scope „${scope}“: gh auth refresh -s ${scope}`);

// gh exits 1 whenever GraphQL's answer holds errors, even next to data, and prints them as "gh: <message>", without their type.
// gh hints at a missing scope only after a 4xx other than 422, to a token that names its scopes (api.ScopesSuggestion).
export function readGh({ code, stdout, stderr }, { write = false, path = null, rest = false } = {}) {
  const err = String(stderr ?? "");
  const said = firstLine(err.replace(/^gh: /gm, ""));
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Not JSON: what went wrong is on stderr.
  }
  if (code === 0 && json === null) throw failure("gh antwortete ohne lesbares JSON", { write, unclear: true });
  if (rest && code === 0) return { json, warnings: [], errors: [] };
  const scope = rest ? err.match(NEEDS_SCOPE)?.[1] : null;
  if (scope) throw missingScope(scope);
  if (rest && TOKEN_KIND.test(err)) throw new BoardError("Benachrichtigungen liest nur ein klassisches Token oder die Anmeldung von gh selbst: gh auth login");
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  const types = errors.map((e) => e.type);
  if (code === 4 || /gh auth login/.test(err)) throw new BoardError("gh ist nicht angemeldet: gh auth login");
  if (types.includes("INSUFFICIENT_SCOPES") || /required scopes|has not been granted/i.test(err)) throw missingScope("project");
  if (types.includes("RATE_LIMITED") || /rate limit/i.test(err)) {
    throw new BoardError("GitHub-Ratenlimit erreicht; es geht nach dem nächsten Zurücksetzen weiter");
  }
  if (write && errors.length) {
    const own = (path && errorAt(errors, path)) ?? errors[0];
    const typed = Boolean(own.type || own.extensions?.code) && !SERVER_TIMEOUT.test(own.message ?? "");
    const text = firstLine(own.message) || (typed ? "GitHub hat die Änderung abgelehnt" : "GitHub meldete einen Fehler ohne Text");
    throw failure(text, { write, unclear: !typed });
  }
  if (json?.data) return { json, warnings: errors.map((e) => firstLine(e.message)).filter(Boolean), errors };
  if (NOT_SENT.test(err) || SENT_FAILURE.test(err)) {
    throw failure(`GitHub nicht erreichbar: ${said}`, { write, unclear: !NOT_SENT.test(err) });
  }
  const status = Number(err.match(/\bHTTP (\d{3})\b/)?.[1]);
  if (status >= 500 || SERVER_TIMEOUT.test(err)) throw failure(`GitHub antwortete mit ${said}`, { write, unclear: true });
  const text = firstLine(errors[0]?.message) || said || `gh endete mit ${code}`;
  throw failure(text, { write, unclear: !(status >= 400) });
}

// How a project's view is read and drawn, by the shape its layout draws in
// (KINDS); null for a layout the board does not draw.
const PLANS = { board: boardPlan, table: tablePlan };
const planFor = (layout) => PLANS[kindOf({ source: "github", layout })?.shape] ?? null;

const gh = async (paths, args, options = {}) => readGh(await call("gh", args, null, GH_TIMEOUT, { ...options, paths }), options);

const prsReadKey = (view) => JSON.stringify([view.sections, view.limit]);

// The GitHub source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items when GitHub did not name the login, and
// per layout of a GitHub view how it loads (`hiddenFor(view)` gives its
// hidden columns) and how a board writes a move; and the items related to an
// issue, its parent, sub-issues and linked pull requests, read with its
// description (related.js says what `related` holds), and a pull request's
// details (pullRequest, the same); and an item's assignment (assign:
// actions/assign.js says what it holds), whose people are read once per repo
// and kept while the board runs (one that fails is not kept). A list keeps
// the login gh runs as while the board runs, as gh last named it. The PR
// tabs of all contexts read their shared sections together (together, and
// readPrs: a tab's load joins the read that runs).
// gh runs by the path `paths` (toolPaths) finds.
export function makeGithub(paths) {
  const people = readMemo();
  let login = null;
  let prsRead = null;

  // One read of the PR sections, for `view` and every tab that joins it:
  // its answer as it grows (json, errors, notified, pending: the ids whose
  // threads are still read), each step told to `steps`, done when whole.
  function readPrs(view) {
    const read = { key: prsReadKey(view), json: null, errors: [], asked: null, notified: null, pending: null, steps: new Set() };
    const step = () => read.steps.forEach((f) => f());
    read.done = (async () => {
      const notifications = gh(paths, githubNotificationsArgs(), { rest: true, ...what(view, "notifications") })
        .then(({ json }) => notifiedPrs(json))
        .catch((e) => ({ keys: null, unnamed: 0, why: errorText(e) }))
        .then((n) => (read.notified = n));
      login ??= await gh(paths, githubViewerArgs(), what(view, "login")).then((r) => r.json?.data?.viewer?.login ?? null, () => null);
      read.asked = login;
      const { json, errors } = await gh(paths, githubListArgs(view, read.asked), what(view, "list"));
      Object.assign(read, { json, errors });
      login = json?.data?.viewer?.login ?? login;
      const ids = moreThreadIds(json, view);
      read.pending = ids.length ? new Set(ids) : null;
      if (ids.length || !read.notified) step();
      for (let at = 0; at < ids.length; at += THREAD_IDS) {
        const chunk = ids.slice(at, at + THREAD_IDS);
        let page = null;
        let failed = null;
        try {
          page = await gh(paths, githubThreadsArgs(chunk), what(view, "threads"));
        } catch (e) {
          failed = errorText(e);
        }
        errors.push(...addThreads(json, view, chunk, page?.json ?? null, page?.errors ?? [], failed));
      }
      read.pending = null;
      if (ids.length && !read.notified) step();
      await notifications;
    })();
    const forget = () => prsRead === read && (prsRead = null);
    read.done.then(forget, forget);
    return read;
  }

  // The pages of `paged` for `view`, joined (addPage) into the first's
  // answer: { json, warnings (`before`'s first), errors (the first page's
  // GraphQL errors) }. One gh call each, named "<name>-page-<n>", its args
  // pageArgs of { after, count } (nextPage's; the first's { after: null,
  // count: 0 }), until GitHub has no more, the view's limit is read, or as
  // many calls ran as full pages would take to read it; before each page
  // after the first, the data so far (parse of json and errors) is drawn.
  async function readPages(paged, view, { live, parse, name, pageArgs, before = [] }) {
    const { json, warnings, errors } = await gh(paths, pageArgs({ after: null, count: 0 }), what(view, `${name}-page-1`));
    warnings.unshift(...before);
    const calls = Math.ceil(view.limit / PAGE);
    const pages = pageCount(paged, json, calls);
    for (let call = 1, next = nextPage(paged, json, view); next && call < calls; call++, next = nextPage(paged, json, view)) {
      live.partial(() => ({ data: { ...parse(json, errors), partial: true }, warnings: [...warnings] }));
      live.page(call + 1, Math.max(call + 1, pages));
      const page = await gh(paths, pageArgs(next), what(view, `${name}-page-${call + 1}`));
      addPage(paged, json, page.json, page.errors);
      warnings.push(...page.warnings);
    }
    return { json, warnings, errors };
  }

  // A project's view, of whichever layout: the project with its views and
  // fields (githubProjectArgs), which the board learns (live.project); then,
  // of the view it shows (the view's own, or for the view that learns them
  // the one it wants, else the first), its items' pages (readPages), read
  // as its layout's plan says (planFor), a view of a layout the board does
  // not draw reading none. Both reads are one load, so that the view's state,
  // progress, error and saved data stay those of one read; the board, which
  // knows what shows, names the view it goes on with. A board's move writes
  // the card's column (one layout's data may stand in another's view until
  // its read).
  const projectViews = {
    async load(view, { hiddenFor, live = NO_LIVE }) {
      // The hidden columns as the load starts: a change since reads again.
      let hidden = hiddenFor(view);
      const head = await gh(paths, githubProjectArgs(view), what(view, "project"));
      const project = parseGithubProject(head.json, view, head.errors);
      const meta = projectMeta(project);
      const { wanted = null } = view;
      const number = view.address.view ?? (project.views.some((v) => v.number === wanted) ? wanted : project.views[0]?.number);
      const shown = project.views.find((v) => v.number === number);
      if (!shown) {
        const why = view.address.view === null ? "hat keine Ansichten" : `hat keine Ansicht ${view.address.view} mehr`;
        throw Object.assign(new BoardError(`Projekt „${project.title}“ ${why}`), { project: meta });
      }
      const learnt = live.project(meta);
      const toPlan = planFor(shown.layout);
      if (learnt === false || !toPlan) return { data: { shape: "placeholder" }, warnings: head.warnings };
      const now = learnt ?? view;
      const plan = toPlan(project, shown);
      if (now !== view) hidden = hiddenFor(now);
      const parse = (json, errors) => plan.parse(json, now, hidden, errors);
      const pageArgs = (next) => (next.after === null ? githubItemsArgs(now, plan, hidden) : githubItemsPageArgs(now, plan, hidden, next.after, next.count));
      const { json, warnings, errors } = await readPages(PROJECT_ITEMS, now, { live, parse, name: "items", pageArgs, before: head.warnings });
      return { data: parse(json, errors), warnings };
    },
    async move(view, data, card, column) {
      checkMoveResult((await gh(paths, githubMoveArgs(data.meta, card, column), { write: true, path: MOVE_PATH, ...what(view, "move") })).json, card);
    },
  };

  // An Issues tab's view: its owner's repos once while the board runs (`r`
  // drops them: forget), then its search's pages (readPages).
  const issueRepos = readMemo();
  async function readIssueRepos(view) {
    const read = { org: false, repos: [] };
    let after = null;
    for (let call = 1; call <= REPOS_PAGES; call++) {
      const { json, errors } = await gh(paths, githubIssueReposArgs(view.owner, after), what(view, `repos-page-${call}`));
      const page = parseIssueRepos(json, view.owner, errors);
      Object.assign(read, { org: page.org, repos: [...read.repos, ...page.repos] });
      after = page.after;
      if (!after) break;
    }
    return read;
  }
  const issueViews = {
    async load(view, { live = NO_LIVE }) {
      const hidden = [...view.hideRepos];
      const { org, repos } = await issueRepos.get(foldedName(view.owner), () => readIssueRepos(view));
      const query = issuesQuery(view, org, hidden, repos);
      const parse = (json, errors) => parseGithubIssues(json, view, { repos, hidden, query }, errors);
      const pageArgs = (next) => githubIssuesArgs(view, query, next.count, next.after);
      const { json, warnings, errors } = await readPages(ISSUE_SEARCH, view, { live, parse, name: "issues", pageArgs });
      return { data: parse(json, errors), warnings };
    },
    forget: (view) => issueRepos.drop(foldedName(view.owner)),
  };

  const views = {
    board: projectViews,
    table: projectViews,
    roadmap: projectViews,
    issues: issueViews,
    list: {
      together: (all) => all.filter((v) => v.source === "github" && v.layout === "list"),
      async load(view, { live = NO_LIVE }) {
        if (prsRead?.key !== prsReadKey(view)) prsRead = readPrs(view);
        const read = prsRead;
        const notes = () => {
          if (read.notified?.keys === null) return [notifiedUnknown(read.notified.why)];
          return read.notified?.unnamed ? [notifiedUnnamed(read.notified.unnamed)] : [];
        };
        const result = () => {
          const data = parseGithubList(read.json, view, read.errors, { pending: read.pending, login: read.asked, notified: read.notified?.keys ?? null });
          return { data: read.notified ? data : { ...data, notifiedPending: true }, warnings: [...data.warnings, ...notes()] };
        };
        let failed = null;
        const step = () => {
          try {
            live.partial(result);
          } catch (e) {
            failed ??= e;
          }
        };
        read.steps.add(step);
        try {
          await read.done;
        } finally {
          read.steps.delete(step);
        }
        if (failed) throw failed;
        return result();
      },
    },
  };

  return {
    site: "GitHub",
    forget: (view) => views[view.layout]?.forget?.(view),
    noViewer: "GitHub hat nicht gesagt, als wer gh angemeldet ist",
    related: {
      reads: (item) => item.kind === "issue" && Number.isInteger(item.number) && item.repo.includes("/"),
      async load(item, view) {
        const { json, errors } = await gh(paths, githubRelatedArgs(item), what(view, "related"));
        return parseGithubRelated(json, item, view.owners, errors);
      },
    },
    pullRequest: {
      reads: (item) => item.kind === "pr" && Number.isInteger(item.number) && item.repo.includes("/"),
      async load(item, view) {
        const { json, errors } = await gh(paths, githubPullRequestArgs(item), what(view, "pull-request"));
        return parseGithubPullRequest(json, item, errors);
      },
    },
    assign: {
      refuse(item) {
        if (item.kind === "draft") return "Entwurf ohne Repo: erst in ein Issue umwandeln";
        if (!item.contentId || !ASSIGN[item.kind]) return "Auf diesen Eintrag hat gh keinen Zugriff";
        return null;
      },
      people: (item, view) => people.get(item.repo, () => gh(paths, githubAssignableArgs(item), what(view, "assignable")).then(({ json, errors }) => parseAssignable(json, item, errors))),
      // Without the list, GitHub names no one to assign but no one.
      fallbackMe: () => null,
      async write(view, item, person) {
        return checkAssigned((await gh(paths, githubAssignArgs(item, person), { write: true, path: assignPath(item), ...what(view, "assign") })).json, item, person);
      },
    },
    views,
  };
}
