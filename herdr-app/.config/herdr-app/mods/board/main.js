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
//     names], limit? (a board: the most items it reads, 1000; a list: per
//     search, 50, at most 100), start? }] }, and by kind (VIEW_KINDS): a
//     board has project { owner, number, field? ("Status"), priorityField?
//     ("Priority") } and filter? (a Projects filter such as "assignee:@me");
//     its columns are the options of that single-select field, a card's
//     priority its option of the single-select field priorityField names
//     (none where the project has no such field; one views.json names that
//     the project lacks is a warning). A list has sections [{ name, query,
//     tone? }], one GitHub search for pull requests each; tone is one of
//     SECTION_TONES (shared.js), and without one a section takes the next
//     of SECTION_TONE_ORDER by its place that no other section sets. A view
//     may still say source: "github".
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
// Calls: a GitHub board view costs one gh call per refresh for each page of
// up to 100 items it reads (GitHub's most), at most as many as full pages of
// its limit take: ten for the 1000 by default (each item's priority,
// milestone and parent, with its title and repo, and the first page's look
// at the priority field add no connection and so no points; see below); a
// list view one, and one more per THREAD_IDS (100) pull requests in it with
// more than FIRST_THREADS (10) review threads. GitHub prices a request by
// its connections, each counted as full: the list's per section one search,
// then per pull request of its limit (50 by default) its assignees, review
// requests, last commit (and that one's checks), latest reviews
// (LATEST_REVIEWS, 20) and review threads, and per thread (FIRST_THREADS)
// its comments, so with the defaults 1 + 50 * 6 + 50 * 10 = 801 requests a
// section, about 8 points (a hundred requests each) of GitHub's 5000 an
// hour, 24 for the shipped three sections; the follow-up (githubThreadsArgs)
// 51 per such pull request (REVIEW_THREADS threads and their comments),
// about one point for two. An issue's related items (its description,
// parent, sub-issues and linked pull requests) cost one more when its
// details open, again on `r` while they are open, and again after a refresh
// where their last read failed (readRelated; what a refresh keeps of them
// keptRelated says); an item the details panel went down to (Enter on a
// line, related.js) costs the same when it shows, a pull request one gh or
// az call for its details (az repos pr show), and on `r` each level's again,
// so that a level whose item is no longer among the lines of the one above
// can go. An Azure work item's related items (its description, parent,
// children and linked pull requests) cost the same, one az call (az boards
// work-item show --expand relations), and one WIQL query more for its
// children's and its parent's titles and states where it has either
// (sources/azure/related.js). An Azure team's Sprint two az calls (the
// taskboard's column of each work item, and one WIQL query for their fields;
// for a sprint the sprint picker chose, by its id and path; none while the
// team has no sprint running and none is chosen) and one WIQL query more
// where its items have parents outside the sprint that it does not keep yet
// (parentTitles), its Backlog two, one after the other (the level's work
// items in their list by az rest, then one WIQL query for their fields; one
// for an empty backlog), and one more for the project's work item types
// (their colors) while neither view keeps them; either one more while who az
// is stays unknown. What the Sprint and the Backlog read once and keep, and
// for how long, makeAzure says. An assignment costs one gh or az call, and
// the assignee picker one more per repo or team the first time it opens there
// (GitHub's assignable users with who gh is; the team's members, and who az
// is while that is unknown). The sprint picker costs one az call (the team's
// iterations) the first time it opens for a team, one more for the team's
// current sprint where the Sprint keeps none, and a refresh of a sprint it
// chose one where `r` dropped them. A state change costs one az call, a
// Backlog's create one and a child's parent link one more; a create reads the
// Backlog again, and one whose answer was unclear asks one WIQL query more
// after that refresh; a create for a team whose default iteration follows the
// current one reads the team's settings first, one call more. The PR tabs
// read nothing yet. Finding gh and az costs one sh call now and then
// (toolPaths says when). A view refreshes when its tab first shows (unless it
// has data the prefetch tried within refreshMinutes), on `r` (which first
// drops what its source keeps of it: its source's forget), after a column is
// hidden or shown (the command menu's "Spalte ausblenden", a name in the
// hidden line, the column menu), when it is shown again tried longer than
// refreshMinutes ago (not while a read of it runs: that one shows), and every
// refreshMinutes while it shows. Besides, after each read of views.json (the
// start, `r`), while the board shows, the prefetch reads each other view with
// a loader once, as its tab would (prefetchOrder: one at a time, none tried
// within refreshMinutes, none whose own last read since it found its source
// unavailable), so a start or an `r` costs each other view's refresh at most
// once; it waits while any read runs, a write is under way or a dialog is
// busy. After that a view not shown reads nothing. The Azure calls of a load
// that need nothing of each other run side by side: the Sprint's settings
// (iteration, areas, columns, types) and who az is; its taskboard once the
// iteration came, its query once the areas came too; the Backlog's settings
// (levels, configuration, team settings, areas), the types' colors and who az
// is; its ids once the levels came, the query for their fields once the
// configuration came too. What a view drew last, as read, is saved
// (loading.js) and drawn after a restart with its age until its read replaces
// it.
//
// The modules in src/, built into main.js by build.mjs (its header says how
// and why): shared.js, config.js (views.json), contexts.js (the top bar's
// sources, contexts and their views), kinds/index.js (view kinds),
// kinds/board.js (a board's columns and cards), kinds/sprint.js (a sprint's
// taskboard), kinds/backlog.js (a team's backlog), kinds/states.js (a
// state's color), select.js (filter, "nur meine", selection, the filter of
// the command menu and the sprint picker), commands.js (the action table,
// which the keys of its actions, the hint line and the command menu read),
// related.js (the items related to an item, read when its details open: what
// is kept, their lines), description.js (a description as drawn, without
// anything it could load), scroll.js (how the details scroll; the sums a
// board column shares), sources/ (GitHub; Azure in sources/azure/:
// common.js, sprint.js, backlog.js, related.js, index.js), tools.js
// (running gh and az, a log line each), loading.js (the saved state, what a
// load draws before its end, the prefetch's order, the top bar's words for a
// read), actions/ (starting a session, writing a change at once, moving a
// card, changing a state, creating a work item, assigning an item),
// ui/helpers.js, ui/tones.js (the tones of labels and types, the selected
// background, the tints), ui/layer.js (the board layer), ui/related.js (the
// related items as drawn), ui/band.js (which cards of a board column draw
// whole), ui/shapes/ (how a view's data is drawn and worked: board, prs,
// sprint, backlog, placeholder), ui/modals/ (the dialogs: start, status,
// columns, create, assign, commands, sprints) and this one, the Board, which
// looks the shape up.
// Their data logic is plain exported functions, tested with a few UI paths
// by tests/herdr-app/board.test.mjs with node.

import { View, div, svg } from "gpui-kit";
import { Input, InputState, ScrollHandle, TextView, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, focused, home, knownAgents, layout, machines, nextCommand, notify, panes, props, readTextFile, run, settings, spaces, theme, writeTextFile } from "herdr";

// ==== src/shared.js ====

// What the board's modules share: its names, its error and how one is
// shown, its lines for herdr's log, small checks and text helpers, an
// item's key and type, and labels for times.

export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension.
  // unclear: a write may or may not have landed.
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
// How many items GitHub sends in one page of a connection at most (its
// `first`).
export const PAGE = 100;

export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];
export const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1);

// The message to show for an error: a BoardError's own, else marked as
// unexpected.
export const errorText = (e) => (e instanceof BoardError ? e.message : `Unerwarteter Fehler: ${firstLine(e?.message ?? e)}`);

// herdr's log gets console.log.
export const boardLog = { write: (line) => console.log(line) };

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) boardLog.write(e?.stack ?? String(e));
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

// An item's label on a card or a list's row: an Azure work item's number
// alone (the views that show it hold only work items, so the AB# says
// nothing there), else itemLabel. Its details, notices and toasts keep
// itemLabel.
export const cardLabel = (item) => (item.source === "azure" && item.kind === "workitem" ? String(item.number) : itemLabel(item));

// A person as the board names one, in every source alike: by name where
// there is one, else by login; null for neither. Logins are kept apart
// (assigneeLogins: select.js isMine).
export const personName = ({ name, login }) => name || login || null;

// What names an issue, pull request or work item wherever it shows (on
// the board, as a line of the details, as a level the details panel went
// down to): its source, kind, repo (none on Azure) and number. Its
// identity, for comparing (sameItem) and for keying a level; unlike
// itemKey, a label to show ("tender#3004", null for a draft), and unlike
// an item's `key`, the board's own for a card or row (a Projects item's id
// on GitHub).
export const lineKey = (item) => `${item.source}:${item.kind}:${item.repo ?? ""}#${item.number}`;

// Whether `a` and `b` are the same issue, pull request or work item.
export const sameItem = (a, b) => lineKey(a) === lineKey(b);

// How an issue's or pull request's state shows on a line and a level of
// the details (GitHub's states and Azure's pull request statuses map onto
// them): its label, its chip's theme color, and whether it is done
// (dimmed); otherLook for a state none is known for.
export const STATE_LOOKS = {
  open: { state: "offen", color: "ansi2", done: false },
  closed: { state: "geschlossen", color: "muted", done: true },
  merged: { state: "gemerged", color: "ansi5", done: true },
};
export const otherLook = (state) => ({ state: String(state ?? "?").toLowerCase(), color: "muted", done: false });

// A draft pull request's review, on either source: a draft asks for none
// yet.
export const DRAFT_REVIEW = "Entwurf";

// copper's hues by its names, each as the theme name the board draws it in
// (ui/tones.js takes those to copper's colors and says who takes orange's
// ansi11).
export const COPPER_HUES = { red: "ansi1", green: "ansi2", yellow: "ansi3", blue: "ansi4", violet: "ansi5", teal: "ansi6", orange: "ansi11" };

// The tones a PR list's section may take (views.json, a section's "tone"):
// copper's hues but orange, the mark's (ui/tones.js, markColor); and the
// order in which sections without one take them, by their place, past the
// ones other sections set (config.js).
export const SECTION_TONES = Object.fromEntries(Object.entries(COPPER_HUES).filter(([name]) => name !== "orange"));
export const SECTION_TONE_ORDER = ["blue", "violet", "teal", "green", "yellow", "red"];

// The label of an item's parent, an issue or work item of the same source
// and repo: "tender#3002", "AB#7".
export const parentLabel = (item) => itemLabel({ ...item, kind: "issue", number: item.parent });

export const relativeLabel = (root, item) => (item.source === "github" && item.repo === root.repo ? `#${item.number}` : cardLabel(item));

export function partOfText(item) {
  if (!Number.isInteger(item.parent)) return null;
  const repo = item.parentRepo ?? item.repo;
  const parent = { source: item.source, kind: item.source === "azure" ? "workitem" : "issue", number: item.parent, repo, repoShort: repo?.split("/").pop() };
  return ["Teil von", relativeLabel(item, parent), item.parentTitle].filter(Boolean).join(" ");
}

// An item that is an Epic by its title alone: "[Epic] …", the convention of
// a project without issue types.
const EPIC_TITLE = /^\[epic\]/i;

// An item's type as the board names it: its own (an issue type, a work item
// type), else "Epic" for an Epic by its title; null for none.
export const cardType = (item) => item.type ?? (EPIC_TITLE.test(item.title ?? "") ? "Epic" : null);

// The label whose color an Epic by its title alone takes for its type's
// marker: its "epic" label, whatever its case; null for another item.
export const epicLabel = (item) =>
  (!item.type && cardType(item) ? (item.labels ?? []).find((l) => l.toLowerCase() === "epic") ?? null : null);

// Reads kept by key as their promises: get(key, read) gives the one kept
// for `key`, else starts read() and keeps that; a read that fails is
// dropped (where no newer one has taken its place), so the next get reads
// again. forget(key, promise) drops `promise` where it is still the one
// kept; drop(key) whatever is kept for `key`; clear() drops all.
export function readMemo() {
  const kept = new Map();
  const forget = (key, promise) => kept.get(key) === promise && kept.delete(key);
  return {
    get(key, read) {
      if (!kept.has(key)) {
        const promise = read();
        kept.set(key, promise);
        promise.catch(() => forget(key, promise));
      }
      return kept.get(key);
    },
    forget,
    drop: (key) => kept.delete(key),
    clear: () => kept.clear(),
  };
}

// A day in ms, and the end of an iteration's last day from Azure's
// finishDate (that day's start, in UTC; NaN for none), and whether that
// day is over by `now`: what keeps a sprint (iterationUntil) and what the
// sprint picker counts as ended (startRow) go by it.
export const DAY_MS = 86400000;
export const lastDayEnd = (finish) => Date.parse(finish ?? "") + DAY_MS;
export const lastDayOver = (finish, now) => lastDayEnd(finish) <= now;

// A day label for a past moment, by local calendar days.
export function ageLabel(iso, now) {
  const then = new Date(iso), today = new Date(now);
  if (Number.isNaN(then.getTime())) return "";
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(today) - day(then)) / DAY_MS);
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

// The most items a board reads, and its default limit: ten of GitHub's
// pages (PAGE).
const BOARD_LIMIT = 10 * PAGE;

// A list section's keys, and the tones it may take, as an error names them.
const SECTION_KEYS = ["name", "query", "tone"];
const TONE_NAMES = Object.keys(SECTION_TONES).map((n) => `"${n}"`).join(", ").replace(/, ([^,]+)$/, " oder $1");

// A list's sections, each with its tone: its own, else the next of
// SECTION_TONE_ORDER by its place among those without one, past the tones
// the others set while any is left.
function sectionsWithTones(sections) {
  const set = new Set(sections.map((s) => s.tone).filter(Boolean));
  const left = SECTION_TONE_ORDER.filter((tone) => !set.has(tone));
  const order = left.length ? left : SECTION_TONE_ORDER;
  let next = 0;
  return sections.map((s) => ({ name: s.name, query: s.query, tone: s.tone ?? order[next++ % order.length] }));
}

