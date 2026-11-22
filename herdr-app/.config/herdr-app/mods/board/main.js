// Built from src/ by `mise run herdr-board-build`; edit the modules there, not this file.

// The board: one's own work from GitHub (issues and pull requests on a
// Projects v2 board, open pull requests) and Azure DevOps, as
// mods/board/views.json sets them, as the board layer of the layout
// (props { layer: true }) or in a tab "Board". What it shows, where, its
// keys and behaviour: README, "herdr app".
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
// Hidden columns are left out of the query and of the board. GitHub's
// queries also ask for the login gh runs as, which "nur meine" compares
// with.
//
// Calls: a GitHub view costs one gh call per refresh, an Azure team's
// Sprint two az calls (the taskboard's column of each work item, and one
// WIQL query for their fields), its Backlog two, one after the other (the
// level's work items in their list by az rest, then one WIQL query for
// their fields; one for an empty backlog); either one more while who az is
// stays unknown. What the Sprint and the Backlog read once and keep, and
// for how long, makeAzure says. A state change costs one az call, a
// Backlog's create one and a child's parent link one more; a create reads
// the Backlog again. The PR tabs read nothing yet. Finding gh and az costs one sh call
// now and then (toolPaths says when). A view refreshes when its tab first
// shows, on `r` (which first drops what its source keeps of it: its
// source's forget), after a column is hidden or shown (x, a name in the
// hidden line, the column menu), when it is shown again older than
// refreshMinutes, and every refreshMinutes while it shows.
//
// The modules in src/, built into main.js by build.mjs (its header says how
// and why): shared.js, config.js (views.json), contexts.js (the top bar's
// sources, contexts and their views), kinds/index.js (view kinds),
// kinds/board.js (a board's columns and cards), kinds/sprint.js (a
// sprint's taskboard), kinds/backlog.js (a team's backlog), kinds/states.js
// (a state's color), select.js (filter, "nur meine", selection), sources/
// (GitHub; Azure in sources/azure/: common.js, sprint.js, backlog.js,
// index.js), tools.js (running gh and az), actions/ (starting a session,
// writing a change at once, moving a card, changing a state, creating a
// work item),
// ui/helpers.js, ui/layer.js (the board layer), ui/shapes/ (how a view's
// data is drawn and worked: board, prs, sprint, backlog, placeholder),
// ui/modals/ (the dialogs: start, status, columns, create) and this one, the Board, which looks the shape up. Their
// data logic is plain exported functions, tested with a few UI paths by
// tests/herdr-app/board.test.mjs with node.

import { View, div } from "gpui-kit";
import { Input, InputState, ScrollHandle, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, focused, home, knownAgents, layout, machines, nextCommand, notify, panes, props, readTextFile, run, settings, spaces, theme, writeTextFile } from "herdr";

// ==== src/shared.js ====

// What the board's modules share: its names, its error and how one is
// shown, small checks and text helpers, an item's key, and labels for times.

export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension. It
  // is set for the Azure views, to tell this apart from a failure; nothing
  // reads it yet. unclear: a write may or may not have landed.
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

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) console.log(e?.stack ?? String(e));
  return errorText(e);
}

// An item's key: `<repo>#<number>` on GitHub; on Azure `AB#<id>` for a work
// item (Azure Boards' own way to name one) and `!<id>` for a pull request
// (Azure Repos' own); null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  if (item.source === "azure") return item.kind === "pr" ? `!${item.number}` : `AB#${item.number}`;
  return `${item.repoShort}#${item.number}`;
}

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

// The label of an item's parent, an issue or work item of the same source
// and repo: "tender#3002", "AB#7".
export const parentLabel = (item) => itemLabel({ ...item, kind: "issue", number: item.parent });

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

// ==== src/kinds/index.js ====

// View kinds, "<source> <layout>" (viewKind), and what the board shows for
// a view of each: `shape`, how its data is drawn and walked (ui/shapes/),
// or for a view whose source reads nothing for it yet the `text` it shows.
// A new view kind is: an entry here; its loading in its source's module
// (make<Source>().views[layout]); for a GitHub view, what views.json may say
// about it (VIEW_KINDS in config.js); for an Azure team view, its entry in
// TEAM_VIEWS (config.js); and for a new way to draw, a shape.

// A view's kind: the key of KINDS (and of VIEW_KINDS for a GitHub view).
export const viewKind = (v) => `${v.source} ${v.layout}`;

// What every view carries with its defaults, fresh for each view: the
// columns hidden by default (none) and its own start settings (none).
export const viewDefaults = () => ({ hide: [], start: {} });

export const KINDS = {
  "github board": { shape: "board" },
  "github list": { shape: "prs" },
  "azure sprint": { shape: "sprint" },
  "azure backlog": { shape: "backlog" },
  "azure prs": { text: "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;

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
  "„sources.github.views“, Azure in „sources.azure“ mit „org“ und „contexts“ (Kopf von mods/board/src/main.js)";

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

// Per GitHub view kind ("github <layout>", viewKind; its entry in KINDS,
// kinds/index.js, says how it shows): its own keys, what is wrong with them,
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

// The layouts a GitHub view may have, from VIEW_KINDS.
const GITHUB_LAYOUTS = Object.keys(VIEW_KINDS).map((k) => k.slice("github ".length));

function viewProblems(v) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const out = [];
  if (!isText(v.id)) out.push("„id“ fehlt");
  if (!isText(v.name)) out.push("„name“ fehlt");
  if (v.source !== undefined && v.source !== "github") out.push("„source“ ist hier \"github\" oder fehlt");
  const kind = VIEW_KINDS[viewKind({ source: "github", layout: v.layout })];
  if (!kind) return [...out, `„layout“ ist ${GITHUB_LAYOUTS.map((l) => `"${l}"`).join(" oder ")}`];
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  if (v.hide !== undefined && !textList(v.hide)) out.push("„hide“ muss eine Liste von Texten sein");
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 100)) out.push("„limit“ ist eine ganze Zahl von 1 bis 100");
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

function normalizeView(v) {
  const common = { ...viewDefaults(), id: v.id, name: v.name, source: "github", layout: v.layout };
  if (v.hide !== undefined) common.hide = v.hide;
  if (v.start !== undefined) common.start = v.start;
  return { ...common, ...VIEW_KINDS[viewKind(common)].defaults(v) };
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
// name, org, project, team, views } or { id, source: "azure", kind: "prs",
// name, org, project }; views in the switch's order, org the organisation's
// address (orgUrl).
function normalizeContext(c, org) {
  const name = contextName(c);
  if (c.team) {
    const views = c.views ?? TEAM_VIEW_IDS;
    const { project, team } = c.team;
    return { id: `azure:team:${project}/${team}`, source: "azure", kind: "team", name, org, project, team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)) };
  }
  return { id: `azure:prs:${c.prs.project}`, source: "azure", kind: "prs", name, org, project: c.prs.project };
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
    const context = problems.length ? null : normalizeContext(c, org);
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
  } else if (raw.sources !== undefined) errors.push("„sources“ muss ein Objekt sein");
  else if (!old) errors.push("„sources“ fehlt: „sources.azure“ oder „sources.github“");
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

// Whether an item is one's own, for "nur meine": it came from a search of
// one's own (ownByQuery), or `me` (the login the data was read as; null
// when the source did not say) is one of its assignees (their logins, where
// the item names them apart from the names it shows: assigneeLogins), its
// author, or a reviewer asked for.
export const isMine = (item, me) =>
  item.ownByQuery === true ||
  (Boolean(me) && ((item.assigneeLogins ?? item.assignees ?? []).includes(me) || item.author === me || (item.reviewers ?? []).includes(me)));

// Whether an item shows in data read as `viewer`: it matches the filter and,
// with `mine` on, it is one's own.
export const shows = (item, filter, mine, viewer) => matches(item, filter) && (!mine || isMine(item, viewer));

// Keyboard movement: sel = { col, key } (key null on an empty column) → the
// next sel. "up"/"down" move within the column, "left"/"right" to the next
// column, keeping the row where they can. `columns` are those that show
// (hidden ones left out); a list is one column.
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

// The index of the column whose shown cards hold `key`; -1 for none.
export const columnOf = (columns, key) => columns.findIndex((c) => c.shown.some((card) => card.key === key));

// The selection after new data or a filter: its card's column again, else the
// first card; a selected empty column stays selected.
export function selectionAfter(columns, sel) {
  const at = columnOf(columns, sel?.key);
  if (at >= 0) return { col: at, key: sel.key };
  if (!sel?.key && columns[sel?.col]) return sel;
  const first = columns.findIndex((c) => c.shown.length);
  return first >= 0 ? { col: first, key: columns[first].shown[0].key } : { col: 0, key: null };
}

