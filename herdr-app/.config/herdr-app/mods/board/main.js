// Built from src/ by `mise run herdr-board-build`; edit the modules there, not this file.

// The board, in its tab "Board": one's own work from GitHub (issues and pull
// requests on a Projects v2 board, open pull requests) and Azure DevOps, as
// views.json beside this file sets them. The leader's `b` shows or opens its
// tab. Keys and behaviour: README, "herdr app".
//
// views.json:
// - refreshMinutes (3), see Calls below.
// - sources: what the board shows, by source.
//   - azure: { org (https://dev.azure.com/<org>), contexts: [...] }, a
//     context either { team: { project, team }, views?: ["sprint",
//     "backlog"] (both when missing) } or { prs: { project } }.
//   - github: { views: [{ id, name, layout: "board" | "list", hide?: [column
//     names], limit?, start? }] }, and by kind (VIEW_KINDS): a board has
//     project { owner, number, field? ("Status") } and filter? (a Projects
//     filter such as "assignee:@me"); its columns are the options of that
//     single-select field. A list has sections [{ name, query }], one GitHub
//     search for pull requests each. A view may still say source: "github".
// - start: what the start dialog proposes: agent (a programs.json key),
//   machine, open ("space" | "tab"), checkout (the folder the session starts
//   in; ~ is that machine's home), message (the first message for issues and
//   work items) and review (for pull requests). Templates take {number}
//   {title} {url} {owner} {repo} {key}.
// - repos: { "<owner>/<repo>": { any start field } }. startSettings says
//   which start applies.
// An older views.json with its views at the top is not read; the board says
// where they go now.
//
// Hidden columns are left out of the query; the same request counts them for
// their stubs.
//
// The top bar toggles between the sources (Azure, GitHub) and shows a tab
// per context of the shown one: on Azure a team, with its view switch
// (Sprint, Backlog), or a project's pull requests; on GitHub a view. The
// Azure tabs read nothing yet: each says which view it will hold. "nur
// meine" filters what shows to one's own (on GitHub: assigned to, or opened
// by, the login gh runs as), without reading anything again. The shown
// source, its tab and a team's view last across reloads.
//
// Calls: a GitHub view costs one gh call per refresh. Finding gh costs one
// sh call now and then (toolPaths says when). A view refreshes when the
// board opens on it, on `r`, after `x`, when it is shown again older than
// refreshMinutes, and every refreshMinutes while its tab shows.
//
// The board is written as modules in src/ beside build.mjs, which builds
// them into the one main.js a stowed mod is (README, "herdr app"): shared
// helpers, views.json, the sources (GitHub, Azure, and running gh and az),
// the board's columns and cards, starting a session, and the UI, this
// module. Its data logic is plain exported functions, tested with a few UI
// paths by tests/herdr-app/board.test.mjs with node.

import { View, div } from "gpui-kit";
import { Input, InputState, ScrollHandle, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, knownAgents, machines, nextCommand, notify, panes, readTextFile, run, settings, spaces, theme } from "herdr";

// ==== src/shared.js ====

// What every part of the board uses: its names, its error and how one is shown,
// small checks and text helpers, an item's key, and labels for times.

export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension,
  // something to set up rather than a failure of the view. unclear: a write
  // may or may not have landed.
  constructor(message, { unavailable = false, unclear = false } = {}) {
    super(message);
    this.unavailable = unavailable;
    this.unclear = unclear;
  }
}

// A failure: with `write` and `unclear` (it may have reached the server) one
// whose outcome is unclear, else a plain error. The one place that choice is
// made.
export function failure(text, { write = false, unclear = false } = {}) {
  return write && unclear ? new BoardError(`Ergebnis unklar: ${text}`, { unclear: true }) : new BoardError(text);
}

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isText = (v) => typeof v === "string" && v.trim() !== "";
export const textList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];
export const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1);

// The message to show for an error: a BoardError's own, else marked as
// unexpected.
export const errorText = (e) => (e instanceof BoardError ? e.message : `Unerwarteter Fehler: ${firstLine(e?.message ?? e)}`);

// An item's key: `<repo>#<number>` on GitHub, `AB#<id>` on Azure (Azure
// Boards' own way to name a work item), null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  return item.source === "azure" ? `AB#${item.number}` : `${item.repoShort}#${item.number}`;
}

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

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

// ==== src/config.js ====

// views.json: reading it, what is wrong with it, and the start settings for
// an item.

export const START_DEFAULTS = { agent: null, machine: null, open: "space", checkout: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
// Keys of the start that made a worktree or set the status; the agent's own
// skills do both now.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const TOP_KEYS = ["refreshMinutes", "start", "repos", "sources"];
// What an old views.json, with its views at the top, is told.
const OLD_SHAPE = "views.json hat noch die alte Form: die Ansichten stehen jetzt unter „sources“, die GitHub-Ansichten in " +
  "„sources.github.views“, Azure in „sources.azure“ mit „org“ und „contexts“ (README, „herdr app“)";

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

const textProblems = (v, keys) => keys.filter((k) => v[k] !== undefined && v[k] !== null && typeof v[k] !== "string").map((k) => `„${k}“ muss Text sein`);

// Keys every GitHub view may have; each kind adds its own (VIEW_KINDS).
// "source" may stay from views.json's first form, as "github".
const COMMON_KEYS = ["id", "name", "source", "layout", "hide", "limit", "start"];

// Per GitHub view kind ("github <layout>"): its own keys, what is wrong with them,
// and its fields with their defaults filled in.
const VIEW_KINDS = {
  "github board": {
    keys: ["project", "filter"],
    problems(v) {
      const p = v.project;
      const out = [];
      if (!isObject(p) || !isText(p.owner) || !Number.isInteger(p.number) || p.number < 1) {
        out.push("„project“ braucht „owner“ (Text) und „number“ (ganze Zahl)");
      } else if (p.field !== undefined && !isText(p.field)) out.push("„project.field“ muss Text sein");
      return [...out, ...textProblems(v, ["filter"])];
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
};

// A view's kind, the key of VIEW_KINDS.
export const viewKind = (v) => `${v.source} ${v.layout}`;

function viewProblems(v) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (!isText(v.name)) out.push("„name“ fehlt");
  if (v.source !== undefined && v.source !== "github") out.push("„source“ ist hier \"github\" oder fehlt");
  if (v.layout !== "board" && v.layout !== "list") out.push("„layout“ ist \"board\" oder \"list\"");
  const kind = VIEW_KINDS[`github ${v.layout}`];
  if (!kind) return out;
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  if (v.hide !== undefined && !textList(v.hide)) out.push("„hide“ muss eine Liste von Texten sein");
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 100)) out.push("„limit“ ist eine ganze Zahl von 1 bis 100");
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v) {
  const common = { id: v.id, name: v.name, source: "github", layout: v.layout, hide: v.hide ?? [], start: v.start ?? {} };
  return { ...common, ...VIEW_KINDS[`github ${v.layout}`].defaults(v) };
}