// Per GitHub view kind ("github <layout>", viewKind; its entry in KINDS,
// kinds/index.js, says how it shows): its own keys, what is wrong with them,
// its fields with their defaults filled in, and the largest `limit` it takes:
// a board's is the most items it reads, in pages of up to PAGE, one gh call
// each, at most as many calls as full pages would take; a list's is each
// search's `first`, one page.
const VIEW_KINDS = {
  "github board": {
    keys: ["project", "filter"],
    maxLimit: BOARD_LIMIT,
    problems(v) {
      const p = v.project;
      const out = [];
      if (!isObject(p) || !isText(p.owner) || !Number.isInteger(p.number) || p.number < 1) {
        out.push("„project“ braucht „owner“ (Text) und „number“ (ganze Zahl)");
      } else {
        out.push(...["field", "priorityField"].filter((k) => p[k] !== undefined && !isText(p[k])).map((k) => `„project.${k}“ muss Text sein`));
      }
      return [...out, ...textProblems(v, ["filter"])];
    },
    defaults: (v) => ({
      project: {
        owner: v.project.owner, number: v.project.number, field: v.project.field ?? "Status", priorityField: v.project.priorityField ?? "Priority",
        // A project may lack the default one: only a named one it lacks is told.
        priorityGiven: v.project.priorityField !== undefined,
      },
      filter: v.filter ?? "",
      limit: v.limit ?? BOARD_LIMIT,
    }),
  },
  "github list": {
    keys: ["sections"],
    maxLimit: PAGE,
    problems(v) {
      if (!(Array.isArray(v.sections) && v.sections.length && v.sections.every((s) => isObject(s) && isText(s.name) && isText(s.query)))) {
        return ["„sections“ braucht Einträge mit „name“ und „query“"];
      }
      return v.sections.flatMap((s) => [
        ...Object.keys(s).filter((k) => !SECTION_KEYS.includes(k)).map((k) => `Abschnitt „${s.name}“: „${k}“ gibt es nicht`),
        ...(s.tone === undefined || Object.hasOwn(SECTION_TONES, s.tone) ? [] : [`Abschnitt „${s.name}“: „tone“ ist ${TONE_NAMES}`]),
      ]);
    },
    defaults: (v) => ({ sections: sectionsWithTones(v.sections), limit: v.limit ?? 50 }),
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
  if (v.limit !== undefined && !(Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= kind.maxLimit)) out.push(`„limit“ ist eine ganze Zahl von 1 bis ${kind.maxLimit}`);
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

// Whether `texts` (falsy ones left out) hold every word of `filter`
// between them, case-insensitive.
export function wordsMatch(texts, filter) {
  const words = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// The filter of the command menu and the sprint picker (rankByName): {
// entry, at } for each entry of `list` whose text (`textOf`) holds the
// letters of `query` in its order, `at` where they stand in it
// (fuzzyMatch), best first. A tie keeps the shorter text first, then the
// list's order. An empty query keeps the list as it is, with no letters.
export function fuzzyRank(list, query, textOf) {
  if (!String(query ?? "").trim()) return list.map((entry) => ({ entry, at: [] }));
  const scored = list.map((entry, n) => ({ entry, n, text: textOf(entry), match: fuzzyMatch(textOf(entry), query) }));
  return scored
    .filter((s) => s.match)
    .sort((x, y) => y.match.score - x.match.score || x.text.length - y.text.length || x.n - y.n)
    .map((s) => ({ entry: s.entry, at: s.match.at }));
}

// The entries of `list` the filter `query` leaves by their names, best
// first (fuzzyRank), each with `at`, where its letters stand in the name:
// the command menu's actions, the sprint picker's sprints.
export const rankByName = (list, query) => fuzzyRank(list, query, (e) => e.name).map(({ entry, at }) => ({ ...entry, at }));

// How the letters of `query` fit `text`, case-insensitive and spaces left
// out ("nlv" fits "nach links verschieben"): { score, at (the index in the
// text of each letter, as the best fit places them) }, or null where they
// do not fit in their order; an empty query fits with no letters. A letter
// scores 1, 8 more where it starts a word (the text's start or after a
// character that is no letter or digit), 4 more where it follows the
// letter before it, and the text's first letter 2 more; of all the ways
// the letters fit, the best counts.
export function fuzzyMatch(text, query) {
  const q = Array.from(String(query ?? "").toLowerCase().replace(/\s+/g, ""));
  const t = Array.from(String(text).toLowerCase());
  if (!q.length) return { score: 0, at: [] };
  const startsWord = (j) => j === 0 || !/[\p{L}\p{N}]/u.test(t[j - 1]);
  const own = (j) => 1 + (startsWord(j) ? 8 : 0) + (j === 0 ? 2 : 0);
  // Per letter, per place in the text: the best score with that letter
  // there, and where the letter before it stands (`from`).
  let best = t.map((c, j) => (c === q[0] ? { score: own(j), from: null } : null));
  const steps = [best];
  for (const letter of q.slice(1)) {
    const next = t.map(() => null);
    let apart = null; // the best of best[0..j-2], by its place
    for (let j = 1; j < t.length; j++) {
      if (j >= 2 && best[j - 2] && (apart === null || best[j - 2].score > best[apart].score)) apart = j - 2;
      if (t[j] !== letter) continue;
      const after = best[j - 1] ? best[j - 1].score + own(j) + 4 : null;
      const away = apart === null ? null : best[apart].score + own(j);
      if (after === null && away === null) continue;
      next[j] = after !== null && (away === null || after >= away) ? { score: after, from: j - 1 } : { score: away, from: apart };
    }
    best = next;
    steps.push(best);
  }
  let end = -1;
  best.forEach((b, j) => {
    if (b && (end < 0 || b.score > best[end].score)) end = j;
  });
  if (end < 0) return null;
  const at = [];
  for (let i = steps.length - 1, j = end; i >= 0; j = steps[i][j].from, i--) at.unshift(j);
  return { score: best[end].score, at };
}

// Cards whose text holds every word of the filter (wordsMatch); their
// assignees count by name and by login.
export function matches(card, text) {
  if (!String(text ?? "").trim()) return true;
  return wordsMatch([card.title, card.number !== null ? `#${card.number}` : "", itemKey(card), card.repo, card.type, card.author, card.branch,
    ...(card.labels ?? []), ...(card.assignees ?? []), ...(card.assigneeLogins ?? [])], text);
}

// Whether an item is one's own, for "nur meine": it came from a search of
// one's own (ownByQuery), or `me` (the login the data was read as; null
// when the source did not say) is the login of one of its assignees
// (assigneeLogins; `assignees` are their names), its author, or a reviewer
// asked for.
export const isMine = (item, me) =>
  item.ownByQuery === true ||
  (Boolean(me) && ((item.assigneeLogins ?? []).includes(me) || item.author === me || (item.reviewers ?? []).includes(me)));

// Whether an item shows in data read as `viewer`: it matches the filter and,
// with `mine` on, it is one's own.
export const shows = (item, filter, mine, viewer) => matches(item, filter) && (!mine || isMine(item, viewer));

export const showsAll = (filter, mine) => !mine && !String(filter ?? "").trim();

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

// gg/G (Home/End): the first (`end` "top") or last ("bottom") card of the
// selected column; null where that column shows none.
export function edgeOf(columns, sel, end) {
  const cards = columns[sel?.col]?.shown ?? [];
  if (!cards.length) return null;
  return { col: sel.col, key: (end === "top" ? cards[0] : cards.at(-1)).key };
}

// The index of the column whose shown cards hold `key`; -1 for none.
export const columnOf = (columns, key) => columns.findIndex((c) => c.shown.some((card) => card.key === key));

// Where `item` (any item that names its source, kind, repo and number, such
// as a related item's line) stands among the shown cards of `columns`, as
// a selection { col, key }; null where none of them is that item.
export function placeOf(columns, item) {
  for (const [col, c] of columns.entries()) {
    const card = c.shown.find((i) => sameItem(i, item));
    if (card) return { col, key: card.key };
  }
  return null;
}

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

// Whether a column can be hidden: one with a target (an option of the
// view's field); the column without status is always shown.
export const hideable = (column) => Boolean(column?.target);

// The stored toggles after hiding or showing a column: only what differs from
// the view's defaults, so a later edit to hide takes effect. A column that
// cannot be hidden (hideable): unchanged.
export function toggleHidden(view, stored, column) {
  if (!hideable(column)) return stored;
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

// The data with the card `key`'s fields set to those of `patch`.
export const withCard = (board, key, patch) => ({
  ...board, columns: board.columns.map((c) => ({ ...c, cards: c.cards.map((card) => (card.key === key ? { ...card, ...patch } : card)) })),
});

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

// Whether the card `key` has a column to go to `step` columns on
// (stepTarget): what H/L move it to.
export const hasStep = (board, key, step) => Boolean(stepTarget(board, key, step));

// A view's columns with the person's hidden set applied.
export function withHidden(board, hidden) {
  return { ...board, columns: board.columns.map((c) => ({ ...c, hidden: hidden.has(c.name) })) };
}

// The columns as the board shows them: hidden ones left out, the others with
// the cards that show (`mine`: only one's own).
export function shownColumns(board, filter, mine = false) {
  const all = showsAll(filter, mine);
  return (board?.columns ?? []).filter((c) => !c.hidden).map((c) => ({ ...c, shown: all ? c.cards : c.cards.filter((card) => shows(card, filter, mine, board.viewer)) }));
}

// ==== src/kinds/states.js ====

// A work item's state as the board shows it: its theme color, and whether
// it counts as done.

// The theme color of a state, and whether it is done, by its category
// (data.meta.states: categoryStates, from parseAzureTypes and
// parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";
export const stateDone = (data, name) => data.meta.states.find((s) => s.name === name)?.done === true;

// ==== src/kinds/sprint.js ====

// A sprint's taskboard: its rows (one per story, and "Ohne Story" for tasks
// whose story is not in the sprint), the items it holds, what shows and how the
// keys walk it, a task's state as shown, a state change laid over the data, its
// warnings (sprintWarnings), which folds hold (foldsOf) and its dates as
// written. The data is a board's (kinds/board.js: its columns hold the tasks, so
// moves, their rollback and H/L work on it as on a board) plus its rows;
// sprintBoard (sources/azure/sprint.js) builds it.

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
// (a task moved in comes last in its column's data). withoutFolded leaves
// the tasks of folded rows out of them.
export function sprintNav(data, filter, mine) {
  const order = new Map(data.rows.map((r, i) => [r.key, i]));
  const stories = { id: STORY_COLUMN, name: "Story", shown: sprintStories(data).filter((s) => shows(s, filter, mine, data.viewer)) };
  const byRow = (a, b) => order.get(rowOf(a)) - order.get(rowOf(b)) || a.number - b.number;
  return [stories, ...shownColumns(data, filter, mine).map((c) => ({ ...c, shown: [...c.shown].sort(byRow) }))];
}

// sprintNav's columns without the tasks of the rows in `folded`.
export const withoutFolded = (nav, folded) => (folded.size ? nav.map((c, i) => (i ? { ...c, shown: c.shown.filter((t) => !folded.has(t.row)) } : c)) : nav);

// Per row key, how many tasks it holds (total) and how many of them show
// in `nav` (sprintNav's columns, none folded: shown).
export function rowCounts(data, nav) {
  const counts = new Map();
  const count = (key) => counts.get(key) ?? counts.set(key, { shown: 0, total: 0 }).get(key);
  for (const t of data.columns.flatMap((c) => c.cards)) count(t.row).total++;
  for (const t of nav.slice(1).flatMap((c) => c.shown)) count(t.row).shown++;
  return counts;
}

// The tasks of the row `key`, in every column.
export const rowTasks = (data, key) => data.columns.flatMap((c) => c.cards.filter((t) => t.row === key));

// Whatever the filter shows; done by the state the task's column shows.
export function storyProgress(data, key) {
  const states = data.columns.flatMap((c) => c.cards.filter((t) => t.row === key).map((t) => shownState(t, c)));
  return states.length ? { total: states.length, done: states.filter((s) => stateDone(data, s)).length } : null;
}

// Which stories a Sprint view has folded, as the store keeps it
// ("folded:<view>": { sprint: the iteration's id, stories: [story keys] });
// null for anything else.
export function readStoredFolds(v) {
  return typeof v?.sprint === "string" && Array.isArray(v.stories) && v.stories.every((k) => typeof k === "string") ? v : null;
}

// The stories folded in the sprint `data` shows, from what is kept
// (`folds`, readStoredFolds): none where they were folded in another
// sprint.
export const foldedStories = (folds, data) => new Set(folds?.sprint === data.meta.iterationId ? folds.stories : []);

// What a Sprint's data shows, the one place that tells it: "none" where
// the team has no sprint running and none is chosen (meta.iterationId
// null), "current" for the team's current sprint (meta.currentId), and
// "chosen" for another one the sprint picker chose.
export function sprintIs(data) {
  const { iterationId, currentId } = data.meta;
  if (!iterationId) return "none";
  return iterationId === currentId ? "current" : "chosen";
}

// The folds that hold for the sprint `data` shows, of a Sprint view's state
// `st`: for a sprint the sprint picker chose those of this session
// (st.chosenFolds, by the sprint's id), which never replace the stored
// ones; else the stored ones (st.folds).
export const foldsOf = (st, data) => (sprintIs(data) === "chosen" ? st.chosenFolds.get(data.meta.iterationId) ?? null : st.folds);

// `folds` with the story `key` folded, or unfolded where it was, in the
// sprint `data` shows; the folds of another sprint are dropped.
export function toggledFolds(folds, data, key) {
  const now = [...foldedStories(folds, data)];
  return { sprint: data.meta.iterationId, stories: now.includes(key) ? now.filter((k) => k !== key) : [...now, key] };
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

// Keyboard movement over sprintNav's columns: j/k as everywhere (navigate),
// the only keys that change the row; h/l stay in the selected item's row,
// onto that row's item in the next column in their direction that has one
// (the stories' column holds the row's story), past the empty cells; where
// none has one, nothing moves. With no item selected (an empty column) h/l
// move as navigate does.
export function sprintNavigate(nav, sel, dir) {
  if (dir === "up" || dir === "down" || !nav.length) return navigate(nav, sel, dir);
  const ci = Math.min(Math.max(sel?.col ?? 0, 0), nav.length - 1);
  const from = nav[ci].shown.find((i) => i.key === sel?.key);
  if (!from) return navigate(nav, sel, dir);
  const step = dir === "left" ? -1 : 1;
  for (let to = ci + step; to >= 0 && to < nav.length; to += step) {
    const next = nav[to].shown.find((i) => rowOf(i) === rowOf(from));
    if (next) return { col: to, key: next.key };
  }
  return { col: ci, key: from.key };
}

// The data with the story or task `key` replaced by fn(it).
export function mapSprintItem(data, key, fn) {
  const set = (i) => (i.key === key ? fn(i) : i);
  return {
    ...data,
    rows: data.rows.map((r) => (r.story?.key === key ? { ...r, story: set(r.story) } : r)),
    columns: data.columns.map((c) => ({ ...c, cards: c.cards.map(set) })),
  };
}

// The data with the story or task `key`'s fields set to those of `patch`.
export const withSprintItem = (data, key, patch) => mapSprintItem(data, key, (i) => ({ ...i, ...patch }));

// The data with the item `key` in `state`; a task's column then counts as
// read (shownState shows its own state).
export const withItemState = (data, key, state) => mapSprintItem(data, key, (i) => ({ ...i, state, ...(isTask(i) ? { readColumn: i.column } : {}) }));

// A day as the Sprint writes it, from Azure's date (the day's start, in
// UTC): "16.11.", with its year where that is not `year`; null for none.
export function dayText(date, year) {
  const at = new Date(date ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getUTCDate()}.${at.getUTCMonth() + 1}.${at.getUTCFullYear() === year ? "" : at.getUTCFullYear()}`;
}

// An iteration's dates as the sprint picker's row says them, `year` the
// year now: "16.11.–27.11.", "ab 16.11.", "bis 27.11.", or "ohne Daten".
export function sprintDates(it, year) {
  const [start, finish] = [dayText(it.start, year), dayText(it.finish, year)];
  if (start && finish) return `${start}–${finish}`;
  if (start) return `ab ${start}`;
  return finish ? `bis ${finish}` : "ohne Daten";
}

// The row the sprint picker marks first among `rows` (in Azure's order,
// each with current, start and finish): the team's current sprint; where
// it has none, the next to start (the first that starts after `now`), else
// the last that ended (its last day over by `now`: lastDayOver),
// else the first.
export function startRow(rows, now) {
  const current = rows.findIndex((r) => r.current);
  if (current >= 0) return current;
  const next = rows.findIndex((r) => Date.parse(r.start ?? "") > now);
  if (next >= 0) return next;
  const ended = rows.map((r) => lastDayOver(r.finish, now)).lastIndexOf(true);
  return Math.max(ended, 0);
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

// The index `by` places on from `at` in a list `length` long, round past
// its end to its start and back: the next or previous tab, source or view.
export const stepIndex = (length, at, by) => (at + by + length) % length;

// The index in `list` of `shown` (by its id), -1 for none: the shown tab
// among the contexts, the shown source among the sources.
export const shownIndex = (list, shown) => list.findIndex((x) => x.id === shown?.id);

// The source after `shown` among `sources`, in the toggle's order.
export const sourceAfter = (sources, shown) => sources[stepIndex(sources.length, shownIndex(sources, shown), 1)];

// The view a team context shows after `shown`, one of its views.
export const teamViewAfter = (context, shown) => context.views[stepIndex(context.views.length, context.views.indexOf(shown), 1)];

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
    r = await logged("sh", { kind: `which-${tool}` }, () => execute("sh", whichArgs(tool, on), { on, timeout: timeoutMs }));
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
  const known = readMemo();
  return {
    // start(program) runs the program; its rejection passes on unchanged,
    // but for the second time it is gone.
    async run(tool, on, timeoutMs, start) {
      const key = `${on ?? ""}\n${tool}`;
      for (let again = false; ; again = true) {
        const lookup = known.get(key, () => findTool(execute, tool, on, timeoutMs));
        const { program, bare } = await lookup;
        try {
          return await start(program);
        } catch (e) {
          const msg = firstLine(e?.message ?? e);
          if (bare || !NOT_INSTALLED.test(msg)) throw e;
          known.forget(key, lookup);
          if (again) throw notStarted(tool, on, msg);
        }
      }
    },
    reset() {
      known.clear();
    },
  };
}

// The line names no argument: no query text, no token.
export const callLine = (tool, { view = null, kind = "call" } = {}, ms, outcome) => `board: ${tool} ${kind} ${ms} ms ${outcome} view=${view ?? "-"}`;
export const what = (view, kind) => ({ what: { view: view?.id ?? null, kind } });

async function logged(tool, about, run) {
  const began = Date.now();
  let outcome = "failed";
  try {
    const r = await run();
    outcome = r?.code ? `exit ${r.code}` : "ok";
    return r;
  } finally {
    boardLog.write(callLine(tool, about, Date.now() - began, outcome));
  }
}

// One run of a program: its result, or a BoardError when it could not run.
// With `paths` (toolPaths) it runs by what that finds. `write` is for calls
// that change something (see execRejection).
export async function call(tool, args, on, timeout, { write = false, paths = null, what: about } = {}) {
  const start = (program) => logged(tool, about, () => exec(program, args, { on, timeout }));
  try {
    return await (paths ? paths.run(tool, on, timeout, start) : start(tool));
  } catch (e) {
    throw e instanceof BoardError ? e : execRejection(tool, e, timeout, on, { write });
  }
}

// ==== src/loading.js ====

// How views load beyond one read: each view's last good data kept on disk
// (the saved state, drawn at once after a restart), what a load draws before
// its end, the order the prefetch reads the other views in, and the top
// bar's words for a read and an age.

// herdr's store refuses a value whose JSON string takes more than 1 MiB in
// UTF-8, and a file of more than 8 MiB for all keys (gpui-kit's
// storage.rs).
export const SAVED_MAX = 1000000;
export const SAVED_PREFIX = "board:data:";
// Raised when what a shape draws from changes, so that no older data is drawn.
export const SAVED_VERSION = 1;
export const savedKey = (id) => `${SAVED_PREFIX}${id}`;

// Data read for other hidden columns or another form of the view is not
// its data.
const savedSig = (view, hidden) => JSON.stringify([SAVED_VERSION, view, [...hidden].sort()]);

// The size the store measures `text` by.
export function storeBytes(text) {
  const json = JSON.stringify(text);
  let bytes = json.length;
  for (let i = 0; i < json.length; i++) {
    const unit = json.charCodeAt(i);
    if (unit >= 0x80) bytes++;
    // A surrogate is half of a 4-byte character, so 2 bytes.
    if (unit >= 0x800 && (unit < 0xd800 || unit > 0xdfff)) bytes++;
  }
  return bytes;
}

export function savedText(view, hidden, { data, warnings }, at) {
  const text = JSON.stringify({ sig: savedSig(view, hidden), at, data, warnings });
  return storeBytes(text) <= SAVED_MAX ? text : null;
}

export function readSaved(text, view, hidden) {
  let entry;
  try {
    entry = JSON.parse(text);
  } catch {
    return null;
  }
  if (entry?.sig !== savedSig(view, hidden) || !Number.isFinite(entry.at) || typeof entry.data?.shape !== "string") return null;
  return { data: entry.data, warnings: Array.isArray(entry.warnings) ? entry.warnings : [], at: entry.at };
}

export const goneSaved = (keys, ids) => keys.filter((k) => k.startsWith(SAVED_PREFIX) && !ids.has(k.slice(SAVED_PREFIX.length)));

// A load's live: partial(result) draws result() ({ data, warnings }) before
// the end, calling it at once or not at all; page(n, of) names the page
// under way.
export const NO_LIVE = { partial() {}, page() {} };

export const refreshDue = (st, now, every) => now - st.tried >= every;

export function prefetchOrder(views, { shown, source, now, every, stateOf, loads }) {
  const due = views.filter((v) => {
    if (v.id === shown?.id || !loads(v)) return false;
    const st = stateOf(v.id);
    return !st.loading && !st.unavailable && refreshDue(st, now, every);
  });
  const rank = (v) => [v.source === source ? 0 : 1, stateOf(v.id).at];
  return due.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1];
  });
}

export function sinceLabel(at, now) {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`;
  if (s < 48 * 3600) return `vor ${Math.floor(s / 3600)} h`;
  return `vor ${Math.floor(s / 86400)} d`;
}

export function readLabels(st, now) {
  if (!st) return { reading: "", age: "" };
  const page = st.progress?.pages > 1 ? ` Seite ${st.progress.page} von ${st.progress.pages}` : "";
  return { reading: st.loading ? `lädt …${page}` : "", age: st.at ? `Stand ${sinceLabel(st.at, now)}` : "" };
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
// request's head branch, or one with a part that starts with `<number>-` or
// whose last part is `<number>`, in a folder of its repo).
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
    hits = allSpaces
      .filter((s) => s.branch && (item.kind === "pr" && item.branch ? s.branch === item.branch : numberedBranch(s.branch, item.number) && (s.folder ?? "").includes(item.repoShort)))
      .map((s) => ({ space: s.id, tab: null, status: s.status ?? null, label: s.branch }));
  }
  hits.sort((a, b) => (URGENCY[a.status] ?? 4) - (URGENCY[b.status] ?? 4));
  return hits[0] ?? null;
}

// No RegExp: one would be compiled per card on every render.
function numberedBranch(branch, number) {
  const parts = String(branch).split("/");
  return parts.some((part, i) => part.startsWith(`${number}-`) || (i === parts.length - 1 && part === String(number)));
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

// Azure DevOps, what its two team views and a work item's related items
// share: states and their categories, what az's failures mean, how az is
// called, the work items' fields and how az's answers are read, who az is,
// and a state change. The Sprint's own calls are in sprint.js, the
// Backlog's in backlog.js, the related items' in related.js, the source as
// the board uses it in index.js (makeAzure).

// Theme colors and column order for Azure's state categories, and the
// categories whose states count as done (a done related item is dimmed).
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };
const DONE_CATEGORIES = new Set(["Completed", "Removed"]);

// States named with their categories → [{ id, name, category, color, done
// }], each name once (its first category), in category order.
export function categoryStates(pairs) {
  const states = new Map();
  for (const [name, category] of pairs) {
    if (!states.has(name)) states.set(name, { id: name, name, category, color: CATEGORY_COLORS[category] ?? "muted", done: DONE_CATEGORIES.has(category) });
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return [...states.values()].sort((a, b) => order(a) - order(b));
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
  const { lines, errorLine, said } = azSaid(stderr);
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

// What az printed on stderr: its lines but the WARNING: ones, its ERROR:
// line (or undefined), and what it said, that line's words or else the
// first line's.
export function azSaid(stderr) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const errorLine = lines.find((l) => /^ERROR:/.test(l));
  return { lines, errorLine, said: (errorLine ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim() };
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

// Built from SYSTEM: the command check (tests/herdr-app/check-commands.py) takes System.Id in quotes for a command.
const SYSTEM = "System.";
export const AREA_PATH = `${SYSTEM}AreaPath`;
// A work item's description (HTML), and the link to a child.
export const DESCRIPTION = `${SYSTEM}Description`;
export const CHILD_LINK = `${SYSTEM}LinkTypes.Hierarchy-Forward`;
// The link from a work item to its parent.
export const PARENT_LINK = `${SYSTEM}LinkTypes.Hierarchy-Reverse`;
const fieldOf = (wi, name) => wi.fields?.[SYSTEM + name];

// 1 (the highest) to 4, where the work item's type has one.
export const PRIORITY = "Microsoft.VSTS.Common.Priority";

// The fields read of each work item.
export const WORK_ITEM_FIELDS = [...["Id", "Title", "WorkItemType", "State", "AssignedTo", "Parent", "AreaPath", "IterationPath"].map((f) => SYSTEM + f), PRIORITY];

// One WIQL query for the fields of the work items `ids` (WORK_ITEM_FIELDS
// and `extraFields`), in the order of their ids.
export function idsWiql(ids, extraFields = []) {
  const fields = [...WORK_ITEM_FIELDS, ...extraFields].map((f) => `[${f}]`).join(", ");
  return `SELECT ${fields} FROM WorkItems WHERE [${SYSTEM}Id] IN (${ids.join(", ")}) ORDER BY [${SYSTEM}Id]`;
}

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
// values: [{ value, includeChildren }], default (the area a new work item
// gets, or null) }.
export function parseAreas(stdout) {
  const json = azJson(stdout, "die Bereiche des Teams");
  const values = (Array.isArray(json?.values) ? json.values : []).filter((v) => typeof v?.value === "string" && v.value);
  if (!values.length) throw new BoardError("Azure nannte keine Bereiche des Teams");
  return {
    field: json.field?.referenceName ?? AREA_PATH,
    values: values.map((v) => ({ value: v.value, includeChildren: v.includeChildren === true })),
    default: typeof json.defaultValue === "string" && json.defaultValue ? json.defaultValue : null,
  };
}

// The address of a work item's page.
export const workItemUrl = (c, id) => `${c.org}/${encodeURIComponent(c.project)}/_workitems/edit/${id}`;

// A person as a work item names one: an identity ({ displayName,
// uniqueName }), or older answers' "Name <login>" → { name, login } (login
// in lower case, null where it is not given).
export function azPerson(who) {
  if (typeof who === "string") {
    const login = who.match(/<([^>]+)>\s*$/)?.[1] ?? null;
    return { name: personName({ name: who.replace(/\s*<[^>]*>\s*$/, ""), login }), login: login?.toLowerCase() ?? null };
  }
  if (!isObject(who)) return { name: null, login: null };
  return { name: personName({ name: who.displayName, login: who.uniqueName }), login: who.uniqueName?.toLowerCase() ?? null };
}

const PRIORITY_TONES = { 1: "ansi1", 2: "ansi11" };

export function azPriority(value) {
  return Number.isInteger(value) ? { name: `P${value}`, tone: PRIORITY_TONES[value] ?? "muted" } : null;
}

// A work item of az boards query's answer as the board shows it, keyed as
// itemKey names it; with an `orderField`, its value there as `order` (a
// number, else null). az's answer holds no parent's title: the Sprint reads
// it (parentTitles).
export function azWorkItem(wi, c, orderField = null) {
  const f = (name) => fieldOf(wi, name) ?? null;
  const who = azPerson(f("AssignedTo"));
  const item = {
    source: "azure", kind: "workitem", number: wi.id, title: f("Title") ?? "", type: f("WorkItemType"),
    state: f("State"), assignees: who.name ? [who.name] : [], assigneeLogins: who.login ? [who.login] : [],
    parent: f("Parent"), parentTitle: null, area: f("AreaPath"), iteration: f("IterationPath"), priority: azPriority(wi.fields?.[PRIORITY]),
    url: workItemUrl(c, wi.id), labels: [], sub: null, branch: null,
    ...(orderField ? { order: typeof wi.fields?.[orderField] === "number" ? wi.fields[orderField] : null } : {}),
  };
  return { key: itemKey(item), ...item };
}

// Until when what an iteration's dates bound stays kept (ms): the end of
// its last day (lastDayEnd), or half a day from `now` where it names none.
export function iterationUntil(finish, now) {
  const end = lastDayEnd(finish);
  return Number.isNaN(end) ? now + DAY_MS / 2 : end;
}

// Until when the answer that a team has no current sprint stays kept: the
// end of the day (UTC), when the next one may start (Azure's dates are the
// starts of days).
export const dayEnd = (now) => (Math.floor(now / DAY_MS) + 1) * DAY_MS;

// How long a team's settings that change rarely stay kept (ms): its areas,
// and the Backlog's settings (BACKLOG_KEEP_MS).
export const TEAM_KEEP_MS = 4 * 3600000;

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

// The members of a team (az devops team list-member), the first
// MEMBERS_LIMIT, whom the assignee picker offers.
export const MEMBERS_LIMIT = 1000;
export const azMembersArgs = (c) =>
  ["devops", "team", "list-member", ...azOrg(c.org), "--project", c.project, "--team", c.team, "--top", String(MEMBERS_LIMIT), "-o", "json"];

// A team's members as az lists them → { all ({ login (lower case), name
// (personName) }; a group is none), note (that the list may be cut, or
// null) }.
export function parseMemberList(stdout) {
  const list = azList(azJson(stdout, "die Mitglieder des Teams"));
  if (!list) throw new BoardError("Azure lieferte keine Mitglieder des Teams");
  const all = list
    .map((m) => m?.identity)
    .filter((i) => isObject(i) && i.isContainer !== true && typeof i.uniqueName === "string" && i.uniqueName)
    .map((i) => ({ login: i.uniqueName.toLowerCase(), name: personName({ name: i.displayName, login: i.uniqueName }) }));
  return { all, note: list.length >= MEMBERS_LIMIT ? `erste ${MEMBERS_LIMIT}` : null };
}

// A team's members (parseMemberList) as the picker offers them to
// `viewer` (the account az is, lower case, or null) → { me (its member
// where it is one, else az's own "me" with what is known of it; me:
// true), people (the other members by name), note }.
export function membersFor({ all, note }, viewer) {
  const own = all.find((p) => p.login === viewer);
  const me = { login: viewer ?? null, name: own?.name ?? null, me: true };
  const people = all.filter((p) => p.login !== viewer).sort((a, b) => a.name.localeCompare(b.name));
  return { me, people, note };
}

// Assigning the work item `id` to `person`: its login, "me" for az's own
// account (me: true; az resolves it), "" for no one, which az writes as an
// empty Assigned To.
export const azAssignArgs = (c, id, person) =>
  ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--assigned-to", person ? (person.me ? "me" : person.login) : "", "-o", "json"];

// az's answer to an assignment must be the work item `id` and name
// `person` as its Assigned To (anyone for me without a known login), or no
// one for null; then → { names, logins } as it names them, else it is open
// whether the change landed.
export function checkAzAssigned(stdout, id, person) {
  const json = jsonOrNull(stdout);
  const who = azPerson(json ? fieldOf(json, "AssignedTo") : undefined);
  const fits = json?.id !== id ? false : !person ? !who.login : Boolean(who.login) && (person.me && !person.login ? true : who.login === person.login);
  if (!fits) throw failure("Azure hat die Zuweisung nicht bestätigt", { write: true, unclear: true });
  return { names: who.name ? [who.name] : [], logins: who.login ? [who.login] : [] };
}

export const azStateArgs = (c, id, state) => ["boards", "work-item", "update", ...azOrg(c.org), "--id", String(id), "--state", state, "-o", "json"];

// az's answer to a state change must name the state it set; anything else
// leaves open whether the change landed.
export function checkStateResult(stdout, state) {
  const json = jsonOrNull(stdout);
  if (!json || fieldOf(json, "State") !== state) throw failure("Azure hat den Status nicht bestätigt", { write: true, unclear: true });
}

// ==== src/sources/azure/sprint.js ====

// The Azure Sprint: its calls, what they answer, the sprint as the sprint
// shape shows it (sprintBoard), a task's move on the taskboard, and the
// view as makeAzure uses it (sprintView).

// The Sprint view's calls for a team context `c` ({ org, project, team }):
// its current iteration, its areas (azAreasArgs), its taskboard's columns,
// the project's work item types with their states, and per refresh the
// taskboard's column of each work item and the fields of the sprint's work
// items (azQueryArgs); for the sprint picker, all the team's iterations
// (azIterationsArgs without a timeframe).
export const azIterationsArgs = (c, timeframe = null) =>
  ["boards", "iteration", "team", "list", ...azOrg(c.org), "--project", c.project, "--team", c.team, ...(timeframe ? ["--timeframe", timeframe] : []), "-o", "json"];
export const azIterationArgs = (c) => azIterationsArgs(c, "current");
export const azColumnsArgs = (c) => azInvokeArgs(c, "work", "taskboardColumns", { project: c.project, team: c.team });
export const azTypesArgs = (c) => azInvokeArgs(c, "wit", "workitemtypes", { project: c.project });
export const azTaskboardArgs = (c, iterationId) => azInvokeArgs(c, "work", "taskboardWorkItems", { project: c.project, team: c.team, iterationId });
// A work item type's color as "#rrggbb", from six hex digits (the form of
// its states' colors in the same answer), with or without #, or eight
// (aarrggbb, Azure's process files' form: the alpha is dropped); null for
// anything else.
export function typeColor(color) {
  const hex = typeof color === "string" ? /^#?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(color)?.[1] : null;
  return hex ? `#${hex.toLowerCase()}` : null;
}

// The work item types' answer → { states (categoryStates, common.js),
// types: { [type]: [state names] }, colors: { [type]: "#rrggbb" } (each
// type's own color, typeColor; a type without one, or with another form,
// has none), warnings (where the answer names colors but none in a form
// typeColor reads: the views say so beside their data) }.
export function parseAzureTypes(stdout) {
  const value = azJson(stdout, "die Work-Item-Typen")?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  const types = Object.fromEntries(value.map((type) => [type.name, (type.states ?? []).map((s) => s.name)]));
  const colors = Object.fromEntries(value.map((type) => [type.name, typeColor(type.color)]).filter(([, color]) => color));
  const named = [...new Set(value.map((type) => type.color).filter((c) => typeof c === "string" && c))];
  const warnings = named.length && !Object.keys(colors).length ? [`Farben der Work-Item-Typen in unbekannter Form: ${named.slice(0, 3).join(", ")}`] : [];
  return { states: categoryStates(value.flatMap((type) => (type.states ?? []).map((s) => [s.name, s.category]))), types, colors, warnings };
}

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

// An iteration as az lists one (the azure-devops extension's
// get_team_iterations, TeamSettingsIteration: id, name, path, attributes {
// startDate, finishDate, timeFrame }) → { id, name (its path where it has
// none), path, start, finish } (start and finish: the start of its first
// and last day, as Azure gives them, or null).
const iterationOf = (i) => ({ id: i.id, name: i.name ?? i.path, path: i.path, start: i.attributes?.startDate ?? null, finish: i.attributes?.finishDate ?? null });

// The team's current iteration (iterationOf), or null where it has none
// running (az lists none).
export function parseIteration(stdout) {
  const list = azList(azJson(stdout, "den Sprint"));
  if (!list) throw new BoardError("Azure lieferte keinen Sprint");
  const it = list.find((i) => i?.attributes?.timeFrame === "current") ?? list[0];
  if (!it) return null;
  if (!it.id || !it.path) throw new BoardError("Azure nannte den laufenden Sprint ohne Id oder Pfad");
  return iterationOf(it);
}

// The team's iterations, as az lists them without --timeframe →
// [iterationOf] in Azure's order (the team's iterations by their dates).
// One without an id or path is left out. Which one is current, they do
// not say: Azure's timeFrame is that of the moment they were read, while
// they are kept longer (sprintView, iterations).
export function parseIterations(stdout) {
  const list = azList(azJson(stdout, "die Sprints des Teams"));
  if (!list) throw new BoardError("Azure lieferte keine Sprints des Teams");
  return list.filter((i) => i?.id && i.path).map(iterationOf);
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
// meta.currentId is the team's current sprint's id (null where it has
// none running; the shown one's by default), which sprintIs
// (kinds/sprint.js) compares the shown one with; meta.gone ({ id, name })
// a chosen sprint the team no longer has, which the current one, or none
// where none runs, stands in for (sprintView). Without an `iteration` (the
// team has no sprint running and none is chosen) it holds no work items,
// and meta.iterationId, iteration and finish are null.
export function sprintBoard({ iteration, currentId = iteration?.id ?? null, gone = null, columns, types, items, places, viewer }) {
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
    meta: {
      iterationId: iteration?.id ?? null, iteration: iteration?.name ?? null, finish: iteration?.finish ?? null, currentId, gone,
      typeStates: types.types, states: types.states, typeColors: types.colors, unplaced, unknownColumns,
    },
    columns: cols,
    rows: [...(loose ? [{ key: NO_STORY, story: null }] : []), ...stories.map((s) => ({ key: s.key, story: s }))],
    viewer,
    total: items.length,
    limited: items.length >= AZ_QUERY_LIMIT,
    limit: AZ_QUERY_LIMIT,
  };
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

export const PARENTS_UNREAD = "Titel der übergeordneten Work Items nicht gelesen";
const parentsKey = (s, c) => `parents\n${s.teamKey(c)}`;

// One query by id for the parents outside the sprint: az boards query reads no linked item (sources/azure/related.js).
// `before` gets the items before that query, with the titles known so far.
export async function parentTitles(s, c, items, view = null, before = null) {
  const key = parentsKey(s, c);
  const held = s.keptValue(key);
  const titles = new Map(held?.value ?? []);
  const own = new Map(items.map((i) => [i.number, i.title]));
  const missing = [...new Set(items.map((i) => i.parent).filter((id) => Number.isInteger(id) && !own.has(id) && !titles.has(id)))];
  const titleOf = (id) => own.get(id) ?? titles.get(id) ?? null;
  const titled = () => items.map((i) => (Number.isInteger(i.parent) ? { ...i, parentTitle: titleOf(i.parent) } : i));
  let warning = null;
  if (missing.length) {
    before?.(titled());
    try {
      const found = new Map(parseWorkItems(await s.az(azQueryArgs(c, idsWiql(missing)), what(view, "parents")), c).map((i) => [i.number, i.title]));
      for (const id of missing) titles.set(id, found.get(id) ?? null);
      s.keep(key, titles, held?.until ?? Date.now() + TEAM_KEEP_MS);
    } catch (e) {
      warning = `${PARENTS_UNREAD}: ${errorText(e)}`;
    }
  }
  return { items: titled(), warning };
}

// The Sprint as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure, which says what is kept and for how long): what it keeps per
// team and project (settingsOf; the team's areas are the source's,
// s.areasOf), how it loads and writes, the team's iterations for the
// sprint picker (iterations: each with `current`, whether it is the
// team's current iteration as the Sprint keeps it, so that a kept list
// never names a sprint current that has ended), and what a refused write
// or a task in a column the columns read do not know drops (forgetSettings:
// the team's sprint, areas and columns, not the project's types); `r`
// drops the team's iterations and its parent titles too (forget).
//
// load(view, { chosen }) shows the sprint `chosen` ({ id, name }; null:
// the current one), looked up by its id among the team's iterations: its
// taskboard and query by its id and path, the team's settings as for the
// current one. Where the team no longer has it, the current sprint, or
// none where none runs, shows, meta.gone names it and the load says so
// (notice); a read of it that fails names it. Where the team has no sprint
// running and none is chosen, it reads no work items (sprintBoard without
// an iteration).
export function sprintView(s) {
  const iterations = readMemo();
  const iterationsOf = (c, view) => iterations.get(s.teamKey(c), () => s.az(azIterationsArgs(c), what(view, "iterations")).then(parseIterations));
  const currentKey = (c) => `iteration\n${s.teamKey(c)}`;
  function settingsOf(c, view) {
    const team = s.teamKey(c);
    const [iteration, board] = [s.keptValue(currentKey(c)), s.keptValue(`board\n${team}`)];
    const parts = {
      iteration: iteration ? Promise.resolve(iteration.value) : s.az(azIterationArgs(c), what(view, "iteration")).then(parseIteration),
      areas: s.areasOf(c, view),
      columns: board ? Promise.resolve(board.value.columns) : s.az(azColumnsArgs(c), what(view, "columns")).then(parseColumns),
      types: s.typesOf(c, view),
    };
    const all = Promise.all([parts.iteration, parts.areas, parts.columns, parts.types]).then(([it, areas, columns, { types: ty, fresh }]) => {
      const until = iteration?.until ?? (it ? iterationUntil(it.finish, Date.now()) : dayEnd(Date.now()));
      s.keepAreasUntil(c, until);
      if (!iteration) s.keep(currentKey(c), it, until);
      if (!board) s.keep(`board\n${team}`, { columns }, until);
      if (fresh) s.keepTypesUntil(c, until);
      return { iteration: it, areas, columns, types: ty };
    });
    return { ...parts, all };
  }
  const forgetSettings = (c) => {
    s.drop(currentKey(c));
    s.drop(`board\n${s.teamKey(c)}`);
    s.forgetAreas(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forgetSettings, c);
  // The team's current iteration's id: as the Sprint keeps it, else read
  // (and not kept: settingsOf keeps it with the settings it belongs to).
  async function currentIdOf(c, view) {
    const kept = s.keptValue(currentKey(c));
    return (kept ? kept.value : parseIteration(await s.az(azIterationArgs(c), what(view, "iteration"))))?.id ?? null;
  }
  async function loadSprint(view, chosen, live) {
    const c = view.context;
    const me = s.whoAmI(view);
    const settings = settingsOf(c, view);
    const listed = chosen ? iterationsOf(c, view) : null;
    const shown = Promise.all([settings.iteration, listed]).then(([current, list]) => list?.find((i) => i.id === chosen.id) ?? current);
    const placesRead = shown.then((it) => (it ? s.az(azTaskboardArgs(c, it.id), what(view, "taskboard")) : null));
    const itemsRead = Promise.all([shown, settings.areas]).then(([it, areas]) => (it ? s.az(azQueryArgs(c, sprintWiql(it, areas)), what(view, "sprint-items")) : null));
    const [kept, list, iteration, places, items] = await Promise.all([settings.all, listed, shown, placesRead, itemsRead]);
    const found = list?.find((i) => i.id === chosen.id) ?? null;
    const gone = chosen && !found ? { id: chosen.id, name: chosen.name } : null;
    const currentId = kept.iteration?.id ?? null;
    const placed = places === null ? new Map() : parseTaskboard(places);
    const board = (titled, viewer) => {
      const data = sprintBoard({ ...kept, iteration, currentId, gone, items: titled, places: placed, viewer });
      s.noViewerOf(data);
      return data;
    };
    const drawn = (soFar) => void me.then((viewer) => live.partial(() => ({ data: board(soFar, viewer), warnings: [...kept.types.warnings] }))).catch(report);
    const titled = await parentTitles(s, c, items === null ? [] : parseWorkItems(items, c), view, drawn);
    const data = board(titled.items, await me);
    if (data.meta.unknownColumns) forgetSettings(c);
    const instead = currentId ? "der aktuelle Sprint wird gezeigt" : "das Team hat keinen laufenden Sprint";
    return { data, warnings: [...kept.types.warnings, ...(titled.warning ? [titled.warning] : [])], notice: gone ? `${gone.name} gibt es im Team nicht mehr: ${instead}` : null };
  }
  return {
    forget: (c) => {
      forgetSettings(c);
      iterations.drop(s.teamKey(c));
      s.drop(parentsKey(s, c));
    },
    async iterations(view) {
      const c = view.context;
      const [list, current] = await Promise.all([iterationsOf(c, view), currentIdOf(c, view)]);
      return list.map((i) => ({ ...i, current: i.id === current }));
    },
    load: (view, { chosen = null, live = NO_LIVE }) =>
      loadSprint(view, chosen, live).catch((e) => {
        throw chosen && e instanceof BoardError ? new BoardError(`${chosen.name} ließ sich nicht lesen: ${e.message}`, e) : e;
      }),
    async move(view, data, card, column) {
      const file = await writeMoveBody(card.number, column);
      const out = await s.az(azMoveArgs(view.context, data.meta.iterationId, card.number, file), { write: true, ...what(view, "move") }).catch(onRefusal(view.context));
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
  const { lines, said } = azSaid(r.stderr);
  if (!AZ_REST_LOGIN.test(lines.join("\n"))) return azFailure(r, on, options);
  return new BoardError(`${BACKLOG_NEEDS_LOGIN}: ${said}`, { unavailable: true });
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

// The level the Backlog shows: the team's requirement level (Stories; by
// the process for example User Stories, Product Backlog Items,
// Requirements or Issues in Basic), and the
// level below it, whose types (Tasks) may be created under one of its
// items: the team's task level, else the configuration's.
export function backlogLevels(levels, config) {
  return { level: requirementLevel(levels), childLevel: levels.find((l) => l.type === "task") ?? config.taskLevel ?? null };
}

export function requirementLevel(levels) {
  const level = levels.find((l) => l.type === "requirement");
  if (!level) throw new BoardError("Das Team hat keine Backlog-Ebene für Anforderungen (Stories)");
  return level;
}

// A field's reference name, as a WIQL query may name it; anything else is
// none.
const fieldName = (name) => (typeof name === "string" && /^[A-Za-z][\w.]*$/.test(name) ? name : null);

// The team's backlog configuration → { orderField (the field the backlog
// is ordered by: Microsoft.VSTS.Common.StackRank or …BacklogPriority, by
// the process; null where it names none), typeStates: { [type]: [state
// names] in Azure's order }, states (categoryStates, common.js),
// taskLevel }.
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

// The team's settings → { defaultIteration, backlogIteration, follows }:
// the paths of the iteration a new work item gets and of the backlog's own
// (the root of the team's iterations), each null where Azure names none;
// follows: the default iteration is a macro (defaultIterationMacro, such
// as @CurrentIteration), so the path Azure names is good only until that
// iteration ends (its finishDate, or null where it names none).
export function parseTeamSettings(stdout) {
  const json = azJson(stdout, "die Einstellungen des Teams");
  const path = (it) => (typeof it?.path === "string" && it.path ? it.path : null);
  const macro = typeof json?.defaultIterationMacro === "string" && json.defaultIterationMacro !== "";
  return {
    defaultIteration: path(json?.defaultIteration),
    backlogIteration: path(json?.backlogIteration),
    follows: macro ? { finish: json.defaultIteration?.attributes?.finishDate ?? null } : null,
  };
}

// The ids of the level's work items, in the list's order, each once.
export function parseBacklogIds(stdout) {
  const list = azJson(stdout, "die Work Items des Backlogs")?.workItems;
  if (!Array.isArray(list)) throw new BoardError("Azure lieferte keine Work Items des Backlogs");
  return [...new Set(list.map((l) => l?.target?.id).filter(Number.isInteger))];
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
// were more than one query reads (AZ_QUERY_LIMIT). `typeColors` are the
// colors of the project's work item types (parseAzureTypes), none where
// they were not read.
export function backlogList({ level, childLevel, config, settings, area, ids, items, viewer, typeColors = {} }) {
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
      level, childLevel, typeStates: config.typeStates, states: config.states, typeColors, orderField: config.orderField,
      area, iteration: settings.defaultIteration, follows: Boolean(settings.follows), missing: read - rows.length,
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
export const BACKLOG_KEEP_MS = TEAM_KEEP_MS;

// Until when the Backlog keeps a team's settings read at `now`:
// BACKLOG_KEEP_MS, or sooner where the default iteration follows one that
// ends before (settings.follows, iterationUntil).
export function backlogUntil(settings, now) {
  const keep = now + BACKLOG_KEEP_MS;
  return settings.follows ? Math.min(keep, iterationUntil(settings.follows.finish, now)) : keep;
}

// One WIQL query for the work items of the project `project` and the type
// `type`, titled `title`, that the account az is signed in as created
// today, with their parent where `child` asks for it. The project is
// spelled out: az boards query gives @project nothing to stand for.
export function createdWiql({ project, type, title, child = false }) {
  const fields = child ? "[System.Id], [System.Parent]" : "[System.Id]";
  return `SELECT ${fields} FROM WorkItems WHERE [System.TeamProject] = ${wiqlText(project)} AND [System.WorkItemType] = ${wiqlText(type)} ` +
    `AND [System.Title] = ${wiqlText(title)} AND [System.CreatedBy] = @Me AND [System.CreatedDate] = @Today ORDER BY [System.Id]`;
}

// The Backlog as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure): what it keeps per team (backlogSettingsOf), how it loads and
// writes, and what `r` or a refused write drops (forget).
export function backlogView(s) {
  const key = (c) => `backlog\n${s.teamKey(c)}`;
  function backlogSettingsOf(c, view) {
    const held = s.keptValue(key(c));
    if (held) return { level: Promise.resolve(held.value.level), config: Promise.resolve(held.value.config), all: Promise.resolve(held.value) };
    const levels = s.az(azLevelsArgs(c), what(view, "levels")).then(parseBacklogLevels);
    const config = s.az(azBacklogConfigArgs(c), what(view, "backlog-config")).then(parseBacklogConfig);
    const all = Promise.all([levels, config, s.az(azTeamSettingsArgs(c), what(view, "team-settings")).then(parseTeamSettings), s.areasOf(c, view)]).then(([lv, cf, settings, areas]) => {
      const value = { ...backlogLevels(lv, cf), config: cf, settings, area: areas.default };
      const until = backlogUntil(settings, Date.now());
      s.keep(key(c), value, until);
      s.keepAreasUntil(c, until);
      return value;
    });
    return { level: levels.then(requirementLevel), config, all };
  }
  const forget = (c) => {
    s.drop(key(c));
    s.forgetAreas(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forget, c);
  // The colors of the project's work item types (s.typesOf, which keeps
  // them) and their warnings; a read that fails gives none and the warning
  // that says so.
  async function typeColorsOf(c, view) {
    try {
      const { types } = await s.typesOf(c, view);
      return { colors: types.colors, warnings: types.warnings };
    } catch (e) {
      return { colors: {}, warnings: [`Farben der Work-Item-Typen nicht gelesen: ${errorText(e)}`] };
    }
  }
  return {
    forget,
    async load(view, { live = NO_LIVE }) {
      const c = view.context;
      const me = s.whoAmI(view);
      const settings = backlogSettingsOf(c, view);
      let types = null;
      const typesRead = typeColorsOf(c, view).then((t) => (types = t));
      const idsRead = settings.level.then((level) => s.az(azBacklogIdsArgs(c, level.id), { failure: azRestFailure, ...what(view, "backlog-ids") })).then(parseBacklogIds);
      const outRead = Promise.all([idsRead, settings.config]).then(([ids, config]) => {
        const read = ids.slice(0, AZ_QUERY_LIMIT);
        return read.length ? s.az(azQueryArgs(c, idsWiql(read, config.orderField ? [config.orderField] : [])), what(view, "backlog-items")) : "";
      });
      const [kept, ids, out] = await Promise.all([settings.all, idsRead, outRead]);
      const viewer = await me;
      const list = (colors) => {
        const data = backlogList({ ...kept, ids, items: parseWorkItems(out, c, kept.config.orderField), viewer, typeColors: colors });
        s.noViewerOf(data);
        return data;
      };
      if (!types) live.partial(() => ({ data: list({}), warnings: [] }));
      const { colors, warnings } = await typesRead;
      return { data: list(colors), warnings };
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
    // Creates a work item ({ type, title }) in the team's default area and
    // iteration (data.meta), assigned to me; its id. A default iteration
    // that follows the current one (data.meta.follows) is read again first:
    // the one kept may have ended since, and Azure names no end for it.
    async create(view, data, { type, title }) {
      const c = view.context;
      let iteration = data.meta.iteration;
      if (data.meta.follows) {
        iteration = parseTeamSettings(await s.az(azTeamSettingsArgs(c), what(view, "team-settings"))).defaultIteration;
        if (!iteration) throw new BoardError("Das Team nennt gerade keine Standard-Iteration (Team-Einstellungen in Azure)");
      }
      const args = azCreateArgs(c, { type, title, area: data.meta.area, iteration });
      return parseCreated(await s.az(args, { write: true, ...what(view, "create") }).catch(onRefusal(c)));
    },
    // Makes the work item `id` a child of `parent`.
    async addParent(view, id, parent) {
      checkParentLink(await s.az(azParentArgs(view.context, id, parent), { write: true, ...what(view, "parent-link") }), parent);
    },
    // The work items createdWiql finds for a create ({ type, title,
    // child }) in the view's project, as parseWorkItems reads them.
    async findCreated(view, { type, title, child }) {
      const c = view.context;
      return parseWorkItems(await s.az(azQueryArgs(c, createdWiql({ project: c.project, type, title, child })), what(view, "created-items")), c);
    },
  };
}

// ==== src/sources/azure/related.js ====

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
// (related.js, pullRequest): its title, state, draft mark, author, review
// and source branch.
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
  };
}

// The Azure source's `pullRequest` (related.js): a pull request with an
// id, read in the view's organisation.
export const azurePullRequest = (az) => ({
  reads: (item) => item.kind === "pr" && Number.isInteger(item.number),
  load: async (item, view) => parseAzurePullRequest(await az(azPullRequestArgs(view.context, item.number), what(view, "pull-request"))),
});

// The Azure source's `related` (related.js): a work item with an id has
// some to read.
export const azureRelated = (az) => ({
  reads: (item) => item.kind === "workitem" && Number.isInteger(item.number),
  load: (item, view) => loadAzureRelated(az, view.context, item, view),
});

// ==== src/sources/azure/index.js ====

// The Azure source as the board uses it (makeAzure); its team views'
// calls and data are in sprint.js and backlog.js, a work item's related
// items' in related.js, what they share in common.js.

// The Azure source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items, per layout of an Azure view how it
// loads and writes, a work item's related items (related: its
// description, parent, children and linked pull requests, related.js) and
// a pull request's details (pullRequest, the same). az runs by
// the path `paths` (toolPaths) finds.
//
// What the Sprint keeps, each read once and kept until the sprint ends
// (iterationUntil), or, where the team has no sprint running, until that day
// ends (dayEnd; one that fails keeps nothing): per team, by organisation,
// project and team, its current sprint (or that none runs) and taskboard
// columns. The titles of its items' parents outside the sprint are read
// after its work items, only for those not kept yet, and kept TEAM_KEEP_MS
// (parentTitles). The team's iterations, which the sprint picker lists, are
// read when it first opens and kept while the board runs (one that fails
// keeps nothing); which of them is current, the kept current sprint says.
// The project's work item types, one entry for both views (typesOf), are
// kept TEAM_KEEP_MS from their read (even where another read of the Sprint's
// settings fails), or, where a Sprint's whole settings read brought them, as
// long as the Sprint's settings. A refresh reads what is not kept, the
// taskboard's columns of the work items and the sprint's work items; which
// call waits for which, the main.js header says (Calls). The team's kept
// settings (not the project's types) are dropped, so that they are read
// again, by `r` on the Sprint (forget), by a task in a column the columns
// read do not know, and by a move or state change Azure refuses; its
// iterations and parent titles only by `r`.
//
// What the Backlog keeps, per team, read at the same time once and kept
// for BACKLOG_KEEP_MS (one that fails keeps nothing), or until the
// iteration ends that the team's default iteration follows, where that is
// sooner (backlogUntil): the team's backlog levels, its backlog
// configuration and its settings. A refresh reads the level's ids (az
// rest) and one query for their fields (the order: the main.js header,
// Calls); a backlog without ids asks no query. `r` on the Backlog and a
// state change or create Azure refuses drop what it keeps (not the
// project's types). Beside the ids, a refresh reads the project's work
// item types (for their colors) where neither view keeps them, and keeps
// them TEAM_KEEP_MS (typesOf); one that fails is a warning, keeps nothing
// and is read again with the next refresh.
//
// Both views read the team's areas (the Backlog for its default area) and
// keep them as one, for the shorter of their times (areasOf); `r` on
// either, or a refusal there, drops them.
//
// Who az is signed in as is read beside all that, with its own short
// timeout (AZ_ME_TIMEOUT), and kept once read; while that fails it is
// asked again with each refresh, and the data says why (noViewer: the
// source's words and the error).
//
// A team's members, whom the assignee picker offers (assign:
// actions/assign.js says what it holds), are read once per team and kept
// while the board runs; a read that fails is not kept.
export function makeAzure(paths) {
  // An az call's output; a failed one throws what `failure` (azFailure by
  // default) makes of it.
  const az = async (args, options = {}, timeout = AZ_TIMEOUT) => {
    const r = await call("az", args, null, timeout, { ...options, paths });
    if (r.code !== 0) throw (options.failure ?? azFailure)(r, null, options);
    return r.stdout;
  };
  // What the views keep: by key, a value until a time (ms).
  const kept = new Map();
  const keep = (key, value, until) => kept.set(key, { value, until });
  const keptValue = (key) => {
    const entry = kept.get(key);
    return entry && Date.now() < entry.until ? entry : null;
  };
  let viewer = null;
  let viewerError = null;
  const whoAmI = (view = null) =>
    viewer
      ? Promise.resolve(viewer)
      : az(AZ_ME_ARGS, what(view, "me"), AZ_ME_TIMEOUT).then((out) => {
        viewer = parseViewer(out);
        viewerError = viewer ? null : "keinen Benutzer genannt";
        return viewer;
      }, (e) => {
        viewerError = errorText(e);
        return null;
      });
  const noViewer = "az hat nicht gesagt, wer angemeldet ist (az account show; das braucht az login)";
  const teamKey = (c) => `${c.org}\n${c.project}\n${c.team}`;
  // The key of a project's work item types, which both views keep.
  const typesKey = (c) => `types\n${c.org}\n${c.project}`;
  const areasKey = (c) => `areas\n${teamKey(c)}`;
  // What the views share: az, what is kept, who az is (and the data's words
  // for why it is not known), a project's work item types (typesOf), and a
  // state change.
  const shared = {
    az, keptValue, whoAmI, teamKey,
    // The project's work item types (parseAzureTypes), one entry for both
    // views: read where it is not kept and kept TEAM_KEEP_MS from their read
    // (even where another read of the Sprint's settings fails), or, where a
    // Sprint's whole settings read brought them, as long as those
    // (keepTypesUntil); no forget drops it.
    async typesOf(c, view = null) {
      const held = keptValue(typesKey(c));
      if (held) return { types: held.value, fresh: false };
      const types = parseAzureTypes(await az(azTypesArgs(c), what(view, "types")));
      keep(typesKey(c), types, Date.now() + TEAM_KEEP_MS);
      return { types, fresh: true };
    },
    keepTypesUntil(c, until) {
      const entry = kept.get(typesKey(c));
      if (entry) entry.until = until;
    },
    // The team's areas (parseAreas), one entry for both views: read where
    // it is not kept, kept TEAM_KEEP_MS, and shorter where a view keeps
    // its own settings for a shorter time (keepAreasUntil: the Sprint's
    // as long as its settings, the Backlog's until backlogUntil); either
    // view's forget drops it.
    async areasOf(c, view = null) {
      const held = keptValue(areasKey(c));
      if (held) return held.value;
      const value = parseAreas(await az(azAreasArgs(c), what(view, "areas")));
      keep(areasKey(c), value, Date.now() + TEAM_KEEP_MS);
      return value;
    },
    keepAreasUntil(c, until) {
      const entry = kept.get(areasKey(c));
      if (entry) entry.until = Math.min(entry.until, until);
    },
    forgetAreas: (c) => kept.delete(areasKey(c)),
    keep,
    drop: (key) => kept.delete(key),
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
      az(azStateArgs(view.context, item.number, state), { write: true, ...what(view, "state") }).catch(onRefusal(view.context)).then((out) => checkStateResult(out, state)),
  };
  const views = { sprint: sprintView(shared), backlog: backlogView(shared) };
  const members = readMemo();
  return {
    site: "Azure",
    noViewer,
    // A work item's description, parent, children and linked pull requests
    // (related.js).
    related: azureRelated(az),
    pullRequest: azurePullRequest(az),
    assign: {
      refuse: (item) => (item.kind === "workitem" ? null : "Hier lässt sich niemand zuweisen"),
      // The team's members, kept (parseMemberList); who az is is asked
      // each time, so a viewer read since counts.
      async people(item, view) {
        const c = view.context;
        const [list, me] = await Promise.all([members.get(teamKey(c), () => az(azMembersArgs(c), what(view, "members")).then(parseMemberList)), whoAmI(view)]);
        return membersFor(list, me);
      },
      // Without the list, az still knows its own account: "me".
      fallbackMe: () => ({ login: viewer, name: null, me: true }),
      write: async (view, item, person) => checkAzAssigned(await az(azAssignArgs(view.context, item.number, person), { write: true, ...what(view, "assign") }), item.number, person),
    },
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
// (githubThreadsArgs); of each thread how many comments, the last ones; and
// how many latest reviews (prAttention).
export const FIRST_THREADS = 10;
export const REVIEW_THREADS = 50;
export const THREAD_COMMENTS = 10;
export const LATEST_REVIEWS = 20;
// How many pull requests one follow-up for more threads reads by their ids:
// GitHub's most, as for a page (PAGE).
export const THREAD_IDS = PAGE;

// A pull request's first `first` review threads, how many it has, and of
// each whether it is resolved and who wrote its last THREAD_COMMENTS
// comments.
const threadsSelection = (first) =>
  `reviewThreads(first: ${first}) { totalCount nodes { isResolved comments(last: ${THREAD_COMMENTS}) { nodes { author { login } } } } }`;

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
// whether the viewer has to act on it (prAttention): whether it merges
// without conflict; its latest reviews, "A list of latest reviews per user
// associated with the pull request that are not also pending review"
// (GitHub's schema), the first LATEST_REVIEWS and how many there are, each
// with its state and the commit it was given on; and its first
// FIRST_THREADS review threads (threadsSelection). The details panel's pull
// request a level down does without them.
const PR_ATTENTION_FIELDS = `
      mergeable
      latestReviews(first: ${LATEST_REVIEWS}) { totalCount nodes { state author { login } commit { oid } } }
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
  moreReviews: `mehr als ${LATEST_REVIEWS} Reviews`,
  head: "letzter Commit fehlt",
};

// Whether the `viewer` has to act on the pull request `pr` (its `row`
// read; `asked`: whether a search that asks for one's review, or a team's
// one is in, found it; `errors`: GitHub's errors at its path): { attention,
// waiting, unread }. attention: the reasons, as the row names them; none
// where the viewer has nothing to do, or is unknown. unread: what of it the
// list could not read whole, so that no reason, nor "nothing to do", can be
// told for sure: those errors' first lines (also where the viewer is
// unknown) and UNREAD's parts. On one's own
// pull request the reasons are changes requested; unresolved review threads
// whose last comment is someone else's; failing checks; a merge conflict;
// or, where none of these is and all of it was read, "bereit zum Mergen":
// no draft, no review still required (approved, or a repo that asks for
// none), its checks passed or it has none, and it merges without conflict
// (a mergeability still being calculated is no "without"). On someone
// else's: one's review is asked for and one has given none; one's latest
// review (not a dismissed one) was given on another commit than the head,
// asked again or not; one's review is asked for again while one's latest is
// on the head ("Review erneut angefragt"); an unresolved thread one took
// part in (among its last THREAD_COMMENTS comments) whose last comment is
// someone else's. waiting: someone else's pull request one reviewed, all of
// it read, that asks nothing of one ("wartet auf Autor"). Comments as such
// are no reason. `pending`: its follow-up for more threads is still to
// come, which leaves it unsure but not unread.
function prAttention(pr, row, viewer, asked, errors, pending = false) {
  const unread = errors.map((e) => firstLine(e.message)).filter(Boolean);
  if (!viewer) return { attention: [], waiting: false, unread };
  const threads = pr.reviewThreads;
  const nodes = Array.isArray(threads?.nodes) ? threads.nodes : null;
  if (!nodes || nodes.some((t) => !Array.isArray(t?.comments?.nodes))) unread.push(UNREAD.threads);
  const more = Boolean(nodes) && (threads.totalCount ?? 0) > nodes.length;
  if (more && !pending) unread.push(UNREAD.moreThreads(nodes.length));
  const sure = () => !unread.length && !pending;
  const open = (nodes ?? []).filter((t) => t && !t.isResolved).map((t) => (t.comments?.nodes ?? []).map((c) => c?.author?.login ?? null));
  // Whether a thread waits on the viewer: its last comment is someone else's.
  const awaitsViewer = (authors) => authors.length > 0 && authors.at(-1) !== viewer;
  const reasons = [];
  if (pr.author?.login === viewer) {
    const unanswered = open.filter(awaitsViewer).length;
    if (pr.reviewDecision === "CHANGES_REQUESTED") reasons.push(REVIEW.CHANGES_REQUESTED);
    if (unanswered) reasons.push(threadsText(unanswered, more));
    if (row.checks.state === "failed") reasons.push("Checks rot");
    if (pr.mergeable === "CONFLICTING") reasons.push("Konflikt");
    const ready = !pr.isDraft && [null, "APPROVED"].includes(pr.reviewDecision ?? null) && ["passed", "none"].includes(row.checks.state) && pr.mergeable === "MERGEABLE";
    if (!reasons.length && sure() && ready) reasons.push("bereit zum Mergen");
    return { attention: reasons, waiting: false, unread };
  }
  const reviews = Array.isArray(pr.latestReviews?.nodes) ? pr.latestReviews : null;
  if (!reviews) unread.push(UNREAD.reviews);
  const latest = (reviews?.nodes ?? []).find((r) => r?.author?.login === viewer) ?? null;
  const review = latest?.state === "DISMISSED" ? null : latest;
  // The viewer's latest review may be one GitHub did not send.
  if (reviews && !latest && (reviews.totalCount ?? 0) > reviews.nodes.length) unread.push(UNREAD.moreReviews);
  const head = pr.commits?.nodes?.[0]?.commit?.oid ?? null;
  if (review && !head) unread.push(UNREAD.head);
  const requested = asked || row.reviewers.includes(viewer);
  if (requested && !review) reasons.push("Review angefragt");
  if (review && head && review.commit?.oid !== head) reasons.push("neue Commits seit deinem Review");
  // A head unknown is no review's commit, so it gives no reason.
  if (requested && review && review.commit?.oid === head) reasons.push("Review erneut angefragt");
  if (open.some((authors) => authors.includes(viewer) && awaitsViewer(authors))) reasons.push("Antwort erwartet");
  return { attention: reasons, waiting: Boolean(review) && !requested && !reasons.length && sure(), unread };
}

// One GraphQL request for a list view: one search per section (`s0`, `s1`,
// …), and the login gh runs as.
export function githubListArgs(view) {
  const searches = view.sections.map((_, i) => `s${i}: search(type: ISSUE, first: ${view.limit}, query: $q${i}) { ${PR_FIELDS} }`);
  const vars = view.sections.map((_, i) => `$q${i}: String!`).join(", ");
  const doc = `query(${vars}) {\nviewer { login }\n${searches.join("\n")}\n}`;
  return ["api", "graphql", "-f", `query=${doc}`, ...view.sections.flatMap((s, i) => ["-f", `q${i}=${s.query}`])];
}

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

// gh's answer for githubListArgs (and the GraphQL errors that came with its
// data) → { shape: "prs", sections: [{ name, color, count, fetched,
// limited, skipped, notRead, rows }], viewer, warnings } (color: the
// section's tone as a theme name, SECTION_TONES; muted for a section
// without one).
// A pull request found by two sections shows in the first only; a result
// that is no pull request is counted in skipped; one GitHub sent as null
// for an error at its path is not read, and that error's first line is in
// notRead. A row carries whether the viewer has to act (prAttention), with
// the errors at its path; it is asked for one's review where any search
// that asks for it (askingSearch) found it, not only the one that holds it.
// A duplicate's errors stay warnings: its row is another node's. A
// section's rows on which the viewer has to act come first, in GitHub's
// order, then the others in theirs. A search missing from the answer is
// explained by the error at its alias.
// warnings: the first lines of the errors neither a row nor notRead holds.
export function parseGithubList(json, view, errors = [], pending = null) {
  const seen = new Set();
  const viewer = json?.data?.viewer?.login ?? null;
  const shown = new Set();
  const nodesOf = (i) => (Array.isArray(json?.data?.[`s${i}`]?.nodes) ? json.data[`s${i}`].nodes : []);
  const asking = new Set(view.sections.flatMap((s, i) => (askingSearch(s.query) ? nodesOf(i) : [])).map((pr) => pr?.id).filter(Boolean));
  const sections = view.sections.map((s, i) => {
    const own = ownSearch(s.query);
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
      at.forEach((e) => shown.add(e));
      const row = prRow(pr, Boolean(errorAt(at, [...path, "commits"])));
      const waits = Boolean(pending?.has(pr.id));
      rows.push({ key: pr.id, source: "github", kind: "pr", ...row, ...prAttention(pr, row, viewer, asking.has(pr.id), at, waits), ownByQuery: own, ...(waits ? { threadsPending: true } : {}) });
    });
    // Array's sort keeps the order of rows it ranks alike.
    rows.sort((a, b) => Number(b.attention.length > 0) - Number(a.attention.length > 0));
    // count: how many GitHub found; fetched: how many it sent; rows: those
    // held, each pull request once (in its first section), no other result.
    return {
      name: s.name, color: SECTION_TONES[s.tone] ?? "muted", count: found.issueCount, fetched: found.nodes.length, limited: found.issueCount > found.nodes.length,
      skipped, notRead, rows,
    };
  });
  return { shape: "prs", sections, viewer, warnings: errors.filter((e) => !shown.has(e)).map((e) => firstLine(e.message)).filter(Boolean) };
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

// A sub-issue or a linked pull request as a line (related.js).
function relatedLine(node, kind) {
  const repo = node.repository?.nameWithOwner ?? "";
  const state = lookOf(node.state);
  return {
    kind,
    source: "github",
    repo,
    repoShort: repo.split("/").pop(),
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
function relatedSection(conn, kind, path, errors) {
  if (!conn || !Array.isArray(conn.nodes)) {
    const shown = errorAt(errors, conn ? [...path, "nodes"] : path);
    const error = shown ? `GitHub: ${firstLine(shown.message)}` : "GitHub schickte sie nicht";
    return { section: { count: conn?.totalCount ?? null, sent: 0, cut: false, hidden: 0, error, lines: [] }, shown };
  }
  const lines = conn.nodes.filter((n) => Number.isInteger(n?.number)).map((n) => relatedLine(n, kind));
  const section = {
    count: conn.totalCount ?? lines.length, sent: conn.nodes.length, cut: Boolean(conn.pageInfo?.hasNextPage), hidden: conn.nodes.length - lines.length,
    error: null, lines,
  };
  return { section, shown: null };
}

// The issue's parent as a section of one line, or of none where it has
// none; where GitHub sent none for an error at its path, that error, which
// it shows (`shown`), and no count.
function parentSection(issue, errors) {
  const node = issue.parent;
  if (Number.isInteger(node?.number)) return { section: { count: 1, sent: 1, cut: false, hidden: 0, error: null, lines: [relatedLine(node, "issue")] }, shown: null };
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
export function parseGithubRelated(json, item, errors = []) {
  const issue = json?.data?.repository?.issue;
  if (!issue) throw notFound(errors, item);
  const parents = parentSection(issue, errors);
  const subIssues = relatedSection(issue.subIssues, "issue", RELATED_PATHS.subIssues, errors);
  const prs = relatedSection(issue.closedByPullRequestsReferences, "pr", RELATED_PATHS.prs, errors);
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

// The GitHub source for the board: the name of the site `o` opens, why "nur
// meine" cannot tell one's own items when GitHub did not name the login, and
// per layout of a GitHub view how it loads (`hiddenFor(view)` gives its
// hidden columns) and how a board writes a move; and the items related to an
// issue, its parent, sub-issues and linked pull requests, read with its
// description (related.js says what `related` holds), and a pull request's
// details (pullRequest, the same); and an item's assignment (assign:
// actions/assign.js says what it holds), whose people are read once per repo
// and kept while the board runs (one that fails is not kept). gh runs by the
// path `paths` (toolPaths) finds.
export function makeGithub(paths) {
  const people = readMemo();
  return {
    site: "GitHub",
    noViewer: "GitHub hat nicht gesagt, als wer gh angemeldet ist",
    related: {
      reads: (item) => item.kind === "issue" && Number.isInteger(item.number) && item.repo.includes("/"),
      async load(item, view) {
        const { json, errors } = await gh(paths, githubRelatedArgs(item), what(view, "related"));
        return parseGithubRelated(json, item, errors);
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
        // The list's request, then, for its pull requests with more than
        // FIRST_THREADS threads, the follow-up for them, one call per
        // THREAD_IDS of them (addThreads; one that fails leaves its rows
        // unread). The errors a row or a section shows are not warnings too.
        async load(view, { live = NO_LIVE }) {
          const { json, errors } = await gh(paths, githubListArgs(view), what(view, "list"));
          const result = (pending = null) => {
            const data = parseGithubList(json, view, errors, pending);
            return { data, warnings: data.warnings };
          };
          const ids = moreThreadIds(json, view);
          if (ids.length) live.partial(() => result(new Set(ids)));
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
          return result();
        },
      },
    },
  };
}

// ==== src/sources/index.js ====

// The sources as the Board uses them, by id: each source's module makes its
// own (makeGithub, makeAzure).

export const makeSources = (paths) => ({ azure: makeAzure(paths), github: makeGithub(paths) });

// ==== src/related.js ====

// The items related to an item, which the board reads when its details open
// (on GitHub an issue's parent, its sub-issues and the pull requests linked
// to it, on Azure a work item's parent, its children and linked pull
// requests; the same read brings the item's description beside them), what
// of them a view keeps (keptRelated), the lines the details panel walks when
// it has the keyboard, and the heads of their sections. The description as
// drawn is description.js's. The Board reads them (readRelated) and draws
// them (ui/related.js).
//
// Enter on a line shows its item's details in the panel, a level down (the
// Board's drillLine; Esc goes back up): the Board keeps the levels on the
// panel's keyboard (panelOf), reads each level's related items as it reads
// the selected item's, and names the way down at the panel's top
// (pathLabel).
//
// A source that has related items gives `related: { reads(item), load(item,
// view) }`: reads tells whether the item has any to read (no call); load
// reads them (view: the view the item shows in) into { description, format,
// parents, subIssues, prs, warnings, retry }. description is the item's own
// text as the source has it ("" for none), format how it is written:
// "markdown" (the default) or "html". Each of parents (the item's parent,
// one line at most), subIssues and prs is a section { count (how many the
// source has; null when it did not send the section), sent (how many it
// sent), cut (it has more than it sent), hidden (how many it has that cannot
// be read), hiddenAs (what the details say of those: "ohne Zugriff" where it
// is missing), error (why it sent none; null), lines (those that can be
// read) }; a line { source, kind, number, title, url, state (its label),
// draft, and on GitHub repo, repoShort, color (its chip's theme color) and
// done (dimmed); on Azure type, its color and whether it is done coming from
// the view's states when drawn }. warnings: what the source said besides,
// one line each. retry: a part failed that is to be read again after the
// next refresh.
//
// A source whose pull requests the details panel can go down to gives
// `pullRequest: { reads(item), load(item, view) }` the same way: load
// reads the pull request's details as the PR list has a row's (title,
// state, color, done, draft, author, review, branch; on GitHub its checks
// and assignees too, and warnings: what GitHub said besides), which the
// panel shows as the PR list's details do; the Board keeps them as { pr }
// beside the related items.

// What a view keeps of its related items after a refresh starts: only
// those of the item whose details show (`openKey`, null when none) and of
// the levels the panel went down to from it (`deeper`, their keys), read
// or still being read, so that a refresh reads nothing for them; a failed
// read, or one with a part to read again (retry), is dropped, so that it
// is tried again; `r` reads them again too (the Board's reload).
export function keptRelated(related, openKey, deeper = []) {
  const keys = openKey === null ? [] : [openKey, ...deeper];
  return new Map(keys.flatMap((key) => {
    const entry = related.get(key);
    return entry && !entry.error && !entry.data?.retry ? [[key, entry]] : [];
  }));
}

// The way the panel went down from `root` (the board's selected item) to
// the items `levels`, as its top shows it: "tender#914 › #2217".
export const pathLabel = (root, levels) => [cardLabel(root), ...levels.map((i) => relativeLabel(root, i))].join(" › ");

// The sections of read related items, in the order of their lines: the
// parent first, then the sub-issues, then the linked pull requests.
export const RELATED_SECTIONS = ["parents", "subIssues", "prs"];

// The lines of read related items (`data`, or null while none are read).
export const relatedLines = (data) => (data ? RELATED_SECTIONS.flatMap((name) => data[name].lines) : []);

// The name of the section of `data` that holds `line` (one of its lines,
// as relatedLines gives them); null for none.
export const sectionOf = (data, line) => RELATED_SECTIONS.find((name) => data?.[name]?.lines.includes(line)) ?? null;

// Whether a section came whole, so that what it lacks is not there: no
// error, not cut short, none it could not read.
export const wholeSection = (section) => Boolean(section) && !section.error && !section.cut && !section.hidden;

// The line one step `dir` (+1 down, -1 up) from `line` (an index, or null
// for none) over `count` lines: down from none to the first, up from the
// first to none; the last stays the last.
export function stepLine(line, dir, count) {
  if (!count) return null;
  if (line === null) return dir > 0 ? 0 : null;
  const next = line + dir;
  return next < 0 ? null : Math.min(next, count - 1);
}

// " · erste <sent> von <count>" for a section with more than it sent.
const cutNote = (section) => (section.cut ? ` · erste ${section.sent} von ${section.count}` : "");

// The heads of the sections: the sub-issues' with how many of them are
// done, as the item says (its sub, the one count the board and the details
// share; none where the item has no sub-issues), the pull requests' with
// how many there are.
export const subIssuesHead = (item, section) => `UNTERAUFGABEN${item.sub ? ` · ${item.sub.done}/${item.sub.total}` : ""}${cutNote(section)}`;
export const prsHead = (section) => `VERKNÜPFTE PRS${section.count === null ? "" : ` · ${section.count}`}${cutNote(section)}`;

// ==== src/ui/layer.js ====

// The board layer: how the board finds the stack that shows it in place of
// the shown tab's content, and how it shows that content again.

// ---- layer: the same in leader/main.js, board-button/main.js and board/src/ui/layer.js ----
// (a mod here is one main.js: README, "herdr app"; board.test.mjs checks
// that the copies match.) Its layer shape is in focus-history/main.js too.

// ---- layer shape: the same in leader/main.js, board-button/main.js, focus-history/main.js and board/src/ui/layer.js ----
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
// ---- end layer shape ----

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

// ==== src/ui/tones.js ====

// The tone (a theme name such as "ansi4" or "muted") a label's chip takes,
// by its GitHub color's hue, and an issue type's, by its named color, with
// the color an Epic by its title takes (which items are one: cardType and
// epicLabel in shared.js); the board's colors in a theme, its palette
// (paletteOf); how strong the tints are on a theme without copper's colors;
// and tint, which the rest of the board tints with too.
// Which theme name a status or a state has, its source says (GITHUB_COLORS,
// CATEGORY_COLORS), and a PR list section's, views.json (SECTION_TONES in
// shared.js); the selected look, border and background, is selectedLook in
// helpers.js.
//
// Two paths, chosen once per theme (copperColors), never per color: a theme
// that carries copper's colors for mods (themes/copper-*.json, from
// copper-design) draws in copper's text colors and tinted steps, with orange
// as a hue of its own; any other theme draws in its own colors and tints of
// them (CHIP_ALPHA, HEAD_ALPHA, SELECTED_ALPHA). Everything is a theme name,
// a theme color or a tint of one, so a theme with other colors, or with
// surfaces of its own, changes the board with it.

// How strong a tint is (the alpha byte after #rrggbb), on a theme without
// copper's colors: a chip's background (CHIP_ALPHA, under text in the
// chip's own tone), a column head's and a PR list section head's
// (HEAD_ALPHA, under its name and its muted count, or a section's name
// and count in its tone) and a selected card's or row's (SELECTED_ALPHA,
// under its text and chips). Measured against the copper themes' colors with copper's
// own left out, and against catppuccin-mocha as herdr resolves it: that text
// stays at 4.5:1 or more on every ground the shapes draw it on
// (board.test.mjs), but for a muted chip and dim text on a selected card in
// catppuccin, which the test names. HEAD_ALPHA is bound by the muted count
// on copper-light's chrome: at "11" the weakest head, yellow, gives 4.54:1.
export const CHIP_ALPHA = "1a";
export const HEAD_ALPHA = "11";
export const SELECTED_ALPHA = "14";

// A theme color: #rrggbb, or #rrggbbaa (herdr's translucent surfaces); OPAQUE
// only the first.
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const OPAQUE = /^#[0-9a-f]{6}$/i;
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// `hex` with `alpha`: its first six digits, so a color with alpha of its own
// takes this one instead; anything else gives `fallback` (by default `hex`
// as it is).
export const tint = (hex, alpha, fallback = hex) => (HEX.test(hex ?? "") ? `${hex.slice(0, 7)}${alpha}` : fallback);

// `top` (its first six digits) at `alpha` laid over the opaque `ground`, as
// an opaque #rrggbb: the same color whatever lies under it. `fallback` where
// `top` is no color or `ground` no opaque one.
export function layered(top, alpha, ground, fallback) {
  if (!HEX.test(top ?? "") || !OPAQUE.test(ground ?? "")) return fallback;
  const a = parseInt(alpha, 16) / 255;
  const under = channels(ground);
  return `#${channels(top).map((c, i) => Math.round(c * a + under[i] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
}

// copper's colors for mods that the board takes (copper-design's herdr port
// carries them as copper-<color>-<key> since v0.4.0): of each base color,
// its tinted backgrounds, step 3 at rest and step 4 beside it, and its text
// color (copper-<color>-text), which reads at 4.5:1 or more on both and on
// the theme's background.
//
// A tone's copper color is its ANSI slot's: copper's port lays ansi1 to
// ansi6 out as red, green, yellow, blue, violet and teal, and a bright
// variant counts as its plain one (chipTone), but for ansi11, which stands
// for orange: GitHub's ORANGE takes it (GITHUB_COLORS), a label takes it
// for copper's orange (hueTone), and the mark on a pull request the viewer
// has to act on is drawn in it (markColor). Any other tone (muted, dim) is
// the neutral. COPPER_HUES (shared.js) holds the slots by copper's names.
const ANSI_COPPER = Object.fromEntries(Object.entries(COPPER_HUES).map(([color, tone]) => [tone, color]));
const COPPER_COLORS = [...Object.values(ANSI_COPPER), "neutral"];
const COPPER_KEYS = [3, 4, "text"];
const copperKey = (color, key) => `copper-${color}-${key}`;
const copperColor = (tone) => ANSI_COPPER[tone] ?? ANSI_COPPER[chipTone(tone)] ?? "neutral";

// Whether the theme `t` carries every copper color the board takes, each an
// opaque #rrggbb. One answer for the whole theme: a theme that misses one (a
// copper theme before v0.4.0, without text colors) draws in its own colors
// and their tints throughout.
export const copperColors = (t) => COPPER_COLORS.every((color) => COPPER_KEYS.every((key) => OPAQUE.test(t[copperKey(color, key)] ?? "")));

// Where a label's color turns from copper's red to its orange, as an OKLCH
// hue in degrees: further toward orange than halfway between their text
// colors (about 4 and 50), so GitHub's dark reds (b60205 at 29, d93f0b at
// 36) stay red.
const RED_ORANGE = 40;

// How far apart a tint has to stand from the ground beside it, as OKLab
// distance times 100: the board's own bar for every pair, adopted from
// copper-design's bar for a tint drawn edge to edge with a panel level (its
// tests/test_herdr.py), about one neutral step. copper holds a pair of two
// neutral steps to 1.12:1 in luminance instead, which a neutral head on
// neutral step 3 misses (board.test.mjs names it).
const TINT_APART = 3;

// The tone's copper tint for a background drawn on each of `grounds`
// (opaque colors): step 3, copper's component background at rest, where it
// stands TINT_APART from every one of them, else step 4, also where that one
// does not either (a muted head on copper-light's chrome, which is its
// neutral step 3).
function copperTint(t, tone, grounds) {
  const color = copperColor(tone);
  const rest = t[copperKey(color, 3)];
  return grounds.every((g) => !OPAQUE.test(g ?? "") || apart(rest, g) >= TINT_APART) ? rest : t[copperKey(color, 4)];
}

// The board's colors in the theme `t`, its palette, on the path
// copperColors chooses for it, worked out once per theme object: `hues`, the
// tones a label can take, each with the theme name hueTone measures its hue
// by; `borders`, where between two of them a label's hue turns from the one
// to the other where that is not halfway ([low, high, hue]);
// `named(name)`, the tone of a named color a source gives (an issue type's);
// `text(tone)`, the color of text, lines and state fills in a tone;
// `selected`, a selected card's or row's background; `chip(tone)` and
// `head(tone, ground)`, a chip's and a column head's background;
// `drop(ground)`, a drop target column's background, where `ground` is its
// own; `hueTone(hex)`, the tone of a color from outside the theme (hueTone);
// `mark`, the color of the mark on a pull request the viewer has to
// act on, a PR list's, which no section tone and no check state shares.
const palettes = new WeakMap();
function paletteOf(t) {
  let palette = palettes.get(t);
  if (!palette) {
    palette = remembered(t, copperColors(t) ? copperPalette(t) : tintedPalette(t));
    palettes.set(t, palette);
  }
  return palette;
}

// `fn` answering each `key(...args)` once; without a key, by the first
// argument, refused where fn.length is above one (fn.length counts no
// parameter from the first with a default or a rest on).
export function memo(fn, key) {
  if (!key && fn.length > 1) throw new Error(`memo: ${fn.name || "a function"} of ${fn.length} arguments needs a key`);
  const kept = new Map();
  return (...args) => {
    const k = key ? key(...args) : args[0];
    if (!kept.has(k)) kept.set(k, fn(...args));
    return kept.get(k);
  };
}

// herdr's theme() gives a new object on each call, so this lasts one render.
function remembered(t, palette) {
  const hueAt = new Map(palette.hues.map(([tone, name]) => [tone, oklch(t[name])?.h]));
  return {
    ...palette,
    named: memo(palette.named),
    text: memo(palette.text),
    chip: memo(palette.chip),
    head: memo(palette.head, (tone, ground) => `${tone} ${ground}`),
    hueTone: memo((hex) => nearestHue(palette, hueAt, hex)),
  };
}

// A copper theme's palette. A label takes one of copper's seven hues, as
// the tone ANSI_COPPER gives it, measured by its text color, red below
// RED_ORANGE; a named color stays as its source names it. Text, lines and
// state fills in a tone take its copper color's text color (copperColor). A
// selected card or row stands on the theme's `selected`, copper's own blue
// step for a selected row. A chip stands on its tone's copper tint for what
// a chip stands on, a card (the theme's background) and a selected one; a
// column head on its tone's copper tint for both grounds a head stands on
// (copperTint), a column's chrome and the Sprint's background, so a head
// looks the same on either. A drop target keeps its ground and the accent
// border marks it: its `selected` would match a selected card. The mark
// takes copper's orange (SECTION_TONES leaves it out).
function copperPalette(t) {
  return {
    hues: Object.entries(ANSI_COPPER).map(([tone, color]) => [tone, copperKey(color, "text")]),
    borders: [["ansi1", "ansi11", RED_ORANGE]],
    named: (name) => name,
    text: (tone) => t[copperKey(copperColor(tone), "text")],
    selected: t.selected,
    chip: (tone) => copperTint(t, tone, [t.background, t.selected]),
    head: (tone) => copperTint(t, tone, [t.chrome, t.background]),
    drop: (ground) => ground,
    mark: t[copperKey("orange", "text")],
  };
}

// Any other theme's palette, its own colors and tints of them. A label
// takes one of HUE_TONES; a named color its plain variant (chipTone). Text,
// lines and state fills in a tone take the theme's color of that name,
// "muted" where it has none. A selected card or row stands on the accent
// tinted over the theme's background, opaque, so its chips read the same on
// a column's chrome as on the board; without an accent or a background to
// lay it on, on the theme's `selected`. That one would not do as the rule:
// herdr derives it translucent for a theme that sets none, so a card would
// change with the ground under it, and over a dark background it comes out
// about as `raised`, where a plain chip (chip, helpers.js) vanishes. A chip
// stands on a tint of its tone's color, or `raised` where that cannot be
// tinted. A column head stands on its tone's color tinted over the `ground`
// it stands on, opaque, so a column that changes its own ground (a drop
// target) leaves the head as it is; without an opaque ground, the
// translucent tint; without a color, `raised`. A drop target takes the
// theme's `selected`. The mark takes the theme's foreground, as no hue is
// left for it: each of the six is a section's tone or a check state's, and
// its bright yellow, orange's slot, is its yellow (catppuccin-mocha), stands
// next to it (copper-dark without copper's colors) or reads below 4.5:1
// (copper-light without them, HUE_TONES); the mark's dot and weight set it
// apart.
function tintedPalette(t) {
  const text = (tone) => t[tone] ?? t.muted;
  return {
    hues: HUE_TONES.map((name) => [name, name]),
    borders: [],
    named: chipTone,
    text,
    selected: layered(t.accent, SELECTED_ALPHA, t.background, t.selected),
    chip: (tone) => tint(text(tone), CHIP_ALPHA, t.raised),
    head: (tone, ground) => layered(text(tone), HEAD_ALPHA, ground, tint(text(tone), HEAD_ALPHA, t.raised)),
    drop: () => t.selected,
    mark: t.foreground,
  };
}

// The theme `t`'s palette (paletteOf) by piece. A selected card's or row's
// background is the same in every shape, and the accent border marks it too
// (selectedLook, helpers.js).
export const toneColor = (t, tone) => paletteOf(t).text(tone);
export const selectedBg = (t) => paletteOf(t).selected;
export const chipBg = (t, tone) => paletteOf(t).chip(tone);
export const headBg = (t, tone, ground) => paletteOf(t).head(tone, ground);
export const dropBg = (t, ground) => paletteOf(t).drop(ground);
export const markColor = (t) => paletteOf(t).mark;

export const namedTone = (t, name) => paletteOf(t).named(name);

// The tone of a note's level, which toneColor draws every note the board
// shows in: an error, a warning, a success, information.
export const NOTE_TONES = { error: "ansi1", warning: "ansi3", success: "ansi2", info: "muted" };

// The tones a label can take on a theme without copper's colors: the
// theme's red, green, yellow, blue, violet and teal. Not their bright
// variants (ansi9 to ansi14): in copper-light without copper's colors each
// reads below 4.5:1 as chip text on a selected card (ansi14 2.97, ansi11
// 3.12).
export const HUE_TONES = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];
// Below this OKLCH chroma a color counts as grey: it takes "muted".
export const GREY_CHROMA = 0.03;

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const seen = new Map();

// A color's OKLab lightness and axes [L, a, b], from its first six digits;
// null for no #rrggbb[aa].
function oklab(hex) {
  if (!HEX.test(hex ?? "")) return null;
  const key = hex.slice(0, 7).toLowerCase();
  if (seen.has(key)) return seen.get(key);
  const [r, g, b] = channels(hex).map((c) => linear(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const found = [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
  seen.set(key, found);
  return found;
}

// A color's OKLCH chroma and hue (degrees), from its first six digits; null
// for no #rrggbb[aa].
export function oklch(hex) {
  const lab = oklab(hex);
  if (!lab) return null;
  const [, a, b] = lab;
  return { c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

// How far apart two colors stand: their OKLab distance times 100.
function apart(one, other) {
  const [x, y] = [oklab(one), oklab(other)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// The tone of a color from outside the theme (a GitHub label's): of the
// hues the theme `t`'s palette offers (paletteOf), the one whose color is
// nearest to it by OKLCH hue, but between two hues with a border of their
// own the one on its side of that border; a grey one (GREY_CHROMA), one
// that is no color, or a theme without those colors gives "muted".
export const hueTone = (t, hex) => paletteOf(t).hueTone(hex);

function nearestHue({ hues, borders }, hueAt, hex) {
  const own = oklch(hex);
  if (!own || own.c < GREY_CHROMA) return "muted";
  // How far round from `from` a hue lies, going up.
  const round = (h, from) => (h - from + 360) % 360;
  for (const [low, high, at] of borders) {
    const [from, to] = [hueAt.get(low), hueAt.get(high)];
    if (from === undefined || to === undefined || round(own.h, from) > round(to, from)) continue;
    return round(own.h, from) < round(at, from) ? low : high;
  }
  let best = "muted";
  let distance = Infinity;
  for (const [tone] of hues) {
    const theirs = hueAt.get(tone);
    if (theirs === undefined) continue;
    const d = Math.min(Math.abs(own.h - theirs), 360 - Math.abs(own.h - theirs));
    if (d < distance) [best, distance] = [tone, d];
  }
  return best;
}

// A theme name's plain variant: a bright one (ansi9 to ansi14) becomes its
// HUE_TONES color (ORANGE's ansi11 → ansi3, PINK's ansi13 → ansi5), the rest
// stays. On a theme without copper's colors it is an issue type's chip tone
// for the theme name GITHUB_COLORS gives it (tintedPalette); on a copper
// theme it takes a bright tone to its copper color (copperColor).
export function chipTone(name) {
  const n = /^ansi(9|1[0-4])$/.exec(name ?? "")?.[1];
  return n ? `ansi${Number(n) - 8}` : name;
}

// The tone of the line across the top of a card or row (typeLine,
// helpers.js) in the theme `t`: an Azure work item type's color (`hex`, from
// the project's type definitions) by hue (hueTone), as a label's; a GitHub
// issue type's by its named color (the palette's `named`), as its chip's.
// Null where the type has no color, and for an item without an issue type
// (an Epic by its title alone too): no line.
export function typeLineTone(t, item, hex) {
  if (hex) return hueTone(t, hex);
  return item.typeColor ? paletteOf(t).named(item.typeColor) : null;
}

// The tone of an item's type marker in the theme `t`, or null for a type
// without a color (it keeps the plain chip). An issue type's own color
// (typeColor) wins; an Epic by its title alone takes its "epic" label's
// color (epicLabel), the owner's pick on GitHub, by hue (hueTone), and
// "muted" without such a label.
export function typeTone(t, item) {
  if (item.type) return item.typeColor ? paletteOf(t).named(item.typeColor) : null;
  if (!cardType(item)) return null;
  const label = epicLabel(item);
  return label ? hueTone(t, item.labelColors?.[label]) : "muted";
}

// ==== src/ui/helpers.js ====

// Which tones and tints these helpers take: tones.js.

// Settings that last across reloads: the shown source ("source"), each
// source's tab ("tab:<source>"), each team's view ("teamView:<context>"),
// "nur meine" ("mine"), each view's hidden columns ("hidden:<view>"), a
// Sprint's folded stories ("folded:<view>", readStoredFolds) and each
// view's last good data ("board:data:<view>", loading.js). A full or
// missing localStorage keeps them for this session only.
export const store = {
  get(key) {
    const v = store.text(key);
    try {
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    store.setText(key, JSON.stringify(value));
  },
  text(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  // Null, or why the store refused the text.
  setText(key, text) {
    try {
      localStorage.setItem(key, text);
      return null;
    } catch (e) {
      return firstLine(e?.message ?? e) || "refused";
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Gone with the session; see above.
    }
  },
  keys() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => typeof k === "string");
    } catch {
      return [];
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

// GPUI's own 2 px (DRAG_THRESHOLD) is less than a tap on the Deck's touch
// screen may move; 8 px is GTK's drag threshold and Android's touch slop.
export const CLICK_SLOP = 8;

export const inPlace = (from, to) => !from || !to || Math.hypot(to.x - from.x, to.y - from.y) <= CLICK_SLOP;

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

// menuKey takes a menu's keys.
export function menu(t, { id, rowId, width, title, rows, at, pick, head = [], digits = true, from = 0, count = from + rows.length, heads = [], wheel = null, foot = [] }) {
  const below = count - from - rows.length;
  const share = (n) => `${((100 * n) / count).toFixed(2)}%`;
  const row = (kids, n) =>
    h_flex()
      .id(`${rowId}-${from + n}`)
      .px(8)
      .py(6)
      .gap(8)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .when(from + n === at, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => pick(from + n, cx))
      .when(digits, (el) => el.child(div().w(14).text_size(11).text_color(t.dim).child(from + n < 9 ? String(from + n + 1) : "")))
      .children(kids);
  const heading = (text, n) => div().id(`${id}-head-${from + n}`).px(8).pt(n ? 8 : 4).pb(2).truncate().text_size(11).text_color(t.muted).child(text);
  const list = v_flex()
    .id(`${id}-rows`)
    .relative()
    .gap(2)
    .when(Boolean(wheel), (el) => el.on_scroll_wheel((e, cx) => wheel(wheelMove(e), cx)))
    .children(rows.flatMap((kids, n) => [...(heads[n] ? [heading(heads[n], n)] : []), row(kids, n)]))
    .when(count > rows.length, (el) => el.child(
      div().id(`${id}-thumb`).absolute().right(0).top(share(from)).w(3).h(share(rows.length)).rounded(2).bg(t.muted).opacity(0.6),
    ));
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
      .child(div().px(8).py(6).text_size(12).text_color(t.muted).child(`${title} · Enter · Esc`))
      .children(head)
      .child(list)
      .when(below > 0, (el) => el.child(div().id(`${id}-below`).px(8).text_size(11).text_color(t.dim).child(`↓ ${below} weitere`)))
      .children(foot),
  );
}

// A length herdr measured, or a wheel's move, in the script's pixels: herdr
// reports them in the window's pixels and scales a script's lengths by its
// zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
export const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

export const wheelMove = (e) => -unzoomed(e.delta?.y ?? 0);

// How many rows a menu with a filter shows at once (menuWindow).
const MENU_ROWS = 10;
// How far the wheel moves such a menu's window by one row: about a row's
// height in the script's pixels.
export const MENU_ROW_PX = 28;

// The window of a menu with a filter (the assignee picker, the command menu,
// the sprint picker) over the rows of `list` the filter leaves: MENU_ROWS at
// once from m.top, the marked row m.at (-1 for none). Its window follows the
// mark where a key moves it (followMark); the wheel moves it alone
// (menuWheel). menuWindow keeps both within the rows and gives the rows it
// shows (`shown`) and what menu() takes for them.
export function menuWindow(m, list) {
  const count = list.length;
  m.at = Math.max(-1, Math.min(m.at, count - 1));
  m.top = Math.max(0, Math.min(m.top, count - MENU_ROWS));
  const wheel = (by, cx) => {
    menuWheel(m, by, count);
    cx.notify();
  };
  return { shown: list.slice(m.top, m.top + MENU_ROWS), from: m.top, count, at: m.at, wheel };
}

// The window moved so that the marked row shows, after a key moved the
// mark.
export function followMark(m, count) {
  if (m.at >= 0 && m.at < m.top) m.top = m.at;
  if (m.at >= m.top + MENU_ROWS) m.top = m.at - MENU_ROWS + 1;
  m.top = Math.max(0, Math.min(m.top, count - MENU_ROWS));
}

// The wheel over the window (menu's `wheel`): `by` pixels down (up for
// less than 0) move it a row per MENU_ROW_PX, what is left kept for the
// next move (m.wheel), within the rows (at their end nothing is kept); the
// mark stays where it is.
export function menuWheel(m, by, count) {
  m.wheel = (m.wheel ?? 0) + by;
  const step = Math.trunc(m.wheel / MENU_ROW_PX);
  const top = Math.max(0, Math.min(m.top + step, count - MENU_ROWS));
  m.wheel = top === m.top + step ? m.wheel - step * MENU_ROW_PX : 0;
  m.top = top;
}

// A row's name in a menu with a fuzzy filter (the command menu, the sprint
// picker), the filter's letters in it (`at`, fuzzyRank) in the accent
// color.
export function markedName(t, name, at) {
  const hits = new Set(at);
  const runs = [];
  Array.from(name).forEach((ch, i) => {
    const hit = hits.has(i);
    if (runs.length && runs.at(-1).hit === hit) runs.at(-1).text += ch;
    else runs.push({ hit, text: ch });
  });
  return h_flex()
    .flex_1()
    .min_w(0)
    .overflow_hidden()
    .children(runs.map((r) => div().flex_none().text_color(r.hit ? t.accent : t.foreground).when(r.hit, (el) => el.font_semibold()).child(r.text)));
}

// A key in a menu with a filter (every key but Esc, which the Board
// keeps): up/down, ctrl-j/k and ctrl-n/p mark a row of `count`, the
// window following (followMark), and are taken; the rest is the filter's
// (Enter: its submit).
export function filterMenuKey(e, cx, m, count) {
  const k = e.key;
  const ctrl = e.modifiers?.control;
  const by = k === "down" || (ctrl && (k === "j" || k === "n")) ? 1 : k === "up" || (ctrl && (k === "k" || k === "p")) ? -1 : 0;
  if (!by) return;
  cx.stop_propagation();
  m.at = Math.max(0, Math.min(m.at + by, count - 1));
  followMark(m, count);
  cx.notify();
}

// A card's line of who it is assigned to (by name), in every shape alike;
// its callers draw it where the item has assignees.
export const assigneeText = (t, item) => div().text_size(11).text_color(t.dim).child(item.assignees.join(", "));

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

// A menu with a filter (the command menu, the assignee picker, the sprint
// picker): opens the dialog `m` ({ kind, view, … }) as b.modal with its
// filter, an InputState with `placeholder` made for it (m.input; field and
// textField "filter", inputFocused, filter; at, the marked row; top and
// wheel, its window). Enter in the filter picks the marked row (pick(i,
// cx)). When it opens and at each change of the filter, mark() marks the
// row startAt(m) gives and brings the window, from the top, to it
// (followMark over count(m) rows); it returns mark, for a menu whose rows
// come later.
export function openFilterMenu(b, m, { placeholder, count, startAt, pick }, cx) {
  const mark = () => {
    m.at = startAt(m);
    m.top = 0;
    followMark(m, count(m));
  };
  const input = InputState.new({ placeholder });
  Object.assign(m, { input, field: "filter", filter: "", wheel: 0 });
  mark();
  wireTextField(b, m, input, "filter", (cx) => pick(m.at, cx));
  input.on("change", (_e, cx) => {
    m.filter = input.value();
    mark();
    cx.notify();
  });
  b.modal = m;
  input.focus();
  cx.notify();
  return mark;
}

// Such a menu whose rows come from a read (the assignee picker, the
// sprint picker): openFilterMenu, then read(), whose rows land in m.list
// (null until then), marked when they come (its mark). A read that fails
// sets m.error and m.list as failed(e) gives them ({ error, list }) and
// says so as a toast titled `title`.
export function openReadMenu(b, m, { read, failed, title, ...menu }, cx) {
  Object.assign(m, { list: null, error: null });
  const mark = openFilterMenu(b, m, menu, cx);
  cx.spawn(async (cx) => {
    try {
      m.list = await read();
    } catch (e) {
      ({ error: m.error, list: m.list } = failed(e));
      notify({ title, body: m.error, level: "error" });
    } finally {
      mark();
      cx.notify();
    }
  });
}

// Such a menu's head: its filter, and a read's error where it failed; and
// a line of text under its rows (menuNote).
export const filterMenuHead = (t, m) => [
  fieldFrame(t, m, "filter", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
  ...(m.error ? [menuNote(t, m.error, toneColor(t, NOTE_TONES.error))] : []),
];
export const menuNote = (t, text, color, size = 12) => div().px(8).text_size(size).text_color(color).child(text);

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

// The detail panel's width, its one home, from the number of columns that
// share the rest of the board area with it (its shape's columnCount; none
// for a list): a third of that area (the row it shares with the view's
// content), and no narrower than one of those columns, as a share of that
// area (gaps and padding left out). The pixel bounds DETAIL_MIN_W and
// DETAIL_MAX_W come last, so a wide area's 720 px can leave it narrower
// than a column.
export const DETAIL_MIN_W = 420;
export const DETAIL_MAX_W = 720;
export const detailWidth = (columns) => `${(100 * (columns > 0 ? Math.max(1 / 3, 1 / (columns + 1)) : 1 / 3)).toFixed(2)}%`;

// A section of the detail panel: its frame (sectionFrame), a title
// (sectionTitle) over its rows.
// A detail section's padding and the gap between its rows; the related
// items' block (ui/related.js) lays its rows out by them too.
export const FRAME = { px: 18, py: 12, gap: 6 };
export const sectionFrame = (t) => v_flex().px(FRAME.px).py(FRAME.py).gap(FRAME.gap).border_b(1).border_color(t.border);
export const sectionTitle = (t, title) => div().text_size(11).text_color(t.muted).child(title);
export const detailSection = (t, title, ...kids) => sectionFrame(t).child(sectionTitle(t, title)).children(kids);

// The detail panel's section of a pull request's checks (checksSummary),
// in their state's color.
export const checksSection = (t, checks) => detailSection(t, "CHECKS", div().text_color(checkColor(t, checks.state)).child(checks.text));

// A note of the detail panel, under its sections: `text` in its note
// `level`'s tone (NOTE_TONES), with the id `id`.
export const detailNote = (t, id, text, level) => div().id(id).px(18).py(8).text_size(12).text_color(toneColor(t, NOTE_TONES[level])).child(text);

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

// The color of a check state: its note level's tone (NOTE_TONES), dim for
// another.
const CHECK_TONES = { failed: NOTE_TONES.error, pending: NOTE_TONES.warning, passed: NOTE_TONES.success };
export const checkColor = (t, state) => toneColor(t, CHECK_TONES[state] ?? "dim");

// The detail panel's status pill: `label` on its tone `color`'s color
// (toneColor); a click opens the status menu (`open(cx)`).
export function statusPill(t, label, color, open) {
  return div()
    .id("status-pill")
    .px(10)
    .py(2)
    .rounded(12)
    .text_size(12)
    .font_semibold()
    .cursor_pointer()
    .bg(toneColor(t, color))
    .text_color(t.background)
    .on_click((_e, cx) => open(cx))
    .child(`${label} ▾`);
}

// A column's color (a column of a board or a Sprint, a status menu's
// target): its tone's color (toneColor).
export const columnColor = (t, col) => toneColor(t, col.color);

// A column's head, on a tint of its color for the `ground` it stands on
// (headBg): its color as a dot, its name and `count`.
export const columnHead = (t, col, count, ground) =>
  h_flex()
    .gap(6)
    .px(8)
    .py(4)
    .rounded(6)
    .items_center()
    .bg(headBg(t, col.color, ground))
    .child(div().size(9).flex_none().rounded(5).bg(columnColor(t, col)))
    .child(div().flex_1().min_w(0).truncate().font_semibold().child(col.name))
    .child(div().flex_none().text_size(12).text_color(t.muted).child(count));

// A card's left edge: a narrow bar in its column's color, as tall as the
// card's content beside it.
export const CARD_EDGE = 3;
export const cardEdge = (t, col) => div().w(CARD_EDGE).flex_none().rounded(2).bg(columnColor(t, col));

// A thin line across the top of a card or row in its type's color
// (typeLineTone: `hex`, an Azure type's color, or a GitHub issue type's),
// laid over its top edge, `inset` from each side (a rounded card's corner);
// null where its type has no color. The card or row it stands in is
// relative(), so it is placed in that one.
export function typeLine(t, item, hex, inset = 0) {
  const tone = typeLineTone(t, item, hex);
  if (!tone) return null;
  return div().id("type-line").absolute().top(0).left(inset).right(inset).h(2).rounded(1).bg(toneColor(t, tone));
}

// A card's or row's look as selected or not, in every shape alike, for an
// element's map(): a selected one has the accent border and selectedBg; one
// that is not has the border `rest` and the background `restBg` (none: it
// keeps its own).
export const selectedLook = (t, selected, rest, restBg = null) => (el) =>
  el.border_color(selected ? t.accent : rest).when(selected || Boolean(restBg), (e) => e.bg(selected ? selectedBg(t) : restBg));

// A card's chip: `text` in `fg` on `bg`.
export const chip = (t, text, fg = t.muted, bg = t.raised) => div().px(7).rounded(9).text_size(11).text_color(fg).bg(bg).child(text);

// A state as a chip, in the theme's background on its color: `color` where
// its source names one (GitHub's lines), else its state's in the view's
// `data` (Azure; kinds/states.js), muted before the view is read; "ohne
// Status" for none.
export const stateChip = (t, data, state, color = null) =>
  chip(t, state ?? "ohne Status", t.background, toneColor(t, color ?? (data ? stateColor(data, state) : "muted")));

// A chip in a `tone` (a theme name): `text` in the tone's color
// (toneColor) on the tone's chip background (chipBg).
export const toneChip = (t, text, tone) => chip(t, text, toneColor(t, tone), chipBg(t, tone));

// A card's chip for its label `name`, in the label's color brought onto the
// theme (hueTone).
export const labelChip = (t, item, name) => toneChip(t, name, hueTone(t, item.labelColors?.[name]));

// A card's chip for its type (cardType), in its color (typeTone); a type
// without one keeps the plain chip in the foreground. Null for no type.
export function typeChip(t, item) {
  const type = cardType(item);
  if (!type) return null;
  const tone = typeTone(t, item);
  return tone ? toneChip(t, type, tone) : chip(t, type, t.foreground);
}

// A card's chip for its session (linkedSession): what its agent does.
export const sessionChip = (t, session) => chip(t, AGENT_STATUS[session.status] ?? "Sitzung", t.background, t[session.status] ?? t.idle);

export function priorityChip(t, item) {
  if (!item.priority) return null;
  return toneChip(t, item.priority.name, namedTone(t, item.priority.tone)).id("priority").flex_none();
}

// `kids`: the key, on a story its fold and type too.
export function cardHead(t, kids, item) {
  const priority = priorityChip(t, item);
  return h_flex().gap(6).items_center().children(kids).when(Boolean(priority), (el) => el.child(div().flex_1()).child(priority));
}

// `parent`: partOfText, or null where the card names none.
export const showsMeta = (item, parent) => Boolean(item.milestone || parent);
export function cardMeta(t, item, parent) {
  if (!showsMeta(item, parent)) return null;
  return h_flex()
    .id("card-meta")
    .gap(8)
    .items_center()
    .min_w(0)
    .when(Boolean(item.milestone), (el) => el.child(toneChip(t, item.milestone, "muted").id("milestone").flex_none()))
    .when(Boolean(parent), (el) => el.child(div().id("parent").flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(parent)));
}

// `pending`: a write of the card is under way.
export const cardEnd = (t, item, session, pending) => [
  ...(session ? [sessionChip(t, session).flex_none()] : []),
  ...(pending ? [div().flex_none().text_size(11).text_color(t.dim).child("speichert …")] : []),
  ...(item.assignees.length ? [assigneeText(t, item).min_w(0).truncate()] : []),
];

export const footLines = (chips, progress, ends) => ({ chips: chips > 0 || (!progress?.total && ends > 0), progress: Boolean(progress?.total) });

export function cardFoot(t, chips, progress, end) {
  const shows = footLines(chips.length, progress, end.length);
  const bar = shows.progress ? progressLine(t, progress, end) : null;
  return [shows.chips ? chipLine(chips, bar ? [] : end) : null, bar].filter(Boolean);
}

function chipLine(chips, end) {
  return h_flex().id("card-chips").gap(5).items_center().child(h_flex().flex_1().min_w(0).gap(5).flex_wrap().items_center().children(chips)).children(end);
}

export const PROGRESS_SEGMENTS = 30;
export const PROGRESS_TONE = "ansi2";

export function progressLine(t, progress, end) {
  if (!progress?.total) return null;
  const { done, total } = progress;
  const on = toneColor(t, PROGRESS_TONE);
  const bar = total <= PROGRESS_SEGMENTS
    ? h_flex().id("progress-bar").flex_1().min_w(40).h(6).items_stretch().gap(2).children(Array.from({ length: total }, (_, i) => div().flex_1().rounded(1).bg(i < done ? on : t.border)))
    : div().id("progress-bar").flex_1().min_w(40).h(6).rounded(1).bg(t.border).child(div().h(6).w(`${((100 * done) / total).toFixed(2)}%`).rounded(1).bg(on));
  const number = (text) => div().flex_none().text_size(11).text_color(t.muted).child(text);
  return h_flex().id("card-progress").gap(8).items_center().child(number(`${done} / ${total}`)).child(bar).child(number(`${Math.floor((100 * done) / total)} %`)).children(end);
}

// ==== src/kinds/backlog.js ====

// A team's backlog: its rows in backlog order, the item with a key, a state
// change laid over the data, what a new work item may be, and the
// backlog's warnings. backlogList (sources/azure/backlog.js) builds the data.

// The work item with `key`, or null.
export const findBacklogItem = (data, key) => data?.rows.find((r) => r.key === key) ?? null;

// The data with the item `key` in `state`.
export const withBacklogState = (data, key, state) => withBacklogItem(data, key, { state });

// The data with the item `key`'s fields set to those of `patch`.
export const withBacklogItem = (data, key, patch) => ({ ...data, rows: data.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

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

// The warnings of a backlog: an order it cannot check (no order field),
// ids its query did not find, and a backlog longer than one query reads.
export function backlogWarnings(data) {
  const { missing } = data.meta;
  return [
    ...(data.meta.orderField ? [] : ["Reihenfolge ungeprüft: Azure nannte kein Order-Feld"]),
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
// move, a work item's state change, a create, a parent link and an
// assignment are written so.

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
//   parent, "assign" with the logins and whom), and its key where that
//   is not w.key (a create's, whose w.key only keeps one create at a
//   time). A write replaces or drops only the
//   item's open outcome of its own kind, so a move's report waits through
//   a state change and the other way round;
// - w.texts: pending() and landed() say how it goes, unclear leads the
//   warning, refused(why, earlier) the error (earlier: an outcome of the
//   item's write of this kind is still open), landedBut(why) a landed write
//   whose follow-up failed; toasts: the toasts' titles, { unclear (also a
//   landed write whose follow-up failed), refused } ("Status von AB#3",
//   "Status von AB#3 nicht geändert" by default);
// - w.again: refresh after a write that landed too; w.againOnRefusal:
//   after one that was refused too (what it met may have been out of date).
// A write that landed or was refused refreshes the view too while an open
// outcome of the item, of any kind, remains: the refresh tells it, so
// it does not wait for the timer. A refresh follows only while the view
// stands (viewStands).
export function writeAtOnce(b, view, w, cx) {
  const st = b.state(view.id);
  const { key, label } = w;
  const openKey = w.open.key ?? key;
  const same = (u) => u.key === openKey && u.kind === w.open.kind;
  const toasts = w.texts.toasts ?? { unclear: `Status von ${label}`, refused: `Status von ${label} nicht geändert` };
  if (st.pending[key]) return b.say(`${label} wird noch gespeichert`, "info", cx);
  if (st.saved) return refuseOnSaved(b, view, cx);
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
      if (followed && current && (w.againOnRefusal || openOf(st, key))) b.refresh(current, cx);
    }
  }
}

// The saved state may be long out of date: no write goes against it, and
// the person makes it again once a read replaced it. That read runs from
// the moment the saved state shows; one that failed starts again here.
export const SAVED_WRITE = "Gezeigt ist der gespeicherte Stand: erst nach dem Neuladen noch einmal";
function refuseOnSaved(b, view, cx) {
  b.say(SAVED_WRITE, "info", cx);
  restartRead(b, view, cx);
}

export function restartRead(b, view, cx) {
  const { current } = viewStands(b, view);
  if (current && !b.state(view.id).loading) b.refresh(current, cx);
}

// Whether an outcome of the item `key`, of any kind, is still open.
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

// ==== src/actions/assign.js ====

// Assigning an item to one person, or to no one: the change shown at once
// and written by its source (its assign.write), as writeAtOnce writes, and
// after a refresh whom the items of unclear assignments have. A source that
// assigns has `assign`: { refuse(item) (why the item cannot be assigned
// there, or null), people(item, view) (whom the picker offers: { me,
// people, note }, persons { login, name, id?, me? }; kept per repo or team
// by the source), fallbackMe() (the "Ich" it can write without that list,
// or null), write(view, item, person) (makes `person` the only assignee,
// null no one; → { names, logins } as the answer names them) }. How a
// shape finds and changes its items' assignees (`how`): its assign, which
// ui/shapes/index.js describes. The picker is ui/modals/assign.js.

// Who is assigned, as a notice says it.
export const assignedText = (names) => (names.length ? `${names.join(", ")} zugewiesen` : "niemandem zugewiesen");
// A person as the board names one before an answer named them.
const personText = (person) => (person ? personName(person) ?? "ich" : "niemand");
const same = (a, b) => (a ?? []).join("\n") === (b ?? []).join("\n");

// Makes `person` the only assignee of the item `key` (null: no one) at
// once and writes it; an item that has exactly them already sends
// nothing. Where the write landed, the item shows whom the answer names;
// a refusal sets the assignees back, unless a refresh has read others
// since.
export function assignAtOnce(b, view, key, person, cx) {
  const st = b.state(view.id);
  const how = b.shape(view).assign;
  const item = how.find(st.data, key);
  if (!item) return b.say("Den Eintrag gibt es nicht mehr", "warning", cx);
  const label = itemLabel(item);
  const before = { assignees: item.assignees ?? [], assigneeLogins: item.assigneeLogins ?? [] };
  const logins = person ? (person.login ? [person.login] : null) : [];
  if (logins && same(logins, before.assigneeLogins)) return;
  const after = { assignees: person ? [personText(person)] : [], assigneeLogins: logins ?? [] };
  const who = personText(person);
  let answer = null;
  writeAtOnce(b, view, {
    key,
    label,
    apply: () => (st.data = how.withItem(st.data, key, after)),
    write: async () => (answer = await b.sources[item.source].assign.write(view, item, person)),
    landed: () => (st.data = how.withItem(st.data, key, { assignees: answer.names, assigneeLogins: answer.logins })),
    undo() {
      const now = how.find(st.data, key);
      if (now && same(now.assignees, after.assignees) && same(now.assigneeLogins, after.assigneeLogins)) st.data = how.withItem(st.data, key, before);
    },
    open: { kind: "assign", logins, who },
    texts: {
      pending: () => `${label} → ${who} …`,
      landed: () => `${label} ist jetzt ${assignedText(answer.names)}`,
      unclear: `${label} → ${who}`,
      refused: (why, earlier) =>
        (earlier ? `${label} → ${who} nicht gespeichert: ${why}` : `${label} bleibt ${before.assignees.length ? assignedText(before.assignees) : "ohne Zuweisung"}: ${why}`),
      toasts: { unclear: `Zuweisung von ${label}`, refused: `Zuweisung von ${label} nicht geändert` },
    },
  }, cx);
}

// Whom the items of settled unclear assignments (`due`, of kind "assign")
// have in the new data (`how`, the shape's assign), one line each: the one
// they were set to (info), others (warning), or not in the view any more
// (warning). An assignment to az's "me" whose login was unknown says
// whom the item has.
export function unclearAssignLines(due, data, how) {
  return due.map((u) => {
    const now = how.find(data, u.key);
    if (!now) return { text: `${u.label} ist nach dem Neuladen nicht ${how.where}`, warn: true };
    const has = `${u.label} ist nach dem Neuladen ${assignedText(now.assignees ?? [])}`;
    if (!u.logins || same(now.assigneeLogins, u.logins)) return { text: has, warn: false };
    return { text: `${has}, nicht ${u.logins.length ? u.who : "niemandem"}`, warn: true };
  });
}

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

// The key a create is written under: one create at a time per view (an
// unclear one's outcome is kept under a key of its own, createOpenKey).
export const CREATE_KEY = "create";

// The key of the Azure work item `id` (itemKey).
const workItemKey = (id) => itemKey({ source: "azure", kind: "workitem", number: id });

// The key the open outcome of one create is kept under, each its own, so
// that a later create replaces none.
let creates = 0;
const createOpenKey = () => `${CREATE_KEY}:${++creates}`;

// Creates a work item of `type` with `title`; a child type (type.child)
// goes under `parent`. Nothing shows before Azure names the id; then the
// backlog is read again and the new item, where the level holds its type,
// is chosen once that refresh has it (Board.chooseWanted). A child, which
// is no item of the level, is linked to its parent next (linkParent). A
// refusal reads the backlog again too, with settings read afresh (the
// source drops them): what the create met may have been out of date.
export function createItem(b, view, { type, title, parent }, cx) {
  const st = b.state(view.id);
  const label = `„${title}“`;
  const under = type.child && parent ? parent : null;
  const where = under ? ` unter ${itemLabel(under)}` : "";
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
    open: {
      kind: "create", key: createOpenKey(), title, type: type.name, child: Boolean(under),
      parent: under?.number ?? null, parentLabel: under ? itemLabel(under) : null,
    },
    again: true,
    againOnRefusal: true,
    texts: {
      pending: () => `${type.name} ${label}${where} wird angelegt …`,
      landed: () => (under ? `${workItemKey(id)} ${label} angelegt; wird unter ${itemLabel(under)} gehängt …` : `${workItemKey(id)} ${label} angelegt`),
      // A child is no item of the backlog, so no refresh shows it; the
      // refresh's check (unclearCreateLines) says whether it is there.
      unclear: under
        ? `${type.name} ${label} unter ${itemLabel(under)} anlegen (der Backlog zeigt keine ${type.name}s: vor einem neuen Versuch in Azure nachsehen; mit ${itemLabel(under)} ist es noch nicht verknüpft)`
        : `${type.name} ${label} anlegen`,
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

// How the settled unclear creates `due` (of kind "create") ended up, one
// line each, by asking Azure for the work items of each one's project,
// type and title that I created today (the loader's findCreated); for a
// child, only those that hang under no parent yet count, since its link
// was never made. Exactly one is taken for the create (info; a child's
// line adds that it hangs under nothing yet, a warning), none means it did
// not land, several are said as they are, a failed question says that it
// could not be checked (warnings). Nothing is guessed from the rows:
// another item of the same title may be there.
export async function unclearCreateLines(b, view, due) {
  const loader = b.loader(view);
  return Promise.all(due.map(async (u) => {
    const head = `${u.type} ${u.label}`;
    let ids;
    try {
      const found = await loader.findCreated(view, { type: u.type, title: u.title, child: u.child });
      ids = found.filter((i) => !u.child || i.parent === null).map((i) => i.number);
    } catch (e) {
      return { text: `${head}: ob es angelegt ist, ließ sich nicht prüfen (${errorText(e)}); vor einem neuen Versuch in Azure nachsehen`, warn: true };
    }
    if (ids.length === 1) {
      const key = workItemKey(ids[0]);
      if (u.child) return { text: `${head} ist angelegt (${key}), hängt aber nicht unter ${u.parentLabel}`, warn: true };
      return { text: `${head} ist angelegt (${key})`, warn: false };
    }
    if (!ids.length) return { text: `${head} ist nicht angelegt: Azure kennt kein Work Item dieses Titels, das ich heute angelegt habe`, warn: true };
    return { text: `${head}: Azure kennt ${ids.length} Work Items dieses Titels, die ich heute angelegt habe (${ids.map(workItemKey).join(", ")}); welches es ist, sagt das Board nicht`, warn: true };
  }));
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

// ==== src/ui/modals/assign.js ====

// The assignee picker: whom the selected item is assigned to, one person or no
// one, as a menu (helpers.js menu, without digits: typing goes to the filter).
// Its rows are "Ich", "niemand", then the people its source offers (the repo's
// assignable people on GitHub, the team's members on Azure), narrowed by a
// filter that has the keyboard; up/down (or ctrl-j/k, ctrl-n/p) mark a row,
// Enter or a click assigns it (actions/assign.js). Its window shows
// MENU_ROWS rows, follows the mark, and the mouse wheel moves it
// (helpers.js: openReadMenu, menuWindow). Which row is marked when the rows
// come and after each change of the filter: where the people were read and
// "Ich" is among them, the first row the filter leaves that is no "niemand",
// and "niemand" only where it is all that is left; else (the people could
// not be read, or GitHub named no viewer) none, so that Enter assigns
// nothing until a row is chosen. Board.openAssign opens it as b.modal = {
// kind: "assign", view, key, label, and openReadMenu's fields, list being {
// me, people, note } }.
// Where the people cannot be read, it says so in the dialog and as a toast,
// and offers what its source can write without them.

// The rows the filter leaves: { text, sub, person } ("Ich" carries its
// name as `sub`; a person their login), each word of the filter in its
// text, sub or login (wordsMatch).
export function assignRows(list, filter) {
  if (!list) return [];
  const rows = [
    ...(list.me ? [{ text: "Ich", sub: list.me.name, person: list.me }] : []),
    { text: "niemand", sub: null, person: null },
    ...list.people.map((p) => ({ text: p.name, sub: p.login, person: p })),
  ];
  return rows.filter((r) => wordsMatch([r.text, r.sub, r.person?.login], filter));
}

const rowsOf = (m) => assignRows(m.list, m.filter);

// The row marked when the rows come or the filter changes (-1 for none),
// by the rule in the header.
function startAt(m) {
  if (m.error || !m.list?.me) return -1;
  const rows = rowsOf(m);
  const person = rows.findIndex((r) => r.person);
  return person >= 0 ? person : rows.length - 1;
}

// Assigns the row at `i`, where there is one, and closes the dialog.
function assignPick(b, m, i, cx) {
  const row = rowsOf(m)[i];
  if (!row) return;
  b.closeModal(cx);
  assignAtOnce(b, m.view, m.key, row.person, cx);
}

export const assignModal = {
  // Opens the picker for the view's selected item, or says why it cannot
  // be assigned; then asks its source for the people (kept there).
  open(b, view, cx) {
    const item = b.selected(view);
    if (!item) return;
    const source = b.sources[item.source].assign;
    const why = source.refuse(item);
    if (why) return b.say(why, "info", cx);
    const m = { kind: "assign", view, key: item.key, label: itemLabel(item) };
    openReadMenu(b, m, {
      placeholder: "Filter: Name oder Login",
      count: (m) => rowsOf(m).length,
      startAt,
      pick: (i, cx) => assignPick(b, m, i, cx),
      read: () => source.people(item, view),
      failed: (e) => ({ error: `Wer zuweisbar ist, ließ sich nicht lesen: ${report(e)}`, list: { me: source.fallbackMe(), people: [], note: null } }),
      title: "Zuweisen: Personen nicht gelesen",
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, rowsOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const rows = rowsOf(m);
    const { shown, ...win } = menuWindow(m, rows);
    const message = !m.list ? "lädt …" : !rows.length ? "Niemand passt zum Filter" : null;
    return menu(t, {
      id: "assign",
      rowId: "assign-row",
      width: 420,
      title: `Zuweisen · ${m.label}`,
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => [
        div().flex_none().text_color(r.person ? t.foreground : t.muted).child(r.text),
        ...(r.sub ? [div().min_w(0).truncate().text_size(11).text_color(t.dim).child(r.sub)] : []),
      ]),
      ...win,
      pick: (i, cx) => assignPick(b, m, i, cx),
      foot: [...(message ? [menuNote(t, message, t.muted)] : []), ...(m.list?.note ? [menuNote(t, `Personen: ${m.list.note}`, t.dim, 11)] : [])],
    });
  },
};

// ==== src/ui/modals/columns.js ====

// The column menu: every column of a board view, shown or hidden, walked
// with j/k; Enter, a digit or a click hides or shows one, and the menu stays
// open until Esc. The command menu's "Spalten…" opens it (Board.openColumns)
// as b.modal = { kind: "columns", view, at }; it reads the columns from the
// view's data as they are now, so a toggle shows at once.

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
  open(b, view, cx) {
    b.modal = { kind: "columns", view, at: 0 };
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "columns",
      rowId: "column",
      width: 320,
      title: "Spalten zeigen",
      at: m.at,
      pick: (i, cx) => toggleAt(b, m, i, cx),
      rows: columnsOf(b, m).map((c) => [
        div().w(14).text_color(t.foreground).child(c.hidden ? "" : "✓"),
        div().size(9).flex_none().rounded(5).bg(columnColor(t, c)),
        div().flex_1().min_w(0).truncate().text_color(c.hidden ? t.muted : t.foreground).child(c.name),
        div().flex_none().text_size(11).text_color(t.dim).child(c.count === null ? "" : String(c.count)),
        div().w(80).flex_none().text_size(11).text_color(t.dim).child(!b.shape(m.view).canHide(c) ? "immer gezeigt" : c.hidden ? "ausgeblendet" : "gezeigt"),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, columnsOf(b, b.modal).length, (i, cx) => toggleAt(b, b.modal, i, cx)),
};

// ==== src/scroll.js ====

// How the details block scrolls: the one home of its offset. A script
// cannot set a scroll area's offset (a ScrollHandle reads it and reveals a
// child, with the smallest scroll needed), so the board scrolls the block
// itself: it keeps the offset in the related items' state (`ui`:
// ui/related.js, relatedState) with the heights of the window and the
// content as measured (`viewport`, `content`), shifts the content up by it,
// and draws the position as a thumb. All lengths are the script's pixels
// (measured ones divided by herdr's zoom: ui/related.js).
//
// A move by a page or end key glides: the content and the thumb carry herdr's
// transition of `top` at every draw (motionOf), GLIDE while the block stands
// where such a key put it (`glideTo`: the heights it was measured at then;
// every other mover drops it, and only a change of the heights could move the
// offset besides), else a zero duration. gpui-kit keeps a transition's value
// per element and property, adopting the first one it sees, and eases toward
// a changed target with the duration given in that draw; a zero duration
// takes the target at once (gpui-kit's base/src/motion.rs,
// transition_with_status). So a transition set only once the target has
// changed would not ease that change, and j/k, the wheel, a line scrolled
// into view, another item or level and a change of the heights (a fold, a
// read, a resize) move the block at once.

// One line of the details, the step of j/k.
export const LINE_PX = 18;

// How a page or end key's move glides: herdr's transition of `top`.
export const GLIDE = { duration: 120, easing: "ease-out" };

// The transition the block draws its top with now: GLIDE while it stands
// where a page or end key put it, else 0, which moves it at once.
export function motionOf(ui) {
  const to = ui.glideTo;
  return to && to.content === ui.content && to.viewport === ui.viewport ? GLIDE : 0;
}

// The block at `offset`, put there by a page or end key.
function glideTo(ui, offset) {
  ui.offset = offset;
  ui.glideTo = { content: ui.content, viewport: ui.viewport };
}

// The block at `offset`, at once.
function jumpTo(ui, offset) {
  ui.offset = offset;
  ui.glideTo = null;
}

// The offset `offset` kept within the content: from 0 to where its end
// meets the window's; 0 where the content fits.
export const clampOffset = (offset, content, viewport) => Math.max(0, Math.min(offset, content - viewport));

// The offset after a move by `by` pixels (down for more than 0).
export const offsetBy = (s, by) => clampOffset(s.offset + by, s.content, s.viewport);

// The offset at which the span [top, top + height] of the content shows,
// moved as little as needed: one above the window to its top, one below to
// its bottom (one taller than the window to its top).
export function revealOffset(s, top, height) {
  let at = s.offset;
  if (top + height > at + s.viewport) at = top + height - s.viewport;
  if (top < at) at = top;
  return clampOffset(at, s.content, s.viewport);
}

// Whether the span shows whole; true while the window is not measured yet.
export const spanShows = (s, top, height) => !s.viewport || (top >= s.offset && top + height <= s.offset + s.viewport);

// The thumb that shows the position: { top, height } within the window, at
// least `min` high; null where the content fits or the window is not
// measured.
export function thumbOf(s, min = 16) {
  if (!(s.content > s.viewport) || s.viewport <= 0) return null;
  const height = Math.max(min, Math.round((s.viewport * s.viewport) / s.content));
  const top = Math.round(((s.viewport - height) * clampOffset(s.offset, s.content, s.viewport)) / (s.content - s.viewport));
  return { top, height };
}

// Where each row of a column of rows stands, `gap` between them, after `pad`
// above the first → { tops, content }, content down to the last row's end.
export function rowTops(heights, gap, pad = 0) {
  const tops = [];
  let at = pad;
  for (const h of heights) {
    tops.push(at);
    at += h + gap;
  }
  return { tops, content: heights.length ? at - gap : pad };
}

// The block's offset when it draws the details of the item `key`: 0 for
// another item than the last (ui.at), at once, kept within the content,
// which a resize or a refresh may have changed.
export function offsetOf(ui, key) {
  if (ui.at !== key) {
    ui.at = key;
    jumpTo(ui, 0);
  }
  ui.offset = clampOffset(ui.offset, ui.content, ui.viewport);
  return ui.offset;
}

// The block moved by `by` pixels at once: j/k by LINE_PX, the wheel by its
// move.
export const scrollBy = (ui, by) => jumpTo(ui, offsetBy(ui, by));
export const halfWindow = (ui) => Math.max(LINE_PX, Math.floor(ui.viewport / 2));
// ctrl-d/ctrl-u: the block half its window down (`dir` 1) or up (-1),
// gliding.
export const scrollPage = (ui, dir) => glideTo(ui, offsetBy(ui, dir * halfWindow(ui)));
// The block at its top or bottom (gg/G, Home/End), gliding.
export const scrollToEnd = (ui, end) => glideTo(ui, end === "top" ? 0 : clampOffset(Infinity, ui.content, ui.viewport));
// The block moved at once so that `span` ({ top, height }) shows.
export const revealSpan = (ui, span) => jumpTo(ui, revealOffset(ui, span.top, span.height));
// The block's scroll as it stands, for restoreScroll: its offset, the
// heights of its window and its content, and its rows' sizes.
export const keptScroll = (ui) => ({ offset: ui.offset, viewport: ui.viewport, content: ui.content, sizes: ui.sizes });
// The block's scroll as keptScroll kept it (`back`), for the details of
// the item `key`, at once: a level's way back up (Board.levelUp).
export function restoreScroll(ui, key, back) {
  Object.assign(ui, { at: key, viewport: back.viewport, content: back.content, sizes: back.sizes });
  jumpTo(ui, back.offset);
}

// ==== src/ui/related.js ====

// The detail panel's sections of an item's related items (related.js): its
// description ("BESCHREIBUNG", drawn formatted by herdr's TextView, as
// Markdown or HTML as its source writes it, without anything it could load:
// description.js; "keine Beschreibung" where it has none), its parent
// ("ÜBERGEORDNET", where it has one or the source could not send it), its
// sub-issues (an Azure work item's children), then, where it has any or the
// source could not send them, the pull requests linked to it; one line each
// with its key, title and state (a done one dimmed, a draft marked), and
// below a section how many it has that cannot be read. While they load the
// description's and the sub-issues' sections say "lädt …", after a failure
// the reason; a section the source could not send says why in its place;
// what the source said besides follows at the end. The line the panel has
// selected while it has the keyboard is marked; a click on a line is Enter
// on it (the Board's pickLine). A link in the description opens through the
// Board's openLink.
//
// A description taller than about 12 lines shows folded to that height,
// with "… mehr" below, and the key that unfolds it where one does now
// (commands.js, fold-description, says when z does); that key or a click
// on it unfolds it ("weniger" folds it again). TextView tells no count of
// its lines, so the fold goes by height: FOLDED_H, 12 lines of the
// details' 18 pixels; how tall the description is, its block measures
// (on_size_change), and it folds only once that is known to be more.
//
// The block scrolls by an offset the board keeps (scroll.js, its one home,
// says why): its window measures its height, the content its own and each
// row its own (on_size_change), the content stands shifted up by the
// offset, the mouse wheel moves it, and a thin thumb at the right shows
// where it is (no scrollbar to drag). The shift is a relative position,
// which moves the content without changing what it gives the layout: a
// negative top margin would make the window, which takes its height from
// the content, shorter by the offset, so that a content which shrinks
// while scrolled (a refresh, a fold) would leave it short, down to none.

export const FOLDED_H = 12 * LINE_PX;

// What the related items keep per Board, plain values the Board makes once
// when it starts and every draw reads: the measured height of each
// description by its item's key, the key of the item whose description is
// unfolded (null: none; another item's shows folded), and the block's
// scroll (scroll.js): its offset, the heights a page or end key's move
// was made at (`glideTo`; null: none), the item it is of (`at`), the
// heights of its window and its content, and of each row by its id.
export const relatedState = () => ({ heights: new Map(), unfolded: null, offset: 0, glideTo: null, at: null, viewport: 0, content: 0, sizes: new Map() });

// Whether the description of `item` is taller than FOLDED_H, as measured.
export const descriptionFolds = (ui, item) => (ui.heights.get(item.key) ?? 0) > FOLDED_H;

// `el` measuring its height into `keep(height)` after each layout that
// changes it, under the id `id` (on_size_change needs a lasting one).
const measured = (el, id, keep) => el.id(id).on_size_change((size, cx) => {
  keep(unzoomed(size.height));
  cx.notify();
});

// The id each row of relatedRows draws with.
const rowId = (r, i) => (r.kind === "line" ? `related-line-${r.n}` : `related-row-${i}`);

// Where line `n` of the related items stands in the block's content, from
// the measured heights (LINE_PX for a row not measured yet); null where no
// such line shows.
function lineSpan(ui, item, entry, n) {
  const rows = relatedRows(item, entry);
  const i = rows.findIndex((r) => r.kind === "line" && r.n === n);
  if (i < 0) return null;
  const heights = rows.map((r, j) => ui.sizes.get(rowId(r, j)) ?? LINE_PX);
  return { top: rowTops(heights, FRAME.gap, FRAME.py).tops[i], height: heights[i] };
}

// Scrolls line `n` into view.
export function revealLine(ui, item, entry, n) {
  const span = lineSpan(ui, item, entry, n);
  if (span) revealSpan(ui, span);
}

// Whether line `n` shows whole (true while the block is not measured yet).
export function lineShows(ui, item, entry, n) {
  const span = lineSpan(ui, item, entry, n);
  return Boolean(span) && spanShows(ui, span.top, span.height);
}

// The rows of the related items of `item` as drawn, in order, from `entry`
// (the Board's kept read: { data, error, shown }, data and error null
// while it loads, shown the description as drawn (shownDescription, made
// once per read); null before a read starts): { kind: "head" | "note" |
// "text" | "line", text, a note's level ("info", "error", "warning";
// NOTE_TONES) or, for a line, `line` and its index `n` among relatedLines
// (the one order of the lines); a "text" is the description, one row: its
// `text` as drawn and its `format`.
export function relatedRows(item, entry) {
  const data = entry?.data;
  const description = { kind: "head", text: "BESCHREIBUNG" };
  if (!data) {
    const why = entry?.error ? { kind: "note", text: entry.error, level: "error" } : { kind: "note", text: "lädt …", level: "info" };
    return [description, why, { kind: "head", text: subIssuesHead(item, { cut: false }) }, why];
  }
  const lines = relatedLines(data);
  const rows = [description];
  if (typeof entry.shown === "string") rows.push({ kind: "text", text: entry.shown, format: data.format === "html" ? "html" : "markdown" });
  else rows.push({ kind: "note", text: "keine Beschreibung", level: "info" });
  const body = (section, none) => {
    if (section.error) rows.push({ kind: "note", text: section.error, level: "error" });
    for (const line of section.lines) rows.push({ kind: "line", line, n: lines.indexOf(line) });
    if (none && !section.error && !section.lines.length && !section.hidden) rows.push({ kind: "note", text: "keine", level: "info" });
    if (section.hidden) rows.push({ kind: "note", text: `${section.hidden} ${section.hiddenAs ?? "ohne Zugriff"}`, level: "info" });
  };
  const parents = data.parents;
  if (parents.lines.length || parents.error || parents.hidden) {
    rows.push({ kind: "head", text: "ÜBERGEORDNET" });
    body(parents, false);
  }
  rows.push({ kind: "head", text: subIssuesHead(item, data.subIssues) });
  body(data.subIssues, true);
  const prs = data.prs;
  if (prs.lines.length || prs.error || prs.hidden) {
    rows.push({ kind: "head", text: prsHead(prs) });
    body(prs, false);
  }
  for (const text of data.warnings ?? []) rows.push({ kind: "note", text, level: "warning" });
  return rows;
}

// The description row `r` of `item`: the TextView in a block that measures
// it, folded to FOLDED_H where it is taller and not unfolded, and below it
// the fold's switch.
function description(b, t, item, r) {
  const ui = b.relatedUi;
  const folds = descriptionFolds(ui, item);
  const open = ui.unfolded === item.key;
  // The key that folds it, where one does now (commands.js).
  const foldKey = folds ? b.keyShown("fold-description") : null;
  const id = `description-${item.key}`;
  const view = (r.format === "html" ? TextView.html(id, r.text) : TextView.markdown(id, r.text))
    .text_size(12)
    .on_link_click((url, cx) => b.openLink(url, cx));
  const size = measured(div().flex_none(), `description-size-${item.key}`, (h) => ui.heights.set(item.key, h)).child(view);
  const box = div().id("description").overflow_hidden().when(folds && !open, (el) => el.max_h(FOLDED_H)).child(size);
  return v_flex()
    .gap(4)
    .child(box)
    .when(folds, (el) => el.child(
      div()
        .id("description-fold")
        .text_size(12)
        .text_color(t.accent)
        .cursor_pointer()
        .on_click((_e, cx) => {
          if (!b.modal) b.toggleFold(cx);
        })
        .child(`${open ? "weniger" : "… mehr"}${foldKey ? ` (${foldKey})` : ""}`),
    ));
}

// The detail panel's rows of an item the panel went down to (a line's
// item: it has no card, so no shape lends it rows): its state as a chip
// (stateChip), as its line has it. A pull request's (`entry` its read: {
// data: { pr }, error }) add what the PR list's details show beside the
// header: its checks where its source reads them (GitHub); what GitHub
// said besides, a warning each; and while they load or after a failure, a
// note.
export function levelParts(b, t, view, item, entry) {
  const chips = [stateChip(t, b.state(view.id).data, item.state, item.color)];
  if (item.kind !== "pr") return { chips };
  const note = (text, level) => detailNote(t, "level-note", text, level);
  if (!entry?.data) return { chips, sections: [entry?.error ? note(entry.error, "error") : note("lädt …", "info")] };
  const { checks, warnings } = entry.data.pr;
  return { chips, sections: [...(checks ? [checksSection(t, checks)] : []), ...(warnings ?? []).map((w) => note(w, "warning"))] };
}

// The block of the related items of `item` (relatedRows) in `view`, the
// line `at` marked (null: none), each with its state as a chip (stateChip).
// Whether a line is done is its own where its source names it (GitHub),
// else its state's in the view's data (Azure).
export function relatedSections(b, t, mono, view, item, entry, at) {
  const ui = b.relatedUi;
  const data = b.state(view.id).data;
  const rowOf = (r) => {
    if (r.kind === "head") return sectionTitle(t, r.text).pt(4);
    if (r.kind === "note") return div().text_size(12).text_color(toneColor(t, NOTE_TONES[r.level])).child(r.text);
    if (r.kind === "text") return description(b, t, item, r);
    const { line, n } = r;
    const done = line.done ?? stateDone(data, line.state);
    return h_flex()
      .flex_none()
      .gap(8)
      .px(8)
      .py(4)
      .items_center()
      .rounded(6)
      .border_1()
      .map(selectedLook(t, n === at, t.chrome))
      .cursor_pointer()
      .opacity(done ? 0.55 : 1)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (!b.modal) b.pickLine(view, n, cx);
      })
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(line)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(line.title))
      .when(line.draft, (el) => el.child(chip(t, "Entwurf")))
      .child(stateChip(t, data, line.state, line.color));
  };
  const offset = offsetOf(ui, item.key);
  const motion = motionOf(ui);
  const content = measured(v_flex(), "related-lines", (h) => (ui.content = h))
    .flex_none()
    .px(FRAME.px)
    .py(FRAME.py)
    .gap(FRAME.gap)
    .relative()
    .top(offset ? -offset : 0)
    .transition("top", motion)
    .children(relatedRows(item, entry).map((r, i) => measured(rowOf(r), rowId(r, i), (h) => ui.sizes.set(rowId(r, i), h))));
  const windowEl = measured(v_flex(), "related-window", (h) => (ui.viewport = h))
    .min_h(0)
    .overflow_hidden()
    .on_scroll_wheel((e, cx) => {
      scrollBy(ui, wheelMove(e));
      cx.notify();
    })
    .child(content);
  const thumb = thumbOf(ui);
  return v_flex()
    .id("related-scroll")
    .relative()
    .min_h(0)
    .border_b(1)
    .border_color(t.border)
    .child(windowEl)
    .when(Boolean(thumb), (el) => el.child(
      div().id("related-thumb").absolute().right(3).top(thumb?.top ?? 0).transition("top", motion)
        .w(3).h(thumb?.height ?? 0).rounded(2).bg(t.muted).opacity(0.6),
    ));
}

// ==== src/commands.js ====

// The board's actions, their one home: the action table ACTIONS, which the
// keys of its actions (Board.key, through keyName and actionFor), the hint
// line (hintsOf) and the command menu (menuActions; ui/modals/commands.js)
// all read, so a key, its hint and its menu entry run one action and say
// one thing. An action:
// - id, and name: the menu's name for it (a string, or name(c));
// - key: the key that runs it, as keyName names it; null for one the menu
//   (or a button, or a click) alone runs;
// - menu: its place in the menu (lower first: the item's, the details
//   panel's, the view's, the board's); none for one the menu does not list;
//   group: what it acts on (GROUPS: the selected item, the details panel's
//   item, the shown view, or the board), the menu's heading over it;
// - when(c): whether it can run now, which needs what its group acts on;
//   the menu offers only those;
// - takes(c): whether its key is taken (when by default): a few keys are
//   taken where they do nothing, or say why they do nothing;
// - bar: an action of the whole board or of the top bar (the tabs, the
//   source, the team view, nur meine, the filter, reload, the menu), which
//   runs on the moment as it is, without the board keeping its selection
//   first (Board.keptContext);
// - run(b, c, cx); aim(c) and gone(c) where it aims closer than its group
//   (menuActions);
// - hint(c): its text on the hint line, null for none; hintKey: the key
//   the hint line names (its key by default). The hint line names each key
//   once (hintsOf), and neither the moves nor a key named elsewhere (where
//   it acts, or only in the menu); README, "herdr app", lists those it
//   leaves out.
// An entry without run is a hint only: a core key the Board handles itself
// (Tab, Esc).
// `c` is what the Board says of the moment (Board.actionContext): { b,
// view, st, shape, item (the selected one), details (the item whose details
// show: where the panel went down into a related item, that one), related
// (whether those read related items), panel (the details panel's keyboard,
// or null), line (its selected line's index, or null), lines (the related
// items' lines), drilled (whether the panel shows a related item rather
// than the board's selected one), trail (the keys of the items on the
// panel's way down, the board's selected one first) }.

// What a key event names (an action's key), or null for one no action has:
// [ ] / and : as typed (with Shift, or with Control+Alt; Control alone
// stays herdr's, and Alt alone is let through: a key herdr binds with Alt
// never reaches a mod), else with no Control, Alt or platform key a digit,
// Enter, or a letter: upper case with Shift alone, so that Caps Lock
// changes no key, and an upper case letter is its own key (Shift+S is no s).
export function keyName(k, ch, mod) {
  const typed = !(mod.control && !mod.alt) && !mod.platform;
  if (typed && ["[", "]", "/", ":"].includes(ch)) return ch;
  if (mod.control || mod.alt || mod.platform) return null;
  if (/^[1-9]$/.test(ch)) return ch;
  if (k === "enter") return "enter";
  if (!/^[a-z]$/.test(k)) return null;
  return mod.shift ? k.toUpperCase() : k;
}

// How the hint line and the menu write a key.
const keyLabel = (key) => (key === "enter" ? "Enter" : key);

// Whether the action `a` is held now: while the details panel shows a
// level it went down to, the actions on the selected item (its group
// "item") take no key and give no hint, since they would act on the
// board's item while another one shows; the menu still offers them, under
// that item's heading.
const held = (a, c) => a.group === "item" && Boolean(c.drilled);

// The action the key `name` runs now: the first in the table that has it
// and takes it, and is not held; null for none.
export const actionFor = (name, c) => ACTIONS.find((a) => a.run && a.key === name && !held(a, c) && (a.takes ?? a.when)(c)) ?? null;

const nameOf = (a, c) => (typeof a.name === "function" ? a.name(c) : a.name);

// The key of the action `id` as the hint line and the menu write it, where
// that key runs it now (actionFor), else null; and its name now. The texts
// that name an action (the description's fold, the hint to the column
// menu) take them from here.
export function keyShown(id, c) {
  const a = ACTIONS.find((x) => x.id === id);
  return a?.key && actionFor(a.key, c) === a ? keyLabel(a.key) : null;
}
export const actionName = (id, c) => nameOf(ACTIONS.find((a) => a.id === id), c);

const KIND_NAMES = { issue: "Issue", pr: "PR" };

// The menu's groups by what they act on: the heading over each (title:
// "Task AB#311 · Export als CSV", "Detailfenster · tender#2217 …", the
// view's name such as "Sprint", or "Board"); `aim`, which of that an
// action opened for (its view and item, its view and details, its view;
// the board has none); and `gone`, what the menu says where an action
// would run on another (Board.runAction).
// The details' aim is the way the panel went down to them (trail), so that
// an action opened on one level does not run on another.
const GROUPS = {
  item: {
    title: (c) => `${[cardType(c.item) ?? KIND_NAMES[c.item.kind], itemLabel(c.item)].filter(Boolean).join(" ")} · ${c.item.title}`,
    aim: (c) => [c.view?.id, c.item?.key],
    gone: (c) => `${itemLabel(c.item)} ist nicht mehr ausgewählt`,
  },
  details: {
    title: (c) => `Detailfenster · ${itemLabel(c.details)} ${c.details.title}`,
    aim: (c) => [c.view?.id, ...(c.trail ?? [c.details?.key])],
    gone: (c) => `Die Details von ${itemLabel(c.details)} sind nicht mehr offen`,
  },
  view: { title: (c) => c.view.name, aim: (c) => [c.view?.id], gone: (c) => `„${c.view.name}“ wird nicht mehr gezeigt` },
  board: { title: () => "Board", aim: () => [], gone: () => "" },
};

// The command menu's entries now: { action, name, key, group, head, aim,
// gone, groupAim, groupGone } for each action the menu lists that can run,
// in the menu's order, with its key where that key runs it now
// (actionFor), else none; its group's heading; and what it aims at and
// what is said where that has gone (GROUPS; an action may aim closer, as
// "Spalte ausblenden" at its column, and what its group aims at, and says,
// apart: where that has gone, the menu says so first).
export function menuActions(c) {
  return ACTIONS.filter((a) => a.menu != null && a.when(c))
    .sort((x, y) => x.menu - y.menu)
    .map((a) => {
      const group = GROUPS[a.group];
      return {
        action: a, name: nameOf(a, c), key: keyShown(a.id, c), group: a.group, head: group.title(c),
        aim: aimOf(a, c), gone: a.gone?.(c) ?? group.gone(c), groupAim: groupAimOf(a, c), groupGone: group.gone(c),
      };
    });
}

// What the action `a` acts on now, as a text to compare (menuActions), and
// what its group does.
export const aimOf = (a, c) => JSON.stringify([...GROUPS[a.group].aim(c), ...(a.aim?.(c) ?? [])]);
export const groupAimOf = (a, c) => JSON.stringify(GROUPS[a.group].aim(c));

// The hint line's entries now: [key, text], in the table's order, each key
// once: the part that has the keyboard (the details panel, whose actions
// are the group "details", or the board) names its keys, and the other
// part's hints stay for the keys it does not name.
export function hintsOf(c) {
  const shown = ACTIONS.filter((a) => a.hint && !held(a, c))
    .map((a) => ({ a, key: a.hintKey ?? keyLabel(a.key), text: a.hint(c) }))
    .filter((h) => h.text);
  const leads = (h) => (h.a.group === "details") === Boolean(c.panel);
  const named = new Set(shown.filter(leads).map((h) => h.key));
  return shown.filter((h) => leads(h) || !named.has(h.key)).map((h) => [h.key, h.text]);
}

// The shown source's tabs, and the shown one's index.
const tabsOf = (c) => c.b.contexts();
const tabAt = (c) => shownIndex(tabsOf(c), c.b.context());

// The source after the shown one, and the shown team's next view.
const nextSource = (c) => sourceAfter(sourcesOf(c.b.config), c.b.source());
const nextView = (c) => teamViewAfter(c.b.context(), c.b.teamViewOf(c.b.context()));

// Whether the shown view has items to move over (none: the placeholder).
const walks = (c) => Boolean(c.shape?.dirs.length);
// Whether an item is selected and no line of the details panel, which
// takes Enter and o while one is, and the panel shows that item's details
// (held while drilled).
const onItem = (c) => Boolean(c.item) && c.line === null;
// Whether the panel shows a related item it went down to, and whether no
// line of it is selected, when Enter and o act on that item.
const onLevel = (c) => Boolean(c.details) && Boolean(c.drilled);
const onLevelItem = (c) => onLevel(c) && c.line === null;
// Whether the line hints name the line's keys: the panel has the keyboard
// and a line is selected (else Enter and o are the item's the panel shows:
// at the top the board's, on a level that item's; a pull request's level
// has no lines).
const lineHints = (c) => Boolean(c.panel) && c.line !== null;
// What the marked line's actions aim at: that line's item, so that a read
// that shifts the lines while the menu is open runs none on another.
const lineAim = (c) => [c.lines[c.line] ? lineKey(c.lines[c.line]) : null];
const lineGone = (c) => `${itemLabel(c.lines[c.line])} ist nicht mehr markiert`;
// Whether a line of the details panel is selected and still there.
const onLine = (c) => Boolean(c.details) && c.line !== null && Boolean(c.lines[c.line]);
// Whether a view shows, its data is read, and its shape has `what`.
const has = (c, what) => Boolean(c.view && c.st?.data && c.shape?.[what]);

// The selected column, where the shape hides columns and can hide it
// (its canHide).
function hideableColumn(c) {
  if (!has(c, "toggleColumn")) return null;
  const col = c.b.navColumns(c.view)[c.st.sel?.col];
  return col && c.shape.canHide(col) ? col : null;
}

// What the second Enter does with the item: go to its session, or start one.
function startName(item) {
  if (linkedSession(item, spaces())) return "Zur Sitzung";
  return item.kind === "pr" ? "Review starten…" : "Agent starten…";
}

// The digit keys' tabs; the first carries the hint for them all.
const tabAction = (n) => ({
  id: `tab-${n}`,
  group: "board",
  name: (c) => `Tab ${n}: ${tabsOf(c)[n - 1].name}`,
  key: String(n),
  menu: 30 + n,
  bar: true,
  when: (c) => Boolean(tabsOf(c)[n - 1]) && n - 1 !== tabAt(c),
  takes: () => true,
  run: (b, c, cx) => b.switchTab(n - 1, cx),
  ...(n === 1 ? { hint: () => "Tab", hintKey: "1 2 3 [ ]" } : {}),
});

// A move of the selected card or task one column on (`by` 1) or back (-1).
const moveAction = (id, key, by, name) => ({
  id,
  group: "item",
  name,
  key,
  menu: by < 0 ? 5 : 6,
  when: (c) => has(c, "move") && Boolean(c.item) && c.shape.canMove(c.st, c.item, by),
  takes: (c) => has(c, "move"),
  run: (b, c, cx) => c.shape.move(b, c.view, c.st, by, cx),
  ...(by < 0 ? { hint: (c) => (c.shape?.move ? c.shape.moveHint ?? "verschieben" : null), hintKey: "H/L" } : {}),
});

export const ACTIONS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(tabAction),
  {
    id: "tab-next", group: "board", name: "Nächster Tab", key: "]", menu: 40, bar: true,
    when: (c) => tabsOf(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepTab(1, cx),
  },
  {
    id: "tab-previous", group: "board", name: "Vorheriger Tab", key: "[", menu: 41, bar: true,
    when: (c) => tabsOf(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepTab(-1, cx),
  },
  {
    id: "source", group: "board", name: (c) => `Quelle wechseln: ${nextSource(c).name}`, key: null, menu: 42, bar: true,
    when: (c) => sourcesOf(c.b.config).length > 1,
    run: (b, c, cx) => b.switchSource(nextSource(c).id, cx),
  },
  {
    id: "team-view", group: "view", name: (c) => `Ansicht wechseln: ${teamViewName(nextView(c))}`, key: "v", menu: 25, bar: true,
    when: (c) => Boolean(c.view) && hasViewSwitch(c.b.context()), takes: () => true,
    run: (b, c, cx) => b.nextTeamView(cx),
    hint: (c) => (hasViewSwitch(c.b.context()) ? viewSwitchHint(c.b.context()) : null),
  },
  moveAction("move-left", "H", -1, "Nach links verschieben"),
  moveAction("move-right", "L", 1, "Nach rechts verschieben"),
  {
    id: "create", group: "view", name: "Neu…", key: "n", menu: 20,
    when: (c) => has(c, "create"),
    run: (b, c, cx) => c.shape.create(b, c.view, cx),
    hint: (c) => (c.shape?.create ? "neu" : null),
  },
  {
    id: "status", group: "item", name: "Status ändern…", key: "s", menu: 3,
    when: (c) => has(c, "openStatusMenu") && Boolean(c.item), takes: (c) => has(c, "openStatusMenu"),
    run: (b, c, cx) => b.openStatusMenu(c.view, cx),
    hint: (c) => (c.shape?.openStatusMenu ? "Status" : null),
  },
  {
    id: "assign", group: "item", name: "Zuweisen…", key: "a", menu: 4,
    when: (c) => has(c, "assign") && Boolean(c.item), takes: (c) => Boolean(c.st?.data),
    run: (b, c, cx) => b.openAssign(c.view, cx),
    hint: (c) => (c.shape?.assign ? "zuweisen" : null),
  },
  // z folds what is where the keyboard is: on a Sprint the selected
  // story's tasks while the board has it, the description while the details
  // panel has it, and on a view whose shape folds nothing of its own the
  // description whenever the details show one that folds (the story's comes
  // first in the table, so it wins while it takes z). The menu offers both
  // where they can run, z beside the one it runs.
  {
    id: "fold-story", group: "item", name: "Story zu-/aufklappen", key: "z", menu: 8,
    when: (c) => has(c, "fold") && Boolean(c.item), takes: (c) => !c.panel && has(c, "fold"),
    run: (b, c, cx) => c.shape.fold(b, c.view, c.st, cx),
  },
  {
    id: "details", group: "item", name: "Details zeigen", key: "enter", menu: 1,
    when: (c) => Boolean(c.item) && !c.st.detail,
    run: (b, c, cx) => b.enter(c.view, cx),
    hint: (c) => (walks(c) ? c.shape.enterHint ?? "Detail · Agent" : null),
  },
  {
    id: "start", group: "item", name: (c) => startName(c.item), key: "enter", menu: 2,
    when: (c) => Boolean(c.item) && c.st.detail, takes: (c) => onItem(c) && c.st.detail,
    run: (b, c, cx) => b.enter(c.view, cx),
  },
  {
    id: "open", group: "item", name: "Im Browser öffnen", key: "o", menu: 7,
    when: (c) => Boolean(c.item), takes: onItem,
    run: (b, c, cx) => b.open(c.item, cx),
    hint: (c) => (walks(c) ? "öffnen" : null),
  },
  // On a pull request's level, which reads no related items, the panel
  // still has the keyboard.
  { id: "tab-hint", hint: (c) => (c.related || c.panel ? (c.panel ? "Board" : "Details") : null), hintKey: "Tab" },
  {
    id: "fold-description", group: "details", key: "z", menu: 9,
    name: (c) => (c.b.relatedUi.unfolded === c.details.key ? "Beschreibung weniger" : "Beschreibung mehr"),
    when: (c) => Boolean(c.details) && c.related && descriptionFolds(c.b.relatedUi, c.details),
    run: (b, c, cx) => b.toggleFold(cx),
  },
  // The details panel's selected line (a line selected before `r` read the
  // related items again is gone until they come: its key does nothing).
  {
    id: "line-details", group: "details", name: "Zeile im Detailfenster zeigen", key: "enter", menu: 10,
    when: onLine, takes: (c) => c.line !== null, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => c.lines[c.line] && b.drillLine(c.view, c.lines[c.line], cx),
    hint: (c) => (lineHints(c) ? "Zeile zeigen" : null),
  },
  {
    id: "line-board", group: "details", name: "Zeile auf dem Board", key: null, menu: 11,
    when: onLine, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => b.enterLine(c.view, c.lines[c.line], cx),
  },
  {
    id: "line-open", group: "details", name: "Zeile im Browser öffnen", key: "o", menu: 12,
    when: onLine, takes: (c) => c.line !== null, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => c.lines[c.line] && b.open(c.lines[c.line], cx),
    hint: (c) => (lineHints(c) ? "Zeile öffnen" : null),
  },
  // The item the panel went down to: Enter and o act on it where no line
  // is selected (the line's actions come first in the table and take them
  // while one is).
  {
    id: "level-start", group: "details", name: (c) => startName(c.details), key: "enter", menu: 13,
    when: onLevel,
    run: (b, c, cx) => b.startSession(c.view, c.details, cx),
    hint: (c) => (onLevelItem(c) ? (c.details.kind === "pr" ? "Review" : "Agent") : null),
  },
  {
    id: "level-open", group: "details", name: "Im Browser öffnen", key: "o", menu: 14,
    when: onLevel,
    run: (b, c, cx) => b.open(c.details, cx),
    hint: (c) => (onLevelItem(c) ? "öffnen" : null),
  },
  {
    id: "hide-column", group: "view", name: (c) => `Spalte ausblenden: ${hideableColumn(c).name}`, key: null, menu: 21,
    when: (c) => Boolean(hideableColumn(c)),
    run: (b, c, cx) => b.toggleColumn(c.view, hideableColumn(c), cx),
    aim: (c) => [hideableColumn(c)?.id ?? null],
    gone: (c) => `Spalte „${hideableColumn(c).name}“ ist nicht mehr ausgewählt`,
  },
  {
    id: "columns", group: "view", name: "Spalten…", key: null, menu: 22,
    when: (c) => has(c, "toggleColumn"),
    run: (b, c, cx) => b.openColumns(c.view, cx),
  },
  // The sprint a Sprint view shows: the sprint picker (no key; what else
  // opens it, ui/modals/sprints.js says), and back to the current sprint
  // where another shows and the team has one running.
  {
    id: "sprint-pick", group: "view", name: "Sprint wählen…", key: null, menu: 23,
    when: (c) => has(c, "pickSprint"),
    run: (b, c, cx) => c.shape.pickSprint(b, c.view, cx),
  },
  {
    id: "sprint-current", group: "view", name: "Aktueller Sprint", key: null, menu: 24,
    when: (c) => has(c, "showSprint") && sprintIs(c.st.data) === "chosen" && Boolean(c.st.data.meta.currentId),
    run: (b, c, cx) => c.shape.showSprint(b, c.view, null, cx),
  },
  {
    id: "mine", group: "board", name: (c) => (c.b.mine ? "Nur meine aus" : "Nur meine an"), key: "m", menu: 26, bar: true,
    when: (c) => Boolean(c.b.source()), takes: () => true,
    run: (b, c, cx) => b.toggleMine(cx),
    hint: (c) => (c.b.source() ? "nur meine" : null),
  },
  {
    id: "filter", group: "board", name: "Filter", key: "/", menu: 27, bar: true,
    when: () => true,
    run: (b) => b.filterInput.focus(),
  },
  {
    id: "reload", group: "board", name: "Neu laden", key: "r", menu: 28, bar: true,
    when: () => true,
    run: (b, c, cx) => b.reload(cx),
    hint: () => "neu laden",
  },
  {
    id: "commands", name: "Befehle", key: ":", bar: true,
    when: () => true,
    run: (b, c, cx) => b.openCommands(cx),
    hint: () => "Befehle",
  },
  { id: "escape-hint", hint: (c) => (c.panel ? "zurück" : "schließen"), hintKey: "Esc" },
];

// ==== src/ui/modals/commands.js ====

// The command menu: the actions that can run now, each by its name with its
// key at the right where that key runs it now, under a heading for what
// they act on (commands.js, menuActions), as a menu like the assignee
// picker's (helpers.js menu, without digits: typing goes to the filter).
// The filter has the keyboard and narrows them as one types, in the order
// shownCommands gives, the filter's letters in the accent color. Up/down,
// ctrl-j/k and ctrl-n/p mark one, Enter or a click runs it on what it
// aimed at when the menu opened (Board.runAction), Esc closes; its window
// shows MENU_ROWS rows (helpers.js: openFilterMenu, filterMenuKey,
// menuWindow). `:` opens it (Board.openCommands) as b.modal = { kind:
// "commands", view (the view it opened on, so that a reload of views.json
// that drops it, or makes it another kind, closes it), entries (the
// actions as it opened), and openFilterMenu's fields }; its first row is
// marked, -1 where the filter leaves none.

// The entries the filter leaves (rankByName), best first, each group
// (an action's group, not its heading's text) together after its best;
// with no filter, in the menu's order.
export function shownCommands(entries, filter) {
  const ranked = rankByName(entries, filter);
  const groups = [...new Set(ranked.map((e) => e.group))];
  return groups.flatMap((group) => ranked.filter((e) => e.group === group));
}

const entriesOf = (m) => shownCommands(m.entries, m.filter);

// Runs the row at `i`, where there is one, after the menu closed.
function runEntry(b, m, i, cx) {
  const entry = entriesOf(m)[i];
  if (!entry) return;
  b.closeModal(cx);
  b.runAction(entry, cx);
}

export const commandsModal = {
  // Opens the menu on the moment `c` (Board.openCommands).
  open(b, c, cx) {
    const m = { kind: "commands", view: c.view, entries: menuActions(c) };
    openFilterMenu(b, m, {
      placeholder: "Befehl: tippen, um zu filtern",
      count: (m) => entriesOf(m).length,
      startAt: (m) => (entriesOf(m).length ? 0 : -1),
      pick: (i, cx) => runEntry(b, m, i, cx),
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, entriesOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const entries = entriesOf(m);
    const { shown, ...win } = menuWindow(m, entries);
    return menu(t, {
      id: "commands",
      rowId: "command",
      width: 440,
      title: "Befehle",
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((e) => [
        markedName(t, e.name, e.at),
        ...(e.key ? [div().flex_none().text_size(11).font_semibold().text_color(t.dim).child(e.key)] : []),
      ]),
      // A group's heading over its first row, and over the window's first.
      heads: shown.map((e, n) => (n === 0 || shown[n - 1].group !== e.group ? e.head : null)),
      ...win,
      pick: (i, cx) => runEntry(b, m, i, cx),
      foot: entries.length ? [] : [menuNote(t, "Kein Befehl passt zum Filter", t.muted)],
    });
  },
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
      const missing = [!data.meta.area && "keinen Standardbereich", !data.meta.iteration && "keine Standard-Iteration"].filter(Boolean).join(" und ");
      return b.say(`Das Team hat ${missing}: in Azure unter Team-Einstellungen setzen`, "warning", cx);
    }
    const input = InputState.new({ placeholder: "Titel des neuen Work Items" });
    const m = { kind: "create", view, data, types, at: 0, parent, input, field: "title", error: null };
    wireTextField(b, m, input, "title", (cx) => createModal.create(b, cx));
    b.modal = m;
    input.focus();
    cx.notify();
  },

  // Creates the work item and closes the dialog; without a title, while
  // another create of the view is under way, or while the view shows its
  // saved state (SAVED_WRITE), it stays and says so.
  create(b, cx) {
    const m = b.modal;
    if (m?.kind !== "create") return;
    const title = m.input.value().trim();
    const st = b.state(m.view.id);
    const busy = st.pending[CREATE_KEY];
    if (!title || busy || st.saved) {
      m.error = busy ? "Ein Work Item wird noch angelegt …" : st.saved ? SAVED_WRITE : "Der Titel fehlt";
      if (st.saved && !busy) restartRead(b, m.view, cx);
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
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(m.error ?? ""))),
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

// ==== src/ui/modals/sprints.js ====

// The sprint picker: which sprint a team's Sprint view shows, as a menu
// like the command menu's (helpers.js menu, without digits: typing goes to
// the filter). Its rows are the team's iterations, past, current and
// future, in Azure's order (the source's iterations; makeAzure says how
// long they are kept), each with its dates, the team's current sprint
// marked "aktuell"; the filter has the keyboard and narrows them by their
// names as the command menu's does (rankByName), its letters in the
// accent color. Up/down, ctrl-j/k and ctrl-n/p mark a row, Enter or a
// click shows that sprint (the sprint shape's showSprint), Esc closes; its
// window shows MENU_ROWS rows, follows the mark, and the mouse wheel moves
// it (helpers.js: openReadMenu, filterMenuKey, menuWindow). Without a
// filter the sprint startRow names is marked (the current one, where the
// team has one); under a filter, the first row it leaves. The command
// menu's "Sprint wählen…" and a click on the sprint's name in the view's
// head open it (the sprint shape's pickSprint) as b.modal = { kind:
// "sprints", view, team, and openReadMenu's fields }. Where the iterations
// cannot be read, it says so in the dialog and as a toast.

const sprintRowsOf = (m) => rankByName(m.list ?? [], m.filter);

// The row marked when the rows come or the filter changes (-1 for none),
// by the rule in the header.
function sprintStartAt(m) {
  const rows = sprintRowsOf(m);
  if (!rows.length) return -1;
  return m.filter ? 0 : startRow(rows, Date.now());
}

// Shows the row at `i`, where there is one, and closes the picker; the
// current sprint's row goes back to the current one.
function pickSprintRow(b, m, i, cx) {
  const row = sprintRowsOf(m)[i];
  if (!row) return;
  b.closeModal(cx);
  b.shape(m.view).showSprint(b, m.view, row.current ? null : { id: row.id, name: row.name }, cx, row.id);
}

export const sprintsModal = {
  // Opens the picker for the Sprint view `view`, then asks its source for
  // the team's iterations.
  open(b, view, cx) {
    const m = { kind: "sprints", view, team: view.context?.team ?? view.name };
    openReadMenu(b, m, {
      placeholder: "Filter: Name des Sprints",
      count: (m) => sprintRowsOf(m).length,
      startAt: sprintStartAt,
      pick: (i, cx) => pickSprintRow(b, m, i, cx),
      read: () => b.loader(view).iterations(view),
      failed: (e) => ({ error: `Die Sprints des Teams ließen sich nicht lesen: ${report(e)}`, list: [] }),
      title: "Sprint wählen: Sprints nicht gelesen",
    }, cx);
  },

  // Every key but Esc (the Board's): filterMenuKey.
  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, sprintRowsOf(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const rows = sprintRowsOf(m);
    const { shown, ...win } = menuWindow(m, rows);
    const year = new Date(Date.now()).getUTCFullYear();
    const empty = m.error ? null : m.list?.length ? "Kein Sprint passt zum Filter" : "Das Team hat keine Sprints";
    const message = !m.list ? "lädt …" : !rows.length ? empty : null;
    return menu(t, {
      id: "sprints",
      rowId: "sprint",
      width: 440,
      title: `Sprint · ${m.team}`,
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.current ? [toneChip(t, "aktuell", NOTE_TONES.success).flex_none()] : []),
        div().flex_none().text_size(11).text_color(t.dim).child(sprintDates(r, year)),
      ]),
      ...win,
      pick: (i, cx) => pickSprintRow(b, m, i, cx),
      foot: message ? [menuNote(t, message, t.muted)] : [],
    });
  },
};

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
        const r = await call("sh", checkoutArgs(m.settings.checkout), on, CHECKOUT_TIMEOUT, what(m.view, "checkout"));
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
            .children(m.notes.map((n) => div().text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(n)))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(m.error ?? ""))),
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
      title: "Status ändern",
      at: m.at,
      pick: (i, cx) => pickTarget(b, m, i, cx),
      rows: m.targets.map((c) => [
        div().size(9).flex_none().rounded(5).bg(columnColor(t, c)),
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
// between them (Board.tabKey). A new dialog is a module here and its
// entry in MODALS.

export const MODALS = { start: startModal, status: statusModal, columns: columnsModal, create: createModal, assign: assignModal, commands: commandsModal, sprints: sprintsModal };

// ==== src/ui/shapes/backlog.js ====

// The backlog shape: a team's backlog level (its Stories) as a list in
// backlog order, one row per work item with its id, type, title, state,
// sprint ("—" for none) and assignee, a line across its top in its type's
// color (typeLine), walked as one column. n creates a work item (the create
// dialog, actions/create.js), s changes the selected item's state from its
// type's states (the status menu, actions/state.js), Enter shows the
// details. Not the prs shape: that one draws sections of GitHub pull
// requests with their author, draft mark, checks and age. The data: {
// shape: "backlog", meta: { level, childLevel, typeStates, states,
// typeColors, orderField, area, iteration, follows, missing }, rows, viewer,
// noViewer, total, limited, limit } (backlogList, sources/azure/backlog.js).
// View fields it reads: id, source, layout (as writeAtOnce does), context
// (the create dialog).

// The backlog shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const backlogState = (b) => b.shapeState.backlog;

const backlogColumns = (b, st) => backlogNav(st.data, b.filterText, b.mine);

// How the backlog finds an item, and where one no longer is: what its
// states and its assignments share.
const BACKLOG_LOOKUP = { find: findBacklogItem, where: "im Backlog" };
// How the backlog finds, changes and shows its items' states
// (actions/state.js). A state that landed is the item's own: nothing is
// read again for it.
const BACKLOG_STATES = { ...BACKLOG_LOOKUP, withState: withBacklogState, stateOf: (_data, item) => item.state, again: false };
// How the backlog finds and changes its items' assignees (actions/assign.js).
const BACKLOG_ASSIGN = { ...BACKLOG_LOOKUP, withItem: withBacklogItem };

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
  dirs: ["up", "down"],
  loads: true,
  // n: the create dialog.
  create: (b, view, cx) => MODALS.create.open(b, view, cx),
  received: (data) => data,
  warnings: (_view, data) => backlogWarnings(data),
  // The settled outcomes: a state change's which state its item has, a
  // parent link's whether the item hangs under its parent, an assignment's
  // whom it has; then, once Azure has answered (one query each,
  // unclearCreateLines), a create's whether it landed.
  settle(b, view, due, data, cx) {
    tellOutcomes(b, [
      ...unclearStateLines(due.filter((u) => u.kind === "state"), data, BACKLOG_STATES),
      ...unclearParentLines(due.filter((u) => u.kind === "parent"), data),
      ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, BACKLOG_ASSIGN),
    ], cx);
    const creates = due.filter((u) => u.kind === "create");
    if (!creates.length) return;
    cx.spawn(async (cx) => {
      try {
        tellOutcomes(b, await unclearCreateLines(b, view, creates), cx);
      } catch (e) {
        b.say(report(e), "error", cx);
      }
    });
  },
  assign: BACKLOG_ASSIGN,
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
    const line = typeLine(t, r, data.meta.typeColors?.[r.type]);
    return h_flex()
      .id(`row-${r.key}`)
      .relative()
      .flex_none()
      .gap(12)
      .px(18)
      .py(7)
      .items_center()
      .border_l(2)
      .map(selectedLook(t, selected, t.background))
      .opacity(st.pending[r.key] ? 0.7 : 1)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        // A click on a row (clickItem).
        if (!b.modal) b.clickItem(view, { col: 0, key: r.key }, cx);
      })
      .child(div().w(WIDTH.key).flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(cell(WIDTH.type, r.type ?? ""))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().min_w(0).truncate().child(r.title))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .child(div().w(WIDTH.state).flex_none().child(stateChip(t, data, r.state)))
      .child(cell(WIDTH.sprint, r.sprint ?? "—"))
      .child(cell(WIDTH.assignee, r.assignees.join(", ")))
      .when(Boolean(line), (el) => el.child(line));
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

// ==== src/ui/band.js ====

// A board column draws whole only the cards in its band, its window and
// half a window above and below; every other card is a frame of its height.
// herdr gives a mod's draw 50 ms, which a column of a few hundred whole
// cards outgrows.

// The list's height until herdr laid it out (scrollOf).
export const VIEWPORT_GUESS = 1000;

export const bandState = () => ({ lo: 0, hi: 0, content: 0, revealed: null });

// herdr before 0.1.18 reads nothing back from a ScrollHandle.
export const readsScroll = (handle) => typeof handle.offset === "function";

export function scrollOf(handle) {
  const { width, height } = handle.viewport_size();
  return { offset: handle.offset().y, viewport: height || VIEWPORT_GUESS, width };
}

// herdr runs a key's scroll_to_item at its next frame: until the handle
// has moved, the band stands where that scroll goes.
function followed(s, at) {
  if (s.revealed?.from === at.offset) return s.revealed.to;
  s.revealed = null;
  return at.offset;
}

const bandOffset = (s, at, content) => clampOffset(followed(s, at), content, at.viewport);

export function placeBand(s, content, at) {
  const offset = bandOffset(s, at, content);
  const vp = at.viewport;
  Object.assign(s, { content, lo: offset - vp / 2, hi: offset + vp + vp / 2 });
}

export const inBand = (s, top, height) => top < s.hi && top + height > s.lo;

export function leftBand(s, at) {
  const offset = bandOffset(s, at, s.content);
  return offset < s.lo || offset + at.viewport > s.hi;
}

// As herdr's scroll_to_item(0) on a list scrolled to `at`.
export function revealTop(s, at) {
  s.revealed = { from: at.offset, to: 0 };
}

// As herdr's scroll_to_item: the smallest scroll that shows the card.
export function revealCard(s, at, content, top, height) {
  const to = revealOffset({ offset: at.offset, viewport: at.viewport, content }, top, height);
  s.revealed = to === at.offset ? null : { from: at.offset, to };
}

// ==== src/ui/shapes/board.js ====

// The board shape: a view's data as columns of cards, which a card moves
// between (H/L, the status menu, a drag). A hidden column is not drawn: the
// command menu's "Spalte ausblenden" hides the selected one, the line below
// the columns names the hidden ones and a click on a name shows it again;
// the command menu's "Spalten…" opens the column menu (modals/columns.js).
// The data: { shape: "board", meta, columns: [{ id, name, color, hidden,
// count, target, cards }], total, limited, viewer, read, partial (while
// later pages are still to come) } (parseGithubBoard). View fields it
// reads: id, source, layout, hide (the columns hidden by default) and
// project.priorityField.

// How the board finds and changes its cards' assignees (actions/assign.js).
const BOARD_ASSIGN = { find: (data, key) => findCard(data, key)?.card ?? null, withItem: withCard, where: "auf dem Board" };

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js).
const boardState = (b) => b.shapeState.board;
const columnLeft = (kept) => leftBand(kept.band, scrollOf(kept.scroll));

// By id, not place: a column coming in front (Ohne Status) must not hand its
// neighbours their state; a state passed on starts anew, scrolled to the top.
function columnKept(b, id) {
  const st = boardState(b);
  let kept = st.byId.get(id);
  if (!kept) {
    const free = st.pool.filter((k) => !st.showing.includes(k.id)).sort((x, y) => x.used - y.used)[0];
    if (!free) return st.pool[Math.max(0, st.showing.indexOf(id)) % SCROLLS];
    st.byId.delete(free.id);
    const band = bandState();
    if (free.id !== null) {
      free.scroll.scroll_to_item(0);
      if (st.windowed) revealTop(band, scrollOf(free.scroll));
    }
    kept = Object.assign(free, { id, band, cardWidth: 0 });
    st.byId.set(id, kept);
  }
  kept.used = ++st.clock;
  return kept;
}

// All of a draw's columns at once, so that a new one takes no state from a
// column later in the draw.
export function columnsKept(b, ids) {
  boardState(b).showing = ids;
  return ids.map((id) => columnKept(b, id));
}

// Unlike columnKept, claims no state and counts no use.
export const keptOf = (b, id) => boardState(b).byId.get(id);

export const boardShape = {
  state() {
    // A state's `id`: the column holding it, null for none; `used`: the
    // clock at its last use, the oldest passed on first.
    const pool = Array.from({ length: SCROLLS }, () => ({ id: null, used: 0, scroll: ScrollHandle.new(), band: bandState(), cardWidth: 0 }));
    const windowed = readsScroll(pool[0].scroll);
    if (!windowed) console.log("board: this herdr reads no scroll position back (0.1.18 does), so every card of a column draws whole");
    return { pool, byId: new Map(), clock: 0, showing: [], windowed, heights: new Map() };
  },
  nav: (b, st) => shownColumns(st.data, b.filterText, b.mine),
  columnCount: (b, st) => shownColumns(st.data, b.filterText, b.mine).length,
  selected: (b, st) => findCard(st.data, st.sel?.key)?.card ?? null,
  scrollTo(b, view, sel, row) {
    const col = b.navColumns(view)[sel.col];
    const kept = columnKept(b, col.id);
    if (boardState(b).windowed) {
      const at = scrollOf(kept.scroll);
      const { heights, tops, content } = columnLayout(b, col, kept, at.width);
      revealCard(kept.band, at, content, tops[row], heights[row]);
    }
    kept.scroll.scroll_to_item(row);
  },
  bandsLeft(b) {
    const st = boardState(b);
    return st.windowed && st.pool.some((k) => st.showing.includes(k.id) && columnLeft(k));
  },
  // All items, whatever the filter: the cards of the shown columns.
  items: (data) => data.columns.filter((c) => !c.hidden).flatMap((c) => c.cards),
  count(b, data) {
    const cols = shownColumns(data, b.filterText, b.mine);
    return { shown: cols.reduce((n, c) => n + c.shown.length, 0), total: cols.reduce((n, c) => n + c.cards.length, 0) };
  },
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge")),
  dirs: ["up", "down", "left", "right"],
  loads: true,
  // H/L: the selected card one column on (`by` 1) or back (-1), hidden
  // columns too.
  move(b, view, st, by, cx) {
    const target = st.sel?.key && stepTarget(st.data, st.sel?.key, by);
    if (target) b.moveTo(view, st.sel?.key, target.id, cx);
  },
  canMove: (st, item, by) => hasStep(st.data, item.key, by),
  canHide: hideable,
  received: (data, st) => applyMoves(data, st.moves),
  warnings: (view, data) => [
    ...unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
    ...(view.project.priorityGiven && data.meta.lacksPriorityField
      ? [`Projekt „${data.meta.title}“ hat kein Auswahlfeld „${view.project.priorityField}“ (project.priorityField): die Karten zeigen keine Priorität`]
      : []),
  ],
  settle: (b, view, due, data, cx) =>
    tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, BOARD_ASSIGN)], cx),
  assign: BOARD_ASSIGN,
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

const CARD_GAP = 6;

function columnLayout(b, col, kept, listWidth) {
  const measured = boardState(b).heights;
  const heights = col.shown.map((card) => {
    const m = measured.get(card.key);
    return m && (m.width === kept.cardWidth || !kept.cardWidth) ? m.height : cardHeightGuess(card, listWidth);
  });
  return { heights, ...rowTops(heights, CARD_GAP) };
}

const MEASURE_SLACK = 2;

function cardMeasure(b, kept, layout, card, i) {
  return (size, cx) => {
    const height = unzoomed(size.height);
    const width = unzoomed(size.width);
    boardState(b).heights.set(card.key, { height, width });
    const resized = Boolean(kept.cardWidth) && width !== kept.cardWidth;
    kept.cardWidth = width;
    if (resized || Math.abs(height - layout.heights[i]) > MEASURE_SLACK) cx.notify();
  };
}

function drawBoard(b, t, mono, view, st) {
  const cols = b.navColumns(view);
  const allSpaces = spaces();
  const dragged = b.drag ? findCard(st.data, b.drag.key)?.card : null;
  const { windowed } = boardState(b);
  const states = columnsKept(b, cols.map((c) => c.id));
  const columnEl = (col, ci) => {
    const filtered = col.cards.length - col.shown.length;
    const focusedCol = st.sel?.col === ci;
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    const ground = t.chrome;
    const head = columnHead(t, col, filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length), ground);
    const kept = states[ci];
    const at = windowed ? scrollOf(kept.scroll) : null;
    const layout = at && columnLayout(b, col, kept, at.width);
    if (at) placeBand(kept.band, layout.content, at);
    const whole = (card, measure) => drawCard(b, t, mono, view, st, card, col, ci, allSpaces, measure);
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
      .bg(target ? dropBg(t, ground) : ground)
      .p(10)
      .when(windowed, (el) => el.on_scroll_wheel((_e, cx) => {
        // GPUI moved the list before the event reached its column.
        if (columnLeft(kept)) cx.notify();
      }))
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
        if (from !== col.id) b.chooseDropped(view, key, cx);
      })
      .child(head)
      .child(
        v_flex()
          .id(`cards-${ci}`)
          .flex_1()
          .min_h(0)
          .gap(CARD_GAP)
          .overflow_y_scrollbar()
          .track_scroll(kept.scroll)
          .children(col.shown.map((card, i) => {
            if (!layout) return whole(card, null);
            return inBand(kept.band, layout.tops[i], layout.heights[i]) ? whole(card, cardMeasure(b, kept, layout, card, i)) : cardFrame(t, st, card, layout.heights[i]);
          }))
          .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
      );
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(
      cols.length
        ? h_flex().id("columns").flex_1().min_h(0).gap(12).p(14).items_start().children(cols.map(columnEl))
        : div().p(20).text_color(t.muted).child(`Alle Spalten sind ausgeblendet: ein Name unten oder „${b.actionName("columns")}“ im Befehlsmenü (${b.keyShown("commands")}) zeigt eine wieder`),
    )
    .when(st.data.columns.some((c) => c.hidden), (el) => el.child(hiddenLine(b, t, view, st)))
    .when(Boolean(st.data.limited) && !st.data.partial, (el) =>
      el.child(div().px(16).pb(8).text_size(12).text_color(toneColor(t, NOTE_TONES.warning))
        .child(`Nur die ersten ${st.data.read} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
    );
}

// The line below the columns that names the hidden ones; a click on a name
// shows that column again.
function hiddenLine(b, t, view, st) {
  const hidden = st.data.columns.filter((c) => c.hidden);
  return h_flex()
    .id("hidden-columns")
    .flex_none()
    .flex_wrap()
    .gap(6)
    .px(16)
    .pb(10)
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

function cardFrame(t, st, card, height) {
  return div()
    .flex_none()
    .h(height)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, st.sel?.key === card.key, t.border, t.background));
}

// drawCard's box, which cardHeightGuess sums.
const CARD = { py: 9, pl: 5, pr: 9, border: 1, gap: 7, lineGap: 6, titleLine: 17 };
// About the height of a line of 11-pixel text and the width of a title's
// character, for a card never measured.
const LINE_GUESS = 16;
const TITLE_CHAR_PX = 6.5;
// The list's width until herdr measured it.
const LIST_W_GUESS = 300;

function cardLabels(card) {
  const epic = epicLabel(card);
  return card.labels.filter((l) => l !== epic);
}

// A card never measured: its lines as drawCard draws them, its title's
// wrapped by its length in the list's `width`; a line that holds only a
// session chip or "speichert …" is left out, the card's measure corrects it.
export function cardHeightGuess(card, width) {
  const room = Math.max(60, (width || LIST_W_GUESS) - CARD.pl - CARD.pr - 2 * CARD.border - CARD_EDGE - CARD.gap);
  const titleLines = Math.max(1, Math.ceil(((card.title ?? "").length * TITLE_CHAR_PX) / room));
  const foot = footLines((cardType(card) ? 1 : 0) + cardLabels(card).length, card.sub, card.assignees.length);
  const lines = [LINE_GUESS, CARD.titleLine * titleLines, ...[showsMeta(card, partOfText(card)), foot.chips, foot.progress].filter(Boolean).map(() => LINE_GUESS)];
  return 2 * (CARD.py + CARD.border) + rowTops(lines, CARD.lineGap).content;
}

function drawCard(b, t, mono, view, st, card, col, ci, allSpaces, measure) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
  const type = typeChip(t, card);
  const labels = cardLabels(card);
  const line = typeLine(t, card, null, 6);
  const end = cardEnd(t, card, linkedSession(card, allSpaces), Boolean(st.pending[card.key]));
  const chips = [...(type ? [type] : []), ...labels.slice(0, 3).map((l) => labelChip(t, card, l)), ...(labels.length > 3 ? [chip(t, `+${labels.length - 3}`)] : [])];
  const meta = cardMeta(t, card, partOfText(card));
  return h_flex()
    .id(`card-${card.key}`)
    .relative()
    .flex_none()
    .items_stretch()
    .py(CARD.py)
    .pl(CARD.pl)
    .pr(CARD.pr)
    .gap(CARD.gap)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, selected, t.border, t.background))
    .opacity(dragging ? 0.5 : st.pending[card.key] ? 0.7 : 1)
    .cursor_pointer()
    .when(Boolean(measure), (el) => el.on_size_change(measure))
    .on_mouse_down("left", (e, cx) => {
      cx.stop_propagation();
      if (b.modal) return;
      b.drag = { key: card.key, from: card.column, at: e.position };
      b.over = ci;
      b.handle.focus();
      cx.notify();
    })
    .on_mouse_up("left", (e, cx) => {
      // Released on another card it bubbles to the column under it, which
      // takes the drop.
      if (b.modal || b.drag?.key !== card.key) return;
      cx.stop_propagation();
      const clicked = inPlace(b.drag.at, e.position);
      b.endDrag(cx);
      if (clicked) b.clickItem(view, { col: ci, key: card.key }, cx);
    })
    .child(cardEdge(t, col))
    .child(v_flex().flex_1().min_w(0).gap(CARD.lineGap)
      .child(cardHead(t, [div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(card))], card))
      .child(div().text_size(12.5).line_height(`${CARD.titleLine}px`).child(card.title))
      .when(Boolean(meta), (el) => el.child(meta))
      .children(cardFoot(t, chips, card.sub, end)))
    .when(Boolean(line), (el) => el.child(line));
}

// Hides a shown column or shows a hidden one; the selection follows
// (reselectIn).
function toggleBoardColumn(b, view, col, cx) {
  const st = b.state(view.id);
  if (!st.data) return;
  if (!boardShape.canHide(col)) return b.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
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
  dirs: [],
  loads: false,
  received: (data) => data,
  warnings: () => [],
};

// ==== src/ui/shapes/prs.js ====

// The prs shape: a list of pull requests in sections, walked as one column.
// Its data is parseGithubList's; a row's author, draft mark and checks show
// where it has them, and whether the viewer has to act on it. Each section
// is drawn in its color, a theme name: its head on a band of it, each row
// with a stripe of it at its left. View fields it reads: id.

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
  dirs: ["up", "down"],
  loads: true,
  enterHint: "Detail · Review",
  received: (data) => data,
  warnings: (_view, data) =>
    data.sections.flatMap((s) => [
      ...(s.skipped ? [`${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`] : []),
      ...(s.notRead?.length ? [`${s.notRead.length} Treffer in „${s.name}“ nicht gelesen: ${s.notRead[0]}`] : []),
    ]),
  // The detail panel's rows of a pull request: why the viewer has to act on
  // it, its checks, where it has them, and a note for each part that could
  // not be read or is still to come, as a pull request a level down shows
  // its own (levelParts, ui/related.js).
  detailParts(b, t, view, item) {
    const sections = [];
    if (item.attention?.length) sections.push(detailSection(t, "DU BIST DRAN", ...item.attention.map((reason) => div().text_color(markColor(t)).child(reason))));
    if (item.checks) sections.push(checksSection(t, item.checks));
    sections.push(...(item.unread ?? []).map((text) => detailNote(t, "unread-note", text, "warning")));
    if (item.threadsPending) sections.push(detailNote(t, "pending-note", "Review-Threads werden noch gelesen …", "info"));
    return sections.length ? { sections } : {};
  },
};

// Every row keeps the cell, so the cells after it line up.
export const THREADS_PENDING = "… Threads laden";
function attentionCell(t, r) {
  const cell = div().w(200).flex_none().truncate().text_size(12);
  const unsure = r.unread?.length ? ["?"] : r.threadsPending ? ["…"] : [];
  if (r.attention?.length) return cell.font_semibold().text_color(markColor(t)).child(`● ${[...r.attention, ...unsure].join(" · ")}`);
  return cell.text_color(t.muted).child(r.unread?.length ? "? nicht ganz gelesen" : r.threadsPending ? THREADS_PENDING : r.waiting ? "wartet auf Autor" : "");
}

// A section's count: the rows it holds (each pull request once, in its first
// section; results that are no pull request, and those GitHub sent as null
// for an error, left out), "<shown>/<held>"
// while the filter or "nur meine" hides some; a section GitHub cut adds how
// many it sent of how many it found.
export function sectionCount(section, shown) {
  const held = section.rows.length;
  const cut = section.limited ? ` · erste ${section.fetched} von ${section.count}` : "";
  return `${shownOf(shown, held)}${cut}`;
}

function drawPrs(b, t, mono, view, st) {
  const now = Date.now();
  const row = (r, tone) => {
    const selected = st.sel?.key === r.key;
    return h_flex()
      .id(`row-${r.key}`)
      .flex_none()
      .gap(12)
      .px(18)
      .py(8)
      .items_center()
      .border_l(2)
      // Its section's stripe, the accent while it is selected.
      .map(selectedLook(t, selected, toneColor(t, tone)))
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        // A click on a row (clickItem).
        if (!b.modal) b.clickItem(view, { col: 0, key: r.key }, cx);
      })
      .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .child(attentionCell(t, r))
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.author)))
      // Every row keeps the draft cell, so the columns after it line up.
      .child(div().w(60).flex_none().text_size(12).text_color(t.muted).child(r.draft ? "Entwurf" : ""))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  };
  const children = [];
  for (const [i, s] of st.data.sections.entries()) {
    const rows = s.rows.filter((r) => b.visible(r, st.data));
    const tone = s.color;
    children.push(
      div().id(`section-${i}`).flex_none().mt(8).px(20).py(3).bg(headBg(t, tone, t.background)).text_size(11).font_semibold().text_color(toneColor(t, tone))
        .child(`${s.name.toUpperCase()} · ${sectionCount(s, rows.length)}`),
    );
    children.push(...rows.map((r) => row(r, tone)));
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

// The sprint shape: a team's sprint (its current one, or one the sprint picker
// chose) as a taskboard. One row per story (storyCell at the left), its tasks
// as cards in the team's taskboard columns (drawTask); tasks whose story is
// not in the sprint stand in the row "Ohne Story". H/L move a task to the next
// column (through the taskboard's own column, not the state: two columns may
// map to one state), s changes a story's or a task's state from its type's
// states (the status menu), Enter shows the details; both write at once
// (actions/move.js, actions/write.js). z (while the board has the keyboard),
// or a click on the triangle in a story's row, folds its tasks away and back
// (toggleStoryFold; foldsOf says where that is kept). Keys walk the stories,
// then each column's tasks but the folded ones (sprintNav, withoutFolded).
// Another sprint of the team shows through the sprint picker
// (ui/modals/sprints.js says what opens it; pickSprint, showSprint), and says
// so in the head ("nicht aktuell"); with no sprint running and none chosen the
// head says that, and no taskboard shows (sprintIs tells the three apart). The
// data: { shape: "sprint", meta: { iterationId, iteration, finish (all three
// null where no sprint runs and none is chosen), currentId (the team's
// current sprint's, null with none running), gone ({ id, name } of a
// chosen sprint the team no longer has, or null), typeStates, states,
// typeColors, unplaced, unknownColumns }, columns: [{ id, name, color,
// hidden, count, target, types, mappings, cards }], rows: [{ key, story }],
// viewer, noViewer, total, limited, limit } (sprintBoard,
// sources/azure/sprint.js).
// View fields it reads: id, source, layout (as writeAtOnce does).

// How wide the stories' column is.
const STORY_WIDTH = 260;

// The sprint shape's own state on a Board (state(), shapes/index.js): the
// rows' scroll handle.
const sprintState = (b) => b.shapeState.sprint;

// The columns the keys walk, the folded rows' tasks left out, and the
// columns with every task the filter and "nur meine" leave (openColumns),
// which say which rows show and what the column heads count: folding is no
// filter.
const openColumns = (b, st) => sprintNav(st.data, b.filterText, b.mine);
const sprintColumns = (b, st) => withoutFolded(openColumns(b, st), foldedStories(foldsOf(st, st.data), st.data));

// An item's state as shown: a task's as its column maps it (shownState).
const stateNow = (data, item) => shownState(item, isTask(item) ? findCard(data, item.key)?.column : null);

// How the sprint finds an item, and where one no longer is: what its states
// and its assignments share.
const SPRINT_LOOKUP = { find: findSprintItem, where: "im Sprint" };
// How the sprint finds, changes and shows its items' states (actions/state.js).
// A write that landed refreshes the view too: which column a task's new
// state puts it in is Azure's to say.
const SPRINT_STATES = { ...SPRINT_LOOKUP, withState: withItemState, stateOf: stateNow, again: true };
// How the sprint finds and changes its items' assignees (actions/assign.js).
const SPRINT_ASSIGN = { ...SPRINT_LOOKUP, withItem: withSprintItem };

export const sprintShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
  nav: (b, st) => sprintColumns(b, st),
  // The taskboard's columns, without the stories' (STORY_WIDTH wide).
  columnCount: (b, st) => sprintColumns(b, st).length - 1,
  selected: (b, st) => findSprintItem(st.data, st.sel?.key),
  // The row of the selected item, among the rows that show.
  scrollTo(b, view) {
    const st = b.state(view.id);
    const item = findSprintItem(st.data, st.sel?.key);
    const at = item ? shownRows(st.data, openColumns(b, st)).findIndex((r) => r.key === rowOf(item)) : -1;
    if (at >= 0) sprintState(b).scroll.scroll_to_item(at);
  },
  navigate: (b, view, st, dir) => sprintNavigate(sprintColumns(b, st), st.sel, dir),
  items: (data) => sprintItems(data),
  count(b, data) {
    const items = sprintItems(data);
    return { shown: items.filter((i) => b.visible(i, data)).length, total: items.length };
  },
  render: (b, t, mono, view, st) => drawSprint(b, t, mono, view, st),
  dirs: ["up", "down", "left", "right"],
  loads: true,
  // H/L: the selected task one column on (`by` 1) or back (-1); a story
  // says that only tasks move.
  move(b, view, st, by, cx) {
    const item = b.selected(view);
    if (item && !isTask(item)) b.say(`${itemLabel(item)} ist eine Story: H/L verschieben Tasks, s ändert ihren Status`, "info", cx);
    else if (item) {
      const target = stepTarget(st.data, item.key, by);
      if (target) b.moveTo(view, item.key, target.id, cx);
    }
  },
  canMove: (st, item, by) => hasStep(st.data, item.key, by),
  moveHint: "Task verschieben",
  fold: (b, view, st, cx) => foldKey(b, view, st, cx),
  // A chosen sprint the source no longer has (meta.gone) is no longer
  // chosen, unless another was chosen while it read.
  received(data, st) {
    if (data.meta.gone && st.sprint?.id === data.meta.gone.id) st.sprint = null;
    return applyMoves(data, st.moves);
  },
  // sprintWarnings.
  warnings: (view, data) => sprintWarnings(data),
  // The sprint picker, and the sprint `sprint` shown ({ id, name }; null:
  // the current one).
  pickSprint: (b, view, cx) => MODALS.sprints.open(b, view, cx),
  showSprint: (b, view, sprint, cx, id) => showSprint(b, view, sprint, cx, id),
  // The settled outcomes: a move's where its card stands, a state change's
  // which state its item has, an assignment's whom it has.
  settle: (b, view, due, data, cx) =>
    tellOutcomes(b, [
      ...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearStateLines(due.filter((u) => u.kind === "state"), data, SPRINT_STATES),
      ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, SPRINT_ASSIGN),
    ], cx),
  assign: SPRINT_ASSIGN,
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

// "bis 27.11." for the sprint's last day (dayText), or null.
function sprintEnd(finish) {
  const day = dayText(finish, new Date(Date.now()).getUTCFullYear());
  return day ? `bis ${day}` : null;
}

// Shows the sprint `sprint` ({ id, name }; null: the current one) in the
// Sprint view `view` while the board runs, and reads it. `id` is that
// sprint's id: by default `sprint`'s, or for the current one
// meta.currentId as last read; the picker names its row's. Where that
// sprint shows already, as what was asked for (the current one as current,
// a chosen one as chosen: sprintIs), read without an error and no read
// under way, it reads nothing.
function showSprint(b, view, sprint, cx, id = sprint?.id ?? b.state(view.id).data?.meta.currentId ?? null) {
  const st = b.state(view.id);
  const shows = id !== null && st.data?.meta.iterationId === id && (sprintIs(st.data) === "current") === (sprint === null);
  st.sprint = sprint;
  if (shows && !st.error && !st.loading) return;
  b.refresh(view, cx);
}

// The head's start, over the stories: the sprint's name, which a click
// opens the sprint picker on; "nicht aktuell" where it is not the team's
// current sprint; its last day and how many stories show. Where the team
// has no sprint running and none is chosen, "kein laufender Sprint" alone,
// which a click opens the picker on too.
function sprintTitle(b, t, view, data, nav, stories) {
  const is = sprintIs(data);
  return h_flex()
    .id("sprint-title")
    .w(STORY_WIDTH)
    .flex_none()
    .flex_wrap()
    .gap(6)
    .items_center()
    .text_size(12)
    .text_color(t.muted)
    .child(div().id("sprint-name").flex_none().cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => {
      if (!b.modal) sprintShape.pickSprint(b, view, cx);
    }).child(is === "none" ? "kein laufender Sprint" : data.meta.iteration))
    .when(is === "chosen", (el) => el.child(toneChip(t, "nicht aktuell", NOTE_TONES.warning).flex_none()))
    .when(is !== "none", (el) => el.child(div().flex_none().child(`· ${[sprintEnd(data.meta.finish), `${shownOf(nav[0].shown.length, stories.length)} Stories`].filter(Boolean).join(" · ")}`)));
}

// z: the selected story's tasks folded away, or back; on a task, its row's,
// and its story is chosen where it shows.
function foldKey(b, view, st, cx) {
  const item = b.selected(view);
  if (!item) return;
  const key = isTask(item) ? item.row : item.key;
  if (key === NO_STORY) return b.say("Die Zeile „Ohne Story“ lässt sich nicht zuklappen", "info", cx);
  if (!rowTasks(st.data, key).length) return b.say(`${itemLabel(item)} hat keine Tasks zum Zuklappen`, "info", cx);
  toggleStoryFold(b, view, key, cx);
  if (isTask(item) && sprintColumns(b, st)[0].shown.some((s) => s.key === key)) b.choose(view, { col: 0, key }, cx);
}

// Folds the tasks of the story `key` away, or back, in the shown sprint,
// and keeps that per view and sprint (toggledFolds): in the store for the
// current sprint, for a chosen one while the board runs (foldsOf). A
// selected task that is folded away hands the selection to its story where
// that shows (no choice: reselect), else as after new data.
function toggleStoryFold(b, view, key, cx) {
  const st = b.state(view.id);
  const folds = toggledFolds(foldsOf(st, st.data), st.data, key);
  if (sprintIs(st.data) === "chosen") st.chosenFolds.set(st.data.meta.iterationId, folds);
  else store.set(`folded:${view.id}`, (st.folds = folds));
  const item = b.selected(view);
  const nav = sprintColumns(b, st);
  if (item && isTask(item) && item.row === key && nav[0].shown.some((s) => s.key === key)) b.reselect(view, { col: 0, key });
  else b.keepSelection(view);
  cx.notify();
}

function drawSprint(b, t, mono, view, st) {
  const data = st.data;
  const open = openColumns(b, st);
  const folded = foldedStories(foldsOf(st, data), data);
  const nav = withoutFolded(open, folded);
  const [, ...cols] = nav;
  const rows = shownRows(data, open);
  const counts = rowCounts(data, open);
  const stories = sprintStories(data);
  const allSpaces = spaces();
  const none = sprintIs(data) === "none";
  const head = h_flex()
    .id("sprint-head")
    .flex_none()
    .gap(10)
    .px(14)
    .pt(10)
    .pb(6)
    .items_center()
    .child(sprintTitle(b, t, view, data, nav, stories))
    .when(!none, (el) => el.children(open.slice(1).map((col) => columnHead(t, col, shownOf(col.shown.length, col.cards.length), t.background).flex_1().min_w(0))));
  // No sprint running and none chosen: no taskboard, a note where its rows go.
  if (none) {
    const note = "Das Team hat gerade keinen laufenden Sprint. Einen anderen zeigt „Sprint wählen…“ im Befehlsmenü (:) oder ein Klick auf „kein laufender Sprint“.";
    return v_flex().flex_1().min_h(0).child(head).child(div().id("sprint-none").p(20).text_color(t.muted).child(note));
  }
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
    .child(storyCell(b, t, mono, view, st, r, nav, folded, counts))
    .when(folded.has(r.key), (el) => el.child(foldedCell(t, r, counts.get(r.key))))
    .when(!folded.has(r.key), (el) => el.children(cols.map((col, ci) => v_flex()
      .flex_1()
      .min_w(0)
      .gap(6)
      .children(col.shown.filter((card) => card.row === r.key).map((card) => drawTask(b, t, mono, view, st, card, ci + 1, col, allSpaces))))));
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(head)
    .child(v_flex().id("sprint-rows").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(sprintState(b).scroll).children(rows.map(rowEl)));
}

// A folded row's place of its tasks, across the taskboard's columns: how
// many it holds, as many as the filter and "nur meine" leave of them where
// they thin them (its rowCounts entry).
function foldedCell(t, r, { shown, total }) {
  return div().id(`folded-${r.key}`).flex_1().min_w(0).py(6).text_size(12).text_color(t.muted).child(`${shownOf(shown, total)} ${total === 1 ? "Task" : "Tasks"}`);
}

// A story the filter or "nur meine" hides still shows for its tasks, dimmed.
function storyCell(b, t, mono, view, st, r, nav, folded, counts) {
  const cell = v_flex().w(STORY_WIDTH).flex_none().gap(4);
  if (!r.story) return cell.child(div().text_size(12.5).font_semibold().text_color(t.muted).child("Ohne Story"));
  const story = r.story;
  const shown = nav[0].shown.includes(story);
  const selected = st.sel?.key === story.key;
  const line = typeLine(t, story, st.data.meta.typeColors?.[story.type], 6);
  const end = cardEnd(t, story, null, Boolean(st.pending[story.key]));
  const meta = cardMeta(t, story, partOfText(story));
  const fold = counts.get(story.key)?.total
    ? [div().id(`fold-${story.key}`).flex_none().w(12).text_size(11).text_color(t.muted).cursor_pointer()
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        if (!b.modal) toggleStoryFold(b, view, story.key, cx);
      })
      .child(folded.has(story.key) ? "▸" : "▾")]
    : [];
  const head = [
    ...fold,
    div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(story)),
    ...(story.type ? [div().text_size(11).text_color(t.dim).child(story.type)] : []),
  ];
  return cell
    .id(`story-${story.key}`)
    .relative()
    .p(6)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, selected, t.background))
    .opacity(shown ? (st.pending[story.key] ? 0.7 : 1) : 0.5)
    .when(shown, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: 0, key: story.key }, cx);
    }))
    .child(cardHead(t, head, story))
    .child(div().text_size(12.5).line_height("17px").child(story.title))
    .when(Boolean(meta), (el) => el.child(meta))
    .children(cardFoot(t, [stateChip(t, st.data, story.state).flex_none()], storyProgress(st.data, story.key), end))
    .when(Boolean(line), (el) => el.child(line));
}