// The selection after the columns changed (`before` → `after`: a column
// hidden or shown, a card moved out of sight): the selected column, found by
// id, else the column now at its index or the last one; there its card,
// else the card now in the same row (the last, past the end); no column,
// { col: 0, key: null }.
export function selectionInColumns(before, after, sel) {
  const was = before[sel?.col];
  const row = Math.max(0, was?.shown.findIndex((c) => c.key === sel?.key) ?? 0);
  const kept = after.findIndex((c) => c.id === was?.id);
  const col = kept >= 0 ? kept : Math.min(sel?.col ?? 0, after.length - 1);
  if (col < 0) return { col: 0, key: null };
  const cards = after[col].shown;
  if (cards.some((c) => c.key === sel?.key)) return { col, key: sel.key };
  return { col, key: cards.length ? cards[Math.min(row, cards.length - 1)].key : null };
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

// Whether a card may go to a column: one that takes drops; one that maps
// the card's type, where the column names the types it takes (a
// taskboard's column, whose name is no state); and, where the board's meta
// names its types' states for columns named after states (meta.types; no
// board carries them yet), a state of the card's own type. The sprint
// names its types' states as meta.typeStates instead, for the status menu:
// its columns are no states.
export function canDrop(board, card, column) {
  if (!column?.target) return false;
  if (column.types && !column.types.includes(card.type)) return false;
  const states = board.meta?.types?.[card.type];
  return !states || states.includes(column.name);
}

export const targetsFor = (board, card) => board.columns.filter((c) => canDrop(board, card, c));

// The column H (step -1) or L (+1) moves a card to: the next column, hidden
// ones included, the card may go to; null at the edge.
export function stepTarget(board, key, step) {
  const found = findCard(board, key);
  if (!found) return null;
  const columns = board.columns;
  for (let i = columns.findIndex((c) => c.id === found.column.id) + step; i >= 0 && i < columns.length; i += step) {
    if (canDrop(board, found.card, columns[i])) return columns[i];
  }
  return null;
}

// A view's columns with the person's hidden set applied.
export function withHidden(board, hidden) {
  return { ...board, columns: board.columns.map((c) => ({ ...c, hidden: hidden.has(c.name) })) };
}

// The columns as the board shows them: hidden ones left out, the others with
// the cards that show (`mine`: only one's own).
export function shownColumns(board, filter, mine = false) {
  return (board?.columns ?? []).filter((c) => !c.hidden).map((c) => ({ ...c, shown: c.cards.filter((card) => shows(card, filter, mine, board.viewer)) }));
}

// ==== src/contexts.js ====

// The top bar's order of things: the sources it toggles between, the
// contexts of each, one tab apiece, and the view a context shows. On Azure a
// context is a team, with its views (Sprint, Backlog), or a project's pull
// requests; on GitHub each view of views.json is one.

// The sources in the toggle's order; with none remembered, the board shows
// the first one there is.
export const SOURCES = [
  { id: "github", name: "GitHub" },
  { id: "azure", name: "Azure" },
];

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

// The contexts of a source in a config, in views.json's order: { id, source,
// kind: "team" | "prs" | "view", name, … } (a team's fields, a project's, or
// the GitHub view as `view`).
export function contextsOf(config, source) {
  if (source === "azure") return config?.azure?.contexts ?? [];
  if (source === "github") return githubViews(config).map((v) => ({ id: githubContextId(v.id), source: "github", kind: "view", name: v.name, view: v }));
  return [];
}

// The id of a GitHub view's context (its tab).
export const githubContextId = (viewId) => `github:${viewId}`;

// Whether a context has a switch between views: a team with more than one.
export const hasViewSwitch = (context) => context?.kind === "team" && context.views.length > 1;

// The hint line's name for a team's switch: its views' names, "Sprint/Backlog".
export const viewSwitchHint = (context) => context.views.map(teamViewName).join("/");

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
// "sprint" | "backlog" | "prs", name, context, hide, start }. Its kind is
// viewKind(view).
export function viewOf(context, teamViewId) {
  if (context.kind === "view") return context.view;
  if (context.kind === "team") {
    return { id: `${context.id}:${teamViewId}`, source: "azure", layout: teamViewId, name: teamViewName(teamViewId), context, ...viewDefaults() };
  }
  return { id: context.id, source: "azure", layout: "prs", name: context.name, context, ...viewDefaults() };
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

// How long gh may take, and az: an az run starts Python, and most ask Azure
// a few times.
export const GH_TIMEOUT = 30000;
export const AZ_TIMEOUT = 60000;

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
  const name = item.repo ?? "";
  const [owner, repo] = name.includes("/") ? name.split("/") : ["", name];
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

// ==== src/sources/azure/common.js ====

// Azure DevOps, what its two team views share: states and their
// categories, what az's failures mean, how az is called, the work items'
// fields and how az's answers are read, who az is, and a state change.
// The Sprint's own calls are in sprint.js, the Backlog's in backlog.js, the
// source as the board uses it in index.js (makeAzure).

// Theme colors and column order for Azure's state categories.
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

// States named with their categories → [{ id, name, category, color }],
// each name once (its first category), in category order.
export function categoryStates(pairs) {
  const states = new Map();
  for (const [name, category] of pairs) {
    if (!states.has(name)) states.set(name, { id: name, name, category, color: CATEGORY_COLORS[category] ?? "muted" });
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return [...states.values()].sort((a, b) => order(a) - order(b));
}

// The work item types' answer → { states: [{ id, name, category, color }] in
// category order, types: { [type]: [state names] } }.
export function parseAzureTypes(stdout) {
  const value = azJson(stdout, "die Work-Item-Typen")?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  const types = Object.fromEntries(value.map((type) => [type.name, (type.states ?? []).map((s) => s.name)]));
  return { states: categoryStates(value.flatMap((type) => (type.states ?? []).map((s) => [s.name, s.category]))), types };
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

// The organisation for az boards and az devops, and no guessing it from a
// git checkout in the folder az runs in.
export const azOrg = (org) => ["--org", org, "--detect", "false"];

// az devops invoke on one REST resource (`area`, `resource`, the route's
// parameters), always at api-version 7.1: its own default is 5.0, which
// knows no taskboard.
export function azInvokeArgs(c, area, resource, route, more = []) {
  return [
    "devops", "invoke", ...azOrg(c.org), "--area", area, "--resource", resource,
    "--route-parameters", ...Object.entries(route).map(([k, v]) => `${k}=${v}`), "--api-version", "7.1", ...more, "-o", "json",
  ];
}

// Calls both team views make: the team's areas, and a WIQL query (az
// boards query takes no team or project for its macros).
export const azAreasArgs = (c) => ["boards", "area", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "-o", "json"];
export const azQueryArgs = (c, wiql) => ["boards", "query", ...azOrg(c.org), "--project", c.project, "--wiql", wiql, "-o", "json"];

// Who az is signed in as (az login): the account's user, { name, type }. It
// reads az's own profile and asks Azure nothing, so it has a short timeout
// of its own.
export const AZ_ME_ARGS = ["account", "show", "--query", "user", "-o", "json"];
export const AZ_ME_TIMEOUT = 15000;

// A text in a WIQL query: in single quotes, a quote in it doubled.
export const wiqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The fields read here are all System. ones. The field names that would
// stand alone in quotes are built from SYSTEM: the command check
// (tests/herdr-app/check-commands.py) takes a quoted word, dot and word
// for a herdr command.
const SYSTEM = "System.";
export const AREA_PATH = `${SYSTEM}AreaPath`;
const fieldOf = (wi, name) => wi.fields?.[SYSTEM + name];

// The fields read of each work item.
export const WORK_ITEM_FIELDS = ["Id", "Title", "WorkItemType", "State", "AssignedTo", "Parent", "AreaPath", "IterationPath"].map((f) => SYSTEM + f);

// az's JSON answer for `what`; `empty` stands for no output at all (az
// boards query prints nothing when nothing matches).
export function azJson(stdout, what, empty) {
  const text = String(stdout ?? "").trim();
  if (!text && empty !== undefined) return empty;
  try {
    return JSON.parse(text);
  } catch {
    throw new BoardError(`az lieferte für ${what} kein lesbares JSON`);
  }
}

// az's answer as JSON, or null for anything else: an answer the reader
// (who az is) or the checks of a write take for one that says nothing.
export function jsonOrNull(stdout) {
  try {
    return JSON.parse(String(stdout ?? "").trim());
  } catch {
    return null;
  }
}

// A list Azure sends either as it is or wrapped in { count, value } (az
// devops invoke prints REST's wrapper, with its continuation_token).
export const azList = (json) => (Array.isArray(json) ? json : Array.isArray(json?.value) ? json.value : null);

// The team's areas → { field (the team field, System.AreaPath by default),
// values: [{ value, includeChildren }] }.
export function parseAreas(stdout) {
  const json = azJson(stdout, "die Bereiche des Teams");
  const values = (Array.isArray(json?.values) ? json.values : []).filter((v) => typeof v?.value === "string" && v.value);
  if (!values.length) throw new BoardError("Azure nannte keine Bereiche des Teams");
  return { field: json.field?.referenceName ?? AREA_PATH, values: values.map((v) => ({ value: v.value, includeChildren: v.includeChildren === true })) };
}

// The team's default area (the area a new work item gets) from its areas'
// answer (azAreasArgs), or null.
export function parseDefaultArea(stdout) {
  const value = azJson(stdout, "die Bereiche des Teams")?.defaultValue;
  return typeof value === "string" && value ? value : null;
}

// The address of a work item's page.
export const workItemUrl = (c, id) => `${c.org}/${encodeURIComponent(c.project)}/_workitems/edit/${id}`;

// A person as a work item names one: an identity ({ displayName,
// uniqueName }), or older answers' "Name <login>" → { name, login } (login
// in lower case, null where it is not given).
export function azPerson(who) {
  if (typeof who === "string") {
    const login = who.match(/<([^>]+)>\s*$/)?.[1] ?? null;
    return { name: who.replace(/\s*<[^>]*>\s*$/, "") || null, login: login?.toLowerCase() ?? null };
  }
  if (!isObject(who)) return { name: null, login: null };
  return { name: who.displayName ?? who.uniqueName ?? null, login: who.uniqueName?.toLowerCase() ?? null };
}

// A work item of az boards query's answer as the board shows it, keyed as
// itemKey names it; with an `orderField`, its value there as `order` (a
// number, else null).
export function azWorkItem(wi, c, orderField = null) {
  const f = (name) => fieldOf(wi, name) ?? null;
  const who = azPerson(f("AssignedTo"));
  const item = {
    source: "azure", kind: "workitem", number: wi.id, title: f("Title") ?? "", type: f("WorkItemType"),
    state: f("State"), assignees: who.name ? [who.name] : [], assigneeLogins: who.login ? [who.login] : [],
    parent: f("Parent"), area: f("AreaPath"), iteration: f("IterationPath"),
    url: workItemUrl(c, wi.id), labels: [], sub: null, branch: null,
    ...(orderField ? { order: typeof wi.fields?.[orderField] === "number" ? wi.fields[orderField] : null } : {}),
  };
  return { key: itemKey(item), ...item };
}

// The most work items az boards query gives.
export const AZ_QUERY_LIMIT = 1000;

// The work items of az boards query's answer → [items] (azWorkItem, with
// the order field where one is given), in its order; no output is none.
export function parseWorkItems(stdout, c, orderField = null) {
  const list = azList(azJson(stdout, "die Work Items", []));
  if (!list) throw new BoardError("Azure lieferte keine Work Items");
  return list.filter((wi) => Number.isInteger(wi?.id)).map((wi) => azWorkItem(wi, c, orderField));
}

// Who az is signed in as (the user's name), in lower case, or null.
export function parseViewer(stdout) {
  const name = jsonOrNull(stdout)?.name;
  return typeof name === "string" && name ? name.toLowerCase() : null;
}

export const azStateArgs = (c, id, state) => ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--state", state, "-o", "json"];

// az's answer to a state change must name the state it set; anything else
// leaves open whether the change landed.
export function checkStateResult(stdout, state) {
  const json = jsonOrNull(stdout);
  if (!json || fieldOf(json, "State") !== state) throw failure("Azure hat den Status nicht bestätigt", { write: true, unclear: true });
}

// ==== src/kinds/sprint.js ====

// A sprint's taskboard: its rows (one per story, and "Ohne Story" for tasks
// whose story is not in the sprint), the items it holds, what shows and how the
// keys walk it, a task's state as shown, a state change laid over the data, and
// its warnings (sprintWarnings). The data is a board's (kinds/board.js: its
// columns hold the tasks, so moves, their rollback and H/L work on it as on a
// board) plus its rows; sprintBoard (sources/azure/sprint.js) builds it.

// The key of the row "Ohne Story", and the id of the column of stories the
// keys walk first.
export const NO_STORY = "none";
export const STORY_COLUMN = "stories";

// The stories of a sprint, in row order.
export const sprintStories = (data) => data.rows.map((r) => r.story).filter(Boolean);

// Every story and task of a sprint.
export const sprintItems = (data) => [...sprintStories(data), ...data.columns.flatMap((c) => c.cards)];

// The story or task with `key`, or null.
export function findSprintItem(data, key) {
  return data?.rows.find((r) => r.story?.key === key)?.story ?? findCard(data, key)?.card ?? null;
}

// The row an item stands in: a story its own, a task its story's (or
// NO_STORY).
export const rowOf = (item) => item.row ?? item.key;

// Whether an item is a task (a card in a column) rather than a story.
export const isTask = (item) => Boolean(item?.row);

// A task's state as shown: moved since it was read, the state its new
// column maps its type to (Azure sets that state with the move), until a
// refresh reads it; else its own.
export function shownState(item, column) {
  if (!isTask(item) || !column || item.column === item.readColumn) return item.state;
  return column.mappings?.[item.type] ?? item.state;
}

// The columns keyboard movement and selection walk: the stories that show,
// then the taskboard's columns with the tasks that show, each in row order
// (a task moved in comes last in its column's data).
export function sprintNav(data, filter, mine) {
  const order = new Map(data.rows.map((r, i) => [r.key, i]));
  const stories = { id: STORY_COLUMN, name: "Story", shown: sprintStories(data).filter((s) => shows(s, filter, mine, data.viewer)) };
  const byRow = (a, b) => order.get(rowOf(a)) - order.get(rowOf(b)) || a.number - b.number;
  return [stories, ...shownColumns(data, filter, mine).map((c) => ({ ...c, shown: [...c.shown].sort(byRow) }))];
}

// The rows that show: those with a story or a task that shows (`nav`,
// sprintNav), in the data's order.
export function shownRows(data, nav) {
  const used = new Set(nav.flatMap((c) => c.shown.map(rowOf)));
  return data.rows.filter((r) => used.has(r.key));
}

// The warnings of a sprint: tasks left out (sprintBoard counts them), and
// a query az may have cut at data.limit.
export function sprintWarnings(data) {
  const { unplaced, unknownColumns } = data.meta;
  return [
    ...(unplaced ? [`${unplaced} ${unplaced === 1 ? "Task" : "Tasks"} ohne Platz auf dem Taskboard`] : []),
    ...(unknownColumns ? [`${unknownColumns} ${unknownColumns === 1 ? "Task steht" : "Tasks stehen"} in einer Spalte, die das Board nicht kennt; die Spalten werden beim nächsten Neuladen neu gelesen`] : []),
    ...(data.limited ? [`Nur die ersten ${data.limit} Work Items des Sprints (so viele gibt az boards query)`] : []),
  ];
}

// Keyboard movement over sprintNav's columns: j/k as everywhere (navigate);
// h/l to the next column, onto the item of the same row there, else the
// first one below it, else the last; an empty column is selected as such.
export function sprintNavigate(nav, sel, dir, rows) {
  if (dir === "up" || dir === "down" || !nav.length) return navigate(nav, sel, dir);
  const ci = Math.min(Math.max(sel?.col ?? 0, 0), nav.length - 1);
  const from = nav[ci].shown.find((i) => i.key === sel?.key);
  const to = Math.min(Math.max(ci + (dir === "left" ? -1 : 1), 0), nav.length - 1);
  if (!from || to === ci) return navigate(nav, sel, dir);
  const list = nav[to].shown;
  if (!list.length) return { col: to, key: null };
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const at = order.get(rowOf(from));
  const next = list.find((i) => rowOf(i) === rowOf(from)) ?? list.find((i) => order.get(rowOf(i)) > at) ?? list.at(-1);
  return { col: to, key: next.key };
}

// The data with the item `key` in `state`; a task's column then counts as
// read (shownState shows its own state).
export function withItemState(data, key, state) {
  const set = (i) => (i.key === key ? { ...i, state, ...(isTask(i) ? { readColumn: i.column } : {}) } : i);
  return {
    ...data,
    rows: data.rows.map((r) => (r.story?.key === key ? { ...r, story: set(r.story) } : r)),
    columns: data.columns.map((c) => ({ ...c, cards: c.cards.map(set) })),
  };
}

// ==== src/sources/azure/sprint.js ====

// The Azure Sprint: its calls, what they answer, the sprint as the sprint
// shape shows it (sprintBoard), a task's move on the taskboard, and the
// view as makeAzure uses it (sprintView).

// The Sprint view's calls for a team context `c` ({ org, project, team }):
// its current iteration, its areas (azAreasArgs), its taskboard's columns,
// the project's work item types with their states, and per refresh the
// taskboard's column of each work item and the fields of the sprint's work
// items (azQueryArgs).
export const azIterationArgs = (c) => ["boards", "iteration", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, "--timeframe", "current", "-o", "json"];
export const azColumnsArgs = (c) => azInvokeArgs(c, "work", "taskboardColumns", { project: c.project, team: c.team });
export const azTypesArgs = (c) => azInvokeArgs(c, "wit", "workitemtypes", { project: c.project });
export const azTaskboardArgs = (c, iterationId) => azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId });
// One WIQL query for the work items of the sprint `iteration` in the team's
// areas (parseAreas), as Azure's taskboard shows them: in the iteration's
// path, and in one of the team's area paths, those below it too where the
// team includes them. az boards query takes no team or project for its
// macros, so the paths are spelled out.
export function sprintWiql(iteration, areas) {
  const field = `[${areas.field}]`;
  const tree = areas.field === AREA_PATH;
  const inArea = areas.values.map((a) => `${field} ${tree && a.includeChildren ? "UNDER" : "="} ${wiqlText(a.value)}`).join(" OR ");
  return `SELECT ${WORK_ITEM_FIELDS.map((f) => `[${f}]`).join(", ")} FROM WorkItems WHERE [System.IterationPath] = ${wiqlText(iteration.path)} AND (${inArea}) ORDER BY [System.Id]`;
}

// The team's current iteration → { id, name, path, finish } (finish: the
// start of its last day, as Azure gives it, or null).
export function parseIteration(stdout) {
  const list = azList(azJson(stdout, "den Sprint"));
  if (!list) throw new BoardError("Azure lieferte keinen Sprint");
  const it = list.find((i) => i?.attributes?.timeFrame === "current") ?? list[0];
  if (!it?.id || !it.path) throw new BoardError("Das Team hat keinen laufenden Sprint");
  return { id: it.id, name: it.name ?? it.path, path: it.path, finish: it.attributes?.finishDate ?? null };
}

// The taskboard's columns → [{ id, name, mappings: [{ type, state }] }] in
// their order.
export function parseColumns(stdout) {
  const columns = azJson(stdout, "die Spalten des Taskboards")?.columns;
  if (!Array.isArray(columns) || !columns.length) throw new BoardError("Azure lieferte keine Spalten des Taskboards");
  return [...columns]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({ id: c.id, name: c.name, mappings: (c.mappings ?? []).map((m) => ({ type: m.workItemType, state: m.state })) }));
}

// The taskboard's column of each work item → Map(id → { columnId, column,
// state }). A list that holds entries but none with a work item's id is no
// answer this reads.
export function parseTaskboard(stdout) {
  const list = azList(azJson(stdout, "die Spalten der Work Items"));
  if (!list) throw new BoardError("Azure lieferte keine Spalten der Work Items");
  const placed = list.filter((w) => Number.isInteger(w?.workItemId));
  if (list.length && !placed.length) throw new BoardError("Azure nannte keine Work Items in den Spalten des Taskboards");
  return new Map(placed.map((w) => [w.workItemId, { columnId: w.columnId, column: w.column, state: w.state }]));
}

// The sprint as the sprint shape shows it (kinds/sprint.js). Its tasks are
// the work items of the types the taskboard's columns map; each goes to the
// column the taskboard places it in (`places`, parseTaskboard). Every other
// work item of the sprint is a story, one row each in the query's order,
// after the row "Ohne Story" for tasks whose story is not in the sprint
// (only where there is one). A task the taskboard does not place is left
// out and counted (meta.unplaced), as is one placed in a column the columns
// read do not list (meta.unknownColumns). A column's color is that of the
// state its first mapping names; it takes the types it maps (types) and
// says which state each gets (mappings).
export function sprintBoard({ iteration, columns, types, items, places, viewer }) {
  const colors = new Map(types.states.map((s) => [s.name, s.color]));
  const cols = columns.map((c) => ({
    id: c.id, name: c.name, color: colors.get(c.mappings[0]?.state) ?? "muted", hidden: false, count: 0, target: true,
    types: c.mappings.map((m) => m.type), mappings: Object.fromEntries(c.mappings.map((m) => [m.type, m.state])), cards: [],
  }));
  const byId = new Map(cols.map((c) => [c.id, c]));
  const taskTypes = new Set(cols.flatMap((c) => c.types));
  const stories = items.filter((i) => !taskTypes.has(i.type));
  const storyKeys = new Map(stories.map((s) => [s.number, s.key]));
  let unplaced = 0;
  let unknownColumns = 0;
  for (const item of items) {
    if (!taskTypes.has(item.type)) continue;
    const place = places.get(item.number);
    const col = place && byId.get(place.columnId);
    if (!col) {
      if (place) unknownColumns++;
      else unplaced++;
      continue;
    }
    col.cards.push({ ...item, column: col.id, readColumn: col.id, row: storyKeys.get(item.parent) ?? NO_STORY });
    col.count++;
  }
  const loose = cols.some((c) => c.cards.some((card) => card.row === NO_STORY));
  return {
    shape: "sprint",
    meta: { iterationId: iteration.id, iteration: iteration.name, finish: iteration.finish, typeStates: types.types, states: types.states, unplaced, unknownColumns },
    columns: cols,
    rows: [...(loose ? [{ key: NO_STORY, story: null }] : []), ...stories.map((s) => ({ key: s.key, story: s }))],
    viewer,
    total: items.length,
    limited: items.length >= AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
}

// Until when a team's sprint stays cached (ms): the end of its last day
// (Azure's finishDate is that day's start, in UTC), or half a day from
// `now` where it names none.
const DAY_MS = 86400000;
export function sprintUntil(finish, now) {
  const at = Date.parse(finish ?? "");
  return Number.isNaN(at) ? now + DAY_MS / 2 : at + DAY_MS;
}

// az devops invoke takes a request's body only from a file (--in-file):
// one per work item, written before each move and kept for the next.
// herdr's writeTextFile makes the folders it needs (herdr-app 0.1.16,
// src/mod_files.rs, write: create_dir_all of the parent), and its
// readTextFile gives null for a file that is not there (read: NotFound is
// None).
export const moveBodyPath = (id) => `${home()}/.cache/herdr-app/board/taskboard-move-${id}.json`;

// The body that moves a task to a taskboard column. The REST reference
// (Taskboard Work Items - Update, api-version 7.1) names the field
// newColumn, a string; it does not say whether that is the name or the id,
// and the name is sent.
export const moveBody = (column) => `${JSON.stringify({ newColumn: column.name })}\n`;

// Writes the body of a move to its file, where it does not hold it
// already; a file that cannot be written is a refusal (nothing was sent).
async function writeMoveBody(id, column) {
  const path = moveBodyPath(id);
  const text = moveBody(column);
  try {
    const now = await readTextFile(path);
    if (now !== text) await writeTextFile(path, text, now);
  } catch (e) {
    throw new BoardError(`Die Anfrage an Azure ließ sich nicht ablegen (${path}): ${firstLine(e?.message ?? e)}`);
  }
  return path;
}

export const azMoveArgs = (c, iterationId, id, file) =>
  azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId, workItemId: id }, ["--http-method", "PATCH", "--in-file", file]);

// az's answer to a move. The reference names none (200 OK); an answer that
// names the work item in its new column, as the list's entries do
// (workItemId, column, columnId), confirms the move. Anything else leaves
// open whether it landed: the refresh that follows says where it stands.
export function checkTaskboardMove(stdout, card, column) {
  const json = jsonOrNull(stdout);
  const entry = azList(json)?.find((w) => w?.workItemId === card.number) ?? json;
  if (entry?.workItemId !== card.number || (entry.columnId !== column.id && entry.column !== column.name)) {
    throw failure("Azure hat die Verschiebung nicht bestätigt", { write: true, unclear: true });
  }
}

