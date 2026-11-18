// The "Arbeit" board: one's own work from GitHub (issues and pull requests on
// a Projects v2 board, open pull requests) and Azure Boards (work items), in
// the views that views.json beside this file defines. The leader's `b` shows
// or opens its tab. Keys and behaviour: README, "herdr app".
//
// views.json:
// - refreshMinutes (3), see Calls below.
// - views: [{ id, name, source: "github" | "azure", layout: "board" | "list",
//   hide?: [column names], limit?, start? }], and by kind (VIEW_KINDS):
//   a GitHub board has project { owner, number, field? ("Status") } and
//   filter? (a Projects filter such as "assignee:@me"); its columns are the
//   options of that single-select field. A GitHub list has sections
//   [{ name, query }], one GitHub search for pull requests each. An Azure
//   board has where? (a WIQL condition, default assigned to @Me),
//   hideCategories? (state categories to hide), organization? and project?
//   (az's configured defaults where missing) and on? (the machine az runs
//   on); its columns are the states of the work item types it finds. An Azure
//   view is listed only where az runs, is signed in and has the azure-devops
//   extension; otherwise the sidebar says why.
// - start: what the start dialog proposes: agent (a programs.json key),
//   machine, open ("space" | "tab"), checkout (the folder the session starts
//   in; ~ is that machine's home), message (the first message for issues and
//   work items) and review (for pull requests). Templates take {number}
//   {title} {url} {owner} {repo} {key}.
// - repos: { "<owner>/<repo>" (on Azure: the project): { any start field } }.
//   startSettings says which start applies; an Azure card starts from its
//   project's entry or from its view's start.checkout.
//
// Hidden columns are left out of the query; on GitHub the same request counts
// them for their stubs (Azure stubs show no count).
//
// Calls: a GitHub view costs one gh call per refresh, an Azure view one az
// call, plus up to two more (az's defaults and the work item types) on its
// first load and after each `r`. A view refreshes when the board opens, on
// `r`, after `x`, when it is shown again older than refreshMinutes, and every
// refreshMinutes while its tab shows. Opening the board and `r` also try the
// Azure views not shown, to learn whether they are available, and the timer
// tries an unavailable view again every refreshMinutes.
//
// The data logic is plain exported functions at the top, tested by
// tests/herdr-app/board.test.mjs with node; it lives in this file because a
// stowed mod is one main.js (README, "herdr app").

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import {
  appHome, checking, exec, knownAgents, machines, nextCommand, notify, panes, readTextFile, run, settings, spaces, theme,
} from "herdr";

export const MOD = "board";
// The config's base name; the extension is added where the path is built.
const CONFIG_NAME = "views";

// ---------------------------------------------------------------------------
// Data: config, queries, parsing, board state. No host calls until the UI
// section.
// ---------------------------------------------------------------------------

export class BoardError extends Error {
  // unavailable: the view's tool is missing, not signed in or without its
  // extension, so the view is left out of the list rather than shown with an
  // error. unclear: a write may or may not have landed.
  constructor(message, { unavailable = false, unclear = false } = {}) {
    super(message);
    this.unavailable = unavailable;
    this.unclear = unclear;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const textList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const firstLine = (text) => String(text ?? "").trim().split("\n")[0];

// The message to show for an error: a BoardError's own, else marked as
// unexpected.
export const errorText = (e) => (e instanceof BoardError ? e.message : `Unerwarteter Fehler: ${firstLine(e?.message ?? e)}`);

// ---- views.json ------------------------------------------------------------

export const START_DEFAULTS = { agent: null, machine: null, open: "space", checkout: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
// Keys of the start that made a worktree or set the status; the agent's own
// skills do both now.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const TOP_KEYS = ["refreshMinutes", "start", "repos", "views"];

function startProblems(start, where) {
  if (start === undefined) return [];
  if (!isObject(start)) return [`„${where}“ muss ein Objekt sein`];
  const out = [];
  for (const [key, value] of Object.entries(start)) {
    if (GONE_START.includes(key)) out.push(`„${where}.${key}“ ${GONE}`);
    else if (!START_KEYS.includes(key)) out.push(`„${where}.${key}“ gibt es nicht`);
    else if (value !== null && typeof value !== "string") out.push(`„${where}.${key}“ muss Text sein`);
  }
  if (start.open !== undefined && start.open !== "space" && start.open !== "tab") out.push(`„${where}.open“ ist "space" oder "tab"`);
  return out;
}

const textOrNull = (v, keys) => keys.filter((k) => v[k] !== undefined && v[k] !== null && typeof v[k] !== "string").map((k) => `„${k}“ muss Text sein`);

// Every view has these keys; each kind adds its own (VIEW_KINDS).
const COMMON_KEYS = ["id", "name", "source", "layout", "hide", "limit", "start"];

// Per view kind ("<source> <layout>"): its own keys, what is wrong with them,
// and the view with its defaults filled in.
const VIEW_KINDS = {
  "github board": {
    keys: ["project", "filter"],
    problems(v) {
      const p = v.project;
      const out = [];
      if (!isObject(p) || !isText(p.owner) || !Number.isInteger(p.number) || p.number < 1) {
        out.push("„project“ braucht „owner“ (Text) und „number“ (ganze Zahl)");
      } else if (p.field !== undefined && !isText(p.field)) out.push("„project.field“ muss Text sein");
      return [...out, ...textOrNull(v, ["filter"])];
    },
    defaults: (v) => ({
      project: { owner: v.project.owner, number: v.project.number, field: v.project.field ?? "Status" },
      filter: v.filter ?? "",
      limit: v.limit ?? 100,
    }),
  },
  "github list": {
    keys: ["sections"],
    problems: (v) =>
      Array.isArray(v.sections) && v.sections.length && v.sections.every((s) => isObject(s) && isText(s.name) && isText(s.query))
        ? []
        : ["„sections“ braucht Einträge mit „name“ und „query“"],
    defaults: (v) => ({ sections: v.sections.map((s) => ({ name: s.name, query: s.query })), limit: v.limit ?? 50 }),
  },
  "azure board": {
    keys: ["where", "hideCategories", "organization", "project", "on"],
    problems: (v) => textOrNull(v, ["where", "organization", "project", "on"]),
    defaults: (v) => ({
      where: v.where ?? "[System.AssignedTo] = @Me",
      hideCategories: v.hideCategories ?? [],
      organization: v.organization ?? null,
      project: v.project ?? null,
      on: v.on ?? null,
      limit: v.limit ?? 100,
    }),
  },
};

function viewProblems(v) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (!isText(v.name)) out.push("„name“ fehlt");
  if (v.source !== "github" && v.source !== "azure") out.push("„source“ ist \"github\" oder \"azure\"");
  if (v.layout !== "board" && v.layout !== "list") out.push("„layout“ ist \"board\" oder \"list\"");
  if (v.source === "azure" && v.layout === "list") out.push("Azure-Ansichten sind Boards (\"layout\": \"board\")");
  const kind = VIEW_KINDS[`${v.source} ${v.layout}`];
  if (!kind) return out;
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (key === "on" && v.source === "github") out.push("„on“ gilt nur für Azure-Ansichten");
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  for (const key of ["hide", "hideCategories"]) {
    if (v[key] !== undefined && !textList(v[key])) out.push(`„${key}“ muss eine Liste von Texten sein`);
  }
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 100)) out.push("„limit“ ist eine ganze Zahl von 1 bis 100");
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v) {
  const common = { id: v.id, name: v.name, source: v.source, layout: v.layout, hide: v.hide ?? [], start: v.start ?? {}, hideCategories: [], on: null };
  return { ...common, ...VIEW_KINDS[`${v.source} ${v.layout}`].defaults(v) };
}

// views.json as text (null: there is none) → { config, errors }. A view with
// problems is left out and each problem is listed; config is null only when
// nothing usable is left.
export function readConfig(text) {
  if (text === null || text === undefined) return { config: null, errors: [`${CONFIG_NAME}.json fehlt im Ordner der Mod`] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { config: null, errors: [`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`] };
  }
  return validateConfig(raw);
}

export function validateConfig(raw) {
  if (!isObject(raw)) return { config: null, errors: ["Oben muss ein Objekt stehen"] };
  const errors = Object.keys(raw).filter((k) => !TOP_KEYS.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  let refreshMinutes = raw.refreshMinutes ?? 3;
  if (typeof refreshMinutes !== "number" || !(refreshMinutes >= 1)) {
    errors.push("„refreshMinutes“ ist eine Zahl ab 1");
    refreshMinutes = 3;
  }
  const startErrors = startProblems(raw.start, "start");
  errors.push(...startErrors);
  const repos = {};
  if (raw.repos !== undefined && !isObject(raw.repos)) errors.push("„repos“ muss ein Objekt sein");
  for (const [name, entry] of Object.entries(isObject(raw.repos) ? raw.repos : {})) {
    const problems = startProblems(entry, `repos.${name}`);
    if (problems.length) errors.push(...problems);
    else repos[name] = entry;
  }
  const views = [];
  if (!Array.isArray(raw.views) || !raw.views.length) errors.push("„views“ braucht mindestens eine Ansicht");
  const ids = new Set();
  (Array.isArray(raw.views) ? raw.views : []).forEach((v, i) => {
    const where = `Ansicht ${i + 1}${isText(v?.name) ? ` („${v.name}“)` : ""}`;
    const problems = viewProblems(v);
    if (!problems.length && ids.has(v.id)) problems.push(`„id“ ${v.id} gibt es schon`);
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    ids.add(v.id);
    views.push(normalizeView(v));
  });
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: views.length ? { refreshMinutes, start, repos, views } : null, errors };
}

// The start for an item: the defaults, then views.json's start, then the
// view's start, then the repo's entry in repos; a later one wins.
export function startSettings(config, view, repo) {
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...(config.repos[repo] ?? {}) };
}

// ---- Hidden columns --------------------------------------------------------

// The stored toggles of a view, { hide: [names], show: [names] }, or null when
// what was stored is not that.
export function readStoredHidden(value) {
  return isObject(value) && textList(value.hide) && textList(value.show) ? { hide: [...value.hide], show: [...value.show] } : null;
}

// The hidden columns: the view's hide (and on Azure the columns of a category
// in hideCategories), plus what the person hid, minus what they showed.
export function hiddenColumns(view, stored, columns = []) {
  const hidden = new Set(view.hide);
  for (const c of columns) if (c.category && view.hideCategories.includes(c.category)) hidden.add(c.name);
  const own = readStoredHidden(stored);
  for (const name of own?.hide ?? []) hidden.add(name);
  for (const name of own?.show ?? []) hidden.delete(name);
  return hidden;
}