function drawTask(b, t, mono, view, st, card, ci, col, allSpaces) {
  const selected = st.sel?.key === card.key;
  const line = typeLine(t, card, st.data.meta.typeColors?.[card.type], 6);
  const end = cardEnd(t, card, linkedSession(card, allSpaces), Boolean(st.pending[card.key]));
  // In its story's row the row names the parent.
  const meta = cardMeta(t, card, card.row === NO_STORY ? partOfText(card) : null);
  return h_flex()
    .id(`card-${card.key}`)
    .relative()
    .flex_none()
    .items_stretch()
    .py(8)
    .pl(5)
    .pr(8)
    .gap(7)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, selected, t.border, t.background))
    .opacity(st.pending[card.key] ? 0.7 : 1)
    .cursor_pointer()
    .on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: ci, key: card.key }, cx);
    })
    .child(cardEdge(t, col))
    .child(v_flex().flex_1().min_w(0).gap(5)
      .child(cardHead(t, [div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(card))], card))
      .child(div().text_size(12.5).line_height("17px").child(card.title))
      .when(Boolean(meta), (el) => el.child(meta))
      .children(cardFoot(t, [stateChip(t, st.data, shownState(card, col)).flex_none()], null, end)))
    .when(Boolean(line), (el) => el.child(line));
}