// The Sprint as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure): what it keeps per team and project (settingsOf), how it
// loads and writes, and what `r` or a refused write drops (forget: the
// team's sprint, areas and columns, not the project's types).
export function sprintView(s) {
  async function settingsOf(c) {
    const team = s.teamKey(c);
    const project = `types\n${c.org}\n${c.project}`;
    const [iteration, board, types] = [s.keptValue(`iteration\n${team}`), s.keptValue(`board\n${team}`), s.keptValue(project)];
    const [it, areas, columns, ty] = await Promise.all([
      iteration?.value ?? s.az(azIterationArgs(c)).then(parseIteration),
      board?.value.areas ?? s.az(azAreasArgs(c)).then(parseAreas),
      board?.value.columns ?? s.az(azColumnsArgs(c)).then(parseColumns),
      types?.value ?? s.az(azTypesArgs(c)).then(parseAzureTypes),
    ]);
    const until = iteration?.until ?? sprintUntil(it.finish, Date.now());
    if (!iteration) s.kept.set(`iteration\n${team}`, { value: it, until });
    if (!board) s.kept.set(`board\n${team}`, { value: { areas, columns }, until });
    if (!types) s.kept.set(project, { value: ty, until });
    return { iteration: it, areas, columns, types: ty };
  }
  const forget = (c) => {
    s.kept.delete(`iteration\n${s.teamKey(c)}`);
    s.kept.delete(`board\n${s.teamKey(c)}`);
  };
  const onRefusal = (c) => s.dropOnRefusal(forget, c);
  return {
    forget,
    async load(view) {
      const c = view.context;
      const me = s.whoAmI();
      const kept = await settingsOf(c);
      const [places, items] = await Promise.all([s.az(azTaskboardArgs(c, kept.iteration.id)), s.az(azQueryArgs(c, sprintWiql(kept.iteration, kept.areas)))]);
      const data = sprintBoard({ ...kept, items: parseWorkItems(items, c), places: parseTaskboard(places), viewer: await me });
      s.noViewerOf(data);
      if (data.meta.unknownColumns) forget(c);
      return { data, warnings: [] };
    },
    async move(view, data, card, column) {
      const file = await writeMoveBody(card.number, column);
      const out = await s.az(azMoveArgs(view.context, data.meta.iterationId, card.number, file), { write: true }).catch(onRefusal(view.context));
      checkTaskboardMove(out, card, column);
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
  };
}

// ==== src/sources/azure/backlog.js ====

// The Azure Backlog: its calls, what they answer, the backlog as the
// backlog shape shows it (backlogList), a create and a parent link, and
// the view as makeAzure uses it (backlogView).

// The Backlog view's calls for a team context `c`: the team's backlog
// levels, its backlog configuration (the order field, each type's states
// and their categories), its settings (default and backlog iteration; its
// default area comes from azAreasArgs' defaultValue), and per refresh the
// level's work items in their list (az rest: az devops invoke picks a
// location by area and resource, the first that fits, which does not
// reliably reach backlogs/{id}/workItems) and one WIQL query for their
// fields (azQueryArgs).
export const azLevelsArgs = (c) => azInvokeArgs(c, "work", "backlogs", { project: c.project, team: c.team });
export const azBacklogConfigArgs = (c) => azInvokeArgs(c, "work", "backlogconfiguration", { project: c.project, team: c.team });
export const azTeamSettingsArgs = (c) =>
  ["boards", "iteration", "team", "show-default-iteration", ...azOrg(c.org), "--project", c.project, "--team", c.team, "-o", "json"];
// Azure DevOps' resource for an Entra token (az rest --resource): az rest
// knows no Azure DevOps host of its own.
export const AZ_DEVOPS_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
export const backlogIdsUrl = (c, levelId) =>
  `${c.org}/${[c.project, c.team].map(encodeURIComponent).join("/")}/_apis/work/backlogs/${encodeURIComponent(levelId)}/workItems?api-version=7.1`;
export const azBacklogIdsArgs = (c, levelId) => ["rest", "--method", "get", "--url", backlogIdsUrl(c, levelId), "--resource", AZ_DEVOPS_RESOURCE, "-o", "json"];

// What a failed az rest says. az rest signs in only with az login (an Entra
// token), never with a PAT, so where az asks for az login, an Entra answer
// (AADSTS…) fails or Azure answers 401, the Backlog says what it needs.
export const BACKLOG_NEEDS_LOGIN = "Der Backlog braucht az login (ein PAT reicht dafür nicht)";
const AZ_REST_LOGIN = /az login|AADSTS\d+|Unauthorized|\b401\b/i;
export function azRestFailure(r, on, options) {
  const said = String(r.stderr ?? "").split("\n").filter((l) => !/^WARNING:/.test(l)).join("\n");
  if (AZ_REST_LOGIN.test(said)) return new BoardError(BACKLOG_NEEDS_LOGIN, { unavailable: true });
  return azFailure(r, on, options);
}

// A backlog level of Azure's answer → { id, name, type ("portfolio",
// "requirement" or "task"), types: [names], defaultType }, or null.
function backlogLevel(l) {
  if (!isObject(l) || typeof l.id !== "string" || !l.id) return null;
  const types = (Array.isArray(l.workItemTypes) ? l.workItemTypes : []).map((t) => t?.name).filter((n) => typeof n === "string" && n);
  const defaultType = typeof l.defaultWorkItemType?.name === "string" ? l.defaultWorkItemType.name : types[0] ?? null;
  return { id: l.id, name: typeof l.name === "string" && l.name ? l.name : l.id, type: l.type ?? null, types, defaultType };
}

// The team's backlog levels → [levels] (backlogLevel); none is no answer.
export function parseBacklogLevels(stdout) {
  const list = azList(azJson(stdout, "die Backlog-Ebenen"));
  const levels = (list ?? []).map(backlogLevel).filter(Boolean);
  if (!levels.length) throw new BoardError("Azure lieferte keine Backlog-Ebenen des Teams");
  return levels;
}

// The level the Backlog shows: the team's requirement level (Stories, by
// the process: User Stories, Product Backlog Items, Requirements), and the
// level below it, whose types (Tasks) may be created under one of its
// items: the team's task level, else the configuration's.
export function backlogLevels(levels, config) {
  const level = levels.find((l) => l.type === "requirement");
  if (!level) throw new BoardError("Das Team hat keine Backlog-Ebene für Anforderungen (Stories)");
  return { level, childLevel: levels.find((l) => l.type === "task") ?? config.taskLevel ?? null };
}

// A field's reference name, as a WIQL query may name it; anything else is
// none.
const fieldName = (name) => (typeof name === "string" && /^[A-Za-z][\w.]*$/.test(name) ? name : null);

// The team's backlog configuration → { orderField (the field the backlog
// is ordered by: Microsoft.VSTS.Common.StackRank or …BacklogPriority, by
// the process; null where it names none), typeStates: { [type]: [state
// names] in Azure's order }, states: [{ id, name, category, color }] in
// category order (as parseAzureTypes), taskLevel }.
export function parseBacklogConfig(stdout) {
  const json = azJson(stdout, "die Backlog-Einstellungen");
  if (!isObject(json)) throw new BoardError("Azure lieferte keine Backlog-Einstellungen");
  const infos = (Array.isArray(json.workItemTypeMappedStates) ? json.workItemTypeMappedStates : [])
    .filter((info) => typeof info?.workItemTypeName === "string" && isObject(info.states));
  return {
    orderField: fieldName(json.backlogFields?.typeFields?.Order),
    typeStates: Object.fromEntries(infos.map((info) => [info.workItemTypeName, Object.keys(info.states)])),
    states: categoryStates(infos.flatMap((info) => Object.entries(info.states))),
    taskLevel: backlogLevel(json.taskBacklog),
  };
}

// The team's settings → { defaultIteration, backlogIteration }: the paths
// of the iteration a new work item gets and of the backlog's own (the root
// of the team's iterations), each null where Azure names none.
export function parseTeamSettings(stdout) {
  const json = azJson(stdout, "die Einstellungen des Teams");
  const path = (it) => (typeof it?.path === "string" && it.path ? it.path : null);
  return { defaultIteration: path(json?.defaultIteration), backlogIteration: path(json?.backlogIteration) };
}

// The ids of the level's work items, in the list's order, each once.
export function parseBacklogIds(stdout) {
  const list = azJson(stdout, "die Work Items des Backlogs")?.workItems;
  if (!Array.isArray(list)) throw new BoardError("Azure lieferte keine Work Items des Backlogs");
  return [...new Set(list.map((l) => l?.target?.id).filter(Number.isInteger))];
}

// One WIQL query for the fields of the work items `ids`, the order field
// among them where there is one.
export function backlogWiql(ids, orderField) {
  const fields = [...WORK_ITEM_FIELDS, ...(orderField ? [orderField] : [])].map((f) => `[${f}]`).join(", ");
  return `SELECT ${fields} FROM WorkItems WHERE [System.Id] IN (${ids.join(", ")}) ORDER BY [System.Id]`;
}

// The sprint a work item is in, as the Backlog shows it: the last part of
// its iteration's path, or null for none, which is the backlog's own
// iteration (the root of the team's iterations) or the project's root (a
// path without a level below).
export function sprintName(path, backlogIteration) {
  if (typeof path !== "string" || !path || path === backlogIteration || !path.includes("\\")) return null;
  return path.split("\\").at(-1);
}

// The backlog as the backlog shape shows it (kinds/backlog.js): one row
// per work item of the level (`items`, parseWorkItems on the ids' query
// with the order field: each item's `order`), each with its sprint
// (sprintName). The rows are sorted by the order field, as Azure's backlog
// is: the REST reference does not say whether the list of ids
// (parseBacklogIds) comes in backlog order, so it is not relied on; it
// orders only what has no order value, after all that has one. Ids the
// query did not find are counted (meta.missing); `limited` says the ids
// were more than one query reads (AZ_QUERY_LIMIT).
export function backlogList({ level, childLevel, config, settings, area, ids, items, viewer }) {
  const at = new Map(ids.map((id, i) => [id, i]));
  const rank = (i) => i.order ?? Infinity;
  const rows = items
    .filter((i) => at.has(i.number))
    .map((i) => ({ ...i, sprint: sprintName(i.iteration, settings.backlogIteration) }))
    .sort((a, b) => rank(a) - rank(b) || at.get(a.number) - at.get(b.number));
  const read = Math.min(ids.length, AZ_QUERY_LIMIT);
  return {
    shape: "backlog",
    meta: {
      level, childLevel, typeStates: config.typeStates, states: config.states, orderField: config.orderField,
      area, iteration: settings.defaultIteration, missing: read - rows.length,
    },
    rows,
    viewer,
    total: ids.length,
    limited: ids.length > AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
}

// Creating a work item: of `type` with `title`, in the team's default area
// and iteration (az applies no team defaults), assigned to the account az
// is signed in as (az resolves "me"). The title is given as --title=…, so
// one that starts with a dash is no option.
export const azCreateArgs = (c, { type, title, area, iteration }) => [
  "boards", "work-item", "create", ...azOrg(c.org), "--project", c.project, "--type", type, `--title=${title}`,
  "--area", area, "--iteration", iteration, "--assigned-to", "me", "-o", "json",
];

// az's answer to a create: the new work item's id. Without one it is open
// whether, and as what, it was created.
export function parseCreated(stdout) {
  const id = jsonOrNull(stdout)?.id;
  if (!Number.isInteger(id)) throw failure("Azure hat keine Nummer des neuen Work Items genannt", { write: true, unclear: true });
  return id;
}

// Making the work item `id` a child of `parent`.
export const azParentArgs = (c, id, parent) =>
  ["boards", "work-item", "relation", "add", ...azOrg(c.org), "--id", String(id), "--relation-type", "parent", "--target-id", String(parent), "-o", "json"];

// az's answer to the parent link: the work item with its relations, which
// az names by their friendly names ("Parent"); one to the parent's address
// confirms the link, anything else leaves it open.
export function checkParentLink(stdout, parent) {
  const relations = jsonOrNull(stdout)?.relations;
  const linked = Array.isArray(relations) && relations.some((r) => /^parent$|Hierarchy-Reverse$/i.test(r?.rel ?? "") && new RegExp(`/workItems/${parent}$`, "i").test(r?.url ?? ""));
  if (!linked) throw failure("Azure hat die Verknüpfung nicht bestätigt", { write: true, unclear: true });
}

// How long the Backlog keeps a team's settings (ms): they change rarely.
export const BACKLOG_KEEP_MS = 4 * 3600000;

// The Backlog as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure): what it keeps per team (backlogSettingsOf), how it loads and
// writes, and what `r` or a refused write drops (forget).
export function backlogView(s) {
  const key = (c) => `backlog\n${s.teamKey(c)}`;
  async function backlogSettingsOf(c) {
    const held = s.keptValue(key(c));
    if (held) return held.value;
    const [levels, config, settings, area] = await Promise.all([
      s.az(azLevelsArgs(c)).then(parseBacklogLevels),
      s.az(azBacklogConfigArgs(c)).then(parseBacklogConfig),
      s.az(azTeamSettingsArgs(c)).then(parseTeamSettings),
      s.az(azAreasArgs(c)).then(parseDefaultArea),
    ]);
    const value = { ...backlogLevels(levels, config), config, settings, area };
    s.kept.set(key(c), { value, until: Date.now() + BACKLOG_KEEP_MS });
    return value;
  }
  const forget = (c) => s.kept.delete(key(c));
  const onRefusal = (c) => s.dropOnRefusal(forget, c);
  return {
    forget,
    async load(view) {
      const c = view.context;
      const me = s.whoAmI();
      const kept = await backlogSettingsOf(c);
      const ids = parseBacklogIds(await s.az(azBacklogIdsArgs(c, kept.level.id), { failure: azRestFailure }));
      const read = ids.slice(0, AZ_QUERY_LIMIT);
      const out = read.length ? await s.az(azQueryArgs(c, backlogWiql(read, kept.config.orderField))) : "";
      const data = backlogList({ ...kept, ids, items: parseWorkItems(out, c, kept.config.orderField), viewer: await me });
      s.noViewerOf(data);
      return { data, warnings: [] };
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
    // Creates a work item ({ type, title }) in the team's default area and
    // iteration (data.meta), assigned to me; its id.
    async create(view, data, { type, title }) {
      const args = azCreateArgs(view.context, { type, title, area: data.meta.area, iteration: data.meta.iteration });
      return parseCreated(await s.az(args, { write: true }).catch(onRefusal(view.context)));
    },
    // Makes the work item `id` a child of `parent`.
    async addParent(view, id, parent) {
      checkParentLink(await s.az(azParentArgs(view.context, id, parent), { write: true }), parent);
    },
  };
}

// ==== src/sources/azure/index.js ====

// The Azure source as the board uses it (makeAzure); its team views'
// calls and data are in sprint.js and backlog.js, what both use in
// common.js.

// The Azure source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items, and per layout of an Azure view how
// it loads and writes. az runs by the path `paths` (toolPaths) finds.
//
// What the Sprint keeps, each read once and kept until the sprint ends
// (sprintUntil; one that fails keeps nothing): per team, by organisation,
// project and team, its current sprint, and its areas and taskboard
// columns; per project the work item types, until the sprint of the team
// that read them ends. What is not kept is read at the same time. A
// refresh then reads the taskboard's columns of the work items and the
// sprint's work items, also at the same time. The team's kept settings
// (not the project's types) are dropped, so that they are read again, by
// `r` on the Sprint (forget), by a task in a column the columns read do not
// know, and by a move or state change Azure refuses.
//
// What the Backlog keeps, per team, read at the same time once and kept
// for BACKLOG_KEEP_MS (one that fails keeps nothing): the team's backlog
// levels, its backlog configuration, its settings and its areas (for the
// default area). A refresh then reads the level's ids (az rest) and, after
// them, one query for their fields; a backlog without ids asks no query.
// `r` on the Backlog and a state change or create Azure refuses drop what
// it keeps.
//
// Who az is signed in as is read beside all that, with its own short
// timeout (AZ_ME_TIMEOUT), and kept once read; while that fails it is
// asked again with each refresh, and the data says why (noViewer: the
// source's words and the error).
export function makeAzure(paths) {
  // An az call's output; a failed one throws what `failure` (azFailure by
  // default) makes of it.
  const az = async (args, options = {}, timeout = AZ_TIMEOUT) => {
    const r = await call("az", args, null, timeout, { ...options, paths });
    if (r.code !== 0) throw (options.failure ?? azFailure)(r, null, options);
    return r.stdout;
  };
  const kept = new Map();
  const keptValue = (key) => {
    const entry = kept.get(key);
    return entry && Date.now() < entry.until ? entry : null;
  };
  let viewer = null;
  let viewerError = null;
  const whoAmI = () =>
    viewer
      ? Promise.resolve(viewer)
      : az(AZ_ME_ARGS, {}, AZ_ME_TIMEOUT).then((out) => {
        viewer = parseViewer(out);
        viewerError = viewer ? null : "keinen Benutzer genannt";
        return viewer;
      }, (e) => {
        viewerError = errorText(e);
        return null;
      });
  const noViewer = "az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login)";
  // What the views share: az, what is kept, who az is (and the data's words
  // for why it is not known), and a state change.
  const shared = {
    az, kept, keptValue, whoAmI,
    teamKey: (c) => `${c.org}\n${c.project}\n${c.team}`,
    noViewerOf(data) {
      if (!data.viewer) data.noViewer = `${noViewer}: ${viewerError}`;
    },
    // A write Azure refused may have met settings that are out of date:
    // `drop` drops them.
    dropOnRefusal: (drop, c) => (e) => {
      if (!(e instanceof BoardError && e.unclear)) drop(c);
      throw e;
    },
    setState: (view, item, state, onRefusal) =>
      az(azStateArgs(view.context, item.number, state), { write: true }).catch(onRefusal(view.context)).then((out) => checkStateResult(out, state)),
  };
  const views = { sprint: sprintView(shared), backlog: backlogView(shared) };
  return {
    site: "Azure",
    noViewer,
    // Drops what the view keeps of its team (r, Board.reload).
    forget(view) {
      if (view.context?.kind === "team") views[view.layout]?.forget(view.context);
    },
    views,
  };
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
      labels(first: 10) { nodes { name } } assignees(first: 5) { nodes { login } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } } }
    ... on DraftIssue { title creator { login } assignees(first: 5) { nodes { login } } }
  }`;

// One GraphQL request for a board view: the project, its field's options and
// the items of the shown columns, plus one count per hidden column (`h0`,
// `h1`, … aliases, first: 0) for the column menu, and the login gh runs as
// (for "nur meine").
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

// The logins of the people a pull request asks to review; a team's request,
// or one whose reviewer is gone, names no one.
const reviewerLogins = (requests) => (requests?.nodes ?? []).map((r) => r?.requestedReviewer?.login).filter(Boolean);

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
    reviewers: reviewerLogins(c.reviewRequests),
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
// { shape: "board", meta, columns: [{ id, name, color, hidden, count, target, cards }], total, limited, viewer, limit }
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
    shape: "board",
    meta: { projectId: project.id, fieldId: field.id, title: project.title, url: project.url },
    columns,
    total: project.items.totalCount,
    limited: project.items.pageInfo.hasNextPage,
    viewer: json?.data?.viewer?.login ?? null,
    limit: view.limit,
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

// Whether a search holds only one's own pull requests, as "nur meine" counts
// them: it has author, assignee, review-requested or user-review-requested
// set to @me, not negated (by a leading - or NOT). A review asked of a team
// one is in shows only in such a search; the answer names no person for it.
// involves, mentions, commenter, reviewed-by and the like do not count.
export function ownSearch(query) {
  const words = String(query ?? "").split(/\s+/);
  return words.some((w, i) => /^(author|assignee|review-requested|user-review-requested):@me$/i.test(w) && words[i - 1]?.toUpperCase() !== "NOT");
}

// gh's answer for githubListArgs (and the GraphQL errors that came with its
// data) → { shape: "prs", sections: [{ name, count, fetched, limited, skipped, rows }], viewer }.
// A pull request found by two sections shows in the first only; a result
// that is no pull request is counted in skipped. A search missing from the
// answer is explained by the error at its alias.
export function parseGithubList(json, view, errors = []) {
  const seen = new Set();
  const sections = view.sections.map((s, i) => {
    const own = ownSearch(s.query);
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
        reviewers: reviewerLogins(pr.reviewRequests),
        ownByQuery: own,
      });
    }
    // count: how many GitHub found; fetched: how many it sent; rows: those
    // held, each pull request once (in its first section), no other result.
    return { name: s.name, count: found.issueCount, fetched: found.nodes.length, limited: found.issueCount > found.nodes.length, skipped, rows };
  });
  return { shape: "prs", sections, viewer: json?.data?.viewer?.login ?? null };
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

// The GitHub source for the board: the name of the site `o` opens, why
// "nur meine" cannot tell one's own items when GitHub did not name the
// login, and per layout of a GitHub view how it loads (`hiddenFor(view)`
// gives its hidden columns) and how a board writes a move. gh runs by the
// path `paths` (toolPaths) finds.
export function makeGithub(paths) {
  return {
    site: "GitHub",
    noViewer: "GitHub hat nicht gesagt, als wer gh angemeldet ist",
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

// ==== src/ui/layer.js ====

// The board layer: how the board finds the stack that shows it in place of
// the shown tab's content, and how it shows that content again.

// ---- layer: the same in leader/main.js, board-button/main.js and board/src/ui/layer.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that the copies match.)
// The board layer (README, "herdr app") is a stack in the layout with a
// block that shows the board mod with props { layer: true } and a block
// that shows the shown tab. It is found by that shape, so its ids live in
// the layout alone.

// The first node of a layout tree, depth first, that `test` accepts, or
// null.
function findNode(node, test) {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, test);
    if (found) return found;
  }
  return null;
}

// The board layer of a layout tree as { stack, board, tab, shown }: the
// stack's id, its board child's and its tab child's, and whether it shows
// the board; null for a layout without one.
function boardLayer(root) {
  const isBoard = (n) => n.content?.mod === "board" && n.content.props?.layer === true;
  const isTab = (n) => n.content?.tab === "active";
  const stack = findNode(root, (n) => n.type === "stack" && (n.children ?? []).some(isBoard) && n.children.some(isTab));
  if (!stack) return null;
  const board = stack.children.find(isBoard).id;
  return { stack: stack.id, board, tab: stack.children.find(isTab).id, shown: stack.active === board };
}

// Shows the shown tab's content in place of the board. With `keyboard`, it
// also gives the keyboard to the focused pane, or the focused terminal
// outside a pane, since layout.select leaves the keyboard where it was.
// Each failure says what failed.
function showTab(layer, { keyboard = true } = {}) {
  try {
    run("layout.select", { stack: layer.stack, child: layer.tab });
  } catch (e) {
    notify({ title: `Could not show "${layer.tab}" in "${layer.stack}"`, body: String(e?.message ?? e), level: "error" });
    return;
  }
  if (!keyboard) return;
  const f = focused();
  const target = f?.pane ? { pane: f.pane } : f?.terminal ? { terminal: f.terminal } : null;
  if (!target) return;
  try {
    run("pane.focus", target);
  } catch (e) {
    const [kind, id] = Object.entries(target)[0];
    notify({ title: `Could not give ${kind} ${id} the keyboard`, body: String(e?.message ?? e), level: "error" });
  }
}

// Shows the tab's content again where the layout's board layer shows the
// board (showTab).
function leaveLayer(options) {
  const layer = boardLayer(layout());
  if (layer?.shown) showTab(layer, options);
}
// ---- end layer ----

// The block's functions for the board's other modules. The block stays
// byte for byte the leader's and the button's copy, which have nothing to
// export, so it carries no `export` of its own.
export const layers = { boardLayer, showTab, leaveLayer };

// ==== src/ui/helpers.js ====

// UI helpers: lasting settings, colors and machine names, whether the board
// shows, and the pieces that the Board, its shapes and its modals draw
// alike (a button, a backdrop for a dialog, a menu and its keys, a detail
// section, a check's color, a status pill, a column's head, a card's chip
// and a session's).

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
  if (store.get("tab:github") === null) store.set("tab:github", githubContextId(view));
  store.set("view", null);
}

export const tint = (hex, alpha) => (/^#[0-9a-f]{6}$/i.test(hex ?? "") ? `${hex}${alpha}` : hex);
export const machineName = (name) => name ?? "Dieser Rechner";
// "auf <machine>", or "auf diesem Rechner" for this one.
export const onMachine = (name) => (name ? `auf ${name}` : "auf diesem Rechner");

// Whether this copy of the board shows. The layer's copy (`isLayer`) shows
// while the board layer shows the board. A copy in a tab shows while a
// board pane is in the shown tab of the shown space, and no board layer
// covers that tab's content. herdr tells a pane mod no id of its own pane,
// so two Board tabs would count as one.
export function boardShown(isLayer) {
  const found = layers.boardLayer(layout());
  if (isLayer) return Boolean(found?.shown);
  if (found?.shown) return false;
  const shownTabs = new Set(spaces().filter((s) => s.active).flatMap((s) => s.tabs.filter((t) => t.active).map((t) => t.id)));
  return panes().some((p) => p.mod === MOD && shownTabs.has(p.tab));
}

// "<shown>/<total>" where the filter or "nur meine" hides some, else the
// total.
export const shownOf = (shown, total) => (shown < total ? `${shown}/${total}` : String(total));

// A button; `primary` is the solid one. A disabled one ignores clicks.
export function button(t, id, label, primary, action, disabled = false) {
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

// A backdrop over the whole board that swallows presses, with a panel on
// it.
export function backdrop(t, id, panel) {
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

// A menu over the board (the status and the column menu): a panel `width`
// wide, `<id>-menu` on a backdrop `<id>-backdrop`, with a title line and one
// row per entry of `rows` (its own children), each `<rowId>-<i>` and led by
// its digit (1–9). The row `at` is marked; a click on a row picks it
// (`pick(i, cx)`); menuKey takes its keys.
export function menu(t, { id, rowId, width, title, rows, at, pick }) {
  return backdrop(
    t,
    `${id}-backdrop`,
    v_flex()
      .id(`${id}-menu`)
      .w(width)
      .p(8)
      .gap(2)
      .rounded(10)
      .border_1()
      .border_color(t.input)
      .bg(t.popover)
      .shadow_lg()
      .child(div().px(8).py(6).text_size(12).text_color(t.muted).child(title))
      .children(
        rows.map((kids, i) =>
          h_flex()
            .id(`${rowId}-${i}`)
            .px(8)
            .py(6)
            .gap(8)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .when(i === at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => pick(i, cx))
            .child(div().w(14).text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
            .children(kids),
        ),
      ),
  );
}

// A menu's keys (every key but Esc, which the Board keeps; all are taken):
// j/k or the arrows move m.at over `count` rows, Enter picks the row at
// m.at, a digit picks its row (`pick(i, cx)`); a digit beyond the rows does
// nothing.
export function menuKey(e, cx, m, count, pick) {
  const k = e.key;
  const ch = e.key_char ?? "";
  cx.stop_propagation();
  if (k === "j" || k === "down") m.at = Math.max(0, Math.min(m.at + 1, count - 1));
  else if (k === "k" || k === "up") m.at = Math.max(m.at - 1, 0);
  else if (k === "enter") return pick(m.at, cx);
  else if (/^[1-9]$/.test(ch) && Number(ch) <= count) {
    m.at = Number(ch) - 1;
    return pick(m.at, cx);
  }
  cx.notify();
}

// A dialog's text field, the InputState `input` for the dialog m's field
// `field`: m.inputFocused follows its focus (Board.boardHasKeyboard), a
// focus moves the dialog onto that field, and Enter in it runs
// `submit(cx)`.
export function wireTextField(b, m, input, field, submit) {
  m.textField = field;
  m.inputFocused = false;
  input.on("focus", (_e, cx) => {
    m.inputFocused = true;
    if (b.modal === m) m.field = field;
    cx.notify();
  });
  input.on("blur", () => {
    m.inputFocused = false;
  });
  input.on("submit", (_e, cx) => submit(cx));
}

// Tab and shift-Tab (`back`) in the open dialog: the next or previous of
// its `fields`, the keyboard where that field wants it (Board.takeKeyboard).
export function cycleField(b, fields, back, cx) {
  const m = b.modal;
  const at = fields.indexOf(m.field);
  m.field = fields[(at + (back ? -1 : 1) + fields.length) % fields.length];
  b.takeKeyboard();
  cx.notify();
}

// A dialog field's label, and its frame, marked while the dialog is on it.
export const fieldLabel = (t, text) => div().text_size(12).text_color(t.muted).child(text);
export const fieldFrame = (t, m, field, inner) =>
  h_flex().h(34).px(10).items_center().rounded(6).border_1().border_color(m.field === field ? t.accent : t.input).bg(t.background).child(inner);

// A section of the detail panel: a title over its rows.
export const detailSection = (t, title, ...kids) =>
  v_flex().px(18).py(12).gap(6).border_b(1).border_color(t.border).child(div().text_size(11).text_color(t.muted).child(title)).children(kids);

// The detail panel's parts of a work item (the sprint and the backlog
// shape): its `state` as a pill on its theme `color`, a click opening the
// status menu; a section `title` with `rows` ([label, value]) where there
// are any; and Status s.
export function workItemDetail(b, t, view, { state, color, title, rows }) {
  const openStatus = (cx) => {
    if (!b.modal) b.openStatusMenu(view, cx);
  };
  const line = ([label, value]) => div().text_size(12).text_color(t.muted).child(`${label}: ${value}`);
  return {
    chips: [statusPill(t, state ?? "ohne Status", color, openStatus)],
    sections: rows.length ? [detailSection(t, title, ...rows.map(line))] : [],
    buttons: [button(t, "act-status", "Status s", false, openStatus)],
  };
}

// The theme color of a check state.
export const checkColor = (t, state) => ({ failed: t.ansi1, pending: t.ansi3, passed: t.ansi2 })[state] ?? t.dim;

// The detail panel's status pill: `label` on its theme `color`; a click
// opens the status menu (`open(cx)`).
export function statusPill(t, label, color, open) {
  return div()
    .id("status-pill")
    .px(10)
    .py(2)
    .rounded(12)
    .text_size(12)
    .font_semibold()
    .cursor_pointer()
    .bg(t[color] ?? t.muted)
    .text_color(t.background)
    .on_click((_e, cx) => open(cx))
    .child(`${label} ▾`);
}

// A column's head: its color, its name and `count`.
export const columnHead = (t, col, count) =>
  h_flex()
    .gap(6)
    .items_center()
    .child(div().size(9).flex_none().rounded(5).bg(t[col.color] ?? t.muted))
    .child(div().flex_1().min_w(0).truncate().font_semibold().child(col.name))
    .child(div().flex_none().text_size(12).text_color(t.muted).child(count));

// A card's chip: `text` in `fg` on `bg`.
export const chip = (t, text, fg = t.muted, bg = t.raised) => div().px(7).rounded(9).text_size(11).text_color(fg).bg(bg).child(text);

// A card's chip for its session (linkedSession): what its agent does.
export const sessionChip = (t, session) => chip(t, AGENT_STATUS[session.status] ?? "Sitzung", t.background, t[session.status] ?? t.idle);

// ==== src/kinds/backlog.js ====

// A team's backlog: its rows in backlog order, the item with a key, a state
// change laid over the data, what a new work item may be, and the
// backlog's warnings. backlogList (sources/azure/backlog.js) builds the data.

// The work item with `key`, or null.
export const findBacklogItem = (data, key) => data?.rows.find((r) => r.key === key) ?? null;

// The data with the item `key` in `state`.
export const withBacklogState = (data, key, state) => ({ ...data, rows: data.rows.map((r) => (r.key === key ? { ...r, state } : r)) });

// The rows that show, as one column (navigate walks a list as one).
export const backlogNav = (data, filter, mine) => [{ id: "backlog", name: data.meta.level.name, shown: data.rows.filter((r) => shows(r, filter, mine, data.viewer)) }];

// The types a new work item may have: the level's, its default first, then
// with a selected item of the level (`parent`) the types of the level
// below it, as its children (child: true).
export function createTypes(data, parent) {
  const { level, childLevel } = data.meta;
  const own = [...new Set([level.defaultType, ...level.types].filter(Boolean))].map((name) => ({ name, child: false }));
  const children = parent ? (childLevel?.types ?? []).filter((n) => !own.some((t) => t.name === n)).map((name) => ({ name, child: true })) : [];
  return [...own, ...children];
}

// The warnings of a backlog: ids its query did not find, and a backlog
// longer than one query reads.
export function backlogWarnings(data) {
  const { missing } = data.meta;
  return [
    ...(missing > 0 ? [`${missing} ${missing === 1 ? "Eintrag" : "Einträge"} des Backlogs ohne Felder (nicht gefunden)`] : []),
    ...(data.limited ? [`Nur die ersten ${data.limit} von ${data.total} Einträgen des Backlogs (so viele liest eine Abfrage)`] : []),
  ];
}

// ==== src/actions/write.js ====

// Writing a change of an item at once: it shows before it is written, one
// write per item at a time; a refusal undoes it and says why, and a write
// whose outcome is unclear keeps the change, refreshes the view and leaves
// the outcome for the next refresh to settle (Board.settleUnclear, the
// shape's settle, which says the outcomes with tellOutcomes). A card's
// move, a work item's state change, a create and a parent link are written
// so.

// Whether a write's view still stands, the one rule for following a write
// up: views.json, as its last valid form says (an invalid one in between
// keeps it), still has that view, of the same kind (followed); and the
// view as views.json has it now (current, null while it is not there).
export function viewStands(b, view) {
  return { followed: b.kinds?.get(view.id) === viewKind(view), current: b.viewById(view.id) };
}

// Writes the change `w` of the item w.key (labelled w.label) at once:
// - w.refuse: a text to say instead of writing (checked after a write of
//   the item under way);
// - w.apply() shows the change; w.write() writes it (a BoardError marked
//   unclear leaves the outcome open);
// - w.landed(cx) when it landed, with the cx that may still be used then
//   (the write's own: a cx a call handed over goes stale when that call
//   returns, herdr's scope.rs); a throw there does not undo the write, it
//   is said as w.texts.landedBut(why). w.failed() when it did not land,
//   either way; w.undo() when it was refused;
// - w.open: what an open outcome records beside key, label and time, for
//   the shape's settle: its kind ("move" with the target `to`, "state"
//   with the `state`, "create" with the title and type, "parent" with the
//   parent), and its key where that is not w.key (a create's, whose w.key
//   only keeps one create at a time). A write replaces or drops only the
//   item's open outcome of its own kind, so a move's report waits through
//   a state change and the other way round;
// - w.texts: pending() and landed() say how it goes, unclear leads the
//   warning, refused(why, earlier) the error (earlier: an outcome of the
//   item's write of this kind is still open), landedBut(why) a landed write
//   whose follow-up failed; toasts: the toasts' titles, { unclear (also a
//   landed write whose follow-up failed), refused } ("Status von AB#3",
//   "Status von AB#3 nicht geändert" by default);
// - w.again: refresh after a write that landed too.
// A write that landed or was refused refreshes the view too while an open
// outcome of the item, of either kind, remains: the refresh tells it, so
// it does not wait for the timer. A refresh follows only while the view
// stands (viewStands).
export function writeAtOnce(b, view, w, cx) {
  const st = b.state(view.id);
  const { key, label } = w;
  const openKey = w.open.key ?? key;
  const same = (u) => u.key === openKey && u.kind === w.open.kind;
  const toasts = w.texts.toasts ?? { unclear: `Status von ${label}`, refused: `Status von ${label} nicht geändert` };
  if (st.pending[key]) return b.say(`${label} wird noch gespeichert`, "info", cx);
  if (w.refuse) return b.say(w.refuse, "warning", cx);
  w.apply();
  st.pending[key] = true;
  b.say(w.texts.pending(), "info", cx);
  cx.spawn(async (cx) => {
    try {
      let landed = false;
      try {
        await w.write();
        landed = true;
      } catch (e) {
        failed(e, cx);
      }
      if (landed) settled(cx);
    } finally {
      delete st.pending[key];
      cx.notify();
    }
  });

  function settled(cx) {
    // A write that landed replaces the open outcome of an earlier one.
    st.unclear = st.unclear.filter((u) => !same(u));
    let said = w.texts.landed();
    let level = "success";
    try {
      w.landed?.(cx);
    } catch (e) {
      said = w.texts.landedBut?.(report(e)) ?? `${said}; danach: ${report(e)}`;
      level = "warning";
      notify({ title: toasts.unclear, body: said, level });
    }
    b.say(said, level, cx);
    const { followed, current } = viewStands(b, view);
    if ((w.again || openOf(st, key)) && followed && current) b.refresh(current, cx);
  }

  function failed(e, cx) {
    w.failed?.();
    const why = report(e);
    const { followed, current } = viewStands(b, view);
    if (e instanceof BoardError && e.unclear) {
      if (followed) st.unclear = [...st.unclear.filter((u) => !same(u)), { label, ...w.open, key: openKey, at: Date.now() }];
      const next = !followed ? "" : current ? "; lädt neu" : "; wird nach dem nächsten Neuladen gemeldet";
      b.say(`${w.texts.unclear}: ${why}${next}`, "warning", cx);
      notify({ title: toasts.unclear, body: why, level: "warning" });
      if (followed && current) b.refresh(current, cx);
    } else {
      w.undo();
      const earlier = st.unclear.some(same);
      b.say(w.texts.refused(why, earlier), "error", cx);
      notify({ title: toasts.refused, body: why, level: "error" });
      if (followed && current && openOf(st, key)) b.refresh(current, cx);
    }
  }
}

// Whether an outcome of the item `key`, of either kind, is still open.
const openOf = (st, key) => st.unclear.some((u) => u.key === key);

// Says the lines of settled outcomes ({ text, warn }) in one notice; one
// that warns makes it a warning, which a toast repeats.
export function tellOutcomes(b, lines, cx) {
  if (!lines.length) return;
  const level = lines.some((l) => l.warn) ? "warning" : "info";
  const text = lines.map((l) => l.text).join("; ");
  b.say(text, level, cx);
  if (level === "warning") notify({ title: "Status nach dem Neuladen", body: text, level: "warning" });
}

// ==== src/kinds/states.js ====

// A work item's state as the board shows it: its theme color.

// The theme color of a state, by its category (data.meta.states:
// parseAzureTypes, parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";

// ==== src/actions/state.js ====

// Changing a work item's state: the status menu of its type's states, the
// change shown at once and written by the view's loader (its setState), as
// writeAtOnce writes, and after a refresh which state the items of unclear
// changes have. The sprint and the backlog shape change states so; each
// says how it finds an item, lays a state over its data and reads the
// state an item shows (`how`: { find(data, key), withState(data, key,
// state), stateOf(data, item), where (where an item
// no longer is: "im Sprint"), again (refresh after a change that landed)
// }).

// Opens the status menu for the selected item: the states of its type
// (data.meta.typeStates), the one it shows marked.
export function openStateMenu(b, view, how, cx) {
  const st = b.state(view.id);
  const item = b.selected(view);
  if (!item) return;
  const states = st.data.meta.typeStates?.[item.type];
  if (!states?.length) return b.say(`Für ${item.type ?? "diesen Typ"} kennt das Board keine Status`, "info", cx);
  const targets = states.map((name) => ({ id: name, name, color: stateColor(st.data, name), hidden: false }));
  b.modal = { kind: "status", view, key: item.key, targets, at: Math.max(0, states.indexOf(how.stateOf(st.data, item))) };
}

// Sets an item's state at once and writes it (writeAtOnce); the state it
// has already sends nothing. A refusal sets the state back, unless a
// refresh has read another since.
export function setStateAtOnce(b, view, key, state, how, cx) {
  const st = b.state(view.id);
  const item = how.find(st.data, key);
  if (!item) return b.say("Den Eintrag gibt es nicht mehr", "warning", cx);
  const label = itemLabel(item);
  const before = how.stateOf(st.data, item);
  if (before === state) return;
  writeAtOnce(b, view, {
    key,
    label,
    apply: () => (st.data = how.withState(st.data, key, state)),
    write: () => b.loader(view).setState(view, item, state),
    undo() {
      if (how.find(st.data, key)?.state === state) st.data = how.withState(st.data, key, before);
    },
    open: { kind: "state", state },
    again: how.again,
    texts: {
      pending: () => `${label} → ${state} …`,
      landed: () => `${label} hat jetzt den Status „${state}“`,
      unclear: `${label} → ${state}`,
      refused: (why, earlier) => (earlier ? `${label} → ${state} nicht gespeichert: ${why}` : `${label} bleibt „${before}“: ${why}`),
    },
  }, cx);
}

// Which state the items of settled unclear state changes (`due`) have in
// the new data, one line each: the state it was set to (info), another
// (warning), or not in the view any more (warning).
export function unclearStateLines(due, data, how) {
  return due.map((u) => {
    const now = how.find(data, u.key);
    if (!now) return { text: `${u.label} ist nach dem Neuladen nicht ${how.where}`, warn: true };
    const state = how.stateOf(data, now);
    if (state === u.state) return { text: `${u.label} hat nach dem Neuladen den Status „${u.state}“`, warn: false };
    return { text: `${u.label} hat nach dem Neuladen den Status „${state}“, nicht „${u.state}“`, warn: true };
  });
}

// ==== src/actions/create.js ====

// Creating a work item on a backlog: written by the view's loader (its
// create, then its addParent for a child), as writeAtOnce writes, with no
// row before Azure names the new id; and after a refresh, how unclear
// creates and parent links ended up. The backlog shape creates so.

// The key a create is written under: one create at a time per view.
export const CREATE_KEY = "create";

// The key of the Azure work item `id` (itemKey).
const workItemKey = (id) => itemKey({ source: "azure", kind: "workitem", number: id });

// Creates a work item of `type` with `title`; a child type (type.child)
// goes under `parent`. Nothing shows before Azure names the id; then the
// backlog is read again and the new item, where the level holds its type,
// is chosen once that refresh has it (Board.chooseWanted). A child, which
// is no item of the level, is linked to its parent next (linkParent).
export function createItem(b, view, { type, title, parent }, cx) {
  const st = b.state(view.id);
  const label = `„${title}“`;
  const under = type.child && parent ? parent : null;
  let id = null;
  writeAtOnce(b, view, {
    key: CREATE_KEY,
    label,
    apply() {},
    write: async () => (id = await b.loader(view).create(view, st.data, { type: type.name, title })),
    // The write's own cx (writeAtOnce): the one this was called with has
    // gone stale by now.
    landed(cx) {
      if (!under) st.want = { key: workItemKey(id), after: st.runs };
      else linkParent(b, view, id, under, cx);
    },
    undo() {},
    open: { kind: "create", title },
    again: true,
    texts: {
      pending: () => `${type.name} ${label} wird angelegt …`,
      landed: () => (under ? `${workItemKey(id)} ${label} angelegt; wird unter ${itemLabel(under)} gehängt …` : `${workItemKey(id)} ${label} angelegt`),
      unclear: `${type.name} ${label} anlegen`,
      refused: (why) => `${type.name} ${label} nicht angelegt: ${why}`,
      landedBut: (why) => `${workItemKey(id)} ${label} angelegt, aber nicht unter ${itemLabel(under)} gehängt: ${why}`,
      toasts: { unclear: `Anlegen von ${label}`, refused: `${label} nicht angelegt` },
    },
  }, cx);
}

// Makes the new work item `id` a child of `parent`, as a write of its own:
// the item is there either way, so a refusal says only that the link is
// missing.
function linkParent(b, view, id, parent, cx) {
  const label = workItemKey(id);
  const to = itemLabel(parent);
  writeAtOnce(b, view, {
    key: label,
    label,
    apply() {},
    write: () => b.loader(view).addParent(view, id, parent.number),
    undo() {},
    open: { kind: "parent", parent: parent.number, parentLabel: to },
    texts: {
      pending: () => `${label} wird unter ${to} gehängt …`,
      landed: () => `${label} hängt jetzt unter ${to}`,
      unclear: `${label} unter ${to}`,
      refused: (why) => `${label} ist angelegt, hängt aber nicht unter ${to}: ${why}`,
      toasts: { unclear: `${label} unter ${to}`, refused: `${label} hängt nicht unter ${to}` },
    },
  }, cx);
}

// Where the work items of settled unclear creates (`due`, of kind
// "create") are in the new data, one line each: an item of that title in
// the backlog (info), else none (warning; a child type is no item of the
// level, so it never shows there).
export function unclearCreateLines(due, data) {
  return due.map((u) => {
    const found = data.rows.filter((r) => r.title === u.title);
    if (found.length) return { text: `${u.label} steht nach dem Neuladen im Backlog (${found.map(itemLabel).join(", ")})`, warn: false };
    return { text: `${u.label} steht nach dem Neuladen nicht im Backlog`, warn: true };
  });
}

// Whether the items of settled unclear parent links (`due`, of kind
// "parent") hang under their parent in the new data, one line each; an
// item the backlog does not hold (a Task) it cannot tell.
export function unclearParentLines(due, data) {
  return due.map((u) => {
    const now = findBacklogItem(data, u.key);
    if (!now) return { text: `Ob ${u.label} unter ${u.parentLabel} hängt, zeigt der Backlog nicht: ${u.label} ist kein Eintrag von ihm`, warn: true };
    if (now.parent === u.parent) return { text: `${u.label} hängt nach dem Neuladen unter ${u.parentLabel}`, warn: false };
    return { text: `${u.label} hängt nach dem Neuladen nicht unter ${u.parentLabel}`, warn: true };
  });
}

// ==== src/ui/modals/columns.js ====

// The column menu: every column of a board view, shown or hidden, walked
// with j/k; Enter, a digit or a click hides or shows one, and the menu stays
// open until Esc. The board shape opens it (X) as b.modal = { kind:
// "columns", view, at }; it reads the columns from the view's data as they
// are now, so a toggle shows at once.

// The view's columns, all of them, in the board's order.
const columnsOf = (b, m) => b.state(m.view.id).data?.columns ?? [];

// Hides or shows the column at `at`, on the view as views.json has it now.
function toggleAt(b, m, at, cx) {
  const col = columnsOf(b, m)[at];
  if (!col) return;
  m.at = at;
  b.toggleColumn(b.viewById(m.view.id) ?? m.view, col, cx);
  cx.notify();
}

export const columnsModal = {
  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "columns",
      rowId: "column",
      width: 320,
      title: "Spalten zeigen · j/k Enter · Esc",
      at: m.at,
      pick: (i, cx) => toggleAt(b, m, i, cx),
      rows: columnsOf(b, m).map((c) => [
        div().w(14).text_color(t.foreground).child(c.hidden ? "" : "✓"),
        div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted),
        div().flex_1().min_w(0).truncate().text_color(c.hidden ? t.muted : t.foreground).child(c.name),
        div().flex_none().text_size(11).text_color(t.dim).child(c.count === null ? "" : String(c.count)),
        div().w(80).flex_none().text_size(11).text_color(t.dim).child(!c.target ? "immer gezeigt" : c.hidden ? "ausgeblendet" : "gezeigt"),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, columnsOf(b, b.modal).length, (i, cx) => toggleAt(b, b.modal, i, cx)),
};

// ==== src/ui/modals/create.js ====

// The create dialog: a new work item on a team's backlog, its type (the
// level's types, its default first; with an item of the level selected also
// the types of the level below, as that item's children) and its title.
// The backlog shape opens it (n) as b.modal = { kind: "create", view,
// types, at (the chosen type), parent (the selected item, or null), input
// (the title's InputState, made for this dialog), field ("title" or
// "type"), textField ("title"), inputFocused, error }. Enter or Anlegen
// creates (actions/create.js): the dialog closes and the notice says how it
// goes.

// The fields Tab walks, in order.
const CREATE_FIELDS = ["title", "type"];

// Where a new work item of the chosen type goes, as the dialog says it.
function whereText(m) {
  const meta = m.data.meta;
  const type = m.types[m.at];
  const place = type?.child ? `unter ${itemLabel(m.parent)} „${m.parent.title}“` : `in „${meta.level.name}“`;
  return `Neu ${place}; Bereich ${meta.area ?? "—"}, Iteration ${meta.iteration ?? "—"}, mir zugewiesen`;
}

export const createModal = {
  // Opens the dialog for the view's backlog, or says why a new work item
  // cannot be made there: no type, no default area or iteration.
  open(b, view, cx) {
    const data = b.state(view.id).data;
    if (!data) return;
    const parent = b.selected(view);
    const types = createTypes(data, parent);
    if (!types.length) return b.say(`„${data.meta.level.name}“ nennt keine Work-Item-Typen`, "warning", cx);
    if (!data.meta.area || !data.meta.iteration) {
      const missing = [!data.meta.area && "Standardbereich", !data.meta.iteration && "Standard-Iteration"].filter(Boolean).join(" und ");
      return b.say(`Das Team hat keinen ${missing}: in Azure unter Team-Einstellungen setzen`, "warning", cx);
    }
    const input = InputState.new({ placeholder: "Titel des neuen Work Items" });
    const m = { kind: "create", view, data, types, at: 0, parent, input, field: "title", error: null };
    wireTextField(b, m, input, "title", (cx) => createModal.create(b, cx));
    b.modal = m;
    input.focus();
    cx.notify();
  },

  // Creates the work item and closes the dialog; without a title it stays
  // and says so.
  create(b, cx) {
    const m = b.modal;
    if (m?.kind !== "create") return;
    const title = m.input.value().trim();
    if (!title) {
      m.error = "Der Titel fehlt";
      return cx.notify();
    }
    b.closeModal(cx);
    createItem(b, m.view, { type: m.types[m.at], title, parent: m.parent }, cx);
  },

  // Tab and shift-Tab (`back`): the next or previous field.
  tab: (b, back, cx) => cycleField(b, CREATE_FIELDS, back, cx),

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey);
  // on the type h/l or the arrows change it, Enter creates. Typing goes to
  // the title.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.field === "title") return;
    cx.stop_propagation();
    if (k === "enter") return createModal.create(b, cx);
    const by = { h: -1, left: -1, k: -1, up: -1, l: 1, right: 1, j: 1, down: 1, space: 1 }[k];
    if (by) cycleType(m, by, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    const type = m.types[m.at];
    return backdrop(
      t,
      "create-backdrop",
      v_flex()
        .id("create-dialog")
        .w(560)
        .rounded(12)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(
          v_flex().px(20).py(16).gap(4).border_b(1).border_color(t.border)
            .child(div().text_size(15).font_semibold().child(`Neues Work Item · ${m.view.context.team}`))
            .child(div().text_size(12).text_color(t.muted).child(whereText(m))),
        )
        .child(
          v_flex().px(20).py(16).gap(14)
            .child(v_flex().gap(6).child(label("Typ")).child(
              frame("type", h_flex().id("create-type").flex_1().min_w(0).gap(6).cursor_pointer()
                .on_click((_e, cx) => {
                  m.field = "type";
                  b.handle.focus();
                  cycleType(m, 1, cx);
                })
                .child(div().flex_1().min_w(0).truncate().child(type.child ? `${type.name} (unter ${itemLabel(m.parent)})` : type.name))
                .child(div().text_color(t.dim).child("◂ ▸"))),
            ))
            .child(v_flex().gap(6).child(label("Titel")).child(frame("title", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(t.ansi1).child(m.error ?? ""))),
        )
        .child(
          h_flex().px(20).py(12).gap(8).items_center().border_t(1).border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child("Tab wechselt das Feld · ◂ ▸ wählt den Typ"))
            .child(button(t, "create-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx)))
            .child(button(t, "create-go", "Anlegen ↵", true, (cx) => createModal.create(b, cx))),
        ),
    );
  },
};

function cycleType(m, by, cx) {
  m.at = (m.at + by + m.types.length) % m.types.length;
  cx.notify();
}

// ==== src/ui/modals/start.js ====

// The start dialog: opens an item's session in its checkout, on a machine
// and with an agent chosen here, as a new space or tab, with a first message
// to edit. It is b.modal = { kind: "start", view, item, settings, input
// (the message's InputState, made for this dialog), field, textField (the
// field that is the input: "message"), inputFocused,
// agents, agent, agentsError, machines, machine, machineNote, agentNote,
// notes, open, busy, error }.

const CHECKOUT_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
// The fields Tab walks, in order.
const FIELDS = ["message", "agent", "machine", "open"];

export const startModal = {
  // Opens the dialog for an item, or says where its checkout is missing. An
  // item without a repo (an Azure work item) takes only views.json's own
  // start: an Azure view has no start of its own.
  open(b, view, item, cx) {
    const settings = startSettings(b.config, view, item.repo);
    if (!settings.checkout) {
      if (!item.repo) return b.say(`Für ${itemLabel(item)} steht kein „checkout“ in ${CONFIG_NAME}.json: „start.checkout“`, "error", cx);
      const where = `„repos“ → „${item.repo}“ oder „start.checkout“ der Ansicht „${view.name}“`;
      return b.say(`Für ${item.repo} steht kein „checkout“ in ${CONFIG_NAME}.json: ${where}`, "error", cx);
    }
    const input = InputState.new({ placeholder: "Erste Nachricht an den Agent" });
    const template = item.kind === "pr" ? settings.review : settings.message;
    input.set_value(renderTemplate(template, templateVars(item)));
    const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name);
    const list = listed.length ? listed : [null];
    let machine = list.indexOf(settings.machine ?? null);
    const machineNote = machine < 0 ? `Rechner „${settings.machine}“ ist nicht verbunden; gewählt: ${machineName(list[0])}` : null;
    if (machine < 0) machine = 0;
    const m = {
      kind: "start", view, item, settings, input, field: "message", agents: [], agent: 0, agentsError: null, machineNote, agentNote: null,
      notes: [machineNote].filter(Boolean), machines: list, machine, open: settings.open === "tab" ? "tab" : "space", busy: null, error: null,
    };
    wireTextField(b, m, input, "message", (cx) => startModal.start(b, cx));
    b.modal = m;
    input.focus();
    loadAgents(b, cx);
    cx.notify();
  },

  // Opens the item's session in its checkout on the chosen machine: finds the
  // checkout's folder there, then runs space.new or tab.new. run() answers
  // nothing, so the board says the session is being opened and watches for a
  // space or tab of its name (watchSession). The dialog stays until the
  // folder is known or the start failed; a failure that comes after the
  // dialog went shows in the banner and as a toast.
  start(b, cx) {
    const m = b.modal;
    if (m?.kind !== "start" || m.busy) return;
    const agent = m.agents[m.agent];
    if (!agent) return void ((m.error = m.agentsError ?? "Kein Agent gewählt"), cx.notify());
    const on = m.machines[m.machine];
    const task = m.input.value().trim();
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
        if (b.modal === m) {
          b.modal = null;
          b.handle.focus();
        }
        b.say(`Sitzung wird geöffnet: ${name}${on ? ` auf ${on}` : ""}`, "info", cx);
        watchSession(b, name, cx);
      } catch (e) {
        const why = report(e);
        if (b.modal === m) m.error = why;
        else {
          b.say(`${itemLabel(m.item)}: Sitzung nicht geöffnet: ${why}`, "error", cx);
          notify({ title: `Sitzung für ${itemLabel(m.item)} nicht geöffnet`, body: why, level: "error" });
        }
      } finally {
        m.busy = null;
        cx.notify();
      }
    });
    cx.notify();
  },

  // Tab and shift-Tab (`back`): the next or previous field.
  tab: (b, back, cx) => cycleField(b, FIELDS, back, cx),

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey,
  // where Tab comes here at all rather than as the board's action); h/l or
  // the arrows change a choice, Enter starts. Typing goes to the message.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.field === "message") return;
    cx.stop_propagation();
    if (k === "enter") return startModal.start(b, cx);
    if (k === "h" || k === "left") return cycle(b, m.field, -1, cx);
    if (k === "l" || k === "right" || k === "space") return cycle(b, m.field, 1, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
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
              b.handle.focus();
              cycle(b, field, 1, cx);
            })
            .child(div().flex_1().min_w(0).truncate().child(value))
            .child(div().text_color(t.dim).child("◂ ▸"))),
        );
    const agent = m.agents[m.agent];
    return backdrop(
      t,
      "start-backdrop",
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
                .child(frame("message", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))),
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
            .child(button(t, "start-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx), Boolean(m.busy)))
            .child(button(t, "start-go", "Starten ↵", true, (cx) => startModal.start(b, cx), Boolean(m.busy))),
        ),
    );
  },
};

function loadAgents(b, cx) {
  const m = b.modal;
  const on = m.machines[m.machine];
  m.agents = [];
  m.agentsError = null;
  m.agentNote = null;
  cx.spawn(async (cx) => {
    try {
      const agents = (await knownAgents({ on })).filter((a) => a.installed);
      if (b.modal !== m || m.machines[m.machine] !== on) return;
      m.agents = agents;
      const wanted = m.settings.agent;
      m.agent = Math.max(0, agents.findIndex((a) => a.key === wanted));
      if (!agents.length) m.agentsError = "Kein Agent installiert";
      else if (wanted && !agents.some((a) => a.key === wanted)) {
        m.agentNote = `Agent „${wanted}“ ist ${onMachine(on)} nicht installiert; gewählt: ${agents[0].name}`;
      }
    } catch (e) {
      if (b.modal !== m || m.machines[m.machine] !== on) return;
      m.agentsError = `Agents ${onMachine(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
    }
    m.notes = [m.machineNote, m.agentNote].filter(Boolean);
    cx.notify();
  });
}