// The stored toggles after hiding or showing a column: only what differs from
// the view's defaults, so a later edit to hide takes effect. A column that
// takes no drops ("Ohne Status") cannot be hidden: unchanged.
export function toggleHidden(view, stored, column, columns) {
  if (!column?.target) return stored;
  const own = readStoredHidden(stored) ?? { hide: [], show: [] };
  const byDefault = hiddenColumns(view, null, columns).has(column.name);
  const hideNow = !hiddenColumns(view, own, columns).has(column.name);
  const next = { hide: own.hide.filter((n) => n !== column.name), show: own.show.filter((n) => n !== column.name) };
  if (hideNow !== byDefault) (hideNow ? next.hide : next.show).push(column.name);
  return next;
}

// Names in a view's hide that match none of `columns` (on Azure: every state
// of the project's work item types, shown or not), and names in
// hideCategories that are no Azure state category.
export function unknownHidden(view, columns) {
  const names = new Set(columns.map((c) => c.name));
  return [...view.hide.filter((n) => !names.has(n)), ...view.hideCategories.filter((c) => !CATEGORIES.includes(c))];
}

// ---- GitHub ----------------------------------------------------------------

// Theme colors for a Projects v2 option color.
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
  content {
    __typename
    ... on Issue { number title url issueType { name } repository { nameWithOwner }
      labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } }
      parent { number } subIssuesSummary { total completed } }
    ... on PullRequest { number title url headRefName repository { nameWithOwner }
      labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } } }
    ... on DraftIssue { title assignees(first: 5) { nodes { login } } }
  }`;

// One GraphQL request for a board view: the project, its field's options and
// the items of the shown columns, plus one count per hidden column (`h0`,
// `h1`, … aliases, first: 0) for the stubs.
export function githubBoardArgs(view, hidden) {
  const { owner, number, field } = view.project;
  const names = [...hidden];
  const key = fieldKey(field);
  const filter = [view.filter, names.length ? `-${key}:${names.map(quoted).join(",")}` : ""].filter(Boolean).join(" ");
  const counts = names.map((_, i) => `h${i}: items(first: 0, query: $h${i}) { totalCount }`).join("\n");
  const vars = names.map((_, i) => `, $h${i}: String!`).join("");
  const doc = `query($login: String!, $number: Int!, $field: String!, $filter: String!${vars}) {
  repositoryOwner(login: $login) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        id title url
        field(name: $field) { ... on ProjectV2SingleSelectField { id name options { id name color } } }
        items(first: ${view.limit}, query: $filter) { totalCount pageInfo { hasNextPage } nodes { ${ITEM_FIELDS} } }
        ${counts}
      }
    }
  }
}`;
  return [
    "api", "graphql", "-f", `query=${doc}`, "-f", `login=${owner}`, "-F", `number=${number}`, "-f", `field=${field}`,
    "-f", `filter=${filter}`,
    ...names.flatMap((n, i) => ["-f", `h${i}=${[view.filter, `${key}:${quoted(n)}`].filter(Boolean).join(" ")}`]),
  ];
}

function githubCard(node) {
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
    title: c.title ?? "(kein Zugriff)",
    url: c.url ?? null,
    labels: (c.labels?.nodes ?? []).map((l) => l.name),
    assignees: (c.assignees?.nodes ?? []).map((a) => a.login),
    type: c.issueType?.name ?? null,
    parent: c.parent?.number ?? null,
    sub: c.subIssuesSummary?.total ? { total: c.subIssuesSummary.total, done: c.subIssuesSummary.completed } : null,
    branch: c.headRefName ?? null,
    column: node.fieldValueByName?.optionId ?? NO_STATUS,
  };
}

// The GraphQL error whose path starts with `path`, or null.
export function errorAt(errors, path) {
  return (errors ?? []).find((e) => Array.isArray(e.path) && path.every((p, i) => e.path[i] === p)) ?? null;
}

// gh's answer for githubBoardArgs (and the GraphQL errors that came with its
// data) → a board:
// { kind: "board", meta, columns: [{ id, name, color, hidden, count, target, cards }], total, limited }.
// A hidden column's cards are only those moved there since the last refresh;
// its count is the server's plus those. Items without a status, or in an
// option the field no longer has, go to "Ohne Status", which takes no drops.
// A part missing from the answer is explained by the error at its path.
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
  if (!field?.options) throw new BoardError(`Projekt „${project.title}“ hat kein Auswahlfeld „${fieldName}“`);
  if (!Array.isArray(project.items?.nodes)) {
    const e = errorAt(errors, ["repositoryOwner", "projectV2", "items"]);
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
  const cards = project.items.nodes.map(githubCard).map((c) => (byId.has(c.column) ? c : { ...c, column: NO_STATUS }));
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
    kind: "board",
    meta: { projectId: project.id, fieldId: field.id, title: project.title, url: project.url },
    columns,
    total: project.items.totalCount,
    limited: project.items.pageInfo.hasNextPage,
  };
}

export const MOVE_MUTATION = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
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
  if (json?.data?.updateProjectV2ItemFieldValue?.projectV2Item?.id !== card.itemId) {
    throw new BoardError("Ergebnis unklar: GitHub hat die Änderung nicht bestätigt", { unclear: true });
  }
}

const PR_FIELDS = `
  issueCount
  nodes {
    ... on PullRequest {
      id number title url isDraft createdAt updatedAt headRefName reviewDecision
      repository { nameWithOwner } author { login }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 0) {
        checkRunCountsByState { state count } statusContextCountsByState { state count } } } } } }
    }
  }`;

// One GraphQL request for a list view: one search per section (`s0`, `s1`, …).
export function githubListArgs(view) {
  const searches = view.sections.map((_, i) => `s${i}: search(type: ISSUE, first: ${view.limit}, query: $q${i}) { ${PR_FIELDS} }`);
  const vars = view.sections.map((_, i) => `$q${i}: String!`).join(", ");
  const doc = `query(${vars}) {\n${searches.join("\n")}\n}`;
  return ["api", "graphql", "-f", `query=${doc}`, ...view.sections.flatMap((s, i) => ["-f", `q${i}=${s.query}`])];
}

// Check counts by GitHub's states, check runs and status contexts together.
const CHECK_KIND = {
  SUCCESS: "passed", FAILURE: "failed", ERROR: "failed", TIMED_OUT: "failed", CANCELLED: "failed", STARTUP_FAILURE: "failed",
  ACTION_REQUIRED: "failed", IN_PROGRESS: "pending", PENDING: "pending", QUEUED: "pending", WAITING: "pending", EXPECTED: "pending",
  SKIPPED: "skipped", NEUTRAL: "skipped", STALE: "skipped",
};

export function checksSummary(rollup) {
  const n = { passed: 0, failed: 0, pending: 0, skipped: 0 };
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
export const reviewLabel = (decision, draft) => (draft ? "Entwurf" : REVIEW[decision] ?? "");

// gh's answer for githubListArgs (and the GraphQL errors that came with its
// data) → { kind: "list", sections: [{ name, count, limited, skipped, rows }] }.
// A pull request found by two sections shows in the first only; a result
// that is no pull request is counted in skipped. A search missing from the
// answer is explained by the error at its alias.
export function parseGithubList(json, view, errors = []) {
  const seen = new Set();
  const sections = view.sections.map((s, i) => {
    const found = json?.data?.[`s${i}`];
    if (!Array.isArray(found?.nodes)) {
      const e = errorAt(errors, [`s${i}`]);
      throw new BoardError(e ? `Die Suche „${s.query}“: ${firstLine(e.message)}` : `Die Suche „${s.query}“ fehlt in GitHubs Antwort`);
    }
    const rows = [];
    let skipped = 0;
    for (const pr of found.nodes) {
      if (!pr?.id) {
        skipped++;
        continue;
      }
      if (seen.has(pr.id)) continue;
      seen.add(pr.id);
      const repo = pr.repository.nameWithOwner;
      rows.push({
        key: pr.id,
        source: "github",
        kind: "pr",
        number: pr.number,
        repo,
        repoShort: repo.split("/").pop(),
        title: pr.title,
        url: pr.url,
        author: pr.author?.login ?? "?",
        draft: pr.isDraft,
        review: reviewLabel(pr.reviewDecision, pr.isDraft),
        checks: checksSummary(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup ?? null),
        updatedAt: pr.updatedAt,
        createdAt: pr.createdAt,
        branch: pr.headRefName,
        labels: [],
        assignees: [],
      });
    }
    return { name: s.name, count: found.issueCount, limited: found.issueCount > found.nodes.length, skipped, rows };
  });
  return { kind: "list", sections };
}

// gh's network failures, as Go's net package and gh word them; the first
// kind means the request never reached GitHub.
const NOT_SENT = /could not resolve host|no such host|connection refused/i;
const NETWORK = /could not resolve host|no such host|connection refused|dial tcp|connection reset|i\/o timeout|Client\.Timeout|\bEOF\b/i;

// A gh call that ran, { code, stdout, stderr } → { json, warnings, errors },
// or a BoardError. gh exits 1 whenever GraphQL's answer holds errors, even
// next to data. Errors that make the answer useless (login, scope, rate
// limit) throw; with data, the others come back as warnings, and the raw
// errors for the parser to explain a missing part.
// With `write`, any GraphQL error is a refusal carrying its message (the one
// whose path names the mutation first), and a failure that may have reached
// GitHub (a network error after sending, HTTP 5xx, an unreadable answer) is
// unclear.
export function readGh({ code, stdout, stderr }, { write = false } = {}) {
  const err = String(stderr ?? "");
  const said = firstLine(err.replace(/^gh: /gm, ""));
  const unclear = (text) => new BoardError(`Ergebnis unklar: ${text}`, { unclear: true });
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Not JSON: what went wrong is on stderr.
  }
  if (code === 0 && json === null) throw write ? unclear("gh antwortete ohne lesbares JSON") : new BoardError("gh antwortete ohne lesbares JSON");
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  const types = errors.map((e) => e.type);
  if (code === 4 || /gh auth login/.test(err)) throw new BoardError("gh ist nicht angemeldet: gh auth login");
  if (types.includes("INSUFFICIENT_SCOPES") || /required scopes|has not been granted/i.test(err)) {
    throw new BoardError("Dem gh-Token fehlt der Scope „project“: gh auth refresh -s project");
  }
  if (types.includes("RATE_LIMITED") || /rate limit/i.test(err)) {
    throw new BoardError("GitHub-Ratenlimit erreicht; es geht nach dem nächsten Zurücksetzen weiter");
  }
  if (write && errors.length) {
    const own = errors.find((e) => Array.isArray(e.path) && e.path[0] === "updateProjectV2ItemFieldValue") ?? errors[0];
    throw new BoardError(firstLine(own.message) || "GitHub hat die Änderung abgelehnt");
  }
  if (json?.data) return { json, warnings: errors.map((e) => firstLine(e.message)).filter(Boolean), errors };
  if (NETWORK.test(err)) {
    if (write && !NOT_SENT.test(err)) throw unclear(`GitHub nicht erreichbar: ${said}`);
    throw new BoardError(`GitHub nicht erreichbar: ${said}`);
  }
  const status = Number(err.match(/\bHTTP (\d{3})\b/)?.[1]);
  if (status >= 500) throw write ? unclear(`GitHub antwortete mit ${said}`) : new BoardError(`GitHub antwortete mit ${said}`);
  throw new BoardError(firstLine(errors[0]?.message) || said || `gh endete mit ${code}`);
}

// ---- Azure -----------------------------------------------------------------

// Theme colors and column order for Azure's state categories.
const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

// The fields read here are all `System.` ones; they are read through this so
// the prefix stays in one place.
const SYSTEM = "System.";
const field = (fields, name) => fields?.[SYSTEM + name];
const FIELDS = ["Id", "Title", "State", "WorkItemType", "AssignedTo", "Tags", "TeamProject"].map((f) => `[${SYSTEM}${f}]`).join(", ");

// --detect false: use az's configured defaults, never the git remote of
// whatever folder herdr runs az in.
const azScope = (view, withProject = true) => [
  "--detect", "false",
  ...(view.organization ? ["--org", view.organization] : []),
  ...(withProject && view.project ? ["--project", view.project] : []),
];

export const azureDefaultsArgs = () => ["devops", "configure", "--list"];

// `az devops configure --list` → { organization, project } (null when unset).
export function parseAzureDefaults(stdout) {
  const value = (name) => String(stdout ?? "").match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "m"))?.[1] || null;
  return { organization: value("organization"), project: value("project") };
}

export function azureTypesArgs(view, project) {
  return ["devops", "invoke", "--area", "wit", "--resource", "workitemtypes", "--route-parameters", `project=${project}`,
    "-o", "json", ...azScope(view, false)];
}

// The work item types' answer → { states: [{ id, name, category, color }] in
// category order, types: { [type]: [state names] } }.
export function parseAzureTypes(stdout) {
  const types = {};
  const states = new Map();
  const value = JSON.parse(stdout)?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  for (const type of value) {
    types[type.name] = (type.states ?? []).map((s) => s.name);
    for (const s of type.states ?? []) {
      if (!states.has(s.name)) states.set(s.name, { id: s.name, name: s.name, category: s.category, color: CATEGORY_COLORS[s.category] ?? "muted" });
    }
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return { states: [...states.values()].sort((a, b) => order(a) - order(b)), types };
}

const wiqlText = (value) => `'${value.replace(/'/g, "''")}'`;

