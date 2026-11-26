// GitHub: the queries for a Projects v2 board and a pull request list, their
// parsing, the status mutation, what gh's answers and failures mean, and the
// source as the board uses it (makeGithub).

import { CONFIG_NAME, BoardError, DRAFT_REVIEW, NOTIFIED, PAGE, STATE_LOOKS, errorText, failure, firstLine, foldedName, otherLook, personName, readMemo, SECTION_TONES } from "../shared.js";
import { NO_LIVE } from "../loading.js";
import { GH_TIMEOUT, call, what } from "../tools.js";
import { repoOwnership } from "../kinds/list.js";

// Theme colors for GitHub's named colors: a Projects v2 option's and an
// issue type's (IssueTypeColor), which share the names.
const GITHUB_COLORS = {
  GRAY: "muted", BLUE: "ansi4", GREEN: "ansi2", YELLOW: "ansi3", ORANGE: "ansi11", RED: "ansi1", PINK: "ansi13", PURPLE: "ansi5",
};
export const NO_STATUS = "none";

// A filter term on the project field: GitHub's filters take the field's name
// in lower case, spaces as dashes, and values in quotes.
const fieldKey = (field) => field.toLowerCase().replace(/\s+/g, "-");
const quoted = (value) => `"${value.replace(/"/g, "")}"`;

const ITEM_FIELDS = `
  id
  fieldValueByName(name: $field) { ... on ProjectV2ItemFieldSingleSelectValue { optionId name } }
  priority: fieldValueByName(name: $priority) { ... on ProjectV2ItemFieldSingleSelectValue { name color } }
  content {
    __typename
    ... on Issue { id number title url issueType { name color } repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login name } } milestone { title }
      parent { number title repository { nameWithOwner } } subIssuesSummary { total completed } }
    ... on PullRequest { id number title url headRefName repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login name } } milestone { title }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } } }
    ... on DraftIssue { title creator { login } assignees(first: 5) { nodes { login name } } }
  }`;

// The view's filter with `term` added.
const filterWith = (view, term) => [view.filter, term].filter(Boolean).join(" ");

// The filter of a board's shown items: the view's, without the hidden
// columns.
function boardFilter(view, hidden) {
  const names = [...hidden];
  return filterWith(view, names.length ? `-${fieldKey(view.project.field)}:${names.map(quoted).join(",")}` : "");
}

// The items a board's query reads: the page after `read` items, from the
// cursor $after where `paged` (a page after the first; `read` may be 0
// there, after an empty first page), PAGE at most and no more than the
// view's limit leaves, with whether more follow and where they start.
function itemsSelection(view, read, paged) {
  const after = paged ? ", after: $after" : "";
  return `items(first: ${Math.min(PAGE, view.limit - read)}${after}, query: $filter) { totalCount pageInfo { hasNextPage endCursor } nodes { ${ITEM_FIELDS} } }`;
}

// A board's query: its variables after the ones every page has, what it
// reads besides the project (`head`), and what it reads of the project.
const boardQuery = (vars, head, project) => `query($login: String!, $number: Int!, $field: String!, $priority: String!, $filter: String!${vars}) {
${head}  repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        ${project}
      }
    }
  }
}`;

function boardArgs(view, hidden, doc) {
  const { owner, number, field, priorityField } = view.project;
  return [
    "api", "graphql", "-f", `query=${doc}`, "-f", `login=${owner}`, "-F", `number=${number}`, "-f", `field=${field}`, "-f", `priority=${priorityField}`,
    "-f", `filter=${boardFilter(view, hidden)}`,
  ];
}

// The hidden columns' counts (first: 0) are for the column menu.
export function githubBoardArgs(view, hidden) {
  const names = [...hidden];
  const key = fieldKey(view.project.field);
  const counts = names.map((_, i) => `\n        h${i}: items(first: 0, query: $h${i}) { totalCount }`).join("");
  const vars = names.map((_, i) => `, $h${i}: String!`).join("");
  const doc = boardQuery(vars, "  viewer { login }\n", `id title url
        field(name: $field) { ... on ProjectV2SingleSelectField { id name options { id name color } } }
        priorityField: field(name: $priority) { ... on ProjectV2SingleSelectField { id } }
        ${itemsSelection(view, 0, false)}${counts}`);
  return [...boardArgs(view, hidden, doc), ...names.flatMap((n, i) => ["-f", `h${i}=${filterWith(view, `${key}:${quoted(n)}`)}`])];
}

// One GraphQL request for the page of a board's items after the cursor
// `after`, `read` items read before it: the same items as the first page's
// query, nothing else.
export function githubBoardPageArgs(view, hidden, after, read) {
  return [...boardArgs(view, hidden, boardQuery(", $after: String!", "", itemsSelection(view, read, true))), "-f", `after=${after}`];
}