function cycle(b, field, by, cx) {
  const m = b.modal;
  if (m.busy) return;
  if (field === "agent" && m.agents.length) m.agent = (m.agent + by + m.agents.length) % m.agents.length;
  if (field === "machine") {
    m.machine = (m.machine + by + m.machines.length) % m.machines.length;
    m.machineNote = null;
    loadAgents(b, cx);
  }
  if (field === "open") m.open = m.open === "space" ? "tab" : "space";
  cx.notify();
}

// Looks for a space or tab named `name` after each wait in SESSION_CHECKS;
// says so when it appears, warns when it has not after the last.
function watchSession(b, name, cx, at = 0) {
  cx.timer.after(SESSION_CHECKS[at], (cx) => {
    const there = spaces().some((s) => s.name === name || s.tabs.some((t) => t.name === name));
    if (there) return b.say(`Sitzung geöffnet: ${name}`, "success", cx);
    if (at + 1 < SESSION_CHECKS.length) return watchSession(b, name, cx, at + 1);
    b.say(`Kein Space und kein Tab „${name}“ erschienen; die Sitzung ist wohl nicht gestartet`, "warning", cx);
    notify({ title: "Sitzung nicht erschienen", body: name, level: "warning" });
  });
}

// ==== src/ui/modals/status.js ====