// sources.github → { github: { views } or null, errors }. A view with
// problems is left out and each problem is listed.
function readGithub(raw) {
  if (!isObject(raw)) return { github: null, errors: ["„sources.github“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => k !== "views").map((k) => `„sources.github.${k}“ gibt es nicht`);
  if (!Array.isArray(raw.views) || !raw.views.length) errors.push("„sources.github.views“ braucht mindestens eine Ansicht");
  const views = [];
  const ids = new Set();
  (Array.isArray(raw.views) ? raw.views : []).forEach((v, i) => {
    const where = `GitHub-Ansicht ${i + 1}${isText(v?.name) ? ` („${v.name}“)` : ""}`;
    const problems = viewProblems(v);
    if (!problems.length && ids.has(v.id)) problems.push(`„id“ ${v.id} gibt es schon`);
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    ids.add(v.id);
    views.push(normalizeView(v));
  });
  return { github: views.length ? { views } : null, errors };
}

// The views a team context may show, in the order of its switch: the id
// views.json names, and the name the switch shows.
export const TEAM_VIEWS = [
  { id: "sprint", name: "Sprint" },
  { id: "backlog", name: "Backlog" },
];
const TEAM_VIEW_IDS = TEAM_VIEWS.map((v) => v.id);
const TEAM_VIEWS_TEXT = TEAM_VIEW_IDS.map((v) => `"${v}"`).join(" und ");

// What is wrong with an entry of sources.azure.contexts: { "team": {
// project, team }, "views"?: [...] } or { "prs": { project } }.
function contextProblems(c) {
  if (!isObject(c)) return ["muss ein Objekt sein"];
  const kinds = ["team", "prs"].filter((k) => c[k] !== undefined);
  if (kinds.length !== 1) return ["braucht genau eins von „team“ und „prs“"];
  const kind = kinds[0];
  const keys = kind === "team" ? ["team", "views"] : ["prs"];
  const fields = kind === "team" ? ["project", "team"] : ["project"];
  const out = Object.keys(c).filter((k) => !keys.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  const inner = c[kind];
  if (!isObject(inner) || !fields.every((f) => isText(inner[f]))) out.push(`„${kind}“ braucht ${fields.map((f) => `„${f}“`).join(" und ")} (Text)`);
  else out.push(...Object.keys(inner).filter((k) => !fields.includes(k)).map((k) => `„${kind}.${k}“ gibt es nicht`));
  const views = c.views;
  if (views !== undefined && !(textList(views) && views.length && views.every((v) => TEAM_VIEW_IDS.includes(v)) && new Set(views).size === views.length)) {
    out.push(`„views“ ist eine Liste aus ${TEAM_VIEWS_TEXT}, jede höchstens einmal`);
  }
  return out;
}

// The name of a context's tab, from an entry of sources.azure.contexts as
// it stands ("" when it names neither): the team, or "PRs · <project>".
function contextName(c) {
  if (isObject(c?.team) && isText(c.team.team)) return c.team.team;
  return isObject(c?.prs) && isText(c.prs.project) ? `PRs · ${c.prs.project}` : "";
}

// A context as the board uses it: { id, source: "azure", kind: "team",
// name, project, team, views } or { id, source: "azure", kind: "prs", name,
// project }; views in the switch's order.
function normalizeContext(c) {
  const name = contextName(c);
  if (c.team) {
    const views = c.views ?? TEAM_VIEW_IDS;
    const { project, team } = c.team;
    return { id: `azure:team:${project}/${team}`, source: "azure", kind: "team", name, project, team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)) };
  }
  return { id: `azure:prs:${c.prs.project}`, source: "azure", kind: "prs", name, project: c.prs.project };
}

// An organisation's address: https://<host>/<organisation>, a trailing /
// dropped; null for anything else.
function orgUrl(value) {
  const url = isText(value) ? value.trim().replace(/\/+$/, "") : "";
  return /^https:\/\/[^/\s]+\/[^/\s]+$/.test(url) ? url : null;
}

// sources.azure → { azure: { org, contexts } or null, errors }. Without a
// valid org (orgUrl) nothing of it is usable; a context with problems is left out and
// each problem is listed.
function readAzure(raw) {
  if (!isObject(raw)) return { azure: null, errors: ["„sources.azure“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => k !== "org" && k !== "contexts").map((k) => `„sources.azure.${k}“ gibt es nicht`);
  const org = orgUrl(raw.org);
  if (!org) errors.push("„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>");
  if (!Array.isArray(raw.contexts) || !raw.contexts.length) {
    errors.push("„sources.azure.contexts“ braucht mindestens einen Eintrag: { \"team\": { \"project\", \"team\" } } oder { \"prs\": { \"project\" } }");
  }
  const contexts = [];
  (Array.isArray(raw.contexts) ? raw.contexts : []).forEach((c, i) => {
    const name = contextName(c);
    const where = `Azure-Kontext ${i + 1}${name ? ` („${name}“)` : ""}`;
    const problems = contextProblems(c);
    const context = problems.length ? null : normalizeContext(c);
    if (context && contexts.some((x) => x.id === context.id)) problems.push("gibt es schon");
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    contexts.push(context);
  });
  // Teams of one name in different projects: their tabs name the project.
  for (const c of contexts) {
    if (c.kind === "team" && contexts.some((x) => x !== c && x.kind === "team" && x.team === c.team)) c.name = `${c.team} · ${c.project}`;
  }
  return { azure: org && contexts.length ? { org, contexts } : null, errors };
}

// views.json as text (null: there is none) → { config, errors }: config is
// { refreshMinutes, start, repos, azure: { org, contexts } or null, github:
// { views } or null }. A view or context with problems is left out and each
// problem is listed; config is null only when nothing usable is left.
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
  // Views at the top are views.json's old form, also beside sources.
  const old = raw.views !== undefined;
  const errors = old ? [OLD_SHAPE] : [];
  errors.push(...Object.keys(raw).filter((k) => !TOP_KEYS.includes(k) && k !== "views").map((k) => `„${k}“ gibt es nicht`));
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
  let azure = null;
  let github = null;
  if (isObject(raw.sources)) {
    const sources = raw.sources;
    errors.push(...Object.keys(sources).filter((k) => k !== "azure" && k !== "github").map((k) => `„sources.${k}“ gibt es nicht (nur „azure“ und „github“)`));
    if (sources.azure !== undefined) {
      const read = readAzure(sources.azure);
      azure = read.azure;
      errors.push(...read.errors);
    }
    if (sources.github !== undefined) {
      const read = readGithub(sources.github);
      github = read.github;
      errors.push(...read.errors);
    }
    if (!azure && !github) errors.push("„sources“ braucht mindestens eine Ansicht: in „sources.azure.contexts“ oder „sources.github.views“");
  } else if (!old) errors.push(raw.sources === undefined ? "„sources“ fehlt: „sources.azure“ oder „sources.github“" : "„sources“ muss ein Objekt sein");
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: azure || github ? { refreshMinutes, start, repos, azure, github } : null, errors };
}

// The GitHub views of a config (none without one).
export const githubViews = (config) => config?.github?.views ?? [];

// The start for an item: the defaults, then views.json's start, then the
// view's start, then the repo's entry in repos; a later one wins.
export function startSettings(config, view, repo) {
  return { ...START_DEFAULTS, ...config.start, ...view.start, ...(config.repos[repo] ?? {}) };
}

// ==== src/select.js ====

// What shows and what is selected, whatever a view's shape: the text filter,
// "nur meine", and keyboard movement over columns (a list is one column).

// Cards whose text holds every word of the filter, case-insensitive.
export function matches(card, text) {
  const words = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [card.title, card.number !== null ? `#${card.number}` : "", itemKey(card), card.repo, card.type, card.author, card.branch,
    ...(card.labels ?? []), ...(card.assignees ?? [])].filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// Whether an item is one's own, for "nur meine": `me` (the login the data
// was read as; null when the source did not say) is one of its assignees,
// its author, or a reviewer asked for.
export const isMine = (item, me) =>
  Boolean(me) && ((item.assignees ?? []).includes(me) || item.author === me || (item.reviewers ?? []).includes(me));

// Whether an item shows in data read as `viewer`: it matches the filter and,
// with `mine` on, it is one's own.
export const shows = (item, filter, mine, viewer) => matches(item, filter) && (!mine || isMine(item, viewer));

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

// ==== src/kinds/board.js ====

// A board's columns and cards: hidden columns, moves and their rollback,
// where a card may go, and the columns as shown.

// The stored toggles of a view, { hide: [names], show: [names] }, or null when
// what was stored is not that.
export function readStoredHidden(value) {
  return isObject(value) && textList(value.hide) && textList(value.show) ? { hide: [...value.hide], show: [...value.show] } : null;
}

// The hidden columns: the view's hide, plus what the person hid, minus what
// they showed.
export function hiddenColumns(view, stored) {
  const hidden = new Set(view.hide);
  const own = readStoredHidden(stored);
  for (const name of own?.hide ?? []) hidden.add(name);
  for (const name of own?.show ?? []) hidden.delete(name);
  return hidden;
}

// The stored toggles after hiding or showing a column: only what differs from
// the view's defaults, so a later edit to hide takes effect. A column that
// takes no drops ("Ohne Status") cannot be hidden: unchanged.
export function toggleHidden(view, stored, column) {
  if (!column?.target) return stored;
  const own = readStoredHidden(stored) ?? { hide: [], show: [] };
  const byDefault = hiddenColumns(view, null).has(column.name);
  const hideNow = !hiddenColumns(view, own).has(column.name);
  const next = { hide: own.hide.filter((n) => n !== column.name), show: own.show.filter((n) => n !== column.name) };
  if (hideNow !== byDefault) (hideNow ? next.hide : next.show).push(column.name);
  return next;
}

// Names in a view's hide that match none of `columns`.
export function unknownHidden(view, columns) {
  const names = new Set(columns.map((c) => c.name));
  return view.hide.filter((n) => !names.has(n));
}

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

// Whether an open outcome is due for a refresh that started at `started`: it
// came before that refresh started, and its card has no write under way
// (that write decides first).
export const isDue = (st, started) => (u) => u.at <= started && !st.pending[u.key];

// Moves laid over every refresh: those still being written, and confirmed
// ones until a refresh that started after the confirmation shows them.
export function pendingMoves(moves, started) {
  return moves.filter((m) => !m.confirmedAt || m.confirmedAt >= started);
}

export function applyMoves(board, moves) {
  return moves.reduce((b, m) => moveCard(b, m.key, m.to), board);
}

// Whether a card may go to a column: one that takes drops and, where the
// board's meta names its types' states (none does yet: GitHub boards carry
// none), a state of the card's own type.
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

// The columns as the board shows them: hidden ones as stubs (no cards), the
// others with the cards that show (`mine`: only one's own).
export function shownColumns(board, filter, mine = false) {
  return (board?.columns ?? []).map((c) => ({ ...c, shown: c.hidden ? [] : c.cards.filter((card) => shows(card, filter, mine, board.viewer)) }));
}

// ==== src/kinds/index.js ====

// View kinds, "<source> <layout>" (viewKind), and what the board shows for
// a view of each: `shape`, how its data is drawn and walked (SHAPES in
// src/main.js), or for a view whose source reads nothing for it yet the
// `text` it shows.
// A new view is an entry here, its loading in its source's module
// (make<Source>().views[layout]) and, for a new way to draw, a shape.

export const KINDS = {
  "github board": { shape: "board" },
  "github list": { shape: "list" },
  "azure sprint": { text: "Sprint-Ansicht folgt" },
  "azure backlog": { text: "Backlog folgt" },
  "azure prs": { text: "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;

// ==== src/contexts.js ====

// The top bar's order of things: the sources it toggles between, the
// contexts of each, one tab apiece, and the view a context shows. On Azure a
// context is a team, with its views (Sprint, Backlog), or a project's pull
// requests; on GitHub each view of views.json is one.

// The sources in the toggle's order.
export const SOURCES = [
  { id: "azure", name: "Azure" },
  { id: "github", name: "GitHub" },
];

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

// The contexts of a source in a config, in views.json's order: { id, source,
// kind: "team" | "prs" | "view", name, … } (a team's fields, a project's, or
// the GitHub view as `view`).
export function contextsOf(config, source) {
  if (source === "azure") return config?.azure?.contexts ?? [];
  if (source === "github") return githubViews(config).map((v) => ({ id: `github:${v.id}`, source: "github", kind: "view", name: v.name, view: v }));
  return [];
}

// The sources of a config that have a context, in the toggle's order.
export const sourcesOf = (config) => SOURCES.filter((s) => contextsOf(config, s.id).length);

// The entry of `list` whose id is `id`, else the first; null in an empty
// list. A remembered choice that views.json no longer has falls back so.
export const pick = (list, id) => list.find((x) => x.id === id) ?? list[0] ?? null;

// The view a team context shows: the remembered one where it has it, else
// its first.
export const teamView = (context, remembered) => (context.views.includes(remembered) ? remembered : context.views[0]);

// The view a context shows (a team: its view `teamViewId`): a GitHub view
// as views.json has it, an Azure one { id, source: "azure", layout:
// "sprint" | "backlog" | "prs", name, context }. Its kind is viewKind(view).
export function viewOf(context, teamViewId) {
  if (context.kind === "view") return context.view;
  if (context.kind === "team") {
    return { id: `${context.id}:${teamViewId}`, source: "azure", layout: teamViewId, name: teamViewName(teamViewId), context };
  }
  return { id: context.id, source: "azure", layout: "prs", name: context.name, context };
}

// Every view of a config: one per context, one per view of a team.
export function viewsOf(config) {
  const contexts = SOURCES.flatMap((s) => contextsOf(config, s.id));
  return contexts.flatMap((c) => (c.kind === "team" ? c.views.map((v) => viewOf(c, v)) : [viewOf(c)]));
}

// ==== src/tools.js ====

// Running gh and az: one run of a program, what a program that could not
// run means, and finding each program by the path the person's shell gives
// on its machine.

// How long gh may take.
export const GH_TIMEOUT = 30000;

// exec's words for a program that is not there, and for a timeout: herdr
// stops a program at its timeout with "<program> took longer than <n> s
// and was stopped" (" on <machine>" before "and" on another machine);
// "timed out" stays for other wordings of the same.
const NOT_INSTALLED = /program not found|no such file or directory|command not found|not installed|ENOENT/i;
const TIMED_OUT = /took longer than [\d.]+ s( on .+)? and was stopped|time(d)?[ -]?out/i;
const toolOn = (tool, on) => (on ? `${tool} auf ${on}` : tool);

// A program that is not there, with a note on how that was found out. Only a
// missing az is marked unavailable (BoardError).
const notInstalled = (tool, on, note = "") =>
  new BoardError(`${toolOn(tool, on)} ist nicht installiert${note ? ` (${note})` : ""}`, { unavailable: tool === "az" });

// A program that would not start, with exec's words for why.
const notStarted = (tool, on, msg) => new BoardError(`${toolOn(tool, on)} ließ sich nicht starten: ${msg}`);

// An exec that could not run at all (exec rejected). An unreachable machine
// or a failed start is an error; a missing program is notInstalled. With
// `write`, a timeout, or any other failure of a call on another machine,
// leaves open whether the change landed; a program that is not installed
// changed nothing.
export function execRejection(tool, error, timeoutMs, on = null, { write = false } = {}) {
  const msg = firstLine(error?.message ?? error);
  const who = toolOn(tool, on);
  if (NOT_INSTALLED.test(msg)) return notInstalled(tool, on);
  if (TIMED_OUT.test(msg)) return failure(`${who} antwortete nicht in ${Math.round(timeoutMs / 1000)} s`, { write, unclear: true });
  if (write && on) return failure(`${who}: ${msg}`, { write, unclear: true });
  return notStarted(tool, on, msg);
}

// herdr runs a program with the PATH it was started with, which may lack
// what the person's shell adds (Homebrew, mise). So gh and az run by the
// absolute path that shell gives on their machine, the way herdr starts
// agents (AGENTS.md, programs.json): interactive here, login and interactive
// on another machine. Its startup files may print anything (a banner), so
// each answer stands between markers.
export const WHICH_START = "<<board-which>>";
export const WHICH_END = "<</board-which>>";
export const SHELL_START = "<<board-shell>>";
export const SHELL_END = "<</board-shell>>";

// Prints the shell it asks and the person's own (tab apart, between the
// shell markers), then the path of the program named in $1 (a name of this
// file's own, never one from views.json) as that shell's PATH finds it,
// between the path markers; "login" in $2 starts that shell as a login
// shell too. The person's shell is $SHELL, else (unset or empty) the
// account's; sh, bash, zsh, dash, ksh and fish run as themselves, any other
// (or none) as /bin/sh with the same flags. A plain sh in that shell looks
// the program up, so an alias or function of the same name does not count.
export const WHICH_SCRIPT = [
  'wanted=${SHELL:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)}',
  "shell=$wanted",
  "case ${shell##*/} in sh|bash|zsh|dash|ksh|fish) ;; *) shell=/bin/sh ;; esac",
  `printf '${SHELL_START}%s\\t%s${SHELL_END}' "$shell" "$wanted"`,
  'if [ "$2" = login ]; then set -- "$1" -l -i; else set -- "$1" -i; fi',
  "tool=$1",
  "shift",
  `exec "$shell" "$@" -c "printf '%s' '${WHICH_START}'; command sh -c 'command -v $tool'; printf '%s' '${WHICH_END}'"`,
].join("\n");

export const whichArgs = (tool, on) => ["-c", WHICH_SCRIPT, "board-which", tool, on ? "login" : ""];

// The text between the last pair of `start` and `end` markers, or null.
function between(stdout, start, end) {
  const text = String(stdout ?? "");
  const to = text.lastIndexOf(end);
  const from = to < 0 ? -1 : text.lastIndexOf(start, to);
  return from < 0 ? null : text.slice(from + start.length, to);
}

// The shell's answer from what it printed, trimmed ("" when it does not find
// the program), or null when there is none.
export const readWhich = (stdout) => between(stdout, WHICH_START, WHICH_END)?.trim() ?? null;

// The shell the script asked and the person's own ("" when none is known),
// or null when the script did not say.
export function readShell(stdout) {
  const said = between(stdout, SHELL_START, SHELL_END);
  if (said === null) return null;
  const [asked, own = ""] = said.split("\t");
  return { asked, own };
}

// What herdr says when it cannot start sh on another machine: a Windows
// machine (as herdr's own Files mod reads it).
const NO_SH = "cannot start sh: program not found";
// The lines an interactive bash without a terminal prints on every start.
const JOB_CONTROL = /cannot set terminal process group|no job control in this shell/;

// A program on a machine (on: null here), asked of the shell there with
// `execute` (herdr's exec): { program: its absolute path, bare: false }. Not
// there: notInstalled, noting /bin/sh when it was asked in place of the
// person's shell. A shell that could not be asked, or gave no answer or no
// path, says so instead. Another machine where herdr cannot start sh
// (Windows) runs the program by its bare name, from the PATH herdr runs it
// with there: { program: tool, bare: true }.
export async function findTool(execute, tool, on, timeoutMs) {
  const unknown = `Pfad von ${toolOn(tool, on)} nicht ermittelt`;
  let r;
  try {
    r = await execute("sh", whichArgs(tool, on), { on, timeout: timeoutMs });
  } catch (e) {
    const msg = firstLine(e?.message ?? e);
    if (on && String(e?.message ?? e).includes(NO_SH)) return { program: tool, bare: true };
    throw new BoardError(TIMED_OUT.test(msg) ? `${unknown}: die Shell antwortete nicht in ${Math.round(timeoutMs / 1000)} s` : `${unknown}: ${msg}`);
  }
  const shell = readShell(r.stdout);
  const answer = readWhich(r.stdout);
  if (answer === null) {
    // The last line that is not bash's own job control notice is the one
    // that says what ended the shell.
    const said = lastLine(String(r.stderr ?? "").split("\n").filter((l) => !JOB_CONTROL.test(l)).join("\n"));
    throw new BoardError(`${unknown}: ${shell?.asked ?? "die Shell"} endete mit ${r.code} ohne Antwort${said ? ` (${said})` : ""}`);
  }
  if (answer === "") {
    const standIn = shell && shell.asked !== shell.own;
    const own = shell?.own ? ` statt ${shell.own.split("/").pop()}` : ", keine Shell eingetragen";
    throw notInstalled(tool, on, standIn ? `gefragt: ${shell.asked}${own}` : "");
  }
  if (!answer.startsWith("/")) throw new BoardError(`${unknown}: die Shell kennt nur „${firstLine(answer)}“, kein Programm`);
  return { program: answer, bare: false };
}

// Runs gh and az by what findTool finds, per machine and program. A found
// program is kept until reset (on `r`); runs at the same time share one
// lookup per machine and program, and one that fails is not kept, so the
// next run asks again. When a run finds the program gone from its path
// (exec's words for a missing program), that lookup is forgotten (a newer
// one that has taken its place is kept) and the run starts again from the
// current lookup, asking the shell if there is none: the program never
// started, so even a write may run again. Gone a second time, the run fails
// and the next run asks again; a bare name is not asked for again.
export function toolPaths(execute) {
  const known = new Map();
  return {
    // start(program) runs the program; its rejection passes on unchanged,
    // but for the second time it is gone.
    async run(tool, on, timeoutMs, start) {
      const key = `${on ?? ""}\n${tool}`;
      for (let again = false; ; again = true) {
        if (!known.has(key)) {
          const fresh = findTool(execute, tool, on, timeoutMs);
          known.set(key, fresh);
          fresh.catch(() => known.get(key) === fresh && known.delete(key));
        }
        const lookup = known.get(key);
        const { program, bare } = await lookup;
        try {
          return await start(program);
        } catch (e) {
          const msg = firstLine(e?.message ?? e);
          if (bare || !NOT_INSTALLED.test(msg)) throw e;
          if (known.get(key) === lookup) known.delete(key);
          if (again) throw notStarted(tool, on, msg);
        }
      }
    },
    reset() {
      known.clear();
    },
  };
}

// One run of a program: its result, or a BoardError when it could not run.
// With `paths` (toolPaths) it runs by what that finds. `write` is for calls
// that change something (see execRejection).
export async function call(tool, args, on, timeout, { write = false, paths = null } = {}) {
  const start = (program) => exec(program, args, { on, timeout });
  try {
    return await (paths ? paths.run(tool, on, timeout, start) : start(tool));
  } catch (e) {
    throw e instanceof BoardError ? e : execRejection(tool, e, timeout, on, { write });
  }
}

// ==== src/actions/start.js ====

// Starting an item's session: its name, finding it again, the first
// message, the checkout and the command that opens it.

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

// ==== src/sources/azure.js ====

// Azure DevOps: work item types and their states, what az's failures mean,
// and the source as the board uses it (makeAzure). What the Azure views read
// and write comes with each view; these stay for them.

// Theme colors and column order for Azure's state categories.
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

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

// az's words for a request that may have reached Azure but got no clear
// answer: msrest's "Error occurred in request., <requests exception>: …"
// and the requests messages it wraps (ConnectionError, ReadTimeout, …).
const AZ_SENT_FAILURE = /Error occurred in request\.|HTTPSConnectionPool|Connection aborted|Read timed out|ReadTimeout|Max retries/i;
// Azure's answers that it failed itself: the Azure DevOps client's
// "Operation returned a 5xx status code.", TF400898 (an internal error), and
// msrest's RetryError after retrying 408 and 5xx answers ("too many 503
// error responses"), which also names "Max retries" and is tested first.
const AZ_SERVER_ERROR = /Operation returned a 5\d\d status code|TF400898|too many \d+ error responses/i;
// ERROR: answers that are a refusal: rule errors (TF401320), something that
// does not exist, az's own argument errors, and 4xx status lines.
const AZ_REFUSED = /^TF401320\b|does not exist|^argument |the following arguments are required|unrecognized arguments|Operation returned a 4\d\d status code|requires user authentication/i;

// What went wrong with an az call that ran, from its ERROR: line (WARNING:
// lines are left out; without an ERROR: line, from all it printed). Missing
// sign-in or extension are marked unavailable (BoardError). With
// `write`, a known refusal form (AZ_REFUSED) is a refusal, as are the
// sign-in, extension and project answers below; anything else (a request
// without a clear answer, a server error, az's own crash or interrupt, a
// failure without an ERROR: line) leaves open whether the change landed.
export function azFailure({ code, stderr }, on = null, { write = false } = {}) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const errorLine = lines.find((l) => /^ERROR:/.test(l));
  const said = (errorLine ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim();
  const az = on ? `az auf ${on}` : "az";
  // A crash's traceback may hold any words; az's own line says what failed.
  const subject = errorLine ? said : lines.join("\n");
  if (AZ_SERVER_ERROR.test(subject)) return failure(`Azure antwortete mit einem Fehler (${az}): ${said}`, { write, unclear: true });
  if (AZ_SENT_FAILURE.test(subject)) return failure(`Azure nicht erreichbar (${az}): ${said}`, { write, unclear: true });
  if (/Before you can run Azure DevOps commands|az (devops )?login/i.test(said)) {
    return new BoardError(`${az} ist nicht angemeldet (az login oder az devops login)`, { unavailable: true });
  }
  if (/'(boards|devops)' is misspelled or not recognized|is not in the 'az' command group/.test(said)) {
    return new BoardError(`${az}: die Erweiterung azure-devops fehlt (az extension add --name azure-devops)`, { unavailable: true });
  }
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return failure(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`, { write, unclear: !errorLine || !AZ_REFUSED.test(said) });
}

// The Azure source for the board, as makeGithub's: no view of it reads
// anything yet, so each shows what its kind says (KINDS).
export function makeAzure() {
  return { site: "Azure", views: {} };
}

// ==== src/sources/github.js ====

// GitHub: the queries for a Projects v2 board and a pull request list, their
// parsing, the status mutation, what gh's answers and failures mean, and the
// source as the board uses it (makeGithub).

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
    ... on Issue { number title url issueType { name } repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } }
      parent { number } subIssuesSummary { total completed } }
    ... on PullRequest { number title url headRefName repository { nameWithOwner } author { login }
      labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } } }
    ... on DraftIssue { title creator { login } assignees(first: 5) { nodes { login } } }
  }`;

// One GraphQL request for a board view: the project, its field's options and
// the items of the shown columns, plus one count per hidden column (`h0`,
// `h1`, … aliases, first: 0) for the stubs, and the login gh runs as (for
// "nur meine").
export function githubBoardArgs(view, hidden) {
  const { owner, number, field } = view.project;
  const names = [...hidden];
  const key = fieldKey(field);
  const filter = [view.filter, names.length ? `-${key}:${names.map(quoted).join(",")}` : ""].filter(Boolean).join(" ");
  const counts = names.map((_, i) => `h${i}: items(first: 0, query: $h${i}) { totalCount }`).join("\n");
  const vars = names.map((_, i) => `, $h${i}: String!`).join("");
  const doc = `query($login: String!, $number: Int!, $field: String!, $filter: String!${vars}) {
  viewer { login }
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
    author: c.author?.login ?? c.creator?.login ?? null,
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
// { kind: "board", meta, columns: [{ id, name, color, hidden, count, target, cards }], total, limited, viewer }
// (viewer: the login gh runs as, null when GitHub did not say).
// A hidden column's cards are only those moved there since the last refresh;
// its count is the server's plus those. Items without a status, or in an
// option the field no longer has, go to "Ohne Status", which takes no drops.
// A missing owner, project, field or item list is explained by the error at
// its path.
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
    viewer: json?.data?.viewer?.login ?? null,
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

const PR_FIELDS = `
  issueCount
  nodes {
    ... on PullRequest {
      id number title url isDraft createdAt updatedAt headRefName reviewDecision
      repository { nameWithOwner } author { login }
      assignees(first: 10) { nodes { login } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 0) {
        checkRunCountsByState { state count } statusContextCountsByState { state count } } } } } }
    }
  }`;

// One GraphQL request for a list view: one search per section (`s0`, `s1`,
// …), and the login gh runs as.
export function githubListArgs(view) {
  const searches = view.sections.map((_, i) => `s${i}: search(type: ISSUE, first: ${view.limit}, query: $q${i}) { ${PR_FIELDS} }`);
  const vars = view.sections.map((_, i) => `$q${i}: String!`).join(", ");
  const doc = `query(${vars}) {\nviewer { login }\n${searches.join("\n")}\n}`;
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
// data) → { kind: "list", sections: [{ name, count, limited, skipped, rows }], viewer }.
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
        assignees: (pr.assignees?.nodes ?? []).map((a) => a.login),
        // Requested reviewers that are people; a team's request names no login.
        reviewers: (pr.reviewRequests?.nodes ?? []).map((r) => r.requestedReviewer?.login).filter(Boolean),
      });
    }
    return { name: s.name, count: found.issueCount, limited: found.issueCount > found.nodes.length, skipped, rows };
  });
  return { kind: "list", sections, viewer: json?.data?.viewer?.login ?? null };
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

// A gh call that ran, { code, stdout, stderr } → { json, warnings, errors },
// or a BoardError. gh exits 1 whenever GraphQL's answer holds errors, even
// next to data, and prints them as "gh: <message>", without their type.
// Errors that make the answer useless (login, scope, rate limit) throw; with
// data, the others come back as warnings, and the raw errors for the parser
// to explain a missing part.
// With `write` (`path`: where the mutation's own errors point), a GraphQL
// error with a type or code is a refusal carrying its message, the mutation's
// own first; an error without either, a server timeout, a connection that
// broke after it was made, HTTP 5xx, an unreadable answer and any failure gh
// does not explain are unclear. A request that never left (NOT_SENT) and
// HTTP 4xx are refusals.
export function readGh({ code, stdout, stderr }, { write = false, path = null } = {}) {
  const err = String(stderr ?? "");
  const said = firstLine(err.replace(/^gh: /gm, ""));
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Not JSON: what went wrong is on stderr.
  }
  if (code === 0 && json === null) throw failure("gh antwortete ohne lesbares JSON", { write, unclear: true });
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

// The GitHub source for the board: the name of the site `o` opens, what
// "nur meine" says when GitHub did not name the login, and per layout of a
// GitHub view how it loads (`hiddenFor(view)` gives its hidden columns) and
// how a board writes a move. gh runs by the path `paths` (toolPaths) finds.
export function makeGithub(paths) {
  return {
    site: "GitHub",
    noViewer: "„nur meine“ zeigt nichts: GitHub hat nicht gesagt, als wer gh angemeldet ist",
    views: {
      board: {
        async load(view, hiddenFor) {
          const hidden = hiddenFor(view);
          const { json, warnings, errors } = await gh(paths, githubBoardArgs(view, hidden));
          return { data: parseGithubBoard(json, view, hidden, errors), warnings };
        },
        async move(view, data, card, column) {
          checkMoveResult((await gh(paths, githubMoveArgs(data.meta, card, column), { write: true, path: MOVE_PATH })).json, card);
        },
      },
      list: {
        async load(view) {
          const { json, warnings, errors } = await gh(paths, githubListArgs(view));
          return { data: parseGithubList(json, view, errors), warnings };
        },
      },
    },
  };
}

// ==== src/sources/index.js ====

// The sources as the Board uses them, by id: each source's module makes its
// own (makeGithub, makeAzure).

export const makeSources = (paths) => ({ azure: makeAzure(paths), github: makeGithub(paths) });

// ==== src/ui/helpers.js ====

// UI helpers: lasting settings, colors and machine names, whether the board
// shows, and an error's text for the UI.

// Settings that last across reloads: the shown source ("source"), each
// source's tab ("tab:<source>"), each team's view ("teamView:<context>"),
// "nur meine" ("mine") and each view's hidden columns ("hidden:<view>"). A
// full or missing localStorage keeps them for this session only.
export const store = {
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

// The shown view a board before the top bar kept ("view": a GitHub view's
// id) becomes the GitHub source and that tab, once; what is set already
// stays.
export function migrateShownView() {
  const view = store.get("view");
  if (typeof view !== "string") return;
  if (store.get("source") === null) store.set("source", "github");
  if (store.get("tab:github") === null) store.set("tab:github", `github:${view}`);
  store.set("view", null);
}

export const tint = (hex, alpha) => (/^#[0-9a-f]{6}$/i.test(hex ?? "") ? `${hex}${alpha}` : hex);
export const machineName = (name) => name ?? "Dieser Rechner";
// "auf <machine>", or "auf diesem Rechner" for this one.
export const onMachine = (name) => (name ? `auf ${name}` : "auf diesem Rechner");

// Whether a board pane is in the shown tab of the shown space.
export function boardShown() {
  const shownTabs = new Set(spaces().filter((s) => s.active).flatMap((s) => s.tabs.filter((t) => t.active).map((t) => t.id)));
  return panes().some((p) => p.mod === MOD && shownTabs.has(p.tab));
}

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) console.log(e?.stack ?? String(e));
  return errorText(e);
}

// ==== src/main.js ====

const CHECKOUT_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
const TICK_MS = 30000;
const SCROLLS = 24;
// What "nur meine" says over data that does not name the login it was read
// as, where its source has no words of its own (noViewer).
const NO_VIEWER = "„nur meine“ zeigt nichts: die Quelle hat nicht gesagt, als wer sie gelesen wurde";

// "<shown> von <total>" where a filter or "nur meine" hides some, else the
// total.
const shownOf = (shown, total) => (shown < total ? `${shown} von ${total}` : String(total));

// How a view's data is drawn and worked with, by shape: data carries the
// shape it was read in (data.kind); before any, the view's kind names it
// (KINDS), and a view its source reads nothing for has the placeholder. Each
// shape: nav (the columns that keyboard movement and selection walk, a list
// as one), selected (the selected item), scrollTo, count ({ shown, total }
// items, or null), render, hints (the view's own keys), dirs (the arrow
// directions that move), keys (the view's own keys; true when one was
// taken), received (the data as kept after a refresh), warnings, settles
// (whether a refresh tells where unclear writes ended up) and column (an
// item's column, for its detail).
const SHAPES = {
  board: {
    nav: (b, st) => shownColumns(st.data, b.filterText, b.mine),
    selected: (b, st) => findCard(st.data, st.sel?.key)?.card ?? null,
    scrollTo: (b, view, sel, row) => b.scrolls[sel.col % SCROLLS].scroll_to_item(row),
    count(b, data) {
      const cols = shownColumns(data, b.filterText, b.mine).filter((c) => !c.hidden);
      return { shown: cols.reduce((n, c) => n + c.shown.length, 0), total: cols.reduce((n, c) => n + c.cards.length, 0) };
    },
    render: (b, t, mono, view, st) =>
      st.data.columns.length ? b.board(t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge"),
    hints: [["h/l j/k", "bewegen"], ["H/L", "verschieben"], ["s", "Status"], ["x", "Spalte"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
    dirs: ["up", "down", "left", "right"],
    keys(b, view, st, { k, ch, mod }, cx) {
      if (!st.data) return false;
      const upper = mod.shift && (k === "h" || k === "l") ? k.toUpperCase() : ch;
      if (upper === "H" || upper === "L") {
        const target = st.sel?.key && stepTarget(st.data, b.navColumns(view), st.sel?.key, upper === "H" ? -1 : 1);
        if (target) b.moveTo(view, st.sel?.key, target.id, cx);
        return true;
      }
      if (k === "s") return b.openStatusMenu(view), true;
      if (k === "x") {
        const col = b.navColumns(view)[st.sel?.col];
        if (col) b.toggleColumn(view, col, cx);
        return true;
      }
      return false;
    },
    received: (data, st) => applyMoves(data, st.moves),
    warnings: (view, data) => unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
    settles: true,
    column: (data, item) => findCard(data, item.key)?.column ?? null,
  },
  list: {
    nav: (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => s.rows.filter((r) => b.visible(r, st.data))) }],
    selected: (b, st) => SHAPES.list.nav(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
    scrollTo: (b, view, sel) => b.scrollList(view, sel.key),
    count(b, data) {
      const rows = data.sections.flatMap((s) => s.rows);
      return { shown: rows.filter((r) => b.visible(r, data)).length, total: rows.length };
    },
    render: (b, t, mono, view, st) => b.list(t, mono, view, st),
    hints: [["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"]],
    dirs: ["up", "down"],
    keys: () => false,
    received: (data) => data,
    warnings: (_view, data) => data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`),
    settles: false,
    column: () => null,
  },
  placeholder: {
    nav: () => [],
    selected: () => null,
    scrollTo() {},
    count: () => null,
    render: (b, t, mono, view) => div().p(20).text_color(t.muted).child(kindOf(view)?.text ?? "Diese Ansicht gibt es noch nicht"),
    hints: [],
    dirs: [],
    keys: () => false,
    received: (data) => data,
    warnings: () => [],
    settles: false,
    column: () => null,
  },
};