// Where a board's items stand in its answers.
const ITEMS_PATH = ["repositoryOwner", "projectV2", "items"];
const PRIORITY_FIELD_PATH = ["repositoryOwner", "projectV2", "priorityField"];

// The error that explains a page without its items: the deepest one on the
// way to them (the owner's, the project's, the items' own), else the
// page's first; null for none.
function pageError(errors) {
  const onTheWay = errors.filter((e) => Array.isArray(e.path) && e.path.every((p, i) => p === ITEMS_PATH[i]));
  return onTheWay.sort((a, b) => b.path.length - a.path.length)[0] ?? errors[0] ?? null;
}

// The board answer `json` (githubBoardArgs) with the items of the next
// page's answer `page` (githubBoardPageArgs, and its GraphQL errors)
// added, each item once (one that moved between two reads may come
// twice), and that page's pageInfo, which says whether more follow. A page
// without its items is explained by GitHub's error (pageError). One that
// says more follow but adds no item or names the same cursor again is taken
// for GitHub's paging stuck, and fails.
export function addBoardPage(json, page, errors = []) {
  const project = json.data.repositoryOwner.projectV2;
  const items = project.items;
  const next = page?.data?.repositoryOwner?.projectV2?.items;
  if (!Array.isArray(next?.nodes)) {
    const e = pageError(errors);
    throw new BoardError(e ? `Projekt „${project.title}“: ${firstLine(e.message)}` : `Projekt „${project.title}“ lieferte die Einträge nach den ersten ${items.nodes.length} nicht`);
  }
  const seen = new Set(items.nodes.map((n) => n?.id));
  const added = next.nodes.filter((n) => !seen.has(n?.id));
  if (next.pageInfo?.hasNextPage && (!added.length || next.pageInfo.endCursor === items.pageInfo.endCursor)) {
    throw new BoardError(`Projekt „${project.title}“: GitHub kam nach ${items.nodes.length} Einträgen nicht weiter`);
  }
  items.nodes.push(...added);
  items.pageInfo = next.pageInfo;
  return json;
}

// The page after the board answer `json`, { after, read } (its cursor and
// how many items came before it), where GitHub says one follows and the
// view's limit leaves room for it; else null. One that follows without a
// cursor to start from fails.
export function nextBoardPage(json, view) {
  const project = json?.data?.repositoryOwner?.projectV2;
  const items = project?.items;
  if (!Array.isArray(items?.nodes) || !items.pageInfo?.hasNextPage || items.nodes.length >= view.limit) return null;
  const after = items.pageInfo.endCursor;
  if (typeof after !== "string") throw new BoardError(`Projekt „${project.title}“: GitHub nannte nach ${items.nodes.length} Einträgen nicht, wo die nächsten beginnen`);
  return { after, read: items.nodes.length };
}

export function boardPages(json, view, calls) {
  const total = json?.data?.repositoryOwner?.projectV2?.items?.totalCount ?? 0;
  return Math.min(calls, Math.max(1, Math.ceil(Math.min(total, view.limit) / PAGE)));
}

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
  return { name: value.name, tone: GITHUB_COLORS[value.color] ?? "muted" };
}

const foreignMark = (owners, repo, flag = "foreign") => (repoOwnership(repo, owners) === "foreign" ? { [flag]: true } : {});

function githubCard(node, owners) {
  const c = node.content ?? {};
  const repo = c.repository?.nameWithOwner ?? "";
  return {
    key: node.id,
    itemId: node.id,
    source: "github",
    kind: c.__typename === "PullRequest" ? "pr" : c.__typename === "DraftIssue" ? "draft" : "issue",
    number: c.number ?? null,
    repo,
    repoShort: repo.split("/").pop(),
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
    priority: githubPriority(node.priority),
    sub: c.subIssuesSummary?.total ? { total: c.subIssuesSummary.total, done: c.subIssuesSummary.completed } : null,
    branch: c.headRefName ?? null,
    column: node.fieldValueByName?.optionId ?? NO_STATUS,
  };
}

// The GraphQL error whose path starts with `path`, or null.
export function errorAt(errors, path) {
  return errorsAt(errors, path)[0] ?? null;
}

// Every GraphQL error whose path starts with `path`.
export const errorsAt = (errors, path) => (errors ?? []).filter((e) => Array.isArray(e.path) && path.every((p, i) => e.path[i] === p));