// The status menu: the columns a card may go to, or the states an item may
// take, picked with j/k and Enter, a digit, or a click. A shape with columns
// or states opens it (openStatusMenu) as b.modal = { kind: "status", view,
// key, targets, at }.

// Moves the card to the target at `i`, or does what the view's shape does
// with a pick (pickStatus).
function pickTarget(b, m, i, cx) {
  b.closeModal(cx);
  const pick = b.shape(m.view).pickStatus;
  if (pick) pick(b, m.view, m.key, m.targets[i], cx);
  else b.moveTo(m.view, m.key, m.targets[i].id, cx);
}

export const statusModal = {
  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "status",
      rowId: "status",
      width: 280,
      title: "Status ändern · j/k Enter · Esc",
      at: m.at,
      pick: (i, cx) => pickTarget(b, m, i, cx),
      rows: m.targets.map((c) => [
        div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted),
        div().flex_1().child(c.name),
        ...(c.hidden ? [div().text_size(11).text_color(t.dim).child("ausgeblendet")] : []),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, b.modal.targets.length, (i, cx) => pickTarget(b, b.modal, i, cx)),
};

// ==== src/ui/modals/index.js ====

// The dialogs drawn over the board, by b.modal.kind: each has render(b, t)
// and key(b, e, cx), which gets every key but Esc (the Board closes a dialog
// on Esc unless it is busy). A dialog keeps its state, and makes the inputs
// it needs, in b.modal; one that belongs to a view keeps it as
// b.modal.view, and a reload that finishes while it is open closes it when
// views.json no longer has that view of that kind. A dialog with fields
// also has tab(b, back, cx), which Tab and shift-Tab (`back`) call to move
// between them (Board.dialogTab). A new dialog is a module here and its
// entry in MODALS.