// ==== src/ui/shapes/index.js ====

// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns that keyboard
// movement and selection walk, a list as one), selected (the selected
// item), scrollTo, items (every item the shape draws, whatever the filter:
// on a board, the cards of its shown columns; a shape without items, the
// placeholder, leaves Enter, o and the arrows to herdr), count ({ shown,
// total } items, or null), render, dirs (the arrow directions that move),
// loads (false for the placeholder, which draws without data), received
// (the data as kept after a refresh) and warnings; and where it has them,
// the actions it lends the action table (commands.js, which says their
// keys and hints): move (b, view, st, by, cx: H/L) with canMove (st, item,
// by: whether the item has a column that way) and moveHint, canHide (col:
// whether a column can be hidden, beside toggleColumn), fold (b, view, st,
// cx: z), create (b, view, cx: n), pickSprint (b, view, cx: the sprint
// picker, ui/modals/sprints.js) with showSprint (b, view, sprint, cx, id:
// the sprint it shows, null for the current one, whose id `id` names
// where it is known) and enterHint (Enter's hint);
// columnCount (how many columns it draws side by side, which the detail
// panel's share of the width is no narrower than one of: detailWidth; a list
// has none), bandsLeft (b: whether a column scrolled past the cards it drew
// whole, which the Board asks every BAND_MS), detailParts (its rows in the
// detail panel), settle (b, view, due, data, cx: says how the unclear writes
// of its items ended up), moveTo, toggleColumn, openStatusMenu, navigate
// (its own keyboard movement in place of navigate's, select.js), pickStatus
// (what a pick in the status menu does in place of a move to that column),
// and assign (how its items' assignees are found and changed: { find(data,
// key), withItem(data, key, patch) (the data with the item's fields set),
// where (where an item no longer is: "im Sprint") }; a shape that has it
// takes a, the assignee picker, ui/modals/assign.js, and its settle says the
// outcomes of unclear assignments, unclearAssignLines).
// A shape keeps its own state per Board in b.shapeState[name], which its
// state() makes once, when the Board starts: herdr refuses a ScrollHandle
// made while a view draws ("cannot run during render"). A new way to draw
// is a module here and its entry in SHAPES.