export function parseGithubBoard(json, view, hidden, errors = []) {
  const { owner, number, field: fieldName } = view.project;
  const ownerNode = json?.data?.repositoryOwner;
  const why = (e) => firstLine(e.message);
  if (!ownerNode) {
    const e = errorAt(errors, ["repositoryOwner"]);
    throw new BoardError(e && e.type !== "NOT_FOUND" ? `GitHub: ${why(e)}` : `GitHub kennt „${owner}“ nicht`);
  }
  const project = ownerNode.projectV2;
  if (!project) {
    const e = errorAt(errors, ["repositoryOwner", "projectV2"]);
    if (e?.type === "NOT_FOUND") throw new BoardError(`Projekt ${number} von ${owner} nicht gefunden – project.number in ${CONFIG_NAME}.json prüfen`);
    throw new BoardError(e ? `Projekt ${number} von ${owner}: ${why(e)}` : `Projekt ${number} von ${owner} nicht gefunden oder kein Zugriff`);
  }
  const field = project.field;
  if (!field?.options) {
    const e = errorAt(errors, ["repositoryOwner", "projectV2", "field"]);
    throw new BoardError(e ? `Projekt „${project.title}“: ${why(e)}` : `Projekt „${project.title}“ hat kein Auswahlfeld „${fieldName}“`);
  }
  if (!Array.isArray(project.items?.nodes)) {
    const e = errorAt(errors, ITEMS_PATH);
    throw new BoardError(e ? `Projekt „${project.title}“: ${why(e)}` : `Projekt „${project.title}“ lieferte keine Einträge`);
  }
  const names = [...hidden];
  const columns = field.options.map((o) => ({
    id: o.id,
    name: o.name,
    color: GITHUB_COLORS[o.color] ?? "muted",
    hidden: hidden.has(o.name),
    count: hidden.has(o.name) ? project[`h${names.indexOf(o.name)}`]?.totalCount ?? null : 0,
    target: true,
    cards: [],
  }));
  const byId = new Map(columns.map((c) => [c.id, c]));
  const cards = project.items.nodes.map((node) => githubCard(node, view.owners)).map((c) => (byId.has(c.column) ? c : { ...c, column: NO_STATUS }));
  if (cards.some((c) => c.column === NO_STATUS)) {
    const none = { id: NO_STATUS, name: "Ohne Status", color: "dim", hidden: false, count: 0, target: false, cards: [] };
    columns.unshift(none);
    byId.set(NO_STATUS, none);
  }
  for (const card of cards) {
    const col = byId.get(card.column);
    col.cards.push(card);
    if (!col.hidden) col.count++;
  }
  return {
    shape: "board",
    meta: {
      projectId: project.id,
      fieldId: field.id,
      title: project.title,
      url: project.url,
      lacksPriorityField: !project.priorityField?.id && !errorAt(errors, PRIORITY_FIELD_PATH),
    },
    columns,
    total: project.items.totalCount,
    limited: project.items.pageInfo.hasNextPage,
    viewer: json?.data?.viewer?.login ?? null,
    read: project.items.nodes.length,
  };
}

// The mutation's field, and the path its own GraphQL errors carry.
const MOVE_FIELD = "updateProjectV2ItemFieldValue";
export const MOVE_PATH = [MOVE_FIELD];
export const MOVE_MUTATION = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  ${MOVE_FIELD}(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
    projectV2Item { id }
  }
}`;

// gh arguments that set a card's field to a column's option.
export function githubMoveArgs(meta, card, column) {
  return [
    "api", "graphql", "-f", `query=${MOVE_MUTATION}`, "-f", `project=${meta.projectId}`, "-f", `item=${card.itemId}`,
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
    repoShort: repo.split("/").pop(),
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
    repoShort: repo.split("/").pop(),
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

  return {
    site: "GitHub",
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
    views: {
      board: {
        // The first page, then each next one, one call each, until GitHub
        // has no more, the view's limit is read, or as many calls ran as
        // full pages would take to read it.
        async load(view, { hiddenFor, live = NO_LIVE }) {
          const hidden = hiddenFor(view);
          const { json, warnings, errors } = await gh(paths, githubBoardArgs(view, hidden), what(view, "board-page-1"));
          const calls = Math.ceil(view.limit / PAGE);
          const pages = boardPages(json, view, calls);
          for (let call = 1, next = nextBoardPage(json, view); next && call < calls; call++, next = nextBoardPage(json, view)) {
            live.partial(() => ({ data: { ...parseGithubBoard(json, view, hidden, errors), partial: true }, warnings: [...warnings] }));
            live.page(call + 1, Math.max(call + 1, pages));
            const page = await gh(paths, githubBoardPageArgs(view, hidden, next.after, next.read), what(view, `board-page-${call + 1}`));
            addBoardPage(json, page.json, page.errors);
            warnings.push(...page.warnings);
          }
          return { data: parseGithubBoard(json, view, hidden, errors), warnings };
        },
        async move(view, data, card, column) {
          checkMoveResult((await gh(paths, githubMoveArgs(data.meta, card, column), { write: true, path: MOVE_PATH, ...what(view, "move") })).json, card);
        },
      },
      list: {
        together: (views) => views.filter((v) => v.source === "github" && v.layout === "list"),
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
    },
  };
}