export const MODALS = { start: startModal, status: statusModal, columns: columnsModal, create: createModal };

// ==== src/ui/shapes/backlog.js ====

// The backlog shape: a team's backlog level (its Stories) as a list in
// backlog order, one row per work item with its id, type, title, state,
// sprint ("—" for none) and assignee, walked as one column. n creates a
// work item (the create dialog, actions/create.js), s changes the selected
// item's state from its type's states (the status menu, actions/state.js),
// Enter shows the details. Not the prs shape: that one draws sections of
// GitHub pull requests with their author, draft mark, checks and age. The
// data: { shape: "backlog", meta: { level, childLevel, typeStates, states,
// orderField, area, iteration, missing }, rows, viewer, noViewer, total,
// limited, limit } (backlogList, sources/azure/backlog.js). View fields it reads:
// id, source, layout (as writeAtOnce does), context (the create dialog).

// The backlog shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const backlogState = (b) => b.shapeState.backlog;

const backlogColumns = (b, st) => backlogNav(st.data, b.filterText, b.mine);

// How the backlog finds, changes and shows its items' states
// (actions/state.js). A state that landed is the item's own: nothing is
// read again for it.
const BACKLOG_STATES = {
  find: findBacklogItem, withState: withBacklogState, stateOf: (_data, item) => item.state, where: "im Backlog", again: false,
};

// The widths of a row's cells (the title takes the rest).
const WIDTH = { key: 80, type: 110, state: 120, sprint: 120, assignee: 150 };

export const backlogShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
  nav: (b, st) => backlogColumns(b, st),
  selected: (b, st) => backlogColumns(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo: (b, view, sel, row) => backlogState(b).scroll.scroll_to_item(row),
  items: (data) => data.rows,
  count: (b, data) => ({ shown: data.rows.filter((r) => b.visible(r, data)).length, total: data.rows.length }),
  render: (b, t, mono, view, st) => drawBacklog(b, t, mono, view, st),
  hints: [["j/k", "bewegen"], ["n", "neu"], ["s", "Status"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
  dirs: ["up", "down"],
  loads: true,
  keys(b, view, st, { k }, cx) {
    if (!st.data) return false;
    if (k === "n") return MODALS.create.open(b, view, cx), true;
    if (k === "s") return b.openStatusMenu(view, cx), true;
    return false;
  },
  received: (data) => data,
  warnings: (_view, data) => backlogWarnings(data),
  // The settled outcomes: a state change's which state its item has, a
  // create's whether its title is in the backlog, a parent link's whether
  // the item hangs under its parent.
  settle: (b, due, data, cx) => tellOutcomes(b, [
    ...unclearStateLines(due.filter((u) => u.kind === "state"), data, BACKLOG_STATES),
    ...unclearCreateLines(due.filter((u) => u.kind === "create"), data),
    ...unclearParentLines(due.filter((u) => u.kind === "parent"), data),
  ], cx),
  openStatusMenu: (b, view, cx) => openStateMenu(b, view, BACKLOG_STATES, cx),
  pickStatus: (b, view, key, target, cx) => setStateAtOnce(b, view, key, target.name, BACKLOG_STATES, cx),
  // The detail panel's rows of a work item: its state as a pill (a click
  // opens the status menu), its area, iteration and sprint, and Status s.
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    if (!st.data) return {};
    const rows = [["Sprint", item.sprint ?? "—"], ...(item.area ? [["Bereich", item.area]] : []), ...(item.iteration ? [["Iteration", item.iteration]] : [])];
    return workItemDetail(b, t, view, { state: item.state, color: stateColor(st.data, item.state), title: "BACKLOG", rows });
  },
};

function drawBacklog(b, t, mono, view, st) {
  const data = st.data;
  const [col] = backlogColumns(b, st);
  const allSpaces = spaces();
  const cell = (w, text, color = t.muted) => div().w(w).flex_none().truncate().text_size(12).text_color(color).child(text);
  const head = v_flex()
    .id("backlog-head")
    .flex_none()
    .px(18)
    .pt(10)
    .pb(6)
    .gap(6)
    .child(div().text_size(12).text_color(t.muted).child(`${data.meta.level.name} · ${shownOf(col.shown.length, data.rows.length)}`))
    .child(h_flex().gap(12).text_size(11).text_color(t.dim)
      .child(div().w(WIDTH.key).flex_none().child("ID"))
      .child(div().w(WIDTH.type).flex_none().child("Typ"))
      .child(div().flex_1().min_w(0).child("Titel"))
      .child(div().w(WIDTH.state).flex_none().child("Status"))
      .child(div().w(WIDTH.sprint).flex_none().child("Sprint"))
      .child(div().w(WIDTH.assignee).flex_none().child("Zugewiesen")));
  if (!col.shown.length) {
    const what = data.rows.length ? "Nichts passt zum Filter oder zu „nur meine“" : "Der Backlog ist leer";
    return v_flex().flex_1().min_h(0).child(head).child(div().p(20).text_color(t.muted).child(what));
  }
  const row = (r) => {
    const selected = st.sel?.key === r.key;
    const session = linkedSession(r, allSpaces);
    return h_flex()
      .id(`row-${r.key}`)
      .flex_none()
      .gap(12)
      .px(18)
      .py(7)
      .items_center()
      .border_l(2)
      .border_color(selected ? t.accent : t.background)
      .when(selected, (el) => el.bg(t.selected))
      .opacity(st.pending[r.key] ? 0.7 : 1)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        // A click on a row (clickItem).
        if (!b.modal) b.clickItem(view, { col: 0, key: r.key }, cx);
      })
      .child(div().w(WIDTH.key).flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(r)))
      .child(cell(WIDTH.type, r.type ?? ""))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().min_w(0).truncate().child(r.title))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .child(div().w(WIDTH.state).flex_none().child(chip(t, r.state ?? "ohne Status", t.background, t[stateColor(data, r.state)] ?? t.muted)))
      .child(cell(WIDTH.sprint, r.sprint ?? "—"))
      .child(cell(WIDTH.assignee, r.assignees.join(", ")));
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(head)
    .child(v_flex().id("backlog-rows").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(backlogState(b).scroll).children(col.shown.map(row)));
}

// ==== src/actions/move.js ====

// Moving a card between a view's columns: at once, written by the view's
// loader (its move), as writeAtOnce writes; the selection the board sets
// when the shown columns change; and, after a refresh, where the cards of
// unclear moves ended up. The board and the sprint shape move their cards
// so.

// Moves a card to a column at once and writes it. A refusal moves it back
// with the error shown; a write whose outcome is unclear leaves it and
// refreshes. A card moved to a hidden column leaves the board; the notice
// says so, and the selection, where it was on that card, stays in its
// column.
export function moveCardTo(b, view, key, columnId, cx) {
  const st = b.state(view.id);
  const found = findCard(st.data, key);
  const to = st.data?.columns.find((c) => c.id === columnId);
  if (!found || !to) return b.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
  if (found.column.id === columnId) return;
  const label = itemLabel(found.card);
  const move = { key, from: found.column.id, to: columnId, at: Date.now(), confirmedAt: null };
  const hiddenNote = () => (st.hidden?.has(to.name) ? " (ausgeblendet)" : "");
  writeAtOnce(b, view, {
    key,
    label,
    refuse: canDrop(st.data, found.card, to) ? null : `${label} kann nicht nach „${to.name}“`,
    apply() {
      const before = b.navColumns(view);
      st.moves.push(move);
      st.data = moveCard(st.data, key, columnId);
      if (to.hidden && st.sel?.key === key) reselectIn(b, view, before);
    },
    write: () => b.loader(view).move(view, st.data, found.card, to),
    landed: () => (move.confirmedAt = Date.now()),
    failed: () => (st.moves = st.moves.filter((m) => m !== move)),
    undo: () => (st.data = rollback(st.data, move)),
    open: { kind: "move", to: { id: to.id, name: to.name } },
    texts: {
      pending: () => `${label} → ${to.name}${hiddenNote()} …`,
      landed: () => `${label} steht jetzt in „${to.name}“${hiddenNote()}`,
      unclear: `${label} → ${to.name}`,
      // With an earlier outcome of the card open, where it is now is for
      // the refresh to say.
      refused: (why, earlier) => (earlier ? `${label} → ${to.name} nicht gespeichert: ${why}` : `${label} bleibt in „${found.column.name}“: ${why}`),
    },
  }, cx);
}

// After the shown columns changed from `before`: the selection the board
// sets (selectionInColumns, reselect).
export function reselectIn(b, view, before) {
  b.reselect(view, selectionInColumns(before, b.navColumns(view), b.state(view.id).sel));
}

// Where the cards of settled unclear moves (`due`, of kind "move") are in
// the new data, one line each: the target column, the write landed (info);
// another column, a warning; not there while the target is hidden, not
// shown (info); not there while other columns are hidden, not shown, it may
// be in any of them (warning); else not on the board (warning).
export function unclearMoveLines(due, data) {
  return due.map((u) => {
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
}

// ==== src/ui/shapes/board.js ====

// The board shape: a view's data as columns of cards, which a card moves
// between (H/L, the status menu, a drag). A hidden column is not drawn: x
// hides one, the line above the columns names the hidden ones and a click
// on a name shows it again; X opens the column menu (modals/columns.js).
// The data: { shape: "board", meta, columns: [{ id, name, color, hidden,
// count, target, cards }], total, limited, viewer, limit }
// (parseGithubBoard). View fields it reads: id, source, layout, hide (the
// columns hidden by default) and, where the data does not name its own,
// limit.

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js): one
// scroll handle per column (SCROLLS, reused beyond).
const boardState = (b) => b.shapeState.board;

export const boardShape = {
  state: () => ({ scrolls: Array.from({ length: SCROLLS }, () => ScrollHandle.new()) }),
  nav: (b, st) => shownColumns(st.data, b.filterText, b.mine),
  selected: (b, st) => findCard(st.data, st.sel?.key)?.card ?? null,
  scrollTo: (b, view, sel, row) => boardState(b).scrolls[sel.col % SCROLLS].scroll_to_item(row),
  // All items, whatever the filter: the cards of the shown columns.
  items: (data) => data.columns.filter((c) => !c.hidden).flatMap((c) => c.cards),
  count(b, data) {
    const cols = shownColumns(data, b.filterText, b.mine);
    return { shown: cols.reduce((n, c) => n + c.shown.length, 0), total: cols.reduce((n, c) => n + c.cards.length, 0) };
  },
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge")),
  hints: [["h/l j/k", "bewegen"], ["H/L", "verschieben"], ["s", "Status"], ["x", "Spalte ausblenden"], ["X", "Spalten"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
  dirs: ["up", "down", "left", "right"],
  loads: true,
  keys(b, view, st, { k, ch, mod }, cx) {
    if (!st.data) return false;
    const upper = mod.shift && (k === "h" || k === "l" || k === "x") ? k.toUpperCase() : ch;
    if (upper === "H" || upper === "L") {
      const target = st.sel?.key && stepTarget(st.data, st.sel?.key, upper === "H" ? -1 : 1);
      if (target) b.moveTo(view, st.sel?.key, target.id, cx);
      return true;
    }
    if (k === "s") return b.openStatusMenu(view, cx), true;
    if (upper === "X") {
      b.modal = { kind: "columns", view, at: 0 };
      return true;
    }
    if (k === "x") {
      const col = b.navColumns(view)[st.sel?.col];
      if (col) b.toggleColumn(view, col, cx);
      return true;
    }
    return false;
  },
  received: (data, st) => applyMoves(data, st.moves),
  warnings: (view, data) => unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
  settle: (b, due, data, cx) => tellOutcomes(b, unclearMoveLines(due, data), cx),
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, cx),
  toggleColumn: (b, view, col, cx) => toggleBoardColumn(b, view, col, cx),
  openStatusMenu: (b, view) => openBoardStatusMenu(b, view),
  // The detail panel's rows of a card: its column as a pill, and Status s.
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    const column = st.data ? findCard(st.data, item.key)?.column : null;
    if (!column) return {};
    const openStatus = (cx) => {
      if (!b.modal) b.openStatusMenu(view, cx);
    };
    return {
      chips: [statusPill(t, column.name, column.color, openStatus)],
      buttons: [button(t, "act-status", "Status s", false, openStatus)],
    };
  },
};

function drawBoard(b, t, mono, view, st) {
  const cols = b.navColumns(view);
  const allSpaces = spaces();
  const dragged = b.drag ? findCard(st.data, b.drag.key)?.card : null;
  const columnEl = (col, ci) => {
    // Cards the filter or "nur meine" hides in this column.
    const filtered = col.cards.length - col.shown.length;
    const focusedCol = st.sel?.col === ci;
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    const head = columnHead(t, col, filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length));
    // The row's full height (the row lines its columns up at the top), in
    // which a long column scrolls its cards.
    return v_flex()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .h_full()
      .gap(8)
      .id(`col-${ci}`)
      .rounded(10)
      .border_1()
      .border_color(target ? t.accent : focusedCol && !st.sel?.key ? t.input : t.border)
      .bg(target ? t.selected : t.chrome)
      .p(10)
      .on_hover((hovered, cx) => {
        if (!b.drag) return;
        if (hovered) b.over = ci;
        else if (b.over === ci) b.over = null;
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => {
        if (!b.drag) return;
        cx.stop_propagation();
        const { key, from } = b.drag;
        b.endDrag(cx);
        b.moveTo(view, key, col.id, cx);
        if (from !== col.id) b.chooseDropped(view, key);
      })
      .child(head)
      .child(
        v_flex()
          .id(`cards-${ci}`)
          .flex_1()
          .min_h(0)
          .gap(6)
          .overflow_y_scrollbar()
          .track_scroll(boardState(b).scrolls[ci % SCROLLS])
          .children(col.shown.map((card) => drawCard(b, t, mono, view, st, card, ci, allSpaces)))
          .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
      );
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .when(st.data.columns.some((c) => c.hidden), (el) => el.child(hiddenLine(b, t, view, st)))
    .child(
      cols.length
        ? h_flex().id("columns").flex_1().min_h(0).gap(12).p(14).items_start().children(cols.map(columnEl))
        : div().p(20).text_color(t.muted).child("Alle Spalten sind ausgeblendet: ein Name oben oder X zeigt eine wieder"),
    )
    .when(Boolean(st.data.limited), (el) =>
      el.child(div().px(16).pb(8).text_size(12).text_color(t.ansi3)
        .child(`Nur die ersten ${st.data.limit ?? view.limit} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
    );
}

// The line above the columns that names the hidden ones; a click on a name
// shows that column again.
function hiddenLine(b, t, view, st) {
  const hidden = st.data.columns.filter((c) => c.hidden);
  return h_flex()
    .id("hidden-columns")
    .flex_none()
    .flex_wrap()
    .gap(6)
    .px(16)
    .pt(10)
    .items_center()
    .text_size(12)
    .child(div().text_color(t.muted).child("ausgeblendet:"))
    .children(
      hidden.map((col) =>
        div()
          .id(`show-${col.id}`)
          .px(8)
          .py(2)
          .rounded(9)
          .cursor_pointer()
          .bg(t.raised)
          .text_color(t.foreground)
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            if (!b.drag && !b.modal) b.toggleColumn(view, col, cx);
          })
          .child(col.name),
      ),
    );
}

function drawCard(b, t, mono, view, st, card, ci, allSpaces) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
  const session = linkedSession(card, allSpaces);
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
      if (b.modal) return;
      // The press selects nothing: it is no choice (clickItem) until it ends
      // as a click or a drop.
      b.drag = { key: card.key, from: card.column };
      b.over = ci;
      b.handle.focus();
      cx.notify();
    })
    .on_mouse_up("left", (_e, cx) => {
      // Released on the card it started on: a click (clickItem). Released on
      // another card: the column under it takes the drop. A release without
      // a press on the card is no click.
      if (b.modal || b.drag?.key !== card.key) return;
      cx.stop_propagation();
      b.endDrag(cx);
      b.clickItem(view, { col: ci, key: card.key }, cx);
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
        .when(Boolean(card.type), (el) => el.child(chip(t, card.type, t.foreground)))
        .children(card.labels.slice(0, 3).map((l) => chip(t, l)))
        .when(card.labels.length > 3, (el) => el.child(chip(t, `+${card.labels.length - 3}`)))
        .when(Boolean(card.sub), (el) => el.child(div().text_size(11).text_color(t.muted).child(`◔ ${card.sub?.done}/${card.sub?.total}`)))
        .when(card.assignees.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(card.assignees.join(", "))))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session))),
    );
}

// Hides a shown column or shows a hidden one; the selection follows
// (reselectIn).
function toggleBoardColumn(b, view, col, cx) {
  const st = b.state(view.id);
  if (!st.data) return;
  if (!col.target) return b.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
  const before = b.navColumns(view);
  st.stored = toggleHidden(view, st.stored, col);
  st.hidden = hiddenColumns(view, st.stored);
  store.set(`hidden:${view.id}`, st.stored);
  st.data = withHidden(st.data, st.hidden);
  reselectIn(b, view, before);
  // What a column holds comes from the query, which leaves hidden ones out.
  b.refresh(view, cx);
}

function openBoardStatusMenu(b, view) {
  const st = b.state(view.id);
  const card = b.selected(view);
  if (!card) return;
  const targets = targetsFor(st.data, card);
  const at = Math.max(0, targets.findIndex((c) => c.id === findCard(st.data, card.key)?.column.id));
  b.modal = { kind: "status", view, key: card.key, targets, at };
}

// ==== src/ui/shapes/placeholder.js ====

// The placeholder shape: what a view whose source reads nothing for it yet
// shows, the text of its kind (KINDS). It has no items, so Enter, o and the
// arrows are left to herdr. View fields it reads: source, layout.

export const placeholderShape = {
  nav: () => [],
  selected: () => null,
  scrollTo() {},
  count: () => null,
  render: (b, t, mono, view) => div().p(20).text_color(t.muted).child(kindOf(view)?.text ?? "Diese Ansicht gibt es noch nicht"),
  items: () => [],
  hints: [],
  dirs: [],
  loads: false,
  keys: () => false,
  received: (data) => data,
  warnings: () => [],
};

// ==== src/ui/shapes/prs.js ====

// The prs shape: a list of pull requests in sections, walked as one column.
// The data: { shape: "prs", sections: [{ name, count, fetched, limited,
// skipped, rows }], viewer } (parseGithubList); a row's author, draft mark
// and checks show where it has them. View fields it reads: id.

// The prs shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const prsState = (b) => b.shapeState.prs;

// The rows that show, as one column.
const prsRows = (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => s.rows.filter((r) => b.visible(r, st.data))) }];

export const prsShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
  nav: prsRows,
  selected: (b, st) => prsRows(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo: (b, view, sel) => scrollToRow(b, view, sel.key),
  // All items, whatever the filter: every section's rows.
  items: (data) => data.sections.flatMap((s) => s.rows),
  count(b, data) {
    const rows = data.sections.flatMap((s) => s.rows);
    return { shown: rows.filter((r) => b.visible(r, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawPrs(b, t, mono, view, st),
  hints: [["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"]],
  dirs: ["up", "down"],
  loads: true,
  keys: () => false,
  received: (data) => data,
  warnings: (_view, data) => data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`),
  // The detail panel's rows of a pull request: its checks, where it has them.
  detailParts: (b, t, view, item) =>
    item.checks ? { sections: [detailSection(t, "CHECKS", div().text_color(checkColor(t, item.checks.state)).child(item.checks.text))] } : {},
};

// A section's count: the rows it holds (each pull request once, in its first
// section; results that are no pull request left out), "<shown>/<held>"
// while the filter or "nur meine" hides some; a section GitHub cut adds how
// many it sent of how many it found.
export function sectionCount(section, shown) {
  const held = section.rows.length;
  const cut = section.limited ? ` · erste ${section.fetched} von ${section.count}` : "";
  return `${shownOf(shown, held)}${cut}`;
}

function drawPrs(b, t, mono, view, st) {
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
        // A click on a row (clickItem).
        if (!b.modal) b.clickItem(view, { col: 0, key: r.key }, cx);
      })
      .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(r)))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.author)))
      // Every row keeps the draft cell, so the columns after it line up.
      .child(div().w(60).flex_none().text_size(12).text_color(t.muted).child(r.draft ? "Entwurf" : ""))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  };
  const children = [];
  for (const s of st.data.sections) {
    const rows = s.rows.filter((r) => b.visible(r, st.data));
    children.push(div().flex_none().px(20).pt(12).pb(4).text_size(11).text_color(t.muted).child(`${s.name.toUpperCase()} · ${sectionCount(s, rows.length)}`));
    children.push(...rows.map(row));
  }
  return v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(prsState(b).scroll).children(children);
}