export const SHAPES = { board: boardShape, prs: prsShape, sprint: sprintShape, backlog: backlogShape, placeholder: placeholderShape };

// ==== src/description.js ====

// An item's description as the details hand it to herdr's TextView
// (shownDescription): Markdown or HTML that can load nothing.
//
// Why: TextView loads every http(s) image of its text with the mod's network
// grant, which herdr gives every mod in full (herdr's src/mods.rs,
// capabilities; gpui-kit's crates/shell/src/materialize/text_view.rs), and
// a description is text anyone with access to the item may write. What
// TextView draws as an image (gpui-kit's crates/base/src/text/format): an
// HTML <img> with a src (html.rs), which HTML's parser also reads <image>
// as, in HTML and as raw HTML in Markdown (markdown.rs, Node::Html); and
// Markdown's inline image `![alt](url)` (markdown.rs, Node::Image).
// Markdown's images by reference (`![alt][ref]`, `![alt][]`, `![ref]`,
// Node::ImageReference) it draws as nothing today. Before parsing HTML it
// writes the text through html5minify (html.rs, cleanup_html), which
// writes the text of <pre> and <textarea> and the content of <script> and
// <style> decoded, as it stands (html5minify/mod.rs, preserve_whitespace
// and contains_code): an entity-spelt `&lt;img …&gt;` in them comes out as
// a tag, which the second parse builds into an image. So a list of what may
// stay, not of what must go; HTML comments go, as they do on GitHub and
// Azure:
//
// - HTML keeps only the plain formatting tags of KEPT, each written anew
//   without attributes but an `a`'s http(s) href; none of them is one whose
//   text html5minify writes as it stands, nor one HTML's parser reads as raw
//   text. A <pre> becomes <p><code> (its text then wraps as any other). An
//   <img> or <image> becomes a link "Bild: <alt>" to its http(s) src, or
//   that text alone. Any other tag is dropped and its text kept, as text
//   of the element around it (the content of a <script>, <style> or
//   <textarea> too, which so never stands in one); any other `<` (none of a
//   tag, or a tag left open or longer than MAX_TAG) is written `&lt;`.
// - Markdown keeps no HTML. A comment outside code (codeRanges) goes as
//   CommonMark reads it at the top level: one that starts a line (at most 3
//   spaces in) is an HTML block to its `-->`, across blank lines; one
//   anywhere else goes only where it crosses no blank line (one after a
//   list marker that crosses a blank line stays as text); one not closed
//   stays. Every other
//   `<` but that of an http(s) URL in `<…>` gets a zero-width space after
//   it, which no HTML tag starts with, so Markdown reads it as text, and in
//   code it looks unchanged. An http(s) URL in `<…>` stays, as an autolink
//   or a link's or definition's destination (`<https://…>`,
//   `[x](<https://…>)`, `[r]: <https://…>`): HTML has no tag of that name,
//   so it can only be a link, or text. It is written as the WHATWG parser
//   reads it (webUrl), and its `\`, `!`, `[`, `]`, `(`, `)` and backtick
//   are encoded outside its host (user part, path, query, fragment:
//   keptUrl), so no link, image or code span can start in the encoded
//   parts however the span is read; its host stays as it is (an IPv6 one
//   keeps its brackets), and where the URL so written would name another
//   host, it is no URL but text. An inline image becomes a Markdown link
//   "Bild: <alt>" to its http(s) URL (its text alone for another URL), and
//   an <img> or <image> tag the same; a `![` that starts no inline image
//   the scanner reads (an image by reference, or one longer than
//   MAX_IMAGE) becomes `[Bild: ` (`![]` `[Bild`), so that
//   `![alt][ref]` is a link where `ref` is defined, and `![alt][]` and
//   `![ref]` text. A label's `[`, `]`, `\` and `!` are escaped. Last, every
//   `![` left (a `!` before one of those links, or two pieces of the text
//   that meet) becomes `!`, a zero-width space and `[`: none is left. Text
//   in code changes the same way as any other.
//
// Each step looks at the text once. A tag looks at most MAX_TAG characters
// ahead, an image MAX_IMAGE, a URL in `<…>` up to the next `<`; a
// comment's end is one search, and whether a blank line lies within it one
// binary search (blankWithin); so a long hostile text costs little, and
// the board makes it once per read (the Board's readRelated).