export function azureQueryArgs(view, hidden) {
  const names = [...hidden];
  const without = names.length ? ` AND [${SYSTEM}State] NOT IN (${names.map(wiqlText).join(", ")})` : "";
  const wiql = `SELECT ${FIELDS} FROM WorkItems WHERE (${view.where})${without} ORDER BY [${SYSTEM}ChangedDate] DESC`;
  return ["boards", "query", "--wiql", wiql, "-o", "json", ...azScope(view)];
}

// The web page of a work item from its API url and project:
// https://dev.azure.com/<org>[/<project id>]/_apis/wit/workItems/<id>
// → https://dev.azure.com/<org>/<project>/_workitems/edit/<id>.
export function azureWebUrl(apiUrl, project, id) {
  if (!apiUrl || !apiUrl.includes("/_apis/")) return null;
  const base = apiUrl.split("/_apis/")[0].replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
  return `${base}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

const personName = (who) => (typeof who === "string" ? who.replace(/\s*<[^>]*>$/, "") : who?.displayName ?? null);

// `az boards query` output → a board whose columns are the states of the work
// item types it found, in category order; without work items it has none. az
// prints nothing at all when nothing matches. meta.types holds each type's
// states, the columns its cards may go to; meta.states all the types' states.
export function parseAzureBoard(stdout, types, hidden) {
  const items = String(stdout ?? "").trim() ? JSON.parse(stdout) : [];
  const cards = items.map((item) => {
    const f = item.fields ?? {};
    const project = field(f, "TeamProject") ?? "";
    const id = field(f, "Id") ?? item.id;
    return {
      key: `az-${id}`,
      source: "azure",
      kind: "workitem",
      number: id,
      repo: project,
      repoShort: project,
      title: field(f, "Title") ?? "",
      url: azureWebUrl(item.url, project, id),
      labels: String(field(f, "Tags") ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      assignees: [personName(field(f, "AssignedTo"))].filter(Boolean),
      type: field(f, "WorkItemType") ?? null,
      parent: null,
      sub: null,
      branch: null,
      column: field(f, "State") ?? "",
    };
  });
  const present = new Set(cards.map((c) => c.type));
  const wanted = new Set(Object.entries(types.types).filter(([t]) => present.has(t)).flatMap(([, s]) => s));
  const columns = types.states
    .filter((s) => wanted.has(s.name))
    .map((s) => ({ ...s, hidden: hidden.has(s.name), count: hidden.has(s.name) ? null : 0, target: true, cards: [] }));
  const byName = new Map(columns.map((c) => [c.name, c]));
  for (const card of cards) {
    let col = byName.get(card.column);
    if (!col) {
      col = { id: card.column, name: card.column, category: null, color: "muted", hidden: false, count: 0, target: true, cards: [] };
      columns.push(col);
      byName.set(col.name, col);
    }
    col.cards.push(card);
    if (!col.hidden) col.count++;
  }
  return { kind: "board", meta: { types: types.types, states: types.states }, columns, total: cards.length, limited: false };
}

export function azureMoveArgs(view, card, column) {
  return ["boards", "work-item", "update", "--id", String(card.number), "--state", column.name, "-o", "json", ...azScope(view, false)];
}

export const AZ_NO_PROJECT = "Azure-Projekt fehlt: „project“ in der Ansicht oder az devops configure --defaults project=…";
// az's (Python requests') words for a connection that failed on the way.
const AZ_NETWORK = /HTTPSConnectionPool|Connection aborted|Read timed out|Max retries/i;

// What went wrong with an az call that ran, from its ERROR: line (WARNING:
// lines are left out). Missing sign-in or extension make the view
// unavailable rather than an error. With `write`, a connection that failed
// on the way leaves open whether the change landed; a TFxxxx or other
// ERROR: answer is a refusal.
export function azFailure({ code, stderr }, on = null, { write = false } = {}) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const said = (lines.find((l) => /^ERROR:/.test(l)) ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim();
  const az = on ? `az auf ${on}` : "az";
  if (AZ_NETWORK.test(lines.join("\n"))) {
    const text = `Azure nicht erreichbar (${az}): ${said}`;
    return write ? new BoardError(`Ergebnis unklar: ${text}`, { unclear: true }) : new BoardError(text);
  }
  if (/Before you can run Azure DevOps commands|az (devops )?login/i.test(said)) {
    return new BoardError(`${az} ist nicht angemeldet (az login oder az devops login)`, { unavailable: true });
  }
  if (/'(boards|devops)' is misspelled or not recognized|is not in the 'az' command group/.test(said)) {
    return new BoardError(`${az}: die Erweiterung azure-devops fehlt (az extension add --name azure-devops)`, { unavailable: true });
  }
  if (/^--project must be specified/.test(said)) return new BoardError(AZ_NO_PROJECT);
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return new BoardError(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`);
}

// An exec that could not run at all (exec rejected). Only a missing az makes
// its view unavailable; an unreachable machine or a failed start is an error.
// With `write`, a timeout, or any other failure of a call on another machine,
// leaves open whether the change landed; a program that is not installed
// changed nothing.
export function execRejection(tool, error, timeoutMs, on = null, { write = false } = {}) {
  const msg = firstLine(error?.message ?? error);
  const who = on ? `${tool} auf ${on}` : tool;
  const unclear = (text) => new BoardError(`Ergebnis unklar: ${text}`, { unclear: true });
  if (/program not found|no such file or directory|command not found|not installed|ENOENT/i.test(msg)) {
    return new BoardError(`${who} ist nicht installiert`, { unavailable: tool === "az" });
  }
  if (/time(d)?[ -]?out/i.test(msg)) {
    const text = `${who} antwortete nicht in ${Math.round(timeoutMs / 1000)} s`;
    return write ? unclear(text) : new BoardError(text);
  }
  if (write && on) return unclear(`${who}: ${msg}`);
  return new BoardError(`${who} ließ sich nicht starten: ${msg}`);
}

// ---- Board state -----------------------------------------------------------

const cloneBoard = (board) => ({ ...board, columns: board.columns.map((c) => ({ ...c, cards: [...c.cards] })) });

export function findCard(board, key) {
  for (const col of board?.columns ?? []) {
    const card = col.cards.find((c) => c.key === key);
    if (card) return { card, column: col };
  }
  return null;
}

// A new board with the card in another column; counts follow (a hidden
// column's count, where it has one, is the server's plus what was moved in).
// Unchanged when the card or column is unknown, or the card is there already.
export function moveCard(board, key, columnId) {
  const found = findCard(board, key);
  if (!found || !board.columns.some((c) => c.id === columnId) || found.column.id === columnId) return board;
  const next = cloneBoard(board);
  const from = next.columns.find((c) => c.id === found.column.id);
  const to = next.columns.find((c) => c.id === columnId);
  from.cards = from.cards.filter((c) => c.key !== key);
  if (from.count !== null) from.count--;
  to.cards.push({ ...found.card, column: columnId });
  if (to.count !== null) to.count++;
  return next;
}

// A failed move undone: the card goes back to move.from, unless it has moved
// on since.
export function rollback(board, move) {
  return findCard(board, move.key)?.column.id === move.to ? moveCard(board, move.key, move.from) : board;
}

// Moves laid over every refresh: those still being written, and confirmed
// ones until a refresh that started after the confirmation shows them.
export function pendingMoves(moves, started) {
  return moves.filter((m) => !m.confirmedAt || m.confirmedAt >= started);
}

export function applyMoves(board, moves) {
  return moves.reduce((b, m) => moveCard(b, m.key, m.to), board);
}

// Whether a card may go to a column: one that takes drops and, where the
// board knows its types' states (Azure; GitHub boards carry none), a state of
// the card's own type.
export function canDrop(board, card, column) {
  if (!column?.target) return false;
  const states = board.meta?.types?.[card.type];
  return !states || states.includes(column.name);
}

export const targetsFor = (board, card) => board.columns.filter((c) => canDrop(board, card, c));

// The column H (step -1) or L (+1) moves a card to: the next shown column,
// stubs included, the card may go to; null at the edge.
export function stepTarget(board, columns, key, step) {
  const found = findCard(board, key);
  if (!found) return null;
  for (let i = columns.findIndex((c) => c.id === found.column.id) + step; i >= 0 && i < columns.length; i += step) {
    if (canDrop(board, found.card, columns[i])) return columns[i];
  }
  return null;
}