export default class Board extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.config = null;
    this.configErrors = [];
    this.views = {}; // per view id, see state()
    // What the top bar shows, as last chosen: the source, its tab (a context
    // id) per source, the view per team context, and "nur meine".
    migrateShownView();
    this.sourceId = store.get("source");
    this.tabIds = { azure: store.get("tab:azure"), github: store.get("tab:github") };
    this.teamViews = {};
    this.mine = store.get("mine") === true;
    this.filterText = "";
    this.filtering = false;
    this.modal = null; // { kind: "status", … } or { kind: "start", … }
    this.notice = null; // { text, level }
    this.drag = null; // { key, from }
    this.over = null; // the column index under a drag
    this.paths = toolPaths(exec);
    this.sources = makeSources(this.paths);
    this.kinds = null; // view id → viewKind in the last valid views.json
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

  // A view's state: data and error, loading (again: one more refresh
  // after this one), at (last success) and tried (last start), warnings,
  // moves (laid over refreshes, see pendingMoves), pending (card keys being
  // written), unclear ({ key, label, to, at } of writes whose outcome is
  // still open; see settleUnclear), stored/hidden (the person's toggles and
  // the hidden set), sel ({ col, key }, null before the first data) and
  // detail.
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, warnings: [], moves: [], pending: {}, unclear: [],
      stored: readStoredHidden(store.get(`hidden:${id}`)), hidden: null, sel: null, detail: false,
    };
    return this.views[id];
  }

  // The source the top bar shows (null without a valid views.json), its
  // contexts (one tab each) and the shown one.
  source() {
    return pick(sourcesOf(this.config), this.sourceId);
  }

  contexts() {
    const source = this.source();
    return source ? contextsOf(this.config, source.id) : [];
  }

  context() {
    const source = this.source();
    return source ? pick(this.contexts(), this.tabIds[source.id]) : null;
  }

  // The view a team context shows (one of TEAM_VIEWS).
  teamViewOf(context) {
    this.teamViews[context.id] ??= store.get(`teamView:${context.id}`);
    return teamView(context, this.teamViews[context.id]);
  }

  // The view a context shows (a team: the view it shows).
  viewFor(context) {
    return viewOf(context, context.kind === "team" ? this.teamViewOf(context) : null);
  }

  // The view the shown tab holds, or null.
  view() {
    const context = this.context();
    return context ? this.viewFor(context) : null;
  }

  // A view as views.json has it now, by id; null when it is gone.
  viewById(id) {
    return viewsOf(this.config).find((v) => v.id === id) ?? null;
  }

  // How a view loads and writes ({ load, move? }); null for a view its
  // source reads nothing for (yet).
  loader(view) {
    return this.sources[view.source]?.views?.[view.layout] ?? null;
  }

  // The view's shape (SHAPES).
  shape(view) {
    const data = this.state(view.id).data;
    return SHAPES[data?.kind ?? (this.loader(view) ? kindOf(view)?.shape : null) ?? "placeholder"];
  }

  hiddenFor(view) {
    const st = this.state(view.id);
    st.hidden = hiddenColumns(view, st.stored);
    return st.hidden;
  }

  // Reads views.json again and refreshes the shown view; see Calls in the
  // header.
  reload(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/mods/${MOD}/${CONFIG_NAME}.json`).catch((e) => {
        this.configErrors = [`${CONFIG_NAME}.json ließ sich nicht lesen: ${firstLine(e?.message ?? e)}`];
        return undefined;
      });
      if (text !== undefined) ({ config: this.config, errors: this.configErrors } = readConfig(text));
      this.paths.reset();
      cx.notify();
      if (!this.config) return;
      // Open outcomes of a view that is gone, or is now of another kind than
      // in the last valid views.json, are dropped.
      const kinds = new Map(viewsOf(this.config).map((v) => [v.id, viewKind(v)]));
      // Before the first valid views.json no view has a state to compare.
      const before = this.kinds ?? kinds;
      for (const [id, st] of Object.entries(this.views)) if (kinds.get(id) !== before.get(id)) st.unclear = [];
      this.kinds = kinds;
      const shown = this.view();
      if (shown) this.refresh(shown, cx);
    });
  }

  refresh(view, cx) {
    const loader = this.loader(view);
    if (!loader) return;
    const st = this.state(view.id);
    // A refresh asked for while one runs (a column shown or hidden) follows it.
    if (st.loading) return void (st.again = true);
    st.loading = true;
    st.again = false;
    st.tried = Date.now();
    const started = st.tried;
    cx.spawn(async (cx) => {
      try {
        const { data, warnings } = await loader.load(view, (v) => this.hiddenFor(v));
        st.moves = pendingMoves(st.moves, started);
        st.data = SHAPES[data.kind].received(data, st);
        st.warnings = [...warnings, ...SHAPES[data.kind].warnings(view, data)];
        st.error = null;
        st.at = Date.now();
        this.keepSelection(view);
        this.settleUnclear(view, started, data, cx);
      } catch (e) {
        st.error = report(e);
        const open = st.unclear.filter(isDue(st, started));
        if (open.length) {
          this.say(`${open.map((u) => u.label).join(", ")}: Ergebnis weiter offen, Neuladen fehlgeschlagen (${errorText(e)})`, "warning", cx);
        }
      } finally {
        st.loading = false;
        // The follow-up refresh reads the view from the config as it is now.
        const fresh = this.viewById(view.id);
        if (st.again && fresh) this.refresh(fresh, cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  // After a refresh that succeeded: where the cards of unclear writes are
  // now, by the server's answer (`data`, without the moves laid over it), for
  // the writes whose outcome came before that refresh started (an older one
  // may have read before the write ended) and whose card has no write under
  // way (that write decides first). The target column: the
  // write landed (info). Another column: a warning. Not loaded and the target
  // is hidden: said as not shown (info); not loaded while other columns are
  // hidden: not shown, it may be in any of them (warning); else not on the
  // board (warning).
  settleUnclear(view, started, data, cx) {
    const st = this.state(view.id);
    const due = st.unclear.filter(isDue(st, started));
    if (!due.length) return;
    st.unclear = st.unclear.filter((u) => !due.includes(u));
    // A view that is no board any more has no columns to tell.
    if (!SHAPES[data?.kind]?.settles) return;
    const lines = due.map((u) => {
      const now = findCard(data, u.key)?.column;
      if (now?.id === u.to.id) return { text: `${u.label} steht nach dem Neuladen in „${u.to.name}“`, warn: false };
      if (now) return { text: `${u.label} steht nach dem Neuladen in „${now.name}“, nicht in „${u.to.name}“`, warn: true };
      if (data.columns.find((c) => c.id === u.to.id)?.hidden) {
        return { text: `${u.label} steht nicht in den gezeigten Spalten („${u.to.name}“ ist ausgeblendet)`, warn: false };
      }
      const hidden = data.columns.filter((c) => c.hidden).map((c) => `„${c.name}“`);
      if (hidden.length) return { text: `${u.label} steht nicht in den gezeigten Spalten (ausgeblendet: ${hidden.join(", ")})`, warn: true };
      return { text: `${u.label} ist nach dem Neuladen nicht auf dem Board`, warn: true };
    });
    const level = lines.some((l) => l.warn) ? "warning" : "info";
    const text = lines.map((l) => l.text).join("; ");
    this.say(text, level, cx);
    if (level === "warning") notify({ title: "Status nach dem Neuladen", body: text, level: "warning" });
  }

  // Every TICK_MS while the board shows: the shown view once refreshMinutes
  // have passed since it was last tried.
  tick(cx) {
    if (!this.config || !boardShown()) return;
    const every = this.config.refreshMinutes * 60000;
    const due = (v) => Date.now() - this.state(v.id).tried >= every;
    const shown = this.view();
    if (shown && due(shown)) this.refresh(shown, cx);
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
        await this.loader(view).move(view, st.data, found.card, to);
        move.confirmedAt = Date.now();
        // A new move that landed replaces the open outcome of an earlier one.
        st.unclear = st.unclear.filter((u) => u.key !== key);
        this.say(`${label} steht jetzt in „${to.name}“`, "success", cx);
      } catch (e) {
        st.moves = st.moves.filter((m) => m !== move);
        const why = report(e);
        // Followed up only while views.json still has this view, of the same
        // kind (as the last valid views.json says; an invalid one in between
        // keeps it).
        const followed = this.kinds?.get(view.id) === viewKind(view);
        const current = this.viewById(view.id);
        if (e instanceof BoardError && e.unclear) {
          if (followed) st.unclear = [...st.unclear.filter((u) => u.key !== key), { key, label, to: { id: to.id, name: to.name }, at: Date.now() }];
          const next = !followed ? "" : current ? "; lädt neu" : "; wird nach dem nächsten Neuladen gemeldet";
          this.say(`${label} → ${to.name}: ${why}${next}`, "warning", cx);
          notify({ title: `Status von ${label}`, body: why, level: "warning" });
          if (followed && current) this.refresh(current, cx);
        } else {
          st.data = rollback(st.data, move);
          // With an earlier outcome of the card open, where it is now is for
          // the refresh to say.
          const open = st.unclear.some((u) => u.key === key);
          this.say(open ? `${label} → ${to.name} nicht gespeichert: ${why}` : `${label} bleibt in „${found.column.name}“: ${why}`, "error", cx);
          notify({ title: `Status von ${label} nicht geändert`, body: why, level: "error" });
          // An earlier unclear write of the card waited for this one; the
          // server's answer tells it now.
          if (followed && current && open) this.refresh(current, cx);
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

  // Whether an item of `data` shows: it matches the filter and, with "nur
  // meine" on, is one's own.
  visible(item, data) {
    return shows(item, this.filterText, this.mine, data.viewer);
  }

  // The view's columns as navigate takes them (a list as one).
  navColumns(view) {
    return this.shape(view).nav(this, this.state(view.id));
  }

  selected(view) {
    const st = this.state(view.id);
    if (!st.sel?.key) return null;
    return this.shape(view).selected(this, st);
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
    this.shape(view).scrollTo(this, view, sel, row);
  }

  // Shows the tab at `index` of the shown source; none there does nothing.
  switchTab(index, cx) {
    const source = this.source();
    const context = this.contexts()[index];
    if (!context) return;
    this.tabIds[source.id] = context.id;
    store.set(`tab:${source.id}`, context.id);
    this.showContext(cx);
  }

  // Shows another source with the tab it showed last.
  switchSource(id, cx) {
    if (!sourcesOf(this.config).some((s) => s.id === id)) return;
    this.sourceId = id;
    store.set("source", id);
    this.showContext(cx);
  }

  // The next source in the toggle's order, after the last the first.
  nextSource(cx) {
    const list = sourcesOf(this.config);
    const at = list.findIndex((s) => s.id === this.source()?.id);
    if (list.length > 1) this.switchSource(list[(at + 1) % list.length].id, cx);
  }

  // After another tab came up: the notice goes, and its view, without data
  // or older than refreshMinutes, loads (where its source reads it).
  showContext(cx) {
    this.notice = null;
    const v = this.view();
    const st = v && this.state(v.id);
    if (v && (!st.data || Date.now() - st.tried >= this.config.refreshMinutes * 60000)) this.refresh(v, cx);
    cx.notify();
  }

  // Shows a view of the shown team context; one it does not have does
  // nothing.
  setTeamView(name, cx) {
    const context = this.context();
    if (context?.kind !== "team" || !context.views.includes(name)) return;
    this.teamViews[context.id] = name;
    store.set(`teamView:${context.id}`, name);
    cx.notify();
  }

  // v: the shown team context's next view.
  nextTeamView(cx) {
    const context = this.context();
    if (context?.kind !== "team") return;
    const views = context.views;
    this.setTeamView(views[(views.indexOf(this.teamViewOf(context)) + 1) % views.length], cx);
  }

  // m: "nur meine" on or off, over whatever shows; nothing is read again.
  toggleMine(cx) {
    if (!this.source()) return;
    this.mine = !this.mine;
    store.set("mine", this.mine);
    const view = this.view();
    if (view && this.state(view.id).data) this.keepSelection(view);
    cx.notify();
  }

  toggleColumn(view, col, cx) {
    const st = this.state(view.id);
    if (!st.data?.columns) return;
    if (!col.target) return this.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
    st.stored = toggleHidden(view, st.stored, col);
    st.hidden = hiddenColumns(view, st.stored);
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
          m.agentNote = `Agent „${wanted}“ ist ${onMachine(on)} nicht installiert; gewählt: ${agents[0].name}`;
        }
      } catch (e) {
        if (this.modal !== m || m.machines[m.machine] !== on) return;
        m.agentsError = `Agents ${onMachine(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
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
        const folder = lastLine(r.stdout);
        if (!folder) throw new BoardError("Checkout-Ordner nicht gelesen");
        let space = null;
        if (m.open === "tab") {
          space = spaceForTab(spaces(), on, folder);
          if (!space) throw new BoardError(`Kein Space ${onMachine(on)} für einen neuen Tab; als neuer Space öffnen`);
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

  // Looks for a space or tab named `name` after each wait in SESSION_CHECKS;
  // says so when it appears, warns when it has not after the last.
  watchSession(name, cx, at = 0) {
    cx.timer.after(SESSION_CHECKS[at], (cx) => {
      const there = spaces().some((s) => s.name === name || s.tabs.some((t) => t.name === name));
      if (there) return this.say(`Sitzung geöffnet: ${name}`, "success", cx);
      if (at + 1 < SESSION_CHECKS.length) return this.watchSession(name, cx, at + 1);
      this.say(`Kein Space und kein Tab „${name}“ erschienen; die Sitzung ist wohl nicht gestartet`, "warning", cx);
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
      const tabs = this.contexts();
      const at = tabs.findIndex((c) => c.id === this.context()?.id);
      if (tabs.length) this.switchTab((at + (ch === "[" ? -1 : 1) + tabs.length) % tabs.length, cx);
      return done();
    }
    if (typed && ch === "/") return this.filterInput.focus(), done();
    if (mod.control || mod.alt || mod.platform) return;
    if (/^[1-9]$/.test(ch)) return this.switchTab(Number(ch) - 1, cx), done();
    if (!mod.shift) {
      const action = { r: () => this.reload(cx), q: () => this.nextSource(cx), v: () => this.nextTeamView(cx), m: () => this.toggleMine(cx) }[k];
      if (action) return action(), done();
    }
    const st = view ? this.state(view.id) : null;
    if (st?.data) this.keepSelection(view);
    if (k === "escape") {
      if (st?.detail) st.detail = false;
      else if (this.notice) this.notice = null;
      else if (this.filterText) {
        this.filterInput.set_value("");
        this.filterText = "";
      }
      return done();
    }
    if (!view) return;
    const shape = this.shape(view);
    const dir = mod.shift ? null : { j: "down", down: "down", k: "up", up: "up", h: "left", left: "left", l: "right", right: "right" }[k];
    if (dir && st.data) {
      if (shape.dirs.includes(dir)) this.select(view, navigate(this.navColumns(view), st.sel, dir));
      return done();
    }
    if (shape.keys(this, view, st, { k, ch, mod }, cx)) return done();
    if (k === "enter") return this.enter(view, cx), done();
    if (k === "o") return this.open(this.selected(view), cx), done();
  }

  scrollList(view, key) {
    const st = this.state(view.id);
    let child = 0;
    for (const s of st.data.sections) {
      child++; // the section's heading
      for (const r of s.rows.filter((row) => this.visible(row, st.data))) {
        if (r.key === key) return this.listScroll.scroll_to_item(child);
        child++;
      }
    }
  }

  openStatusMenu(view) {
    const st = this.state(view.id);
    const card = this.selected(view);
    if (!card || !st.data?.columns) return;
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
        // h_flex centres its items; the content and the detail span the
        // full height, each starting at the top.
        h_flex()
          .flex_1()
          .min_h(0)
          .items_stretch()
          .child(this.main(t, mono, view, st))
          .when(Boolean(item), (el) => el.child(this.detail(t, mono, view, item))),
      )
      .child(this.hints(t, view));
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

  // The top bar, two rows so that neither the tabs nor the filter have to
  // give way on a small screen: the source toggle, a tab per context of the
  // shown source and a team's view switch (where it has two); then "nur
  // meine", the filter, when the shown view was read, and refresh. Without a
  // valid views.json the first row holds only the board's name.
  toolbar(t, view, st) {
    const updated = st?.loading ? "lädt …" : st?.at ? `aktualisiert ${updatedLabel(st.at, Date.now())}` : "";
    const source = this.source();
    const context = this.context();
    const row = () => h_flex().gap(12).px(16).items_center();
    let nav = row().pt(8).pb(4);
    if (!source) nav = nav.child(div().flex_none().text_size(15).font_semibold().child("Board"));
    else {
      const sources = sourcesOf(this.config).map((s) => ({ id: s.id, label: s.name }));
      nav = nav
        .child(this.segments(t, "source", sources, source.id, (id, cx) => this.switchSource(id, cx)))
        .child(this.tabs(t, context))
        .when(context?.kind === "team" && context.views.length > 1, (el) => {
          const views = context.views.map((v) => ({ id: v, label: teamViewName(v) }));
          return el.child(this.segments(t, "team-view", views, this.teamViewOf(context), (name, cx) => this.setTeamView(name, cx)));
        });
    }
    const tools = row()
      .pt(4)
      .pb(8)
      .when(Boolean(source), (el) => el.child(this.mineToggle(t)))
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
    return v_flex().id("top-bar").flex_none().border_b(1).border_color(t.border).child(nav).child(tools);
  }

  // A row of choices, the chosen one marked; a click picks one (`pick(id,
  // cx)`). Each choice has the id `<id>-<choice id>`.
  segments(t, id, choices, chosen, pick) {
    return h_flex()
      .id(id)
      .flex_none()
      .p(2)
      .gap(2)
      .rounded(7)
      .border_1()
      .border_color(t.border)
      .bg(t.chrome)
      .children(
        choices.map((c) =>
          div()
            .id(`${id}-${c.id}`)
            .px(10)
            .py(4)
            .rounded(5)
            .text_size(12)
            .cursor_pointer()
            .text_color(c.id === chosen ? t.foreground : t.muted)
            .when(c.id === chosen, (el) => el.bg(t.selected).font_semibold())
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => {
              if (!this.modal) pick(c.id, cx);
            })
            .child(c.label),
        ),
      );
  }

  // The shown source's tabs: number, name and, for a view with data, how
  // many items it holds ("…" while it loads; "<shown> von <total>" while
  // the filter or "nur meine" hides some).
  tabs(t, context) {
    const count = (c) => {
      const st = this.state(this.viewFor(c).id);
      if (st.loading) return "…";
      const n = st.data ? SHAPES[st.data.kind].count(this, st.data) : null;
      return n ? shownOf(n.shown, n.total) : "";
    };
    // Too narrow for all, the names give way first (cut with …).
    return h_flex()
      .id("tabs")
      .min_w(0)
      .overflow_x_hidden()
      .gap(2)
      .children(
        this.contexts().map((c, i) =>
          h_flex()
            .id(`tab-${c.id}`)
            .min_w(0)
            .px(10)
            .py(5)
            .gap(6)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .text_color(c.id === context?.id ? t.foreground : t.muted)
            .when(c.id === context?.id, (el) => el.bg(t.selected).font_semibold())
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => {
              if (!this.modal) this.switchTab(i, cx);
            })
            .child(div().flex_none().text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
            .child(div().min_w(0).truncate().child(c.name))
            .child(div().flex_none().text_size(12).text_color(t.muted).child(count(c))),
        ),
      );
  }

  // "nur meine": when on, solid and checked.
  mineToggle(t) {
    return div()
      .id("mine")
      .flex_none()
      .px(10)
      .py(5)
      .rounded(6)
      .text_size(12)
      .cursor_pointer()
      .border_1()
      .border_color(this.mine ? t.accent : t.border)
      .bg(this.mine ? t.solid : t.chrome)
      .text_color(this.mine ? t.solid_foreground : t.muted)
      .when(this.mine, (el) => el.font_semibold())
      .hover((s) => s.bg(this.mine ? t.accent : t.hover))
      .on_click((_e, cx) => {
        if (!this.modal) this.toggleMine(cx);
      })
      .child(this.mine ? "✓ nur meine" : "nur meine");
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

  main(t, mono, view, st) {
    const box = v_flex().flex_1().min_w(0).min_h(0);
    const message = (text) => box.child(div().p(20).text_color(t.muted).child(text));
    if (!this.config) return message(this.configErrors.length ? `Keine gültige Ansicht in ${CONFIG_NAME}.json` : "Lädt …");
    if (!view) return message("Keine Ansicht verfügbar");
    const shape = this.shape(view);
    if (shape === SHAPES.placeholder) return box.child(shape.render(this, t, mono, view, st));
    if (!st.data && !st.error) return message(st.loading ? "Lädt …" : "Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(div().px(16).pt(14).text_color(t.ansi1).child(st.error));
    const noViewer = this.mine && st.data && !st.data.viewer ? [this.sources[view.source].noViewer ?? NO_VIEWER] : [];
    const warnings = [...st.warnings, ...noViewer];
    if (warnings.length) shown = shown.children(warnings.map((w) => div().px(16).pt(6).text_size(12).text_color(t.ansi3).child(w)));
    if (!st.data) return shown;
    return shown.child(shape.render(this, t, mono, view, st));
  }

  board(t, mono, view, st) {
    const cols = this.navColumns(view);
    const allSpaces = spaces();
    const dragged = this.drag ? findCard(st.data, this.drag.key)?.card : null;
    const columnEl = (col, ci) => {
      // Cards the filter or "nur meine" hides in this column.
      const filtered = col.hidden ? 0 : col.cards.length - col.shown.length;
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
      // The row's full height (the row lines its columns up at the top, so
      // a stub keeps its own), in which a long column scrolls its cards.
      return base(v_flex().flex_1().min_w(0).min_h(0).h_full().gap(8))
        .child(head.child(div().text_size(12).text_color(t.muted).child(filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length))))
        .child(
          v_flex()
            .id(`cards-${ci}`)
            .flex_1()
            .min_h(0)
            .gap(6)
            .overflow_y_scrollbar()
            .track_scroll(this.scrolls[ci % SCROLLS])
            .children(col.shown.map((card) => this.card(t, mono, view, st, card, ci, allSpaces)))
            .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
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
      const rows = s.rows.filter((r) => this.visible(r, st.data));
      // While the filter or "nur meine" hides rows, the count is of those loaded.
      const count = rows.length < s.rows.length ? shownOf(rows.length, s.rows.length) : `${s.count}${s.limited ? ` (erste ${s.rows.length})` : ""}`;
      children.push(div().flex_none().px(20).pt(12).pb(4).text_size(11).text_color(t.muted).child(`${s.name.toUpperCase()} · ${count}`));
      children.push(...rows.map(row));
    }
    return v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(this.listScroll).children(children);
  }

  detail(t, mono, view, item) {
    const st = this.state(view.id);
    const session = linkedSession(item, spaces());
    const column = st.data ? SHAPES[st.data.kind].column(st.data, item) : null;
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

  // The keys of what shows: the top bar's (a team's v), then those of the
  // shown view's shape.
  hints(t, view) {
    const context = this.context();
    const bar = [...(sourcesOf(this.config).length > 1 ? [["q", "Quelle"]] : []), ["1 2 3 [ ]", "Tab"]];
    const switches = context?.kind === "team" && context.views.length > 1 ? [["v", "Sprint/Backlog"]] : [];
    const always = [...(this.source() ? [["m", "nur meine"]] : []), ["/", "Filter"], ["r", "neu laden"], ["Esc", "schließen"]];
    const keys = [...bar, ...switches, ...(view ? this.shape(view).hints : []), ...always];
    // On a narrow screen the line wraps rather than cut keys off.
    return h_flex()
      .flex_none()
      .flex_wrap()
      .gap_x(16)
      .gap_y(4)
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