function scrollToRow(b, view, key) {
  const st = b.state(view.id);
  let child = 0;
  for (const s of st.data.sections) {
    child++; // the section's heading
    for (const r of s.rows.filter((row) => b.visible(row, st.data))) {
      if (r.key === key) return prsState(b).scroll.scroll_to_item(child);
      child++;
    }
  }
}

// ==== src/ui/shapes/sprint.js ====

// The sprint shape: a team's current sprint as a taskboard. One row per story
// (its id, title and own state at the left), its tasks as cards in the team's
// taskboard columns, each with its own state, assignee and id and the chip of
// its session where it has one; tasks whose story is not in the sprint stand in
// the row "Ohne Story". H/L move a task to the next column (through the
// taskboard's own column, not the state: two columns may map to one state), s
// changes a story's or a task's state from its type's states (the status menu),
// Enter shows the details; both write at once (actions/move.js,
// actions/write.js). Keys walk the stories, then each column (sprintNav). The
// data: { shape: "sprint", meta: { iterationId, iteration, finish, typeStates,
// states, unplaced, unknownColumns }, columns: [{ id, name, color, hidden,
// count, target, types, mappings, cards }], rows: [{ key, story }], viewer,
// noViewer, total, limited, limit } (sprintBoard, sources/azure/sprint.js). View
// fields it reads: id, source, layout (as writeAtOnce does).

// How wide the stories' column is.
const STORY_WIDTH = 260;

// The sprint shape's own state on a Board (state(), shapes/index.js): the
// rows' scroll handle.
const sprintState = (b) => b.shapeState.sprint;

const sprintColumns = (b, st) => sprintNav(st.data, b.filterText, b.mine);

// An item's state as shown: a task's as its column maps it (shownState).
const stateNow = (data, item) => shownState(item, isTask(item) ? findCard(data, item.key)?.column : null);

export const sprintShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
  nav: (b, st) => sprintColumns(b, st),
  selected: (b, st) => findSprintItem(st.data, st.sel?.key),
  // The row of the selected item, among the rows that show.
  scrollTo(b, view) {
    const st = b.state(view.id);
    const item = findSprintItem(st.data, st.sel?.key);
    const at = item ? shownRows(st.data, sprintColumns(b, st)).findIndex((r) => r.key === rowOf(item)) : -1;
    if (at >= 0) sprintState(b).scroll.scroll_to_item(at);
  },
  navigate: (b, view, st, dir) => sprintNavigate(sprintColumns(b, st), st.sel, dir, st.data.rows),
  items: (data) => sprintItems(data),
  count(b, data) {
    const items = sprintItems(data);
    return { shown: items.filter((i) => b.visible(i, data)).length, total: items.length };
  },
  render: (b, t, mono, view, st) => drawSprint(b, t, mono, view, st),
  hints: [["h/l j/k", "bewegen"], ["H/L", "Task verschieben"], ["s", "Status"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
  dirs: ["up", "down", "left", "right"],
  loads: true,
  keys(b, view, st, { k, ch, mod }, cx) {
    if (!st.data) return false;
    const upper = mod.shift && (k === "h" || k === "l") ? k.toUpperCase() : ch;
    if (upper === "H" || upper === "L") {
      const item = b.selected(view);
      if (item && !isTask(item)) b.say(`${itemLabel(item)} ist eine Story: H/L verschieben Tasks, s ändert ihren Status`, "info", cx);
      else if (item) {
        const target = stepTarget(st.data, item.key, upper === "H" ? -1 : 1);
        if (target) b.moveTo(view, item.key, target.id, cx);
      }
      return true;
    }
    if (k === "s") return b.openStatusMenu(view, cx), true;
    return false;
  },
  received: (data, st) => applyMoves(data, st.moves),
  // sprintWarnings.
  warnings: (view, data) => sprintWarnings(data),
  // The settled outcomes: a move's where its card stands, a state change's
  // which state its item has.
  settle: (b, due, data, cx) =>
    tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearStateLines(due.filter((u) => u.kind === "state"), data, SPRINT_STATES)], cx),
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, cx),
  openStatusMenu: (b, view, cx) => openStateMenu(b, view, SPRINT_STATES, cx),
  pickStatus: (b, view, key, target, cx) => setStateAtOnce(b, view, key, target.name, SPRINT_STATES, cx),
  // The detail panel's rows of a story or task: its state as a pill (a click
  // opens the status menu), a task's column, its area and iteration, and
  // Status s.
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    if (!st.data) return {};
    const column = isTask(item) ? findCard(st.data, item.key)?.column : null;
    const state = shownState(item, column);
    const rows = [
      ...(column ? [["Spalte", column.name]] : []),
      ...(item.area ? [["Bereich", item.area]] : []),
      ...(item.iteration ? [["Iteration", item.iteration]] : []),
    ];
    return workItemDetail(b, t, view, { state, color: stateColor(st.data, state), title: isTask(item) ? "TASK" : "STORY", rows });
  },
};

// "bis 27.11." for the sprint's last day (UTC, as Azure gives it), or "".
function sprintEnd(finish) {
  const at = new Date(finish ?? "");
  return Number.isNaN(at.getTime()) ? "" : ` · bis ${at.getUTCDate()}.${at.getUTCMonth() + 1}.`;
}

function drawSprint(b, t, mono, view, st) {
  const data = st.data;
  const nav = sprintColumns(b, st);
  const [, ...cols] = nav;
  const rows = shownRows(data, nav);
  const stories = sprintStories(data);
  const allSpaces = spaces();
  const head = h_flex()
    .id("sprint-head")
    .flex_none()
    .gap(10)
    .px(14)
    .pt(10)
    .pb(6)
    .items_center()
    .child(
      div().w(STORY_WIDTH).flex_none().text_size(12).text_color(t.muted)
        .child(`${data.meta.iteration}${sprintEnd(data.meta.finish)} · ${shownOf(nav[0].shown.length, stories.length)} Stories`),
    )
    .children(cols.map((col) => columnHead(t, col, shownOf(col.shown.length, col.cards.length)).flex_1().min_w(0)));
  if (!rows.length) {
    const what = sprintItems(data).length ? "Nichts passt zum Filter oder zu „nur meine“" : "Keine Work Items im Sprint";
    return v_flex().flex_1().min_h(0).child(head).child(div().p(20).text_color(t.muted).child(what));
  }
  const rowEl = (r) => h_flex()
    .id(`row-${r.key}`)
    .flex_none()
    .gap(10)
    .px(14)
    .py(8)
    .items_start()
    .border_b(1)
    .border_color(t.border)
    .child(storyCell(b, t, mono, view, st, r, nav))
    .children(cols.map((col, ci) => v_flex()
      .flex_1()
      .min_w(0)
      .gap(6)
      .children(col.shown.filter((card) => card.row === r.key).map((card) => drawTask(b, t, mono, view, st, card, ci + 1, col, allSpaces)))));
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(head)
    .child(v_flex().id("sprint-rows").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(sprintState(b).scroll).children(rows.map(rowEl)));
}

// A row's story at the left: its key and type, title and state; one the
// filter or "nur meine" hides (it shows for its tasks) is dimmed and takes
// no click. The row "Ohne Story" names itself.
function storyCell(b, t, mono, view, st, r, nav) {
  const cell = v_flex().w(STORY_WIDTH).flex_none().gap(4);
  if (!r.story) return cell.child(div().text_size(12.5).font_semibold().text_color(t.muted).child("Ohne Story"));
  const story = r.story;
  const shown = nav[0].shown.includes(story);
  const selected = st.sel?.key === story.key;
  return cell
    .id(`story-${story.key}`)
    .p(6)
    .rounded(8)
    .border_1()
    .border_color(selected ? t.accent : t.background)
    .when(selected, (el) => el.bg(t.selected))
    .opacity(shown ? (st.pending[story.key] ? 0.7 : 1) : 0.5)
    .when(shown, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: 0, key: story.key }, cx);
    }))
    .child(h_flex().gap(6).items_center()
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(story)))
      .when(Boolean(story.type), (el) => el.child(div().text_size(11).text_color(t.dim).child(story.type)))
      .when(Boolean(st.pending[story.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))))
    .child(div().text_size(12.5).line_height("17px").child(story.title))
    .child(stateChip(t, st.data, story.state));
}

const stateChip = (t, data, state) => chip(t, state ?? "ohne Status", t.background, t[stateColor(data, state)] ?? t.muted).flex_none();

// A task's card: its key, title, own state, assignee and session; a click
// selects it (clickItem).
function drawTask(b, t, mono, view, st, card, ci, col, allSpaces) {
  const selected = st.sel?.key === card.key;
  const session = linkedSession(card, allSpaces);
  return v_flex()
    .id(`card-${card.key}`)
    .flex_none()
    .p(8)
    .gap(5)
    .rounded(8)
    .border_1()
    .border_color(selected ? t.accent : t.border)
    .bg(selected ? t.selected : t.background)
    .opacity(st.pending[card.key] ? 0.7 : 1)
    .cursor_pointer()
    .on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: ci, key: card.key }, cx);
    })
    .child(h_flex().gap(6).items_center()
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(card)))
      .when(Boolean(st.pending[card.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))))
    .child(div().text_size(12.5).line_height("17px").child(card.title))
    .child(h_flex().gap(5).flex_wrap().items_center()
      .child(stateChip(t, st.data, shownState(card, col)))
      .when(card.assignees.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(card.assignees.join(", "))))
      .when(Boolean(session), (el) => el.child(sessionChip(t, session))));
}

// How the sprint finds, changes and shows its items' states (actions/state.js).
// A write that landed refreshes the view too: which column a task's new
// state puts it in is Azure's to say.
const SPRINT_STATES = {
  find: findSprintItem, withState: withItemState, stateOf: stateNow, where: "im Sprint", again: true,
};

// ==== src/ui/shapes/index.js ====

// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns that keyboard
// movement and selection walk, a list as one), selected (the selected
// item), scrollTo, items (every item the shape draws, whatever the filter:
// on a board, the cards of its shown columns; a shape without items, the
// placeholder, leaves Enter, o and the arrows to herdr), count ({ shown,
// total } items, or null), render, hints (the hint line's entries), dirs
// (the arrow directions that move), loads (false for the placeholder, which
// draws without data), keys (handles the shape's own keys; true when it
// took one), received (the data as kept after a refresh) and warnings; and
// where it has them, detailParts (its rows in the detail panel), settle
// (says how the unclear writes of its items ended up), moveTo,
// toggleColumn, openStatusMenu, navigate (its own keyboard movement in
// place of navigate's, select.js) and pickStatus (what a pick in the status
// menu does in place of a move to that column). A shape keeps its own
// state per Board in b.shapeState[name], which its state() makes once, when
// the Board starts: herdr refuses a ScrollHandle made while a view draws
// ("cannot run during render"). A new way to draw is a module here and its
// entry in SHAPES.

export const SHAPES = { board: boardShape, prs: prsShape, sprint: sprintShape, backlog: backlogShape, placeholder: placeholderShape };

// ==== src/main.js ====

const TICK_MS = 30000;
// How often a copy looks whether it shows (watchShown). herdr draws, and so
// renders, only a copy that shows, again on a change of its live data (spaces
// and tabs, the focus, shared state); a change of the layout alone is not
// documented to render it, while its timers run when it is hidden too. So no
// render sees the copy be hidden, and none may come when it comes to show:
// this timer sees both, and a render that comes first sees the show too.
export const WATCH_MS = 250;
// Why "nur meine" cannot tell one's own items, where the source has no words
// of its own for it (noViewer): it did not name the login it read as.
const NO_VIEWER = "die Quelle hat nicht gesagt, als wer sie gelesen wurde";

// Keys the board binds in its own key context. herdr binds Tab and
// shift-Tab app-wide (gpui-kit's ShellRoot), to moving the keyboard to the
// next or previous tab stop, and runs a matching binding's action before
// on_key_down, so a dialog's key handler never saw Tab, not even while its
// text field had the keyboard; of the matching bindings, the one in the
// deepest context wins, so a binding in the context of the board's root,
// around its dialogs and their fields, comes first. The leader mod binds
// the same way and says more (mods/leader/main.js, KEY_CONTEXT). Each
// action runs tabKey, the one place that says what Tab does on the board.
export const BOARD_KEY_CONTEXT = "Board";
export const BOARD_KEYS = [
  { keystroke: "tab", action: "board_tab", back: false },
  { keystroke: "shift-tab", action: "board_shift_tab", back: true },
];