// A view's columns with the person's hidden set applied.
export function withHidden(board, hidden) {
  return { ...board, columns: board.columns.map((c) => ({ ...c, hidden: hidden.has(c.name) })) };
}

// Cards whose text holds every word of the filter, case-insensitive.
export function matches(card, text) {
  const words = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [card.title, card.number !== null ? `#${card.number}` : "", itemKey(card), card.repo, card.type, card.author, card.branch,
    ...(card.labels ?? []), ...(card.assignees ?? [])].filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// The columns as the board shows them: hidden ones as stubs (no cards), the
// others with the filtered cards.
export function shownColumns(board, filter) {
  return (board?.columns ?? []).map((c) => ({ ...c, shown: c.hidden ? [] : c.cards.filter((card) => matches(card, filter)) }));
}

// Keyboard movement: sel = { col, key } (key null on a stub or an empty
// column) → the next sel. "up"/"down" move within the column, "left"/"right"
// to the next column (stubs too), keeping the row where they can. A list is
// one column.
export function navigate(columns, sel, dir) {
  if (!columns.length) return { col: 0, key: null };
  let ci = Math.min(Math.max(sel?.col ?? 0, 0), columns.length - 1);
  const cards = (i) => columns[i].shown;
  let row = Math.max(0, cards(ci).findIndex((c) => c.key === sel?.key));
  if (dir === "up" || dir === "down") {
    const list = cards(ci);
    if (!list.length) return { col: ci, key: null };
    row = Math.min(Math.max(row + (dir === "up" ? -1 : 1), 0), list.length - 1);
    return { col: ci, key: list[row].key };
  }
  if (dir === "left" || dir === "right") ci = Math.min(Math.max(ci + (dir === "left" ? -1 : 1), 0), columns.length - 1);
  const list = cards(ci);
  return { col: ci, key: list.length ? list[Math.min(row, list.length - 1)].key : null };
}

// The selection after new data or a filter: its card's column again, else the
// first card; a selected stub or empty column stays selected.
export function selectionAfter(columns, sel) {
  const at = columns.findIndex((c) => c.shown.some((card) => card.key === sel?.key));
  if (at >= 0) return { col: at, key: sel.key };
  if (!sel?.key && columns[sel?.col]) return sel;
  const first = columns.findIndex((c) => c.shown.length);
  return first >= 0 ? { col: first, key: columns[first].shown[0].key } : { col: 0, key: null };
}

// ---- Times -----------------------------------------------------------------

export function updatedLabel(at, now) {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`;
  return `vor ${Math.floor(s / 3600)} h`;
}

// A day label for a past moment, by local calendar days.
export function ageLabel(iso, now) {
  const then = new Date(iso), today = new Date(now);
  if (Number.isNaN(then.getTime())) return "";
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(today) - day(then)) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return `${then.getDate()}.${then.getMonth() + 1}.`;
}

// ---- Sessions --------------------------------------------------------------

// An item's key: `<repo>#<number>` on GitHub, `AB#<id>` on Azure (Azure
// Boards' own way to name a work item), null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  return item.source === "azure" ? `AB#${item.number}` : `${item.repoShort}#${item.number}`;
}

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

const NAME_MAX = 60;

// The name of the tab and space a session starts in: the item's key and title,
// cut to NAME_MAX characters. linkedSession finds the session by it.
export function sessionName(item) {
  const key = itemKey(item);
  const full = key ? `${key} ${item.title}` : item.title;
  return full.length <= NAME_MAX ? full : `${full.slice(0, NAME_MAX - 1)}…`;
}

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };

// An item's session: a tab or space whose name starts with its key, the most
// urgent first; failing that, on GitHub a space on its branch (a pull
// request's head branch, or `<type>/<number>-…` in a folder of its repo).
// → { space, tab (null for a space), status, label } or null.
export function linkedSession(item, allSpaces) {
  const key = itemKey(item);
  const named = (name) => Boolean(key) && (name === key || String(name ?? "").startsWith(`${key} `));
  let hits = [];
  for (const s of allSpaces) {
    for (const t of s.tabs ?? []) if (named(t.name)) hits.push({ space: s.id, tab: t.id, status: t.status ?? null, label: t.name });
    if (named(s.name)) hits.push({ space: s.id, tab: null, status: s.status ?? null, label: s.name });
  }
  if (!hits.length && item.source === "github" && key) {
    const own = new RegExp(`(^|/)${item.number}(-|$)`);
    hits = allSpaces
      .filter((s) => s.branch && (item.kind === "pr" && item.branch ? s.branch === item.branch : own.test(s.branch) && (s.folder ?? "").includes(item.repoShort)))
      .map((s) => ({ space: s.id, tab: null, status: s.status ?? null, label: s.branch }));
  }
  hits.sort((a, b) => (URGENCY[a.status] ?? 4) - (URGENCY[b.status] ?? 4));
  return hits[0] ?? null;
}

export const AGENT_STATUS = { working: "arbeitet", blocked: "wartet auf dich", done: "fertig", idle: "bereit" };

// `{name}` placeholders filled from vars; unknown ones stay.
export function renderTemplate(template, vars) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (all, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : all));
}

export function templateVars(item) {
  const [owner, repo] = item.repo.includes("/") ? item.repo.split("/") : ["", item.repo];
  return { number: item.number ?? "", title: item.title, url: item.url ?? "", owner, repo, key: itemKey(item) ?? "" };
}

// Prints the checkout's folder on the chosen machine ($1; a leading ~ is that
// machine's home), or exits 3 when there is none.
export const CHECKOUT_SCRIPT = [
  "case $1 in \\~) dir=$HOME ;; \\~/*) dir=$HOME/${1#\\~/} ;; *) dir=$1 ;; esac",
  '[ -d "$dir" ] || { echo "Kein Checkout unter $dir" >&2; exit 3; }',
  'cd "$dir" && pwd',
].join("\n");

export const checkoutArgs = (checkout) => ["-c", CHECKOUT_SCRIPT, "board-checkout", checkout];

// The space a new tab goes into: one on that machine in the checkout or
// below it, else the shown space when it is on that machine.
export function spaceForTab(allSpaces, on, repoFolder) {
  const here = allSpaces.filter((s) => (s.machine ?? null) === (on ?? null));
  return here.find((s) => s.folder && (s.folder === repoFolder || s.folder.startsWith(`${repoFolder}/`))) ?? here.find((s) => s.active) ?? null;
}

// The app command that opens a session: [name, args]. A new space and its
// first tab both carry the session's name.
export function startCommand({ open, on, folder, argv, task, name, space }) {
  const common = { folder, argv, ...(task ? { task } : {}) };
  if (open === "tab") return ["tab.new", { name, space, ...common }];
  return ["space.new", { name, tab: name, machine: on ?? "", ...common }];
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const GH_TIMEOUT = 30000;
const AZ_TIMEOUT = 60000;
const CHECKOUT_TIMEOUT = 30000;
// When the board looks for a session it opened (watchSession), in ms.
const SESSION_CHECKS = [1000, 2000, 3000];
const TICK_MS = 30000;
const SCROLLS = 24;

// One run of a program: its result, or a BoardError when it could not run.
// `write` is for calls that change something (see execRejection).
async function call(tool, args, on, timeout, { write = false } = {}) {
  try {
    return await exec(tool, args, { on, timeout });
  } catch (e) {
    throw execRejection(tool, e, timeout, on, { write });
  }
}

const gh = async (args, options = {}) => readGh(await call("gh", args, null, GH_TIMEOUT, options), options);

async function az(view, args, options = {}) {
  const r = await call("az", args, view.on, AZ_TIMEOUT, options);
  if (r.code !== 0) throw azFailure(r, view.on, options);
  return r.stdout;
}

// What differs between GitHub and Azure, one set per Board: loading a view
// (`hiddenFor(view, columns)` gives its hidden columns), writing a move, the
// sidebar's tag, the name of the site `o` opens, whether `r` and opening the
// board try its views while not shown (`probe`), and what `r` forgets
// (`reset`). Azure keeps each view's work item types (parseAzureTypes) until
// then.
function makeSources() {
  let azureTypes = {};
  return {
    github: {
      tag: (view) => (view.layout === "list" ? "PR" : "GH"),
      site: "GitHub",
      probe: false,
      reset() {},
      async load(view, hiddenFor) {
        if (view.layout === "list") {
          const { json, warnings, errors } = await gh(githubListArgs(view));
          return { data: parseGithubList(json, view, errors), warnings };
        }
        const hidden = hiddenFor(view, []);
        const { json, warnings, errors } = await gh(githubBoardArgs(view, hidden));
        return { data: parseGithubBoard(json, view, hidden, errors), warnings };
      },
      async move(view, data, card, column) {
        checkMoveResult((await gh(githubMoveArgs(data.meta, card, column), { write: true })).json, card);
      },
    },
    azure: {
      tag: () => "AZ",
      site: "Azure",
      probe: true,
      reset() {
        azureTypes = {};
      },
      async load(view, hiddenFor) {
        if (!azureTypes[view.id]) {
          const project = view.project ?? parseAzureDefaults(await az(view, azureDefaultsArgs())).project;
          if (!project) throw new BoardError(AZ_NO_PROJECT);
          azureTypes[view.id] = parseAzureTypes(await az(view, azureTypesArgs(view, project)));
        }
        const types = azureTypes[view.id];
        const hidden = hiddenFor(view, types.states);
        return { data: parseAzureBoard(await az(view, azureQueryArgs(view, hidden)), types, hidden), warnings: [] };
      },
      async move(view, _data, card, column) {
        await az(view, azureMoveArgs(view, card, column), { write: true });
      },
    },
  };
}

// Settings that last across reloads (the shown view, hidden columns). A full
// or missing localStorage keeps them for this session only.
const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Kept in memory only; see above.
    }
  },
};