const KEPT = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "del", "strike", "mark", "code", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "div", "span", "sub", "sup",
]);
const IMAGES = new Set(["img", "image"]);
export const MAX_TAG = 2048;
export const MAX_IMAGE = 1024;
// How deep the brackets of an image's alt and the parentheses of its
// destination may nest (the latter markdown-rs's limit,
// RESOURCE_DESTINATION_BALANCE_MAX in its util/constant.rs).
const MAX_PARENS = 32;
const ZWSP = "\u200b";
const ATTRIBUTE = /(?:^|[\s/])([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
const TAG_START = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)/y;
const WEB_LINK = /<(https?:\/\/[^<>\n\r]*)>/iy;
const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

// A text with its entities read (&amp; &lt; &gt; &quot; &apos;, &#n;,
// &#xn;); any other stays as written.
function decoded(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()];
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

// A text as HTML writes it, as text or in a quoted attribute.
const htmlText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// An http(s) URL as the WHATWG URL parser writes it (which percent-encodes
// spaces, `<` and `>`, and `"` in its path and query; one may stay in a
// host, which htmlText escapes), or null for anything else.
export function webUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// The tag starting at `at` (its `<`): { close, name (in lower case), body
// (what stands between the name and the `>`), end (after the `>`) }, or
// null where none starts there or it does not end within MAX_TAG. `nextGt`
// gives the next `>` from a position (tagReader).
function readTag(text, at, nextGt) {
  TAG_START.lastIndex = at;
  const m = TAG_START.exec(text);
  if (!m) return null;
  const from = at + m[0].length;
  if (from < text.length && !/[\s/>]/.test(text[from])) return null;
  const end = nextGt(from);
  if (end < 0 || end - at > MAX_TAG) return null;
  return { close: m[1] === "/", name: m[2].toLowerCase(), body: text.slice(from, end), end: end + 1 };
}

// The next `what` at or after a position, for positions that only grow:
// each search starts where the last one ended, so all of them read the text
// once; -1 for none.
function finder(text, what) {
  let found = -2;
  return (p) => {
    if (found === -1) return -1;
    if (found < p) found = text.indexOf(what, p);
    return found;
  };
}

// The tag at a position (readTag), and the end of the comment starting
// there (after its `-->`, which may follow its `<!` at once: `<!-->`), or
// -1 where none starts there or it is not closed.
function tagReader(text) {
  const nextGt = finder(text, ">");
  return (at) => readTag(text, at, nextGt);
}
function commentReader(text) {
  const nextEnd = finder(text, "-->");
  return (at) => {
    if (!text.startsWith("<!--", at)) return -1;
    const end = nextEnd(at + 2);
    return end < 0 ? -1 : end + 3;
  };
}

// A tag's attributes by name, in lower case, each its first value, read.
function attributesOf(body) {
  const attrs = {};
  for (const m of body.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decoded(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

// An image's label: "Bild: <alt>", "Bild" without one.
const imageLabel = (alt) => {
  const text = String(alt ?? "").replace(/\s+/g, " ").trim();
  return text ? `Bild: ${text}` : "Bild";
};

// The tag `tag` as the HTML keeps it (see the header).
function htmlTag(tag) {
  if (tag.name === "pre") return tag.close ? "</code></p>" : "<p><code>";
  if (IMAGES.has(tag.name)) {
    if (tag.close) return "";
    const attrs = attributesOf(tag.body);
    const url = webUrl(attrs.src ?? "");
    const label = htmlText(imageLabel(attrs.alt));
    return url ? `<a href="${htmlText(url)}">${label}</a>` : label;
  }
  if (tag.close) return `</${tag.name}>`;
  if (tag.name !== "a") return `<${tag.name}>`;
  const url = webUrl(attributesOf(tag.body).href ?? "");
  return url ? `<a href="${htmlText(url)}">` : "<a>";
}

// HTML as the details hand it on (see the header).
function keptHtml(text) {
  const tagAt = tagReader(text);
  const commentEnd = commentReader(text);
  const out = [];
  let from = 0;
  for (let at = text.indexOf("<"); at >= 0; at = text.indexOf("<", from)) {
    out.push(text.slice(from, at));
    const end = commentEnd(at);
    const tag = end < 0 ? tagAt(at) : null;
    if (end >= 0) from = end;
    else if (tag) {
      if (KEPT.has(tag.name) || IMAGES.has(tag.name) || tag.name === "pre") out.push(htmlTag(tag));
      from = tag.end;
    } else {
      out.push("&lt;");
      from = at + 1;
    }
  }
  out.push(text.slice(from));
  return out.join("");
}

// A text as Markdown shows it in a link's label: its `\`, `[`, `]` and `!`
// escaped, each `<` followed by a zero-width space.
const markdownLabel = (text) => text.replace(/[\\[\]!]/g, "\\$&").replace(/</g, `<${ZWSP}`);

// An http(s) URL as the Markdown keeps it in `<…>` (see the header), built
// from the parsed pieces; null for no http(s) URL, and for one whose host
// would change.
const URL_ESCAPES = { "\\": "%5C", "!": "%21", "[": "%5B", "]": "%5D", "(": "%28", ")": "%29", "`": "%60" };
const urlText = (text) => text.replace(/[\\![\]()`]/g, (c) => URL_ESCAPES[c]);
export function keptUrl(text) {
  const href = webUrl(text);
  if (!href) return null;
  const url = new URL(href);
  const user = url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";
  const kept = `${url.protocol}//${urlText(user)}${url.host}${urlText(`${url.pathname}${url.search}${url.hash}`)}`;
  const again = webUrl(kept);
  return again && new URL(again).host === url.host ? kept : null;
}

// An image as a Markdown link (see the header).
function markdownImage(alt, src) {
  const url = keptUrl(src);
  const label = markdownLabel(imageLabel(alt));
  return url ? `[${label}](<${url}>)` : label;
}

// The inline image `![alt](destination "title")` starting at `at`, read as
// CommonMark does, within MAX_IMAGE characters, without a blank line and
// nested at most MAX_PARENS deep: { alt, src, end } or null.
function inlineImage(text, at) {
  const limit = Math.min(text.length, at + MAX_IMAGE);
  let i = at + 2;
  let depth = 0;
  for (; i < limit; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "[" && ++depth > MAX_PARENS) return null;
    else if (c === "]" && depth-- === 0) break;
    else if (c === "\n" && text[i + 1] === "\n") return null;
  }
  if (i >= limit || text[i + 1] !== "(") return null;
  const alt = text.slice(at + 2, i);
  i += 2;
  const skip = () => {
    while (i < limit && (text[i] === " " || text[i] === "\t" || text[i] === "\n")) i++;
  };
  skip();
  let src = "";
  if (text[i] === "<") {
    const start = ++i;
    while (i < limit && text[i] !== ">" && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
    if (text[i] !== ">") return null;
    src = text.slice(start, i++);
  } else {
    // Up to a space or control character, its parentheses balanced.
    const start = i;
    let parens = 0;
    for (; i < limit && text.charCodeAt(i) > 32; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === "(" && ++parens > MAX_PARENS) return null;
      else if (text[i] === ")" && parens-- === 0) break;
    }
    src = text.slice(start, i);
  }
  skip();
  const close = { "\"": "\"", "'": "'", "(": ")" }[text[i]];
  if (close) {
    for (i++; i < limit && text[i] !== close; i++) if (text[i] === "\\") i++;
    if (i >= limit) return null;
    i++;
    skip();
  }
  if (i >= limit || text[i] !== ")") return null;
  return { alt: decoded(alt.replace(/\\(.)/g, "$1")), src: decoded(src.replace(/\\(.)/g, "$1")), end: i + 1 };
}

// The http(s) URL in `<…>` at `at`, written as the Markdown keeps it (see
// the header): { text, end } or null, also where the parser takes it for no
// URL. The search stops at the next `<`, so no two of them read the same
// text.
function webLink(text, at) {
  WEB_LINK.lastIndex = at;
  const m = WEB_LINK.exec(text);
  const url = m ? keptUrl(m[1]) : null;
  return url ? { text: `<${url}>`, end: at + m[0].length } : null;
}

// The blank lines of a text: for each, where its line break before stands
// and where the one after it ends, in order (both grow together).
function blankLines(text) {
  const starts = [];
  const ends = [];
  for (let p = text.indexOf("\n"); p >= 0;) {
    const next = text.indexOf("\n", p + 1);
    if (next < 0) break;
    if (/^[ \t]*\r?$/.test(text.slice(p + 1, next))) {
      starts.push(p);
      ends.push(next + 1);
    }
    p = next;
  }
  return { starts, ends };
}

// Whether a blank line lies wholly within [from, to): the first one that
// starts at or after `from` ends first, so it alone needs a look.
function blankWithin(blanks, from, to) {
  let lo = 0;
  let hi = blanks.starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blanks.starts[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  return lo < blanks.starts.length && blanks.ends[lo] <= to;
}

// Where Markdown has code, as [start, end) spans in order: fenced blocks
// (``` or ~~~ at most 3 spaces in, to their closing fence or the end),
// indented blocks (lines 4 spaces or a tab in, where no paragraph goes on)
// and code spans (a run of backticks to the next run
// of the same length within its paragraph, not after a backslash). It
// reads code as CommonMark does in the plain cases; where it misses some,
// a comment in it goes as one outside code would, and where it takes too
// much, a comment stays as text: neither loads anything.
export function codeRanges(text) {
  const ranges = [];
  let pos = 0;
  let fence = null;
  let para = null;
  const endPara = (end) => {
    if (para !== null) codeSpans(text, para, end, ranges);
    para = null;
  };
  for (const line of text.split("\n")) {
    const start = pos;
    const end = pos + line.length;
    pos = end + 1;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
      if (close && close[1][0] === fence.mark && close[1].length >= fence.size) {
        ranges.push([fence.start, end]);
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      endPara(start);
      fence = { mark: open[1][0], size: open[1].length, start };
    } else if (/^[ \t]*\r?$/.test(line)) endPara(start);
    else if (para === null && /^( {4}|\t)/.test(line)) ranges.push([start, end]);
    else if (para === null) para = start;
  }
  if (fence) ranges.push([fence.start, text.length]);
  endPara(text.length);
  return ranges;
}

// The code spans of the paragraph text [from, to), into `ranges`: each run
// of backticks not after a backslash, to the next run of its length; the
// runs between are inside it. Each length's runs are walked once.
function codeSpans(text, from, to, ranges) {
  const runs = [];
  for (let i = from; i < to;) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (j < to && text[j] === "`") j++;
    runs.push({ at: i, size: j - i, opens: text[i - 1] !== "\\" });
    i = j;
  }
  const bySize = new Map();
  runs.forEach((r, k) => (bySize.get(r.size) ?? bySize.set(r.size, []).get(r.size)).push(k));
  const next = new Map();
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    if (!r.opens) continue;
    const same = bySize.get(r.size);
    let p = next.get(r.size) ?? 0;
    while (p < same.length && same[p] <= k) p++;
    next.set(r.size, p);
    if (p < same.length) {
      ranges.push([r.at, runs[same[p]].at + r.size]);
      k = same[p];
    }
  }
}

// Markdown as the details hand it on (see the header).
function keptMarkdown(text) {
  const tagAt = tagReader(text);
  const commentEnd = commentReader(text);
  const code = codeRanges(text);
  const blanks = blankLines(text);
  let c = 0;
  // Whether a position, growing from call to call, is in code.
  const inCode = (at) => {
    while (c < code.length && code[c][1] <= at) c++;
    return c < code.length && code[c][0] <= at;
  };
  let line = 0;
  let lineEnd = text.indexOf("\n");
  // Whether a position, growing from call to call, starts its line after
  // at most 3 spaces, where a comment starts an HTML block.
  const startsLine = (at) => {
    while (lineEnd >= 0 && lineEnd < at) {
      line = lineEnd + 1;
      lineEnd = text.indexOf("\n", line);
    }
    return at - line <= 3 && /^ *$/.test(text.slice(line, at));
  };
  const marks = /<|!\[/g;
  const out = [];
  let from = 0;
  for (let m = marks.exec(text); m; m = marks.exec(text)) {
    const at = m.index;
    out.push(text.slice(from, at));
    from = at + m[0].length;
    if (m[0] === "<") {
      let end = commentEnd(at);
      if (end >= 0 && (inCode(at) || (!startsLine(at) && blankWithin(blanks, at, end)))) end = -1;
      const link = end < 0 ? webLink(text, at) : null;
      const tag = end < 0 && !link ? tagAt(at) : null;
      if (end >= 0) from = end;
      else if (link) {
        out.push(link.text);
        from = link.end;
      } else if (tag && !tag.close && IMAGES.has(tag.name)) {
        const attrs = attributesOf(tag.body);
        out.push(markdownImage(attrs.alt, attrs.src ?? ""));
        from = tag.end;
      } else out.push(`<${ZWSP}`);
    } else {
      const image = inlineImage(text, at);
      if (image) {
        out.push(markdownImage(image.alt, image.src));
        from = image.end;
      } else if (text[from] === "]") out.push("[Bild");
      else out.push("[Bild: ");
    }
    marks.lastIndex = from;
  }
  out.push(text.slice(from));
  return out.join("").replace(/!\[/g, `!${ZWSP}[`);
}

// A description as the details hand it to TextView (format: "markdown" or
// "html"), see the header; null where it has no text.
export function shownDescription(text, format) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  return format === "html" ? keptHtml(raw) : keptMarkdown(raw);
}

// ==== src/main.js ====

const TICK_MS = 30000;
export const PREFETCH_GAP_MS = 1500;
export const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
// From the application root (gpui-kit's svg).
export const REFRESH_ICON = "mods/board/refresh.svg";
// How often a copy looks whether it shows (watchShown). herdr draws, and so
// renders, only a copy that shows, again on a change of its live data (spaces
// and tabs, the focus, shared state); a change of the layout alone is not
// documented to render it, while its timers run when it is hidden too. So no
// render sees the copy be hidden, and none may come when it comes to show:
// this timer sees both, and a render that comes first sees the show too.
export const WATCH_MS = 250;
// How often a copy that shows asks its shape's bandsLeft (shapes/index.js),
// from the look that sees it show to the one that sees it hidden
// (watchShown): herdr tells a script of no drag of a scrollbar's thumb.
// on_window_mouse_move would, but it calls the script at every move of the
// pointer anywhere in the window; on_window_mouse_up sees only the release.
// An ask reads each shown column's ScrollHandle: its offset and its window's
// size.
export const BAND_MS = 100;
// Why "nur meine" cannot tell one's own items, where the source has no words
// of its own for it (noViewer): it did not name the login it read as.
const NO_VIEWER = "die Quelle hat nicht gesagt, als wer sie gelesen wurde";
// Keys the board binds in its own key context. herdr binds Tab and
// shift-Tab app-wide (gpui-kit's ShellRoot), to moving the keyboard to the
// next or previous tab stop, and runs a matching binding's action before
// on_key_down, so Tab never reaches a dialog's key handler, not even while
// the dialog's text field has the keyboard; while a dialog with fields is
// open, or, with no dialog and no filter being typed, the details of an
// item whose source has related items to read (readsRelated; to move the
// keyboard into the details panel and back), the board takes it as an
// action of its own. Of the matching bindings, the one in the deepest
// context wins, so a binding in the context of the board's root comes
// first (the leader mod binds the same way and says more:
// mods/leader/main.js, KEY_CONTEXT). The root carries that context only
// while the board takes Tab (takesTab), and a binding matches only in a
// context on the path to what has the keyboard, so otherwise herdr's own
// Tab runs as before. That matters: herdr's AppWindow runs every
// action the board does not stop as a command of its own, and says
// "unknown command" for one it does not know (herdr's src/window.rs, its
// ShellAction listener and run). Each action runs tabKey, the one place
// that says what Tab does on the board.
export const BOARD_KEY_CONTEXT = "Board";
export const BOARD_KEYS = [
  { keystroke: "tab", action: "board_tab", back: false },
  { keystroke: "shift-tab", action: "board_shift_tab", back: true },
];

// Which end gg, G, Home and End go to ("top", "bottom"), "pending" for a
// first `g` (`g`: one came just before), null for any other key. g and G
// are the letter keys keyName (commands.js) names, so that Caps Lock
// changes no key. No key of the board or of keys.json is a bare g, G, Home
// or End.
export function edgeKey(k, ch, mod, g) {
  if (mod.control || mod.alt || mod.platform) return null;
  if (k === "home") return "top";
  const name = keyName(k, ch, mod);
  if (k === "end" || name === "G") return "bottom";
  if (name !== "g") return null;
  return g ? "top" : "pending";
}

export default class Board extends View {
  init(initProps, cx) {
    this.initProps = initProps;
    // Whether this copy showed when it last looked (at init, in a render or
    // on the WATCH_MS timer; null before the first look), the focus the
    // layer's board was shown with (watchShown, followFocus), its BAND_MS
    // timer while it shows (followBandsWhile), and the last failure each
    // guarded step said (guarded).
    this.wasShown = null;
    this.seen = null;
    this.bandTimer = null;
    this.failed = {};
    this.handle = cx.focus_handle();
    this.config = null;
    this.configErrors = [];
    this.views = {}; // per view id, see state()
    this.prefetchWaits = false;
    this.prefetchLeft = new Set();
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
    this.drag = null; // { key, from, at }: `at` where it was pressed
    this.over = null; // the column index under a drag
    this.paths = toolPaths(exec);
    this.sources = makeSources(this.paths);
    this.kinds = null; // view id → viewKind in the last valid views.json
    // What each shape keeps per Board, by shape name (state(),
    // shapes/index.js).
    this.shapeState = Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [name, shape.state?.() ?? {}]));
    // What the related items' lines keep (ui/related.js), and the details
    // panel's keyboard while it has it (panelOf).
    this.relatedUi = relatedState();
    this.panel = null;
    // Whether the last key was a `g`, the first of gg (edgeKey).
    this.afterG = false;
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
      this.followBandsWhile(true, cx);
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
    cx.timer.every(WATCH_MS, (cx) => {
      this.guarded("Anzeige", () => this.watchShown(cx));
      // A safety net: details that came to show by a way that did not read
      // their related items (readRelated) are read here.
      this.guarded("Details", () => boardShown(this.isLayer()) && this.readRelated(cx));
    });
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

  // Whether the board takes Tab and shift-Tab (BOARD_KEYS): while a dialog
  // with fields is open (its tab, MODALS), and, with no dialog and no filter
  // being typed, while the shown view's details are of an item whose source
  // has related items to read (readsRelated), to move the keyboard into the
  // details panel and back. Anything else leaves Tab to herdr: the root
  // carries the board's key context only while this holds.
  takesTab() {
    if (this.modal) return Boolean(MODALS[this.modal.kind].tab);
    return !this.filtering && this.readsRelated(this.detailsRoot());
  }

  // Tab and shift-Tab (`back`), while the board takes them (takesTab): the
  // open dialog's next or previous field, else the keyboard into the details
  // panel or back to the board (togglePanel).
  tabKey(back, cx) {
    this.afterG = false;
    if (!this.takesTab()) return;
    cx.stop_propagation();
    if (this.modal) return MODALS[this.modal.kind].tab(this, back, cx);
    this.togglePanel(this.view());
    cx.notify();
  }

  // ---- data ----

  // A view's state: again (one more refresh after this one), at (last
  // success) and tried (last start), moves (laid over refreshes, see
  // pendingMoves), pending (keys of items being written), unclear (open
  // outcomes: key, label, at and writeAtOnce's w.open; see settleUnclear),
  // stored/hidden (the person's toggles and the hidden set), sel
  // ({ col, key }, null before the first data), picked (the key of the item
  // the person chose, see clickItem), want (an item to choose once a refresh
  // has it: chooseWanted), related (by item key: readRelated), folds (as the
  // store keeps them: readStoredFolds) and chosenFolds (in the sprints the
  // sprint picker chose, by their id: foldsOf), sprint (the sprint a Sprint
  // view shows in place of the current one, { id, name } as the sprint picker
  // chose it, null for the current one; never stored), saved (the data drawn
  // is the saved state, or what a read drew over it so far), restored (the
  // saved state was looked for), progress ({ page, pages }) and unavailable
  // (the last read since views.json was read found its source unavailable).
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, warnings: [], moves: [], pending: {}, unclear: [],
      stored: readStoredHidden(store.get(`hidden:${id}`)), hidden: null, sel: null, picked: null, runs: 0, want: null, detail: false,
      related: new Map(), folds: readStoredFolds(store.get(`folded:${id}`)), chosenFolds: new Map(), sprint: null,
      saved: false, restored: false, progress: null, unavailable: false,
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
      for (const st of Object.values(this.views)) st.unavailable = false;
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
      // A views.json with problems leaves those views out.
      if (!this.configErrors.length) for (const k of goneSaved(store.keys(), new Set(kinds.keys()))) store.remove(k);
      this.prefetchLeft = new Set(kinds.keys());
      const shown = this.view();
      if (shown) this.restore(shown);
      cx.timer.after(0, () => this.guarded("Gespeicherter Stand", () => viewsOf(this.config ?? {}).forEach((v) => this.restore(v))));
      if (!shown || !this.loader(shown)) this.schedulePrefetch(cx);
      if (!shown) return;
      this.sources[shown.source]?.forget?.(shown);
      // The open details' related items are read again too.
      this.state(shown.id).related.clear();
      this.refresh(shown, cx);
      this.readRelated(cx);
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
    st.progress = null;
    const open = st.detail ? this.selected(view) : null;
    st.related = keptRelated(st.related, open ? open.key : null, (this.panelIn(view)?.levels ?? []).map((l) => l.item.key));
    const started = st.tried;
    const run = ++st.runs;
    const chosen = st.sprint;
    const before = { data: st.data, warnings: st.warnings };
    // Over data this session read, the new data shows only once whole.
    const inSteps = !st.data || st.saved;
    const hidden = this.hiddenFor(view);
    cx.spawn(async (cx) => {
      let drew = false;
      let ended = false;
      const live = {
        partial: (result) => {
          if (ended || !inSteps) return;
          const { data, warnings } = result();
          drew = true;
          st.data = SHAPES[data.shape].received(data, st);
          st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
          this.keepSelection(view);
          cx.notify();
        },
        page: (page, pages) => {
          if (ended) return;
          st.progress = { page, pages };
          cx.notify();
        },
      };
      try {
        const { data, warnings, notice } = await loader.load(view, { hiddenFor: (v) => this.hiddenFor(v), chosen, live });
        // What the load has to say beside its data (a chosen sprint gone).
        if (notice) this.say(notice, "warning", cx);
        st.moves = pendingMoves(st.moves, started);
        st.data = SHAPES[data.shape].received(data, st);
        st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
        st.error = null;
        st.at = Date.now();
        st.saved = false;
        st.unavailable = false;
        // A sprint the picker chose is the view's only while the board runs.
        if (!chosen) this.save(view, hidden, { data, warnings }, st.at, cx);
        this.keepSelection(view);
        this.chooseWanted(view, run, cx);
        this.settleUnclear(view, started, data, cx);
      } catch (e) {
        st.error = report(e);
        st.unavailable = Boolean(e?.unavailable);
        // A failed read keeps what showed before it, not what it drew on its
        // way.
        if (drew) {
          st.data = before.data && SHAPES[before.data.shape].received(before.data, st);
          st.warnings = before.warnings;
          if (st.data) this.keepSelection(view);
          else Object.assign(st, { sel: null, picked: null, detail: false });
        }
        const open = st.unclear.filter(isDue(st, started));
        if (open.length) {
          this.say(`${open.map((u) => u.label).join(", ")}: Ergebnis weiter offen, Neuladen fehlgeschlagen (${errorText(e)})`, "warning", cx);
        }
      } finally {
        ended = true;
        st.loading = false;
        st.progress = null;
        // The follow-up refresh reads the view from the config as it is now.
        const fresh = this.viewById(view.id);
        if (st.again && fresh) this.refresh(fresh, cx);
        // Related items that waited for the refresh, or whose read failed
        // or wants a retry and so was not kept (keptRelated), are read now;
        // after a follow-up refresh, once it ended.
        this.readRelated(cx);
        this.schedulePrefetch(cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  restore(view) {
    const st = this.state(view.id);
    if (st.restored) return;
    st.restored = true;
    if (st.data || !this.loader(view)) return;
    const key = savedKey(view.id);
    const text = store.text(key);
    if (text === null) return;
    const before = { data: st.data, warnings: st.warnings, at: st.at, saved: st.saved, sel: st.sel, picked: st.picked, detail: st.detail, sprint: st.sprint };
    try {
      const saved = readSaved(text, view, this.hiddenFor(view));
      const shape = SHAPES[saved?.data.shape];
      if (!shape?.loads) return;
      const data = shape.received(saved.data, st);
      const warnings = [...saved.warnings, ...shape.warnings(view, saved.data)];
      Object.assign(st, { data, warnings, at: saved.at, saved: true });
      this.keepSelection(view);
    } catch (e) {
      // An entry from code that drew it otherwise: the read draws instead.
      Object.assign(st, before);
      store.remove(key);
      boardLog.write(`board: ${key} dropped: ${firstLine(e?.message ?? e)}`);
    }
  }

  // After the draw the data came with. Where the store does not take the
  // read, the entry before goes too: a restart would draw it as the last.
  save(view, hidden, read, at, cx) {
    cx.timer.after(0, () => this.guarded("Speichern", () => {
      const key = savedKey(view.id);
      const text = savedText(view, hidden, read, at);
      const refused = text === null ? `more than ${SAVED_MAX} bytes` : store.setText(key, text);
      if (refused === null) return;
      store.remove(key);
      boardLog.write(`board: ${key} not saved: ${refused}`);
    }));
  }

  schedulePrefetch(cx) {
    if (this.prefetchWaits) return;
    this.prefetchWaits = true;
    cx.timer.after(PREFETCH_GAP_MS, (cx) => {
      this.prefetchWaits = false;
      this.guarded("Vorladen", () => this.prefetchNext(cx));
    });
  }

  prefetchNext(cx) {
    if (!this.config || !boardShown(this.isLayer()) || this.modal?.busy) return;
    if (Object.values(this.views).some((st) => st.loading || Object.keys(st.pending).length)) return;
    const [next, ...rest] = prefetchOrder(viewsOf(this.config).filter((v) => this.prefetchLeft.has(v.id)), {
      shown: this.view(), source: this.source()?.id, now: Date.now(), every: this.config.refreshMinutes * 60000,
      stateOf: (id) => this.state(id), loads: (v) => Boolean(this.loader(v)),
    });
    this.prefetchLeft = new Set(rest.map((v) => v.id));
    if (!next) return;
    this.restore(next);
    this.refresh(next, cx);
  }

  // After the refresh `run` (its number, st.runs) succeeded: the item a
  // write asked to be chosen (st.want = { key, after: the refreshes started
  // when it asked }: a created work item), once by the first refresh that
  // started after it asked (an earlier one may have read before the item
  // was there); where that refresh's data does not show it (the filter,
  // "nur meine"), nothing is chosen.
  chooseWanted(view, run, cx) {
    const st = this.state(view.id);
    const want = st.want;
    if (!want || run <= want.after) return;
    st.want = null;
    const col = columnOf(this.navColumns(view), want.key);
    if (col >= 0) this.choose(view, { col, key: want.key }, cx);
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
    SHAPES[data?.shape]?.settle?.(this, view, due, data, cx);
  }

  // Every TICK_MS while the board shows: the shown view once refreshMinutes
  // have passed since it was last tried, and the prefetch where it waited.
  tick(cx) {
    if (!this.config || !boardShown(this.isLayer())) return;
    const shown = this.view();
    if (shown && refreshDue(this.state(shown.id), Date.now(), this.config.refreshMinutes * 60000)) this.refresh(shown, cx);
    this.schedulePrefetch(cx);
    cx.notify();
  }

  followBandsWhile(shown, cx) {
    this.bandTimer?.cancel();
    this.bandTimer = shown ? cx.timer.every(BAND_MS, (cx) => this.guarded("Spalten", () => this.followBands(cx))) : null;
  }

  followBands(cx) {
    const view = this.view();
    if (view && this.shape(view).bandsLeft?.(this)) cx.notify();
  }

  // ---- related items, the details panel ----

  // Whether the item's source has related items to read for it (its
  // related.reads, related.js).
  readsRelated(item) {
    return Boolean(item && this.sources[item.source]?.related?.reads(item));
  }

  // Whether the item is a pull request whose details its source reads for
  // the panel to go down to (its pullRequest.reads, related.js).
  readsPullRequest(item) {
    return Boolean(item && this.sources[item.source]?.pullRequest?.reads(item));
  }

  // The item whose details show in the shown view (the board's selected
  // one, at the top of the way the panel went down), or null.
  detailsRoot() {
    const view = this.view();
    return view ? this.detailsRootOf(view) : null;
  }

  // The same in `view`.
  detailsRootOf(view) {
    return this.state(view.id).detail ? this.selected(view) : null;
  }

  // The levels the details panel went down to in `view` (drillLine), the
  // deepest last; none while it is at the top or does not have the keyboard.
  levelsOf(view) {
    return this.panelOf(view)?.levels ?? [];
  }

  // The item the details panel shows in `view`: the deepest level it went
  // down to (a pull request with its details laid over its line, once
  // read), else the item whose details show; null for none.
  levelItem(view) {
    const level = this.levelsOf(view).at(-1)?.item;
    if (!level) return this.detailsRootOf(view);
    const pr = this.relatedOf(view, level)?.data?.pr;
    return pr ? { ...level, ...pr } : level;
  }

  // What the view keeps of the item's related items, the entry relatedRows
  // (ui/related.js) draws from, or null before they are read.
  relatedOf(view, item) {
    return this.state(view.id).related.get(item.key) ?? null;
  }

  // Reads the related items of the item whose details show in the shown
  // view, and of each level the details panel went down to from it, where
  // its source has some to read and the view keeps none (keptRelated says
  // what a refresh keeps; Calls, above). While a refresh of the view runs
  // it waits: the refresh reads them once it ended (refresh).
  readRelated(cx) {
    const view = this.view();
    const item = this.detailsRoot();
    if (!item || this.state(view.id).loading) return;
    this.readRelatedOf(view, item, false, cx);
    for (const level of this.levelsOf(view)) this.readRelatedOf(view, level.item, true, cx);
  }

  // Reads the related items of `item` in `view` (readRelated), where its
  // source has some to read and the view keeps none, or, where it is a
  // `level` the panel went down to, a pull request's details (its source's
  // pullRequest, kept as { pr } under its key the same way; the selected
  // pull request's details are the view's own); once they came, the levels
  // below it are checked (checkLevels).
  readRelatedOf(view, item, level, cx) {
    const st = this.state(view.id);
    const related = this.readsRelated(item);
    if (!(related || (level && this.readsPullRequest(item))) || st.related.has(item.key)) return;
    const entry = { data: null, error: null, shown: null };
    st.related.set(item.key, entry);
    const source = this.sources[item.source];
    cx.spawn(async (cx) => {
      try {
        if (!related) return void (entry.data = { pr: await source.pullRequest.load(item, view) });
        const data = await source.related.load(item, view);
        // The description as drawn, once per read (description.js).
        entry.shown = shownDescription(data.description, data.format);
        entry.data = data;
      } catch (e) {
        entry.error = report(e);
      } finally {
        // A read `r` dropped (reload) decides nothing.
        if (entry.data && st.related.get(item.key) === entry) this.checkLevels(view, item.key, cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  // After the related items of the item `key` came: where the panel went
  // down from that item, the level below is checked against the section its
  // line came from (drillLine), where that section came whole (wholeSection,
  // related.js): its line is found there again, whose item the level then
  // shows as it is now, or it is no longer there (`r` read them again), and
  // the panel goes back up to that item, and says so. A section that did not
  // come whole decides nothing.
  checkLevels(view, key, cx) {
    const panel = this.panelIn(view);
    if (!panel) return;
    const levels = panel.levels;
    const way = [this.detailsRootOf(view), ...levels.map((l) => l.item)];
    const at = way.findIndex((i) => i?.key === key);
    if (at < 0 || at >= levels.length) return;
    const section = this.relatedOf(view, way[at])?.data?.[levels[at].section];
    if (!wholeSection(section)) return;
    const next = levels[at].item;
    const found = section.lines.find((l) => sameItem(l, next));
    if (found) return void (levels[at].item = { ...found, key: next.key });
    while (levels.length > at) this.levelUp(view, panel);
    this.say(`${itemLabel(next)} steht nicht mehr bei ${itemLabel(way[at])}: zurück zu ${itemLabel(way[at])}`, "info", cx);
  }

  // The details panel's keyboard while it has it in `view`, for the item
  // whose details show there; else null, when the board has it: { view,
  // key (the item's), line (the line selected, null for none), levels (the
  // levels it went down to: drillLine) }. Once it is not theirs (another
  // view or item, one without related items, or the details closed) it is
  // dropped, so that it does not come back with them, nor do its levels.
  panelOf(view) {
    const p = this.panelIn(view);
    if (!p) this.panel = null;
    return p;
  }

  // The panel as panelOf finds it, without dropping it: for a view that
  // may not be the one shown (a read or a refresh that ends after a switch),
  // whose look must leave another view's panel alone.
  panelIn(view) {
    const p = this.panel;
    const st = this.state(view.id);
    return p && p.view === view.id && st.detail && st.sel?.key === p.key && this.readsRelated(this.selected(view)) ? p : null;
  }

  // Tab, where the board takes it for the panel (takesTab: the details of
  // an item with related items to read show): the keyboard into the details
  // panel, no line selected, or back to the board where the panel has it,
  // which closes the levels it went down to: the board's keys act on its
  // selected item, whose details then show again.
  togglePanel(view) {
    const item = this.detailsRoot();
    this.panel = this.panelOf(view) ? null : { view: view.id, key: item.key, line: null, levels: [] };
  }

  // The lines of the related items that show in `view` (relatedLines), of
  // the level the panel shows; none on a pull request's.
  linesOf(view) {
    const item = this.levelItem(view);
    return relatedLines(this.readsRelated(item) ? this.relatedOf(view, item)?.data : null);
  }

  // A key while the details panel has the keyboard: j/k or the arrows walk
  // its lines, each scrolled into view; with no line selected they scroll
  // the block a line (LINE_PX), j until the first line shows whole, which
  // it then selects, k from the first line to none and then up. Esc goes
  // a level up where the panel went down (levelUp), else gives the keyboard
  // back. True when the panel took the key. Enter and o on the selected
  // line are actions (commands.js: line-details, line-open).
  panelKey(view, panel, k) {
    const dir = { j: 1, down: 1, k: -1, up: -1 }[k];
    const lines = this.linesOf(view);
    if (dir) {
      const item = this.levelItem(view);
      const entry = this.relatedOf(view, item);
      const ui = this.relatedUi;
      if (panel.line === null && (dir < 0 || !lines.length || !lineShows(ui, item, entry, 0))) scrollBy(ui, dir * LINE_PX);
      else {
        panel.line = stepLine(panel.line, dir, lines.length);
        if (panel.line !== null) revealLine(ui, item, entry, panel.line);
      }
      return true;
    }
    if (k === "escape") {
      if (panel.levels.length) this.levelUp(view, panel);
      else this.panel = null;
      return true;
    }
    return false;
  }

  // Enter on a line (commands.js, line-details): its item's details in the
  // panel, a level down, where its source reads related items for it
  // (readsRelated) or, for a pull request, its details (readsPullRequest;
  // either read as the selected item's are: readRelated); the board's
  // selection stays. The level keeps what the level above showed (its
  // selected line, its scroll with the heights it was measured at, and its
  // unfolded description), for Esc to bring back (levelUp), and the
  // section its line came from, for a read of the level above to check it
  // (checkLevels). A line whose item has none to read is said; `o` opens it.
  drillLine(view, line, cx) {
    const panel = this.panelOf(view);
    if (!panel) return;
    const item = { ...line, key: lineKey(line) };
    if (!this.readsRelated(item) && !this.readsPullRequest(item)) return this.say(`${itemLabel(line)} lässt sich hier nicht zeigen`, "info", cx);
    const ui = this.relatedUi;
    const back = { line: panel.line, ...keptScroll(ui), unfolded: ui.unfolded };
    const section = sectionOf(this.relatedOf(view, this.levelItem(view))?.data, line);
    panel.levels.push({ item, back, section });
    panel.line = null;
    ui.sizes = new Map();
    this.readRelated(cx);
    cx.notify();
  }

  // Esc on a level the panel went down to: the level above again, as it
  // showed (drillLine kept it), its line the one it went down from, found
  // again among its lines where they are read (none where it is no longer
  // there), else the line as it was, and scrolled into view.
  levelUp(view, panel) {
    const { item: from, back } = panel.levels.pop();
    const item = this.levelItem(view);
    const entry = this.relatedOf(view, item);
    const ui = this.relatedUi;
    // Its heights as they were measured, until it is laid out again: the
    // window's too, which takes its height from the content.
    restoreScroll(ui, item.key, back);
    ui.unfolded = back.unfolded;
    if (entry?.data) {
      const at = relatedLines(entry.data).findIndex((l) => sameItem(l, from));
      panel.line = at < 0 ? null : at;
    } else panel.line = back.line;
    if (panel.line !== null) revealLine(ui, item, entry, panel.line);
  }

  // "Zeile auf dem Board" (commands.js, line-board; the panel's button):
  // where a shown column holds the line's item, that item is selected and
  // its details show; the panel keeps the keyboard (with no line selected
  // and none of the levels it went down to) where that item has related
  // items to read, else the board takes it back. Where no shown column
  // holds it, it says so.
  enterLine(view, line, cx) {
    const place = placeOf(this.navColumns(view), line);
    if (!place) return this.say(`${itemLabel(line)} ist nicht auf dem Board`, "info", cx);
    this.choose(view, place, cx);
    this.panel = this.readsRelated(this.selected(view)) ? { view: view.id, key: place.key, line: null, levels: [] } : null;
  }

  // A click on line `at` of the related items: the keyboard into the panel
  // on that line (at the level it shows), and Enter on it.
  pickLine(view, at, cx) {
    const item = this.detailsRootOf(view);
    const line = this.linesOf(view)[at];
    if (!item || !line) return;
    this.panel = this.panelOf(view) ?? { view: view.id, key: item.key, line: null, levels: [] };
    this.panel.line = at;
    this.handle.focus();
    this.drillLine(view, line, cx);
    cx.notify();
  }

  // gg/G and Home/End (edgeKey) while the details panel has the keyboard:
  // its top, with no line selected, or its bottom, on its last line where it
  // has lines.
  panelEdge(view, panel, end) {
    const count = this.linesOf(view).length;
    panel.line = end === "bottom" && count ? count - 1 : null;
    scrollToEnd(this.relatedUi, end);
  }

  // ctrl-d and ctrl-u while the details panel has the keyboard: its block
  // half its window down or up.
  panelPage(dir) {
    scrollPage(this.relatedUi, dir);
  }

  // gg/G and Home/End: the panel's top or bottom where it has the keyboard,
  // else the first or last item of the selected column (a list's first or
  // last row: edgeOf) in a view with data.
  toEdge(view, end, cx) {
    const panel = this.panelOf(view);
    if (panel) return this.panelEdge(view, panel, end);
    const st = this.state(view.id);
    if (!st.data) return;
    this.keepSelection(view);
    const sel = edgeOf(this.navColumns(view), st.sel, end);
    if (sel) this.choose(view, sel, cx);
  }

  // z (commands.js, fold-description), or a click on the description's
  // switch: the shown details' description unfolded, or folded again,
  // where it is taller than its fold (ui/related.js); true when it is.
  toggleFold(cx) {
    const view = this.view();
    const item = view ? this.levelItem(view) : null;
    const ui = this.relatedUi;
    if (!this.readsRelated(item) || !descriptionFolds(ui, item)) return false;
    ui.unfolded = ui.unfolded === item.key ? null : item.key;
    cx.notify();
    return true;
  }

  // A link in a description, as TextView reports its click: opened as an
  // item's page is (open) where it is an http or https URL (webUrl), else
  // said and not opened.
  openLink(url, cx) {
    const page = webUrl(url);
    if (page) this.open({ url: page }, cx);
    else this.say(`Link nicht geöffnet (nur http und https): ${url}`, "warning", cx);
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
  // close, so that they never show an item unasked.
  reselect(view, sel) {
    const st = this.state(view.id);
    const other = sel.key !== st.sel?.key;
    st.sel = sel;
    if (!other) return;
    st.picked = null;
    st.detail = false;
    this.scrollToSelection(view);
  }

  // The item the person chose (what counts as a choice: clickItem): selected
  // and kept as chosen; open details follow it, and its related items are
  // read (readRelated).
  choose(view, sel, cx) {
    const st = this.state(view.id);
    st.sel = sel;
    st.picked = sel.key;
    this.scrollToSelection(view);
    this.readRelated(cx);
  }

  // Only the shown view: the views of a shape share its scroll handles.
  scrollToSelection(view) {
    if (this.view()?.id !== view.id) return;
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

  // ] and [: the shown source's next or previous tab (`by` 1 or -1), past
  // the last the first and back.
  stepTab(by, cx) {
    const tabs = this.contexts();
    if (tabs.length) this.switchTab(stepIndex(tabs.length, shownIndex(tabs, this.context()), by), cx);
  }

  // Shows another source with the tab it showed last.
  switchSource(id, cx) {
    if (!sourcesOf(this.config).some((s) => s.id === id)) return;
    this.sourceId = id;
    store.set("source", id);
    this.showContext(cx);
  }

  // After another tab came up: the notice goes, and its view loads as the
  // header says (Calls).
  showContext(cx) {
    this.notice = null;
    const v = this.view();
    const st = v && this.state(v.id);
    if (v) this.restore(v);
    if (v && !st.loading && (!st.data || refreshDue(st, Date.now(), this.config.refreshMinutes * 60000))) this.refresh(v, cx);
    if (v && !this.loader(v)) this.schedulePrefetch(cx);
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
    this.setTeamView(teamViewAfter(context, this.teamViewOf(context)), cx);
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
    else this.choose(view, sel, cx);
    this.handle.focus();
    this.readRelated(cx);
    cx.notify();
  }

  // A card dropped onto another column by a drag: chosen (clickItem), in the
  // column it is in now (its own, where the move was refused).
  chooseDropped(view, key, cx) {
    const col = columnOf(this.navColumns(view), key);
    if (col >= 0) this.choose(view, { col, key }, cx);
  }

  // Enter: details first, then the item's session (go to it, or start one).
  enter(view, cx) {
    const st = this.state(view.id);
    const item = this.selected(view);
    if (!item) return;
    if (!st.detail) {
      st.detail = true;
      this.readRelated(cx);
      return cx.notify();
    }
    this.startSession(view, item, cx);
  }

  // The session of `item` (the selected one, or the one the details panel
  // went down to): go to it, or start one.
  startSession(view, item, cx) {
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
      boardLog.write(e?.stack ?? String(e));
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
  // after the look and only where it still shows; it starts its BAND_MS
  // timer and the prefetch at once. While hidden, the timer stops and the
  // layer's board forgets the focus it compared with (followFocus), so it
  // starts anew when it shows.
  watchShown(cx) {
    const shown = boardShown(this.isLayer());
    const was = this.wasShown;
    this.wasShown = shown;
    if (!shown) {
      this.seen = null;
      this.followBandsWhile(false, cx);
      return;
    }
    if (was !== false) return;
    this.followBandsWhile(true, cx);
    this.schedulePrefetch(cx);
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

  // The moment an action runs in, `c` as the action table takes it
  // (commands.js says its fields).
  actionContext() {
    const view = this.view();
    const st = view ? this.state(view.id) : null;
    const panel = view ? this.panelOf(view) : null;
    const details = view ? this.levelItem(view) : null;
    const levels = panel?.levels ?? [];
    return {
      b: this, view, st, shape: view ? this.shape(view) : null, item: view ? this.selected(view) : null, details,
      related: this.readsRelated(details), panel, line: panel?.line ?? null, lines: panel ? this.linesOf(view) : [],
      drilled: levels.length > 0, trail: details ? [this.detailsRootOf(view).key, ...levels.map((l) => l.item.key)] : null,
    };
  }

  // The moment an action runs in as its key runs it, the step the keys
  // (key), the menu's opening (openCommands) and its actions (runAction)
  // share: the board keeps its selection first (keepSelection).
  keptContext() {
    const view = this.view();
    if (view && this.state(view.id).data) this.keepSelection(view);
    return this.actionContext();
  }

  // An entry the menu picked (ui/modals/commands.js, menuActions): its
  // action, run as its key runs it, only on what it aimed at when the menu
  // opened and where it can still run. Where what it aimed at is gone (a
  // refresh dropped the item or took it out of sight, another column is
  // selected for "Spalte ausblenden", another view shows), or the action
  // cannot run on it any more (a refresh moved the card into the last
  // column), the menu says so and runs nothing.
  runAction(entry, cx) {
    const c = entry.action.bar ? this.actionContext() : this.keptContext();
    if (aimOf(entry.action, c) !== entry.aim) this.say(groupAimOf(entry.action, c) === entry.groupAim ? entry.gone : entry.groupGone, "info", cx);
    else if (!entry.action.when(c)) this.say(`„${entry.name}“ geht hier nicht mehr`, "info", cx);
    else entry.action.run(this, c, cx);
    cx.notify();
  }

  // The key of the action `id` where it runs it now, and its name now
  // (commands.js), for a text that names it.
  keyShown(id) {
    return keyShown(id, this.actionContext());
  }

  actionName(id) {
    return actionName(id, this.actionContext());
  }

  key(e, cx) {
    const k = e.key;
    const ch = e.key_char ?? "";
    const mod = e.modifiers ?? {};
    // A `g` waits for the next key only: any other key drops it (a Tab
    // action too: tabKey).
    const g = this.afterG;
    this.afterG = false;
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
    // Where Tab comes here rather than as the board's action: its one home.
    if (k === "tab") return this.tabKey(Boolean(mod.shift), cx);
    // A key without Shift, Alt or the platform key: bare without Control
    // too, else with Control alone.
    const plain = !(mod.alt || mod.platform || mod.shift);
    const bare = plain && !mod.control;
    if (view && plain && mod.control && (k === "d" || k === "u") && this.panelOf(view)) {
      return this.panelPage(k === "d" ? 1 : -1), done();
    }
    const end = view ? edgeKey(k, ch, mod, g) : null;
    if (end === "pending") return (this.afterG = true), done();
    if (end) return this.toEdge(view, end, cx), done();
    const panel = view && bare ? this.panelOf(view) : null;
    if (panel && this.panelKey(view, panel, k)) return done();
    // A key of an action of the top bar runs it at once; then the board
    // keeps its selection (keptContext), and Esc, the arrows and the keys
    // of the other actions follow (commands.js, actionFor).
    const name = keyName(k, ch, mod);
    const atOnce = name ? this.actionContext() : null;
    const first = name ? actionFor(name, atOnce) : null;
    if (first?.bar) return first.run(this, atOnce, cx), done();
    if (mod.control || mod.alt || mod.platform) return;
    const c = this.keptContext();
    const st = view ? this.state(view.id) : null;
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
      if (shape.dirs.includes(dir)) this.choose(view, shape.navigate ? shape.navigate(this, view, st, dir) : navigate(this.navColumns(view), st.sel, dir), cx);
      return done();
    }
    // With nothing selected (loading, failed, empty, a placeholder) Enter
    // and o stay herdr's (their actions do not take them).
    const action = name ? actionFor(name, c) : null;
    if (action) return action.run(this, c, cx), done();
  }

  openStatusMenu(view, cx) {
    const open = this.shape(view).openStatusMenu;
    if (!open) return this.say("Hier gibt es keinen Status zu ändern", "info", cx);
    open(this, view, cx);
    cx.notify();
  }

  // The column menu (ui/modals/columns.js), where the view's shape has
  // columns to hide.
  openColumns(view, cx) {
    MODALS.columns.open(this, view, cx);
  }

  // The command menu (ui/modals/commands.js): the actions that can run now,
  // on the selection the board keeps, as an action's key finds it.
  openCommands(cx) {
    MODALS.commands.open(this, this.keptContext(), cx);
  }

  // a: the assignee picker, where the shape's items can be assigned.
  openAssign(view, cx) {
    if (!this.shape(view).assign) return this.say("Hier gibt es keine Zuweisung zu ändern", "info", cx);
    MODALS.assign.open(this, view, cx);
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
    let out = v_flex().id("board").track_focus(this.handle);
    if (this.takesTab()) {
      out = out.key_context(BOARD_KEY_CONTEXT);
      for (const k of BOARD_KEYS) out = out.on_action(k.action, (_e, cx) => this.tabKey(k.back, cx));
    }
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
      .child(this.hints(t));
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
  // meine", the filter, the read under way, the age of the data drawn and
  // refresh. Without a valid views.json the first row holds only the
  // board's name.
  toolbar(t, view, st) {
    const { reading, age } = readLabels(st, Date.now());
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
      .when(Boolean(reading), (el) => el.child(div().id("reading").flex_none().text_size(12).text_color(t.muted).child(reading)))
      .when(Boolean(age), (el) => el.child(div().id("age").flex_none().text_size(12).text_color(t.muted).child(age)))
      .child(button(t, "refresh", svg(REFRESH_ICON).size(14).when(Boolean(st?.loading), (el) => el.spin(1000)), false, (cx) => this.reload(cx)));
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
  // many items it holds ("…" while it loads without data; shownOf while the
  // filter or "nur meine" hides some).
  tabs(t, context) {
    const count = (c) => {
      const st = this.state(this.viewFor(c).id);
      if (st.loading && !st.data) return "…";
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

  // "nur meine": when on, on the theme's `selected` as a chosen tab is,
  // with the accent border of its own; not as a primary button (solid),
  // which it is not. Its text and weight stay, so its size never changes.
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
      .bg(this.mine ? t.selected : t.chrome)
      .text_color(this.mine ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (!this.modal) this.toggleMine(cx);
      })
      .child("nur meine");
  }

  banner(t) {
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
      .children(lines.map((l) => div().text_color(toneColor(t, NOTE_TONES[l.level])).child(l.text)));
  }

  main(t, mono, view, st) {
    const box = v_flex().flex_1().min_w(0).min_h(0);
    const message = (text) => box.child(div().p(20).text_color(t.muted).child(text));
    const loading = () => box.child(h_flex().id("loading").p(20).gap(8).text_color(t.muted).child(div().frames(SPINNER_FRAMES, 150)).child("Lädt …"));
    if (!this.config) return this.configErrors.length ? message(`Keine gültige Ansicht in ${CONFIG_NAME}.json`) : loading();
    if (!view) return message("Keine Ansicht verfügbar");
    const shape = this.shape(view);
    if (shape.loads === false) return box.child(shape.render(this, t, mono, view, st));
    if (!st.data && !st.error) return st.loading ? loading() : message("Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(div().px(16).pt(14).text_color(toneColor(t, NOTE_TONES.error)).child(st.error));
    const warnings = [...st.warnings, ...this.noViewerWarning(view, st, shape)];
    if (warnings.length) shown = shown.children(warnings.map((w) => div().px(16).pt(6).text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(w)));
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

  // The details of `root`, the selected item, or of the item the panel went
  // down to from it (drillLine): then its way down at the top (pathLabel),
  // its rows from its line (levelParts) in place of the shape's, and its
  // session and page in the buttons.
  detail(t, mono, view, root) {
    const st = this.state(view.id);
    // Marked while it has the keyboard (Tab).
    const panel = this.panelOf(view);
    const levels = panel?.levels ?? [];
    const item = levels.length ? this.levelItem(view) : root;
    const session = linkedSession(item, spaces());
    // The rows of its own beside the header: the shape's (chips beside the
    // author, sections, buttons), or a level's (levelParts).
    const parts = (levels.length ? levelParts(this, t, view, item, this.relatedOf(view, item)) : this.shape(view).detailParts?.(this, t, view, item)) ?? {};
    const settings = startSettings(this.config, view, item.repo);
    const firstMessage = renderTemplate(item.kind === "pr" ? settings.review : settings.message, templateVars(item));
    const startLabel = session ? "Zur Sitzung ↵" : item.kind === "pr" ? "Review starten ↵" : "Agent starten ↵";
    // The panel's selected line, where it has one.
    const line = panel && panel.line !== null ? this.linesOf(view)[panel.line] ?? null : null;
    // The way down where the panel went down, else the item's label; and
    // its branch, as the PR list's details name a pull request's.
    const top = `${levels.length ? pathLabel(root, levels.map((l) => l.item)) : itemLabel(item)}${item.branch ? ` · ${item.branch}` : ""}`;
    return v_flex()
      .id("detail")
      .w(detailWidth(this.shape(view).columnCount?.(this, st) ?? 0))
      .min_w(DETAIL_MIN_W)
      .max_w(DETAIL_MAX_W)
      .flex_none()
      .bg(t.chrome)
      .border_l(1)
      .border_color(panel ? t.accent : t.border)
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
              .child(div().id("detail-top").flex_1().min_w(0).truncate().child(top))
              .child(div().text_size(11).child(levels.length ? "Esc zurück" : "Esc schließt")),
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
          .when((item.labels ?? []).length > 0 || Boolean(cardType(item)), (el) =>
            el.child(div().text_size(12).text_color(t.muted).child([cardType(item), ...(item.labels ?? [])].filter(Boolean).join(" · "))),
          )
          .when((item.assignees ?? []).length > 0, (el) => el.child(div().text_size(12).text_color(t.dim).child(`zugewiesen: ${item.assignees.join(", ")}`))),
      )
      .children(parts.sections ?? [])
      .when(this.readsRelated(item), (el) => el.child(relatedSections(this, t, mono, view, item, this.relatedOf(view, item), panel?.line ?? null)))
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
            if (levels.length) return this.startSession(view, item, cx);
            st.detail = true;
            this.enter(view, cx);
          }))
          .children(parts.buttons ?? [])
          .when(Boolean(line), (el) => el.child(button(t, "act-line-board", "Zeile auf dem Board", false, (cx) => {
            if (!this.modal) this.enterLine(view, line, cx);
          })))
          .child(button(t, "act-open", `${this.sources[item.source].site} o`, false, (cx) => {
            if (!this.modal) this.open(item, cx);
          })),
      );
  }

  // The hint line: the keys of what shows now, as the action table says
  // them (hintsOf).
  hints(t) {
    const keys = hintsOf(this.actionContext());
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