export default class Board extends View {
  init(initProps, cx) {
    this.initProps = initProps;
    // Whether this copy showed when it last looked (at init, in a render or
    // on the WATCH_MS timer; null before the first look), the focus the
    // layer's board was shown with (watchShown, followFocus), and the last
    // failure each guarded step said (guarded).
    this.wasShown = null;
    this.seen = null;
    this.failed = {};
    this.handle = cx.focus_handle();
    this.config = null;
    this.configErrors = [];
    this.views = {}; // per view id, see state()
    // What the top bar shows, as last chosen: the source, its tab (a context
    // id) per source, the view per team context, and "nur meine".
    migrateShownView();
    this.sourceId = store.get("source");
    this.tabIds = Object.fromEntries(SOURCES.map((s) => [s.id, store.get(`tab:${s.id}`)]));
    this.teamViews = {};
    this.mine = store.get("mine") === true;
    this.filterText = "";
    this.filtering = false;
    this.modal = null; // a dialog: { kind, … }, its kind a key of MODALS
    this.notice = null; // { text, level }
    this.drag = null; // { key, from }
    this.over = null; // the column index under a drag
    this.paths = toolPaths(exec);
    this.sources = makeSources(this.paths);
    this.kinds = null; // view id → viewKind in the last valid views.json
    // What each shape keeps per Board, by shape name (state(),
    // shapes/index.js).
    this.shapeState = Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [name, shape.state?.() ?? {}]));
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
    if (checking()) return;
    // A copy that is not shown (a reload of a background tab, or the layer's
    // copy behind the tab's content) leaves the keyboard where it is.
    this.wasShown = boardShown(this.isLayer());
    if (this.wasShown) {
      this.takeKeyboard();
      cx.timer.after(300, () => this.guarded("Tastatur", () => this.takeKeyboard()));
    }
    // herdr hands "focus" (board.focus, pane.go) only to a copy that shows;
    // the check guards against one that arrives late, after a switch.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.guarded("Befehl", () => {
          if (command === "focus" && boardShown(this.isLayer())) this.takeKeyboard();
        });
        cx.notify();
      }
    });
    this.bindKeys(cx);
    cx.timer.every(TICK_MS, (cx) => this.guarded("Neuladen", () => this.tick(cx)));
    cx.timer.every(WATCH_MS, (cx) => this.guarded("Anzeige", () => this.watchShown(cx)));
    this.reload(cx);
  }

  // Binds BOARD_KEYS in BOARD_KEY_CONTEXT, once per copy, as the leader
  // does (mods/leader/main.js, bindKeys: each bind adds entries, and a load
  // of keys.json drops them all). A failure leaves the rest of the board
  // working and says why.
  bindKeys(cx) {
    const names = "Tab und shift-Tab";
    try {
      const count = cx.bind_keys(BOARD_KEYS.map(({ keystroke, action }) => ({ keystroke, action, context: BOARD_KEY_CONTEXT })));
      if (count !== BOARD_KEYS.length) {
        notify({ title: `Board: ${names} nicht alle gebunden`, body: `${count} von ${BOARD_KEYS.length} Bindungen angelegt`, level: "error" });
      }
    } catch (e) {
      notify({ title: `Board: ${names} nicht gebunden`, body: String(e?.message ?? e), level: "error" });
    }
  }

  // Tab and shift-Tab (`back`), whatever has the keyboard in the board: in
  // an open dialog with fields, its next or previous field (its tab,
  // MODALS). Anything else takes no Tab yet: the key goes on to herdr.
  tabKey(back, cx) {
    const tab = this.modal ? MODALS[this.modal.kind].tab : null;
    if (!tab) return;
    cx.stop_propagation();
    tab(this, back, cx);
  }

  // ---- data ----

  // A view's state: data and error, loading (again: one more refresh
  // after this one), at (last success) and tried (last start), warnings,
  // moves (laid over refreshes, see pendingMoves), pending (keys of items
  // being written), unclear (open outcomes: key, label, at and
  // writeAtOnce's w.open; see settleUnclear), stored/hidden (the person's
  // toggles and the hidden set), sel ({ col, key }, null before the first
  // data), picked (the key of the item the person chose, see clickItem),
  // runs (how many refreshes have started), want (an item to choose once a
  // refresh has it: chooseWanted) and detail.
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, warnings: [], moves: [], pending: {}, unclear: [],
      stored: readStoredHidden(store.get(`hidden:${id}`)), hidden: null, sel: null, picked: null, runs: 0, want: null, detail: false,
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
    return SHAPES[data?.shape ?? (this.loader(view) ? kindOf(view)?.shape : null) ?? "placeholder"];
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
      // A dialog of a view that is gone, or of another kind now, closes.
      const m = this.modal;
      if (m?.view && kinds.get(m.view.id) !== viewKind(m.view)) this.modal = null;
      const shown = this.view();
      if (!shown) return;
      this.sources[shown.source]?.forget?.(shown);
      this.refresh(shown, cx);
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
    const run = ++st.runs;
    cx.spawn(async (cx) => {
      try {
        const { data, warnings } = await loader.load(view, (v) => this.hiddenFor(v));
        st.moves = pendingMoves(st.moves, started);
        st.data = SHAPES[data.shape].received(data, st);
        st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
        st.error = null;
        st.at = Date.now();
        this.keepSelection(view);
        this.chooseWanted(view, run);
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

  // After the refresh `run` (its number, st.runs) succeeded: the item a
  // write asked to be chosen (st.want = { key, after: the refreshes started
  // when it asked }: a created work item), once by the first refresh that
  // started after it asked (an earlier one may have read before the item
  // was there); where that refresh's data does not show it (the filter,
  // "nur meine"), nothing is chosen.
  chooseWanted(view, run) {
    const st = this.state(view.id);
    const want = st.want;
    if (!want || run <= want.after) return;
    st.want = null;
    const col = columnOf(this.navColumns(view), want.key);
    if (col >= 0) this.choose(view, { col, key: want.key });
  }

  // After a refresh that succeeded: the writes whose outcome was open, came
  // before that refresh started (an older one may have read before the
  // write ended) and whose item has no write under way (that write decides
  // first) are settled; the shape of the new data tells how their writes
  // ended up (a shape without a settle tells nothing).
  settleUnclear(view, started, data, cx) {
    const st = this.state(view.id);
    const due = st.unclear.filter(isDue(st, started));
    if (!due.length) return;
    st.unclear = st.unclear.filter((u) => !due.includes(u));
    SHAPES[data?.shape]?.settle?.(this, due, data, cx);
  }

  // Every TICK_MS while the board shows: the shown view once refreshMinutes
  // have passed since it was last tried.
  tick(cx) {
    if (!this.config || !boardShown(this.isLayer())) return;
    const every = this.config.refreshMinutes * 60000;
    const due = (v) => Date.now() - this.state(v.id).tried >= every;
    const shown = this.view();
    if (shown && due(shown)) this.refresh(shown, cx);
    cx.notify();
  }

  // ---- moves ----

  // Moves a card to a column, where the view's shape has columns.
  moveTo(view, key, columnId, cx) {
    const move = this.shape(view).moveTo;
    if (!move) return this.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
    move(this, view, key, columnId, cx);
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
    this.reselect(view, selectionAfter(this.navColumns(view), this.state(view.id).sel));
  }

  // A selection the board sets by itself, which is no choice (clickItem).
  // Where it lands on another item, the choice lapses and open details
  // close, so that they never show an item unasked, and the item is scrolled
  // into view.
  reselect(view, sel) {
    const st = this.state(view.id);
    const other = sel.key !== st.sel?.key;
    st.sel = sel;
    if (!other) return;
    st.picked = null;
    st.detail = false;
    this.scrollToSelection(view);
  }

  // The item the person chose (what counts as a choice: clickItem): selected,
  // kept as chosen and scrolled into view; open details follow it.
  choose(view, sel) {
    const st = this.state(view.id);
    st.sel = sel;
    st.picked = sel.key;
    this.scrollToSelection(view);
  }

  scrollToSelection(view) {
    const sel = this.state(view.id).sel;
    const row = this.navColumns(view)[sel.col]?.shown.findIndex((c) => c.key === sel.key) ?? -1;
    if (row >= 0) this.shape(view).scrollTo(this, view, sel, row);
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
    this.showContext(cx);
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
    const toggle = this.shape(view).toggleColumn;
    if (!toggle) return this.say("Diese Ansicht hat keine Spalten", "info", cx);
    toggle(this, view, col, cx);
  }

  open(item, cx) {
    if (item?.url) cx.open_url(item.url);
    else this.say("Dazu gibt es keine Seite", "warning", cx);
  }

  // A click on an item. The item the person chose (st.picked) opens its
  // details, as the first Enter does; any other is chosen. Chosen is an item
  // clicked before, moved to with the keys, or dragged onto another column;
  // not one the board selected by itself (reselect), and not one only
  // pressed: a press may still turn into a drag, or end elsewhere.
  clickItem(view, sel, cx) {
    const st = this.state(view.id);
    if (st.picked === sel.key) st.detail = true;
    else this.choose(view, sel);
    this.handle.focus();
    cx.notify();
  }

  // A card dropped onto another column by a drag: chosen (clickItem), in the
  // column it is in now (its own, where the move was refused).
  chooseDropped(view, key) {
    const col = columnOf(this.navColumns(view), key);
    if (col >= 0) this.choose(view, { col, key });
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
    if (!session) return MODALS.start.open(this, view, item, cx);
    // The session may be the tab behind the board layer, which selecting
    // it does not show; leaving the layer first keeps its pane.focus from
    // undoing the selection. (A copy in a tab gets keys only while the
    // layer does not cover it, so there this does nothing.)
    layers.leaveLayer();
    try {
      run("space.select", { id: session.space });
      if (session.tab) run("tab.select", { id: session.tab });
    } catch (e) {
      const space = spaces().find((s) => s.id === session.space);
      const tab = space?.tabs.find((t) => t.id === session.tab);
      const named = `Space „${space?.name ?? session.space}“, Tab „${tab?.name ?? session.tab ?? "–"}“`;
      notify({ title: `Sitzung nicht gezeigt: ${named}`, body: errorText(e), level: "error" });
    }
  }

  // Whether this copy is the board layer's: its block's props say so.
  // props() gives the copy's own props; the ones init got stand in only
  // where it gives none.
  isLayer() {
    const given = props();
    return (given === undefined ? this.initProps : given)?.layer === true;
  }

  // Whether this copy is the layer's board and the layer shows it.
  shownAsLayer() {
    return this.isLayer() && boardShown(true);
  }

  // Gives the board's keyboard to where it belongs, the one rule for it:
  // the open dialog's text field when the dialog is on it (m.textField:
  // the start dialog's message, the create dialog's title), else the filter
  // while one is typed, else the board itself, which hands its keys to a
  // dialog without a text field (the status menu) or on another field.
  takeKeyboard() {
    const m = this.modal;
    if (m?.input && m.field === m.textField) m.input.focus();
    else if (this.filtering) this.filterInput.focus();
    else this.handle.focus();
  }

  // Whether the board has the keyboard: itself, its filter or its dialog's
  // text field (InputState tells no focus; their focus and blur do).
  boardHasKeyboard() {
    return this.handle.is_focused() || this.filtering || Boolean(this.modal?.inputFocused);
  }

  // Runs one step of a loop or a timer; a throw is logged and said in a
  // toast, not again while the same failure repeats (a step that works
  // clears it), so it ends no loop.
  guarded(what, step) {
    try {
      step();
      this.failed[what] = null;
    } catch (e) {
      console.log(e?.stack ?? String(e));
      const text = errorText(e);
      if (this.failed[what] === text) return;
      this.failed[what] = text;
      notify({ title: `Board: ${what} fehlgeschlagen`, body: text, level: "error" });
    }
  }

  // A press outside the layer's shown board shows the tab's content again
  // (README, "herdr app"). On the shown tab it is the only sign: herdr tells
  // a mod of no click on a tab. The board button's press arrives here too, and
  // the button switches on it by itself; so the switch waits until after
  // the press, when it also shows whether the press took the keyboard.
  pressOutside(cx) {
    if (!this.shownAsLayer()) return;
    cx.timer.after(0, () => this.guarded("Klick", () => layers.leaveLayer({ keyboard: this.boardHasKeyboard() })));
  }

  // At every look (a render or the WATCH_MS timer, see there): a copy that
  // was not shown and now shows takes the keyboard once, whoever showed it,
  // after the look and only where it still shows. While hidden, the layer's
  // board forgets the focus it compared with (followFocus), so it starts
  // anew when it shows.
  watchShown(cx) {
    const shown = boardShown(this.isLayer());
    const was = this.wasShown;
    this.wasShown = shown;
    if (!shown) this.seen = null;
    if (!shown || was !== false) return;
    cx.timer.after(0, () => this.guarded("Tastatur", () => {
      if (boardShown(this.isLayer())) this.takeKeyboard();
    }));
  }

  // At every render: while this copy shows as the layer's board, a focus on
  // another space, tab or pane than the one it was shown with shows the
  // tab's content again (README, "herdr app"). No focus at all is never the
  // one compared with; before a first focus, the first focus becomes it.
  // The switch waits until after the render and goes only where the layer
  // still shows the board.
  followFocus(cx) {
    if (!this.shownAsLayer()) return;
    const f = focused();
    if (!f) return;
    const now = JSON.stringify([f.space, f.tab, f.pane]);
    if (this.seen === null) this.seen = now;
    else if (now !== this.seen) {
      this.seen = now;
      cx.timer.after(0, () => this.guarded("Fokus", () => layers.leaveLayer()));
    }
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
    // [ ] and / may come with Shift, or with Control+Alt; Control alone
    // stays herdr's. Alt alone is let through: a key herdr binds with Alt
    // never reaches a mod (logged), so this costs herdr nothing; how AltGr
    // arrives on a German layout is untested.
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
      } else layers.leaveLayer();
      return done();
    }
    if (!view) return;
    const shape = this.shape(view);
    const dir = mod.shift ? null : { j: "down", down: "down", k: "up", up: "up", h: "left", left: "left", l: "right", right: "right" }[k];
    if (dir && st.data) {
      if (shape.dirs.includes(dir)) this.choose(view, shape.navigate ? shape.navigate(this, view, st, dir) : navigate(this.navColumns(view), st.sel, dir));
      return done();
    }
    if (shape.keys(this, view, st, { k, ch, mod }, cx)) return done();
    // With nothing selected (loading, failed, empty, a placeholder) Enter
    // and o stay herdr's.
    const item = this.selected(view);
    if (k === "enter" && item) return this.enter(view, cx), done();
    if (k === "o" && item) return this.open(item, cx), done();
  }

  openStatusMenu(view, cx) {
    const open = this.shape(view).openStatusMenu;
    if (!open) return this.say("Hier gibt es keinen Status zu ändern", "info", cx);
    open(this, view, cx);
    cx.notify();
  }

  // Esc closes a dialog that is not busy; every other key is the dialog's.
  modalKey(e, cx) {
    if (e.key === "escape") {
      cx.stop_propagation();
      return this.closeModal(cx);
    }
    MODALS[this.modal.kind].key(this, e, cx);
  }

  // ---- drawing ----

  // When herdr renders a copy, and why the WATCH_MS timer looks too: see
  // WATCH_MS.
  render(cx) {
    this.watchShown(cx);
    this.followFocus(cx);
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const view = this.view();
    const st = view ? this.state(view.id) : null;
    const item = st?.detail && view ? this.selected(view) : null;
    let out = v_flex()
      .id("board")
      .track_focus(this.handle)
      .key_context(BOARD_KEY_CONTEXT);
    for (const k of BOARD_KEYS) out = out.on_action(k.action, (_e, cx) => this.tabKey(k.back, cx));
    out = out
      .size_full()
      .relative()
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down_out((_e, cx) => this.pressOutside(cx))
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
    if (this.modal) out = out.child(MODALS[this.modal.kind].render(this, t));
    return out;
  }

  endDrag(cx) {
    if (!this.drag) return;
    this.drag = null;
    this.over = null;
    cx.notify();
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
        .when(hasViewSwitch(context), (el) => {
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
      .child(button(t, "refresh", "↻", false, (cx) => this.reload(cx)));
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
  // many items it holds ("…" while it loads; shownOf while the filter or
  // "nur meine" hides some).
  tabs(t, context) {
    const count = (c) => {
      const st = this.state(this.viewFor(c).id);
      if (st.loading) return "…";
      const n = st.data ? SHAPES[st.data.shape].count(this, st.data) : null;
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
    if (shape.loads === false) return box.child(shape.render(this, t, mono, view, st));
    if (!st.data && !st.error) return message(st.loading ? "Lädt …" : "Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(div().px(16).pt(14).text_color(t.ansi1).child(st.error));
    const warnings = [...st.warnings, ...this.noViewerWarning(view, st, shape)];
    if (warnings.length) shown = shown.children(warnings.map((w) => div().px(16).pt(6).text_size(12).text_color(t.ansi3).child(w)));
    if (!st.data) return shown;
    return shown.child(shape.render(this, t, mono, view, st));
  }

  // With "nur meine" on and no login the data was read as: what the text
  // filter leaves but "nur meine" hides only for want of that login (not
  // from a search of one's own) is said, with what still shows, and why:
  // the data's own words (noViewer) where it has them, else its source's.
  noViewerWarning(view, st, shape) {
    if (!this.mine || !st.data || st.data.viewer) return [];
    const left = shape.items(st.data).filter((i) => matches(i, this.filterText));
    if (!left.some((i) => !i.ownByQuery)) return [];
    const what = left.some((i) => i.ownByQuery) ? "nur Treffer eigener Suchen" : "nichts";
    return [`„nur meine“ zeigt ${what}: ${st.data.noViewer ?? this.sources[view.source].noViewer ?? NO_VIEWER}`];
  }

  detail(t, mono, view, item) {
    const st = this.state(view.id);
    const session = linkedSession(item, spaces());
    // The shape's own rows: chips beside the author, sections, buttons.
    const parts = this.shape(view).detailParts?.(this, t, view, item) ?? {};
    const settings = startSettings(this.config, view, item.repo);
    const firstMessage = renderTemplate(item.kind === "pr" ? settings.review : settings.message, templateVars(item));
    const startLabel = session ? "Zur Sitzung ↵" : item.kind === "pr" ? "Review starten ↵" : "Agent starten ↵";
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
              .children(parts.chips ?? [])
              .when(Boolean(item.author), (el) => el.child(div().text_size(12).text_color(t.muted).child([`von ${item.author}`, item.review].filter(Boolean).join(" · "))))
              .when(Boolean(item.parent), (el) => el.child(div().text_size(12).text_color(t.muted).child(`Teil von ${parentLabel(item)}`)))
              .when(Boolean(item.sub), (el) => el.child(div().text_size(12).text_color(t.muted).child(`◔ ${item.sub?.done}/${item.sub?.total} erledigt`))),
          )
          .when((item.labels ?? []).length > 0 || Boolean(item.type), (el) =>
            el.child(div().text_size(12).text_color(t.muted).child([item.type, ...(item.labels ?? [])].filter(Boolean).join(" · "))),
          )
          .when((item.assignees ?? []).length > 0, (el) => el.child(div().text_size(12).text_color(t.dim).child(`zugewiesen: ${item.assignees.join(", ")}`))),
      )
      .children(parts.sections ?? [])
      .child(
        detailSection(
          t,
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
          .child(button(t, "act-start", startLabel, true, (cx) => {
            if (this.modal) return;
            st.detail = true;
            this.enter(view, cx);
          }))
          .children(parts.buttons ?? [])
          .child(button(t, "act-open", `${this.sources[item.source].site} o`, false, (cx) => {
            if (!this.modal) this.open(item, cx);
          })),
      );
  }

  // The keys of what shows: the top bar's (a team's v), then those of the
  // shown view's shape.
  hints(t, view) {
    const context = this.context();
    const bar = [...(sourcesOf(this.config).length > 1 ? [["q", "Quelle"]] : []), ["1 2 3 [ ]", "Tab"]];
    const switches = hasViewSwitch(context) ? [["v", viewSwitchHint(context)]] : [];
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

}