const tint = (hex, alpha) => (/^#[0-9a-f]{6}$/i.test(hex ?? "") ? `${hex}${alpha}` : hex);
const machineName = (name) => name ?? "Dieser Rechner";

// Whether a board pane is in the shown tab of the shown space.
function boardShown() {
  const shownTabs = new Set(spaces().filter((s) => s.active).flatMap((s) => s.tabs.filter((t) => t.active).map((t) => t.id)));
  return panes().some((p) => p.mod === MOD && shownTabs.has(p.tab));
}

// An error's message for the UI; an unexpected one is logged with its stack.
function report(e) {
  if (!(e instanceof BoardError)) console.log(e?.stack ?? String(e));
  return errorText(e);
}

export default class Board extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.config = null;
    this.configErrors = [];
    this.views = {}; // per view id, see state()
    this.viewId = store.get("view");
    this.filterText = "";
    this.filtering = false;
    this.modal = null; // { kind: "status", … } or { kind: "start", … }
    this.notice = null; // { text, level }
    this.drag = null; // { key, from }
    this.over = null; // the column index under a drag
    this.sources = makeSources();
    this.scrolls = Array.from({ length: SCROLLS }, () => ScrollHandle.new());
    this.listScroll = ScrollHandle.new();
    this.filterInput = InputState.new({ placeholder: "Filter: Text in Titel, Schlüssel, Labels …" });
    this.filterInput.on("change", (_e, cx) => {
      this.filterText = this.filterInput.value();
      cx.notify();
    });
    this.filterInput.on("focus", (_e, cx) => {
      this.filtering = true;
      cx.notify();
    });
    this.filterInput.on("blur", (_e, cx) => {
      this.filtering = false;
      cx.notify();
    });
    this.filterInput.on("submit", () => this.handle.focus());
    this.messageInput = InputState.new({ placeholder: "Erste Nachricht an den Agent" });
    this.messageInput.on("focus", (_e, cx) => {
      if (this.modal?.kind === "start") this.modal.field = "message";
      cx.notify();
    });
    this.messageInput.on("submit", (_e, cx) => this.startAgent(cx));
    if (checking()) return;
    // A copy that is not shown (a reload of a background tab) leaves the
    // keyboard where it is.
    if (boardShown()) {
      this.handle.focus();
      cx.timer.after(300, () => this.handle.focus());
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") this.handle.focus();
        cx.notify();
      }
    });
    cx.timer.every(TICK_MS, (cx) => this.tick(cx));
    this.reload(cx);
  }

  // ---- data ----

  // A view's state: data and error, loading (again: one more refresh after
  // this one), at (last success) and tried (last start), unavailable (why the
  // view is not listed), warnings, moves (laid over refreshes, see
  // pendingMoves), pending (card keys being written), unclear ({ key, label }
  // of writes whose outcome the next refresh tells), stored/hidden (the
  // person's toggles and the hidden set), sel ({ col, key }, null before
  // the first data) and detail.
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, unavailable: null, warnings: [], moves: [], pending: {}, unclear: [],
      stored: readStoredHidden(store.get(`hidden:${id}`)), hidden: null, sel: null, detail: false,
    };
    return this.views[id];
  }

  shownViews() {
    return (this.config?.views ?? []).filter((v) => !this.state(v.id).unavailable);
  }

  view() {
    const shown = this.shownViews();
    return shown.find((v) => v.id === this.viewId) ?? shown[0] ?? null;
  }

  hiddenFor(view, columns) {
    const st = this.state(view.id);
    st.hidden = hiddenColumns(view, st.stored, columns);
    return st.hidden;
  }

  // Reads views.json again and refreshes the shown view. Azure views not
  // shown are tried too, so the list knows whether they are available; their
  // work item types are read anew.
  reload(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/mods/${MOD}/${CONFIG_NAME}.json`).catch((e) => {
        this.configErrors = [`${CONFIG_NAME}.json ließ sich nicht lesen: ${firstLine(e?.message ?? e)}`];
        return undefined;
      });
      if (text !== undefined) ({ config: this.config, errors: this.configErrors } = readConfig(text));
      for (const source of Object.values(this.sources)) source.reset();
      cx.notify();
      if (!this.config) return;
      for (const v of this.config.views) this.state(v.id).unavailable = null;
      const shown = this.view();
      for (const v of this.config.views) if (this.sources[v.source].probe && v !== shown) this.refresh(v, cx);
      if (shown) this.refresh(shown, cx);
    });
  }

  refresh(view, cx) {
    const st = this.state(view.id);
    // A refresh asked for while one runs (a column shown or hidden) follows it.
    if (st.loading) return void (st.again = true);
    st.loading = true;
    st.again = false;
    st.tried = Date.now();
    const started = st.tried;
    cx.spawn(async (cx) => {
      try {
        const { data, warnings } = await this.sources[view.source].load(view, (v, columns) => this.hiddenFor(v, columns));
        st.moves = pendingMoves(st.moves, started);
        st.data = data.kind === "board" ? applyMoves(data, st.moves) : data;
        st.warnings = [...warnings, ...this.dataWarnings(view, data)];
        st.error = null;
        st.unavailable = null;
        st.at = Date.now();
        this.keepSelection(view);
        this.settleUnclear(view, cx);
      } catch (e) {
        if (e instanceof BoardError && e.unavailable) st.unavailable = e.message;
        else st.error = report(e);
        if (st.unclear.length) {
          this.say(`${st.unclear.map((u) => u.label).join(", ")}: Ergebnis weiter offen, Neuladen fehlgeschlagen (${errorText(e)})`, "warning", cx);
        }
      } finally {
        st.loading = false;
        // The follow-up refresh reads the view from the config as it is now.
        const fresh = this.config?.views.find((v) => v.id === view.id);
        if (st.again && fresh) this.refresh(fresh, cx);
        // A view that takes the place of one just found unavailable loads now.
        const next = this.view();
        const waiting = next && next !== view && !this.state(next.id).data && !this.state(next.id).loading;
        if (st.unavailable && waiting) this.refresh(next, cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  dataWarnings(view, data) {
    if (data.kind === "list") {
      return data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`);
    }
    return unknownHidden(view, data.meta?.states ?? data.columns).map((n) => `„${n}“ aus hide oder hideCategories passt zu keiner Spalte`);
  }

  // After a refresh that succeeded: where the cards of unclear writes are now.
  settleUnclear(view, cx) {
    const st = this.state(view.id);
    if (!st.unclear.length) return;
    const where = st.unclear.map((u) => `${u.label} steht nach dem Neuladen in „${findCard(st.data, u.key)?.column.name ?? "keiner geladenen Spalte"}“`);
    st.unclear = [];
    this.say(where.join("; "), "info", cx);
  }

  // Every TICK_MS while the board shows: the shown view and the unavailable
  // ones once refreshMinutes have passed since they were last tried.
  tick(cx) {
    if (!this.config || !boardShown()) return;
    const every = this.config.refreshMinutes * 60000;
    const due = (v) => Date.now() - this.state(v.id).tried >= every;
    const shown = this.view();
    if (shown && due(shown)) this.refresh(shown, cx);
    for (const v of this.config.views) if (this.state(v.id).unavailable && due(v)) this.refresh(v, cx);
    cx.notify();
  }

  // ---- moves ----

  // Moves a card to a column at once and writes it; one write per card at a
  // time. A refusal moves it back with the error shown; a write whose outcome
  // is unclear leaves it and refreshes.
  moveTo(view, key, columnId, cx) {
    const st = this.state(view.id);
    const found = findCard(st.data, key);
    const to = st.data?.columns.find((c) => c.id === columnId);
    if (!found || !to) return this.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
    const label = itemLabel(found.card);
    if (found.column.id === columnId) return;
    if (st.pending[key]) return this.say(`${label} wird noch gespeichert`, "info", cx);
    if (!canDrop(st.data, found.card, to)) return this.say(`${label} kann nicht nach „${to.name}“`, "warning", cx);
    const move = { key, from: found.column.id, to: columnId, at: Date.now(), confirmedAt: null };
    st.moves.push(move);
    st.data = moveCard(st.data, key, columnId);
    st.pending[key] = true;
    this.say(`${label} → ${to.name} …`, "info", cx);
    cx.spawn(async (cx) => {
      try {
        await this.sources[view.source].move(view, st.data, found.card, to);
        move.confirmedAt = Date.now();
        this.say(`${label} steht jetzt in „${to.name}“`, "success", cx);
      } catch (e) {
        st.moves = st.moves.filter((m) => m !== move);
        const why = report(e);
        if (e instanceof BoardError && e.unclear) {
          st.unclear.push({ key, label });
          this.say(`${label} → ${to.name}: ${why}; lädt neu`, "warning", cx);
          notify({ title: `Status von ${label}: Ergebnis unklar`, body: why, level: "warning" });
          this.refresh(view, cx);
        } else {
          st.data = rollback(st.data, move);
          this.say(`${label} bleibt in „${found.column.name}“: ${why}`, "error", cx);
          notify({ title: `Status von ${label} nicht geändert`, body: why, level: "error" });
        }
      } finally {
        delete st.pending[key];
        cx.notify();
      }
    });
  }

  say(text, level, cx) {
    this.notice = { text, level };
    cx.notify();
  }

  // ---- what is shown ----

  columns(view) {
    const st = this.state(view.id);
    return st.data?.kind === "board" ? shownColumns(st.data, this.filterText) : [];
  }

  rows(view) {
    const st = this.state(view.id);
    if (st.data?.kind !== "list") return [];
    return st.data.sections.flatMap((s) => s.rows.filter((r) => matches(r, this.filterText)));
  }

  // The board's columns, or a list as one column, as navigate takes them.
  navColumns(view) {
    return this.state(view.id).data?.kind === "list" ? [{ shown: this.rows(view) }] : this.columns(view);
  }

  selected(view) {
    const st = this.state(view.id);
    if (!st.sel?.key) return null;
    if (st.data?.kind === "board") return findCard(st.data, st.sel?.key)?.card ?? null;
    return this.rows(view).find((r) => r.key === st.sel?.key) ?? null;
  }

  keepSelection(view) {
    const st = this.state(view.id);
    st.sel = selectionAfter(this.navColumns(view), st.sel);
  }

  select(view, sel) {
    const st = this.state(view.id);
    st.sel = sel;
    const cols = this.navColumns(view);
    const row = cols[sel.col]?.shown.findIndex((c) => c.key === sel.key) ?? -1;
    if (row < 0) return;
    if (st.data?.kind === "board") this.scrolls[sel.col % SCROLLS].scroll_to_item(row);
    else this.scrollList(view, sel.key);
  }

  switchView(index, cx) {
    const v = this.shownViews()[index];
    if (!v) return;
    this.viewId = v.id;
    store.set("view", v.id);
    this.notice = null;
    const st = this.state(v.id);
    if (!st.data || Date.now() - st.tried >= this.config.refreshMinutes * 60000) this.refresh(v, cx);
    cx.notify();
  }

  toggleColumn(view, col, cx) {
    const st = this.state(view.id);
    if (st.data?.kind !== "board") return;
    if (!col.target) return this.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
    st.stored = toggleHidden(view, st.stored, col, st.data.columns);
    st.hidden = hiddenColumns(view, st.stored, st.data.columns);
    store.set(`hidden:${view.id}`, st.stored);
    st.data = withHidden(st.data, st.hidden);
    // What a column holds comes from the query, which leaves hidden ones out.
    this.refresh(view, cx);
  }

  open(item, cx) {
    if (item?.url) cx.open_url(item.url);
    else this.say("Dazu gibt es keine Seite", "warning", cx);
  }

  // Enter: details first, then the item's session (go to it, or start one).
  enter(view, cx) {
    const st = this.state(view.id);
    const item = this.selected(view);
    if (!item) return;
    if (!st.detail) {
      st.detail = true;
      return cx.notify();
    }
    if (!itemKey(item)) return this.say("Entwurf ohne Repo: erst in ein Issue umwandeln", "info", cx);
    const session = linkedSession(item, spaces());
    if (!session) return this.openStart(view, item, cx);
    run("space.select", { id: session.space });
    if (session.tab) run("tab.select", { id: session.tab });
  }

  // ---- the start dialog ----

  openStart(view, item, cx) {
    const settings = startSettings(this.config, view, item.repo);
    if (!settings.checkout) {
      const where = `„repos“ → „${item.repo}“ oder „start.checkout“ der Ansicht „${view.name}“`;
      return this.say(`Für ${item.repo} steht kein „checkout“ in ${CONFIG_NAME}.json: ${where}`, "error", cx);
    }
    const template = item.kind === "pr" ? settings.review : settings.message;
    this.messageInput.set_value(renderTemplate(template, templateVars(item)));
    const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name);
    const list = listed.length ? listed : [null];
    let machine = list.indexOf(settings.machine ?? null);
    const machineNote = machine < 0 ? `Rechner „${settings.machine}“ ist nicht verbunden; gewählt: ${machineName(list[0])}` : null;
    if (machine < 0) machine = 0;
    this.modal = {
      kind: "start", view, item, settings, field: "message", agents: [], agent: 0, agentsError: null, machineNote, agentNote: null,
      notes: [machineNote].filter(Boolean), machines: list, machine, open: settings.open === "tab" ? "tab" : "space", busy: null, error: null,
    };
    this.messageInput.focus();
    this.loadAgents(cx);
    cx.notify();
  }

  loadAgents(cx) {
    const m = this.modal;
    const on = m.machines[m.machine];
    m.agents = [];
    m.agentsError = null;
    m.agentNote = null;
    cx.spawn(async (cx) => {
      try {
        const agents = (await knownAgents({ on })).filter((a) => a.installed);
        if (this.modal !== m || m.machines[m.machine] !== on) return;
        m.agents = agents;
        const wanted = m.settings.agent;
        m.agent = Math.max(0, agents.findIndex((a) => a.key === wanted));
        if (!agents.length) m.agentsError = "Kein Agent installiert";
        else if (wanted && !agents.some((a) => a.key === wanted)) {
          m.agentNote = `Agent „${wanted}“ ist ${on ? `auf ${on}` : "auf diesem Rechner"} nicht installiert; gewählt: ${agents[0].name}`;
        }
      } catch (e) {
        if (this.modal !== m || m.machines[m.machine] !== on) return;
        m.agentsError = `Agents auf ${machineName(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
      }
      m.notes = [m.machineNote, m.agentNote].filter(Boolean);
      cx.notify();
    });
  }

  cycle(field, by, cx) {
    const m = this.modal;
    if (m.busy) return;
    if (field === "agent" && m.agents.length) m.agent = (m.agent + by + m.agents.length) % m.agents.length;
    if (field === "machine") {
      m.machine = (m.machine + by + m.machines.length) % m.machines.length;
      m.machineNote = null;
      this.loadAgents(cx);
    }
    if (field === "open") m.open = m.open === "space" ? "tab" : "space";
    cx.notify();
  }

  // Opens the item's session in its checkout on the chosen machine: finds the
  // checkout's folder there, then runs space.new or tab.new. run() answers
  // nothing, so the board says the session is being opened and watches for a
  // space or tab of its name (watchSession). The dialog stays until the
  // folder is known or the start failed; a failure that comes after the
  // dialog went shows in the banner and as a toast.
  startAgent(cx) {
    const m = this.modal;
    if (m?.kind !== "start" || m.busy) return;
    const agent = m.agents[m.agent];
    if (!agent) return void ((m.error = m.agentsError ?? "Kein Agent gewählt"), cx.notify());
    const on = m.machines[m.machine];
    const task = this.messageInput.value().trim();
    const name = sessionName(m.item);
    m.busy = "Sitzung wird geöffnet …";
    m.error = null;
    cx.spawn(async (cx) => {
      try {
        const r = await call("sh", checkoutArgs(m.settings.checkout), on, CHECKOUT_TIMEOUT);
        if (r.code !== 0) throw new BoardError(firstLine(r.stderr) || `sh endete mit ${r.code}`);
        const folder = r.stdout.trim().split("\n").pop();
        if (!folder) throw new BoardError("Checkout-Ordner nicht gelesen");
        let space = null;
        if (m.open === "tab") {
          space = spaceForTab(spaces(), on, folder);
          if (!space) throw new BoardError(`Kein Space auf ${machineName(on)} für einen neuen Tab; als neuer Space öffnen`);
        }
        run(...startCommand({ open: m.open, on, folder, argv: agent.run, task, name, space: space?.id }));
        if (this.modal === m) {
          this.modal = null;
          this.handle.focus();
        }
        this.say(`Sitzung wird geöffnet: ${name}${on ? ` auf ${on}` : ""}`, "info", cx);
        this.watchSession(name, cx);
      } catch (e) {
        const why = report(e);
        if (this.modal === m) m.error = why;
        else {
          this.say(`${itemLabel(m.item)}: Sitzung nicht geöffnet: ${why}`, "error", cx);
          notify({ title: `Sitzung für ${itemLabel(m.item)} nicht geöffnet`, body: why, level: "error" });
        }
      } finally {
        m.busy = null;
        cx.notify();
      }
    });
    cx.notify();
  }

  // Looks for a space or tab named `name` after each of SESSION_CHECKS ms;
  // says so when it appears, warns when it has not after the last.
  watchSession(name, cx, at = 0) {
    cx.timer.after(SESSION_CHECKS[at], (cx) => {
      const there = spaces().some((s) => s.name === name || s.tabs.some((t) => t.name === name));
      if (there) return this.say(`Sitzung geöffnet: ${name}`, "success", cx);
      if (at + 1 < SESSION_CHECKS.length) return this.watchSession(name, cx, at + 1);
      this.say(`Kein Space und kein Tab „${name}“ erschienen; die Sitzung hat wohl nicht gestartet`, "warning", cx);
      notify({ title: "Sitzung nicht erschienen", body: name, level: "warning" });
    });
  }

  closeModal(cx) {
    if (this.modal?.busy) return;
    this.modal = null;
    this.handle.focus();
    cx.notify();
  }

  // ---- keys ----

  key(e, cx) {
    const k = e.key;
    const ch = e.key_char ?? "";
    const mod = e.modifiers ?? {};
    if (this.modal) return this.modalKey(e, cx);
    if (this.filtering) {
      if (k === "escape") {
        this.handle.focus();
        cx.stop_propagation();
        cx.notify();
      }
      return;
    }
    const view = this.view();
    const done = () => {
      cx.stop_propagation();
      cx.notify();
    };
    // [ ] and / may come with Shift, or AltGr, which Windows reports as
    // Control+Alt; Control alone stays herdr's.
    const typed = !(mod.control && !mod.alt) && !mod.platform;
    if (typed && (ch === "[" || ch === "]")) {
      const shown = this.shownViews();
      return this.switchView((shown.indexOf(view) + (ch === "[" ? -1 : 1) + shown.length) % shown.length, cx), done();
    }
    if (typed && ch === "/") return this.filterInput.focus(), done();
    if (mod.control || mod.alt || mod.platform) return;
    if (/^[1-9]$/.test(ch)) return this.switchView(Number(ch) - 1, cx), done();
    if (k === "r" && !mod.shift) return this.reload(cx), done();
    if (!view) return;
    const st = this.state(view.id);
    if (st.data) this.keepSelection(view);
    if (k === "escape") {
      if (st.detail) st.detail = false;
      else if (this.notice) this.notice = null;
      else if (this.filterText) {
        this.filterInput.set_value("");
        this.filterText = "";
      }
      return done();
    }
    const dir = mod.shift ? null : { j: "down", down: "down", k: "up", up: "up", h: "left", left: "left", l: "right", right: "right" }[k];
    if (dir && st.data) {
      if (st.data.kind === "board" || dir === "up" || dir === "down") this.select(view, navigate(this.navColumns(view), st.sel, dir));
      return done();
    }
    if (st.data?.kind === "board") {
      const upper = mod.shift && (k === "h" || k === "l") ? k.toUpperCase() : ch;
      if (upper === "H" || upper === "L") {
        const target = st.sel?.key && stepTarget(st.data, this.columns(view), st.sel?.key, upper === "H" ? -1 : 1);
        if (target) this.moveTo(view, st.sel?.key, target.id, cx);
        return done();
      }
      if (k === "s") return this.openStatusMenu(view), done();
      if (k === "x") {
        const col = this.columns(view)[st.sel?.col];
        if (col) this.toggleColumn(view, col, cx);
        return done();
      }
    }
    if (k === "enter") return this.enter(view, cx), done();
    if (k === "o") return this.open(this.selected(view), cx), done();
  }

  scrollList(view, key) {
    const st = this.state(view.id);
    let child = 0;
    for (const s of st.data.sections) {
      child++; // the section's heading
      for (const r of s.rows.filter((row) => matches(row, this.filterText))) {
        if (r.key === key) return this.listScroll.scroll_to_item(child);
        child++;
      }
    }
  }

  openStatusMenu(view) {
    const st = this.state(view.id);
    const card = this.selected(view);
    if (!card || st.data?.kind !== "board") return;
    const targets = targetsFor(st.data, card);
    const at = Math.max(0, targets.findIndex((c) => c.id === findCard(st.data, card.key)?.column.id));
    this.modal = { kind: "status", view, key: card.key, targets, at };
  }

  modalKey(e, cx) {
    const m = this.modal;
    const k = e.key;
    const ch = e.key_char ?? "";
    if (k === "escape") {
      cx.stop_propagation();
      return this.closeModal(cx);
    }
    if (m.kind === "status") {
      cx.stop_propagation();
      let commit = k === "enter";
      if (k === "j" || k === "down") m.at = Math.min(m.at + 1, m.targets.length - 1);
      else if (k === "k" || k === "up") m.at = Math.max(m.at - 1, 0);
      else if (/^[1-9]$/.test(ch)) {
        // A digit beyond the rows does nothing.
        if (!m.targets[Number(ch) - 1]) return cx.notify();
        m.at = Number(ch) - 1;
        commit = true;
      }
      if (!commit) return cx.notify();
      this.closeModal(cx);
      return this.moveTo(m.view, m.key, m.targets[m.at].id, cx);
    }
    // The start dialog: Tab walks the fields; h/l or the arrows change a
    // choice, Enter starts. Typing goes to the message.
    const fields = ["message", "agent", "machine", "open"];
    if (k === "tab") {
      cx.stop_propagation();
      const at = fields.indexOf(m.field);
      m.field = fields[(at + (e.modifiers?.shift ? -1 : 1) + fields.length) % fields.length];
      if (m.field === "message") this.messageInput.focus();
      else this.handle.focus();
      return cx.notify();
    }
    if (m.field === "message") return;
    cx.stop_propagation();
    if (k === "enter") return this.startAgent(cx);
    if (k === "h" || k === "left") return this.cycle(m.field, -1, cx);
    if (k === "l" || k === "right" || k === "space") return this.cycle(m.field, 1, cx);
  }

  // ---- drawing ----

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const view = this.view();
    const st = view ? this.state(view.id) : null;
    const item = st?.detail && view ? this.selected(view) : null;
    let out = v_flex()
      .id("board")
      .track_focus(this.handle)
      .size_full()
      .relative()
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", () => {
        if (!this.filtering && !this.modal) this.handle.focus();
      })
      .on_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .on_hover((hovered, cx) => {
        if (!hovered) this.endDrag(cx);
      })
      .child(this.toolbar(t, view, st));
    if (this.notice || this.configErrors.length) out = out.child(this.banner(t));
    out = out
      .child(
        h_flex()
          .flex_1()
          .min_h(0)
          .child(this.sidebar(t, view))
          .child(this.main(t, mono, view, st))
          .when(Boolean(item), (el) => el.child(this.detail(t, mono, view, item))),
      )
      .child(this.hints(t, st));
    if (this.modal?.kind === "status") out = out.child(this.statusMenu(t));
    if (this.modal?.kind === "start") out = out.child(this.startDialog(t));
    return out;
  }

  endDrag(cx) {
    if (!this.drag) return;
    this.drag = null;
    this.over = null;
    cx.notify();
  }

  // A button; `primary` is the solid one. A disabled one ignores clicks.
  button(t, id, label, primary, action, disabled = false) {
    return div()
      .id(id)
      .px(12)
      .py(7)
      .rounded(6)
      .text_size(12)
      .cursor_pointer()
      .opacity(disabled ? 0.5 : 1)
      .bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground)
      .when(primary, (el) => el.font_semibold())
      .hover((s) => s.bg(primary ? t.accent : t.hover))
      .on_click((_e, cx) => {
        if (!disabled) action(cx);
      })
      .child(label);
  }

  checkColor(t, state) {
    return { failed: t.ansi1, pending: t.ansi3, passed: t.ansi2 }[state] ?? t.dim;
  }

  toolbar(t, view, st) {
    const updated = st?.loading ? "lädt …" : st?.at ? `aktualisiert ${updatedLabel(st.at, Date.now())}` : "";
    return h_flex()
      .flex_none()
      .gap(12)
      .px(16)
      .py(10)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(div().flex_none().text_size(15).font_semibold().child(view?.name ?? "Arbeit"))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .h(32)
          .px(10)
          .gap(8)
          .items_center()
          .rounded(8)
          .border_1()
          .border_color(this.filtering ? t.accent : t.border)
          .bg(t.chrome)
          // A press in the field is the input's; the board must not take the keyboard back.
          .id("filter")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(div().text_color(t.dim).child("/"))
          .child(Input.new(this.filterInput).flex_1().text_size(12.5).text_color(t.foreground)),
      )
      .child(div().flex_none().text_size(12).text_color(t.muted).child(updated))
      .child(this.button(t, "refresh", "↻", false, (cx) => this.reload(cx)));
  }

  banner(t) {
    const color = { error: t.ansi1, warning: t.ansi3, success: t.ansi2, info: t.muted };
    const lines = [...this.configErrors.map((text) => ({ text, level: "error" })), ...(this.notice ? [this.notice] : [])];
    return v_flex()
      .flex_none()
      .px(16)
      .py(6)
      .gap(2)
      .border_b(1)
      .border_color(t.border)
      .bg(t.chrome)
      .text_size(12)
      .children(lines.map((l) => div().text_color(color[l.level] ?? t.muted).child(l.text)));
  }

  sidebar(t, view) {
    const shown = this.shownViews();
    const missing = (this.config?.views ?? []).filter((v) => this.state(v.id).unavailable);
    const count = (v) => {
      const d = this.state(v.id).data;
      if (!d) return "";
      if (d.kind === "list") return String(d.sections.reduce((n, s) => n + s.rows.length, 0));
      return String(d.columns.filter((c) => !c.hidden).reduce((n, c) => n + c.cards.length, 0));
    };
    return v_flex()
      .w(200)
      .flex_none()
      .p(8)
      .gap(3)
      .bg(t.chrome)
      .border_r(1)
      .border_color(t.border)
      .child(div().px(8).pt(2).pb(6).text_size(11).text_color(t.muted).child("ANSICHTEN"))
      .children(
        shown.map((v, i) =>
          h_flex()
            .id(`view-${v.id}`)
            .px(8)
            .py(7)
            .gap(8)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .when(v === view, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => {
              if (!this.modal) this.switchView(i, cx);
            })
            .child(div().w(22).text_size(11).text_color(t.dim).child(this.sources[v.source].tag(v)))
            .child(div().flex_1().min_w(0).truncate().child(v.name))
            .child(div().text_size(12).text_color(t.muted).child(this.state(v.id).loading ? "…" : count(v)))
            .child(div().w(10).text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : "")),
        ),
      )
      .child(div().flex_1())
      .children(missing.map((v) => div().px(8).py(4).text_size(11).text_color(t.dim).child(`${v.name}: ${this.state(v.id).unavailable}`)));
  }

  main(t, mono, view, st) {
    const box = v_flex().flex_1().min_w(0).min_h(0);
    const message = (text) => box.child(div().p(20).text_color(t.muted).child(text));
    if (!this.config) return message(this.configErrors.length ? `Keine gültige Ansicht in ${CONFIG_NAME}.json` : "Lädt …");
    if (!view) return message("Keine Ansicht verfügbar");
    if (!st.data && !st.error) return message(st.loading ? "Lädt …" : "Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(div().px(16).pt(14).text_color(t.ansi1).child(st.error));
    if (st.warnings.length) shown = shown.children(st.warnings.map((w) => div().px(16).pt(6).text_size(12).text_color(t.ansi3).child(w)));
    if (!st.data) return shown;
    if (st.data.kind === "board" && !st.data.columns.length) return shown.child(div().p(20).text_color(t.muted).child("Keine Einträge"));
    return shown.child(st.data.kind === "board" ? this.board(t, mono, view, st) : this.list(t, mono, view, st));
  }

  board(t, mono, view, st) {
    const cols = this.columns(view);
    const allSpaces = spaces();
    const dragged = this.drag ? findCard(st.data, this.drag.key)?.card : null;
    const columnEl = (col, ci) => {
      const focusedCol = st.sel?.col === ci;
      const target = Boolean(dragged) && this.over === ci && this.drag.from !== col.id && canDrop(st.data, dragged, col);
      const base = (el) =>
        el
          .id(`col-${ci}`)
          .rounded(10)
          .border_1()
          .border_color(target ? t.accent : focusedCol && !st.sel?.key ? t.input : t.border)
          .bg(target ? t.selected : t.chrome)
          .p(10)
          .on_hover((hovered, cx) => {
            if (!this.drag) return;
            if (hovered) this.over = ci;
            else if (this.over === ci) this.over = null;
            cx.notify();
          })
          .on_mouse_up("left", (_e, cx) => {
            if (!this.drag) return;
            cx.stop_propagation();
            const { key } = this.drag;
            this.endDrag(cx);
            this.moveTo(view, key, col.id, cx);
          });
      const head = h_flex()
        .gap(6)
        .items_center()
        .child(div().size(9).flex_none().rounded(5).bg(t[col.color] ?? t.muted))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(col.name));
      if (col.hidden) {
        return base(v_flex().w(120).flex_none().gap(6))
          .cursor_pointer()
          .on_click((_e, cx) => {
            if (!this.drag && !this.modal) this.toggleColumn(view, col, cx);
          })
          .child(head)
          .child(div().text_size(12).text_color(t.muted).child(col.count === null ? "x zeigt" : `${col.count} · x zeigt`));
      }
      return base(v_flex().flex_1().min_w(0).min_h(0).gap(8))
        .child(head.child(div().text_size(12).text_color(t.muted).child(String(col.count ?? col.shown.length))))
        .child(
          v_flex()
            .id(`cards-${ci}`)
            .flex_1()
            .min_h(0)
            .gap(6)
            .overflow_y_scrollbar()
            .track_scroll(this.scrolls[ci % SCROLLS])
            .children(col.shown.map((card) => this.card(t, mono, view, st, card, ci, allSpaces)))
            .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child("keine Karten"))),
        );
    };
    return v_flex()
      .flex_1()
      .min_h(0)
      .child(h_flex().id("columns").flex_1().min_h(0).gap(12).p(14).items_start().children(cols.map(columnEl)))
      .when(Boolean(st.data.limited), (el) =>
        el.child(div().px(16).pb(8).text_size(12).text_color(t.ansi3)
          .child(`Nur die ersten ${view.limit} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
      );
  }

  card(t, mono, view, st, card, ci, allSpaces) {
    const selected = st.sel?.key === card.key;
    const dragging = this.drag?.key === card.key;
    const session = linkedSession(card, allSpaces);
    const chip = (text, fg = t.muted, bg = t.raised) => div().px(7).rounded(9).text_size(11).text_color(fg).bg(bg).child(text);
    return v_flex()
      .id(`card-${card.key}`)
      .flex_none()
      .p(9)
      .gap(6)
      .rounded(8)
      .border_1()
      .border_color(selected ? t.accent : t.border)
      .bg(selected ? t.selected : t.background)
      .opacity(dragging ? 0.5 : st.pending[card.key] ? 0.7 : 1)
      .cursor_pointer()
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        if (this.modal) return;
        this.drag = { key: card.key, from: card.column };
        this.over = ci;
        this.select(view, { col: ci, key: card.key });
        this.handle.focus();
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => {
        // Released on the card it started on: a click. Released on another
        // card: the column under it takes the drop.
        if (this.modal || (this.drag && this.drag.key !== card.key)) return;
        cx.stop_propagation();
        this.endDrag(cx);
        st.detail = true;
        cx.notify();
      })
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(card)))
          .when(Boolean(st.pending[card.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))),
      )
      .child(div().text_size(12.5).line_height("17px").child(card.title))
      .child(
        h_flex()
          .gap(5)
          .flex_wrap()
          .items_center()
          .when(Boolean(card.type), (el) => el.child(chip(card.type, t.foreground)))
          .children(card.labels.slice(0, 3).map((l) => chip(l)))
          .when(card.labels.length > 3, (el) => el.child(chip(`+${card.labels.length - 3}`)))
          .when(Boolean(card.sub), (el) => el.child(div().text_size(11).text_color(t.muted).child(`◔ ${card.sub?.done}/${card.sub?.total}`)))
          .when(card.assignees.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(card.assignees.join(", "))))
          .when(Boolean(session), (el) => el.child(chip(AGENT_STATUS[session?.status] ?? "Sitzung", t.background, t[session?.status] ?? t.idle))),
      );
  }

  list(t, mono, view, st) {
    const now = Date.now();
    const row = (r) => {
      const selected = st.sel?.key === r.key;
      return h_flex()
        .id(`row-${r.key}`)
        .flex_none()
        .gap(12)
        .px(18)
        .py(8)
        .items_center()
        .border_l(2)
        .border_color(selected ? t.accent : t.background)
        .when(selected, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (this.modal) return;
          st.sel = { col: 0, key: r.key };
          st.detail = true;
          this.handle.focus();
          cx.notify();
        })
        .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(r)))
        .child(div().flex_1().min_w(0).truncate().child(r.title))
        .child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.draft ? `${r.author} · Entwurf` : r.author))
        .child(div().w(70).flex_none().text_size(12).text_color(this.checkColor(t, r.checks.state)).child(r.checks.short))
        .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
    };
    const children = [];
    for (const s of st.data.sections) {
      children.push(
        div().flex_none().px(20).pt(12).pb(4).text_size(11).text_color(t.muted)
          .child(`${s.name.toUpperCase()} · ${s.count}${s.limited ? ` (erste ${s.rows.length})` : ""}`),
      );
      children.push(...s.rows.filter((r) => matches(r, this.filterText)).map(row));
    }
    return v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(this.listScroll).children(children);
  }

  detail(t, mono, view, item) {
    const st = this.state(view.id);
    const session = linkedSession(item, spaces());
    const column = st.data?.kind === "board" ? findCard(st.data, item.key)?.column : null;
    const section = (title, ...kids) => v_flex().px(18).py(12).gap(6).border_b(1).border_color(t.border)
      .child(div().text_size(11).text_color(t.muted).child(title)).children(kids);
    const settings = startSettings(this.config, view, item.repo);
    const firstMessage = renderTemplate(item.kind === "pr" ? settings.review : settings.message, templateVars(item));
    const startLabel = session ? "Zur Sitzung ↵" : item.kind === "pr" ? "Review starten ↵" : "Agent starten ↵";
    const openStatus = (cx) => {
      this.openStatusMenu(view);
      cx.notify();
    };
    return v_flex()
      .w(360)
      .flex_none()
      .bg(t.chrome)
      .border_l(1)
      .border_color(t.border)
      .child(
        v_flex()
          .px(18)
          .py(14)
          .gap(8)
          .border_b(1)
          .border_color(t.border)
          .child(
            h_flex()
              .font_family(mono)
              .text_size(11.5)
              .text_color(t.muted)
              .child(div().flex_1().min_w(0).truncate().child(`${itemLabel(item)}${item.branch ? ` · ${item.branch}` : ""}`))
              .child(div().text_size(11).child("Esc schließt")),
          )
          .child(div().text_size(15).font_semibold().line_height("20px").child(item.title))
          .child(
            h_flex()
              .gap(8)
              .flex_wrap()
              .items_center()
              .when(Boolean(column), (el) =>
                el.child(
                  div()
                    .id("status-pill")
                    .px(10)
                    .py(2)
                    .rounded(12)
                    .text_size(12)
                    .font_semibold()
                    .cursor_pointer()
                    .bg(t[column?.color] ?? t.muted)
                    .text_color(t.background)
                    .on_click((_e, cx) => {
                      if (!this.modal) openStatus(cx);
                    })
                    .child(`${column?.name} ▾`),
                ),
              )
              .when(Boolean(item.author), (el) => el.child(div().text_size(12).text_color(t.muted).child([`von ${item.author}`, item.review].filter(Boolean).join(" · "))))
              .when(Boolean(item.parent), (el) => el.child(div().text_size(12).text_color(t.muted).child(`Teil von #${item.parent}`)))
              .when(Boolean(item.sub), (el) => el.child(div().text_size(12).text_color(t.muted).child(`◔ ${item.sub?.done}/${item.sub?.total} erledigt`))),
          )
          .when((item.labels ?? []).length > 0 || Boolean(item.type), (el) =>
            el.child(div().text_size(12).text_color(t.muted).child([item.type, ...(item.labels ?? [])].filter(Boolean).join(" · "))),
          )
          .when((item.assignees ?? []).length > 0, (el) => el.child(div().text_size(12).text_color(t.dim).child(`zugewiesen: ${item.assignees.join(", ")}`))),
      )
      .when(Boolean(item.checks), (el) => el.child(section("CHECKS", div().text_color(this.checkColor(t, item.checks?.state)).child(item.checks?.text ?? ""))))
      .child(
        section(
          "SITZUNG",
          session
            ? h_flex()
              .gap(8)
              .items_center()
              .px(10)
              .py(8)
              .rounded(8)
              .border_1()
              .border_color(t.border)
              .bg(t.background)
              .child(div().size(8).flex_none().rounded(4).bg(t[session.status] ?? t.idle))
              .child(div().flex_1().min_w(0).truncate().font_family(mono).text_size(12).child(session.label))
              .child(div().text_size(12).text_color(t.muted).child(AGENT_STATUS[session.status] ?? ""))
            : div().text_size(12).text_color(t.muted).line_height("18px")
              .child(firstMessage ? `Noch keine Sitzung. Enter startet eine mit „${firstMessage}“.` : "Noch keine Sitzung. Enter startet eine."),
        ),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .px(18)
          .py(12)
          .gap(8)
          .flex_wrap()
          .border_t(1)
          .border_color(t.border)
          .child(this.button(t, "act-start", startLabel, true, (cx) => {
            if (this.modal) return;
            st.detail = true;
            this.enter(view, cx);
          }))
          .when(Boolean(column), (el) => el.child(this.button(t, "act-status", "Status s", false, (cx) => {
            if (!this.modal) openStatus(cx);
          })))
          .child(this.button(t, "act-open", `${this.sources[item.source].site} o`, false, (cx) => {
            if (!this.modal) this.open(item, cx);
          })),
      );
  }

  hints(t, st) {
    const keys = st?.data?.kind === "list"
      ? [["1 2 3 [ ]", "Ansicht"], ["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"], ["/", "Filter"], ["r", "neu laden"], ["Esc", "schließen"]]
      : [["1 2 3 [ ]", "Ansicht"], ["h/l j/k", "bewegen"], ["H/L", "verschieben"], ["s", "Status"], ["x", "Spalte"], ["Enter", "Detail · Agent"],
        ["o", "öffnen"], ["/", "Filter"], ["r", "neu laden"], ["Esc", "schließen"]];
    return h_flex()
      .flex_none()
      .gap(16)
      .px(16)
      .py(7)
      .border_t(1)
      .border_color(t.border)
      .bg(t.chrome)
      .text_size(12)
      .text_color(t.muted)
      .children(keys.map(([k, what]) => h_flex().gap(5).child(div().font_semibold().text_color(t.foreground).child(k)).child(div().child(what))));
  }

  // A layer over the whole board that swallows presses, with a panel on it.
  layer(t, id, panel) {
    return div()
      .id(id)
      .absolute()
      .inset_0()
      .flex()
      .items_center()
      .justify_center()
      .bg(tint(t.background, "b3"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
      .child(panel);
  }

  statusMenu(t) {
    const m = this.modal;
    return this.layer(
      t,
      "status-layer",
      v_flex()
        .id("status-menu")
        .w(280)
        .p(8)
        .gap(2)
        .rounded(10)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(div().px(8).py(6).text_size(12).text_color(t.muted).child("Status ändern · j/k Enter · Esc"))
        .children(
          m.targets.map((c, i) =>
            h_flex()
              .id(`status-${i}`)
              .px(8)
              .py(6)
              .gap(8)
              .items_center()
              .rounded(6)
              .cursor_pointer()
              .when(i === m.at, (el) => el.bg(t.selected))
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => {
                this.closeModal(cx);
                this.moveTo(m.view, m.key, c.id, cx);
              })
              .child(div().w(14).text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
              .child(div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted))
              .child(div().flex_1().child(c.name))
              .when(Boolean(c.hidden), (el) => el.child(div().text_size(11).text_color(t.dim).child("ausgeblendet"))),
          ),
        ),
    );
  }

  startDialog(t) {
    const m = this.modal;
    const label = (text) => div().text_size(12).text_color(t.muted).child(text);
    const frame = (field, inner) =>
      h_flex()
        .h(34)
        .px(10)
        .items_center()
        .rounded(6)
        .border_1()
        .border_color(m.field === field ? t.accent : t.input)
        .bg(t.background)
        .child(inner);
    const choice = (field, title, value) =>
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(6)
        .child(label(title))
        .child(
          frame(field, h_flex().id(`choice-${field}`).flex_1().min_w(0).gap(6).cursor_pointer()
            .on_click((_e, cx) => {
              m.field = field;
              this.handle.focus();
              this.cycle(field, 1, cx);
            })
            .child(div().flex_1().min_w(0).truncate().child(value))
            .child(div().text_color(t.dim).child("◂ ▸"))),
        );
    const agent = m.agents[m.agent];
    return this.layer(
      t,
      "start-layer",
      v_flex()
        .id("start-dialog")
        .w(600)
        .rounded(12)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(
          v_flex()
            .px(20)
            .py(16)
            .gap(4)
            .border_b(1)
            .border_color(t.border)
            .child(div().text_size(15).font_semibold().child(`${m.item.kind === "pr" ? "Review starten" : "Agent starten"} · ${itemLabel(m.item)}`))
            .child(div().text_size(12).text_color(t.muted).truncate().child(m.item.title)),
        )
        .child(
          v_flex()
            .px(20)
            .py(16)
            .gap(14)
            .child(label(`Neue Sitzung im Checkout ${m.settings.checkout}`))
            .child(
              h_flex()
                .gap(12)
                .child(choice("agent", "Agent", agent ? agent.name : m.agentsError ?? "lädt …"))
                .child(choice("machine", "Rechner", machineName(m.machines[m.machine])))
                .child(choice("open", "Öffnen als", m.open === "tab" ? "neuer Tab" : "neuer Space")),
            )
            .child(
              v_flex()
                .gap(6)
                .child(label("Erste Nachricht"))
                .child(frame("message", Input.new(this.messageInput).flex_1().text_size(12).text_color(t.foreground))),
            )
            .children(m.notes.map((n) => div().text_size(12).text_color(t.ansi3).child(n)))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(t.ansi1).child(m.error ?? ""))),
        )
        .child(
          h_flex()
            .px(20)
            .py(12)
            .gap(8)
            .items_center()
            .border_t(1)
            .border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.busy ?? "Tab wechselt das Feld · ◂ ▸ wählt"))
            .child(this.button(t, "start-cancel", "Abbrechen Esc", false, (cx) => this.closeModal(cx), Boolean(m.busy)))
            .child(this.button(t, "start-go", "Starten ↵", true, (cx) => this.startAgent(cx), Boolean(m.busy))),
        ),
    );
  }
}
