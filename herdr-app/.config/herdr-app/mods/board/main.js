// Built from src/ by `mise run herdr-board-build`; edit the modules there, not this file.

// The board: one's own work from GitHub (issues and pull requests on a
// Projects v2 board, open pull requests) and Azure DevOps, as
// mods/board/views.json sets them, as the board layer of the layout
// (props { layer: true }) or in a tab "Board". What it shows, where, its
// keys and behaviour: README, "herdr app".
//
// views.json:
// - refreshMinutes (3), see Calls below.
// - sources: what the board shows, in contexts by source; the top bar
//   switches between the contexts and shows the tabs of one, its PR tab
//   last.
//   - github: { contexts: [{ owner, projects?: [...], prs: {...} }], prs: {
//     sections, limit? } }, a context per owner (a user or an
//     organisation). A project is a tab with its views: { number, limit?
//     (the most items a view reads, 1000), start?, views?: { "<number of
//     the view>": { hide?: [column names] } } }, its tab's id its owner's
//     and its number (projectTabId); its name, its views (in GitHub's
//     order) and their layout, filter, column field, group field, sort
//     keys and visible fields come from GitHub (githubProjectArgs), a
//     card's priority from the project's single-select field "Priority"
//     (none without one). An entry with id, name, field, filter,
//     priorityField or hide has the form before and is left out. A
//     context's issues is its Issues tab, after its projects: { id (its own
//     among all contexts' Issues tabs), name? ("Issues"), limit? (the most
//     issues a view reads, 1000, GitHub's search's most), hideRepos?:
//     ["<owner>/<repo>"] (repos turned off, left out of its search), start?
//     }, with a view of the owner's open issues and one of the closed. A
//     context's prs is its PR tab: { id, name? ("PRs"), hideRepos?:
//     ["<owner>/<repo>"] (repos turned off),
//     start? }. The PR tabs of all contexts share github's prs: sections:
//     [{ name, query, tone? }], one GitHub search for pull requests per
//     section, as written, read once for all of them; limit? (per search,
//     50, at most 100); tone is one of SECTION_TONES (shared.js), and
//     without one a section takes the next of SECTION_TONE_ORDER by its
//     place that no other section sets. A PR tab's id is its own among all
//     contexts' PR tabs (readGithub in config.js).
//   - azure: { org (https://dev.azure.com/<org>), repoFolders?, contexts: [{
//     project, teams?: [{ team, views?: ["sprint", "backlog"] (both when
//     missing), repoFolders? }] }] }, a context per project: a tab per team,
//     then one for the project's pull requests. repoFolders: the folders (~
//     is a machine's home; each once, a trailing / aside) whose git
//     repositories the start dialog offers for a team's items without a repo
//     ("Repo"); a team's own in place of those for all.
// - start: what the start dialog proposes: agent (a programs.json key),
//   machine, checkout (the folder the session starts in; ~ is that
//   machine's home; an item without a repo (an Azure work item, or a pull
//   request reached from one) starts in a repo of repoFolders instead),
//   message (the first message for issues and work items) and review (for
//   pull requests). Templates take {number} {title} {url} {owner} {repo}
//   {key}.
// - repos: { "<owner>/<repo>": { any start field } }. startSettings says
//   which start applies.
// In an older views.json, with its views at the top or its sources without
// contexts (sources.github.views, an Azure context with team or prs), the
// old part is not read: the board says where its views and teams go now.
//
// This machine's settings (settings.js; README, "herdr app") lie over
// views.json and are read with it. Hidden columns are a view's hide (a
// project's view's, under its project's views), views.json's or this
// machine's settings'; hiding or showing one writes it into the settings.
// They are left out of the query and of the board. A PR
// tab's repos turned off (hideRepos) are written the same way; their pull
// requests are read and not shown. An Issues tab's are written so too, and
// left out of its search as hidden columns are.
// GitHub's queries also ask for the login gh runs as, which "nur meine"
// compares with.
//
// Calls: a GitHub project's view, a board, a table or a roadmap, costs one
// gh call per refresh for its project's views and fields
// (githubProjectArgs: its views, PROJECT_VIEWS, and their four field lists
// each, so about two points), then one for each page of up to 100 items it
// reads (GitHub's most), at most as many as full pages of its limit take:
// ten for the 1000 by default (each item's priority, milestone and parent,
// with its title and repo, and the values of the fields its view sorts and
// groups by and a table shows, read by name, add no connection and so no
// points, but for linked pull requests, whose count is a connection: one
// point more a page; see below); the
// PR tabs of all contexts one together (a refresh of one refreshes them
// all), one more per THREAD_IDS (100) pull requests in them with
// more than FIRST_THREADS (10) review threads, one for the unread
// notifications of the user gh runs as (githubNotificationsArgs: a REST
// request per page of up to 50, counted against GitHub's REST limit of 5000
// requests an hour, not against GraphQL's points), and, until the board
// knows it, one more for the login gh runs as (githubViewerArgs, one point).
// An Issues tab's view costs one gh call per page of up to 100 issues of its
// search (githubIssuesArgs: per issue its labels, assignees and the rest a
// card reads, as on a project; about two points a page), at most as many as
// full pages of its limit take, ten for the 1000 by default; and, once while
// the board runs and again after `r`, one per 100 of the owner's repos
// (githubIssueReposArgs, one point each), before the first page: whether the
// owner is a user or an organisation names its search.
// GitHub prices a request by its connections, each counted as full: the
// list's per section one search, then per pull request of its limit (50
// by default) its assignees, review requests, review threads, last commit
// (and that one's checks) and the viewer's last reviews (VIEWER_REVIEWS,
// 5), per thread (FIRST_THREADS) its comments and per review
// (VIEWER_REVIEWS) its comments, so with the defaults
// 1 + 50 * 6 + 50 * 10 + 50 * 5 = 1051 requests a section, about 11
// points (a hundred requests each) of GitHub's 5000 an hour, 32 for the
// shipped three sections; the follow-up (githubThreadsArgs) 51 per such
// pull request (REVIEW_THREADS threads and their comments), about one
// point for two. An issue's related items (its description, parent,
// sub-issues and linked pull requests) cost one more when its details
// open, again on `r` while they are open, and again after a refresh
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
// where its tasks have parents outside the sprint, or its other items have
// parents outside it whose titles it does not keep (parentsOutside), beside
// it, for the tasks' parents, one for the team's settings while neither view
// keeps them; its Backlog two, one after the other (the level's work items
// in their list by az rest, then one WIQL query for their fields; one for
// an empty backlog); and one more for the project's work item types (their
// colors) while neither view keeps them; either one more while who az is
// stays unknown. What the Sprint and the Backlog read once and keep, and
// for how long, makeAzure says. An assignment costs one gh or az call, and
// the assignee picker one more per repo or team the first time it opens there
// (GitHub's assignable users with who gh is; the team's members, and who az
// is while that is unknown). The sprint picker costs one az call (the team's
// iterations) the first time it opens for a team, one more for the team's
// current sprint where the Sprint keeps none, and a refresh of a sprint it
// chose one where `r` dropped them. A state change costs one az call, a
// Sprint's move one (its column, or its state where only that column maps the
// new one) or two (its state, then its column), a Backlog's create one and a
// child's parent link one more; a Sprint's move that set a state, or whose
// write was refused, reads the Sprint again, a create the Backlog, and one
// whose answer was unclear asks one WIQL query more after that refresh; a
// create for a team whose default iteration follows the current one reads the
// team's settings first, one call more. Azure's PR tabs read nothing yet. The
// start dialog's Repo field costs one sh call when it opens and one per
// machine chosen in it (its repos; none without repoFolders). Finding gh and
// az costs one sh call now and then (toolPaths says when). The Claude Code
// sessions on this machine cost one sh call (their files and ps), and one
// more where any of them runs (their task lists), each with its log line:
// when the board starts, after a look that sees it come to show, every
// CLAUDE_MS while it shows, and when the focus or a space's count of tabs
// changes (readClaude, followSessions); never in a render. A view refreshes
// when its tab first shows (unless it has data the prefetch tried within
// refreshMinutes), on `r` (which first drops what its source keeps of it: its
// source's forget), after a column is hidden or shown (the command menu's
// "Spalte ausblenden", a name in the hidden line, the column menu), when it is
// shown again tried longer than refreshMinutes ago (not while a read of it
// runs: that one shows), and every refreshMinutes while it shows; a GitHub
// PR tab also whenever another one refreshes (they share one read). Besides,
// after each read of views.json (the start, `r`), while the board shows, the
// prefetch reads each other view with a loader once, as its tab would
// (prefetchOrder: one at a time, none tried within refreshMinutes, none whose
// own last read since it found its source unavailable), so a start or an `r`
// costs each other view's refresh at most once; it waits while any read runs,
// a write is under way or a dialog is busy. After that a view not shown reads
// nothing but the PR tabs' shared refresh above. The Azure calls of a load
// that need nothing of each other run side by side: the Sprint's settings
// (iteration, area paths, columns, types, backlog configuration) and who az
// is; its taskboard once the iteration came, its query once the area paths
// and the configuration came too, its parents' query and the team's settings
// once all that came; the Backlog's settings (levels, configuration, team
// settings, area paths), the types' colors and who az is; its ids once the
// levels came, the query for their fields once the configuration came too.
// What a view drew last, as read, is saved (loading.js) and drawn after a
// restart with its age until its read replaces it.
//
// The modules in src/, built into main.js by build.mjs (its header says how
// and why): shared.js, config.js (views.json), settings.js (this machine's
// settings over it), contexts.js (the top bar's contexts, tabs and their
// views), kinds/index.js (view kinds),
// kinds/board.js (a board's columns and cards), kinds/list.js (a PR or
// Issues tab's repos: whose they are, those turned off, its rows grouped by
// repo, its repo switches),
// kinds/sprint.js (a sprint's
// taskboard), kinds/backlog.js (a team's backlog), kinds/table.js (a
// GitHub project's table), kinds/issues.js (an Issues tab's lines, repos
// and solo repo), kinds/rows.js (a GitHub row in a saved state),
// kinds/fields.js (a GitHub project's fields: an
// item's value of each kind, the groups and order of a view's items),
// kinds/states.js (a
// state's color), select.js (filter, "nur meine", selection, the filter of
// the menus that rank their rows by name), commands.js (the action table,
// which the keys of its actions, the hint line and the command menu read),
// related.js (the items related to an item, read when its details open: what
// is kept, their lines), description.js (a description as drawn, without
// anything it could load), scroll.js (how the details scroll; the sums a
// board column shares), sources/ (GitHub; Azure in sources/azure/:
// common.js, sprint.js, backlog.js, related.js, index.js), tools.js
// (running gh and az, a log line each), loading.js (the saved state, what a
// load draws before its end, the prefetch's order, the top bar's words for a
// read), sessions.js (an item's sessions: the places in herdr and the
// Claude Code sessions that name it), actions/ (starting a session, writing
// a change at once, moving a card, changing a state, creating a work item,
// assigning an item),
// ui/helpers.js, ui/choices.js (a dialog's choice fields and their lists),
// ui/tones.js (the tones of labels and types, the selected background, the
// tints), ui/layer.js (the board layer), ui/related.js (the related items as
// drawn), ui/band.js (which cards of a board column, or rows of a table or
// an Issues tab, draw whole), ui/shapes/ (how a view's data is drawn and
// worked: board, prs, sprint, backlog, table, issues, placeholder),
// ui/modals/ (the dialogs:
// start, status, columns, create, assign, commands, sprints, sessions,
// repos, solo) and this one, the Board, which looks the shape up.
// Their data logic is plain exported functions, tested with a few UI paths
// by tests/herdr-app/board.test.mjs with node.

import { View, div, svg } from "gpui-kit";
import { Input, InputState, Popup, ScrollHandle, TextView, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, focused, home, knownAgents, layout, machines, nextCommand, notify, panes, props, readTextFile, run, settings, spaces, terminals, theme, writeTextFile } from "herdr";

// ==== src/shared.js ====

// What the board's modules share: its names, its error and how one is
// shown, its lines for herdr's log, small checks and text helpers, an
// item's key, type and order, and labels for times.

export const MOD = "board";
// The config's base name; the extension is added where the path is built.
export const CONFIG_NAME = "views";

export class BoardError extends Error {
  // unavailable: az is missing, not signed in or without its extension.
  // unclear: a write may or may not have landed (failure), or landed in part (partly).
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

export const partly = (text) => new BoardError(text, { unclear: true });

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isText = (v) => typeof v === "string" && v.trim() !== "";
export const textList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
// How many items GitHub sends in one page of a connection at most (its
// `first`).
export const PAGE = 100;

export const findRow = (data, key) => data?.rows.find((r) => r.key === key) ?? null;
export const withRow = (data, key, patch) => ({ ...data, rows: data.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

// What a list or board says where the filter or "nur meine" hides every
// item it has.
export const NOTHING_SHOWS = "Nichts passt zum Filter oder zu „nur meine“";

// What a GitHub project's view without an item says, with the filter its
// query sent (`where`: the columns it read), which GitHub answers with no
// items also where it cannot read it.
export const noItemsText = (filter, where = "") =>
  (filter ? `Keine Einträge${where} für den Filter „${filter}“ (auch einen Filter, den GitHub nicht versteht, beantwortet es so)` : `Keine Einträge${where}`);

// The warnings of a GitHub project's view that sorts or groups by fields
// the board does not read (`names`), one each.
export const unreadableOrder = (view, names) =>
  names.map((n) => `Ansicht „${view.name}“ sortiert oder gruppiert nach „${n}“, einem Feld, das das Board nicht liest: es ordnet ohne`);

export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];
export const lastLine = (text) => String(text ?? "").trim().split("\n").at(-1);

export function jsonOrNull(text) {
  try {
    return JSON.parse(String(text ?? "").trim());
  } catch {
    return null;
  }
}

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

// An item's key: `<repo>#<number>` on GitHub, `<owner>/<repo>#<number>`
// for one of a foreign repo (`foreign`, repoOwnership in kinds/list.js); on
// Azure `AB#<id>` for a work item (Azure Boards' own way to name one) and
// `!<id>` for a pull request (Azure Repos' own); null for a draft.
export function itemKey(item) {
  if (item.number === null || item.number === undefined) return null;
  if (item.source === "azure") return item.kind === "pr" ? `!${item.number}` : `AB#${item.number}`;
  return `${item.foreign ? item.repo : item.repoShort}#${item.number}`;
}

// GitHub's owner and repo names ignore case.
export const foldedName = (name) => name.toLowerCase();

export const itemLabel = (item) => itemKey(item) ?? "Entwurf";

// An item's label on a card or a list's row: an Azure work item's number
// alone (the views that show it hold only work items, so the AB# says
// nothing there), else itemLabel. Its details, notices and toasts keep
// itemLabel.
export const cardLabel = (item) => (item.source === "azure" && item.kind === "workitem" ? String(item.number) : itemLabel(item));

// A comparator of items by their `order` (an Azure backlog's order field,
// lowest first), those without one after the rest, ties by `tie`.
export const byOrder = (tie) => (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || tie(a, b);

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

export const NOTIFIED = "ungelesen";

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

// An item's parent, an issue or work item of the same source, in its own
// repo where the item names one (parentRepo, parentForeign).
function parentOf(item) {
  const repo = item.parentRepo ?? item.repo;
  return {
    source: item.source, kind: item.source === "azure" ? "workitem" : "issue", number: item.parent, repo, repoShort: repo?.split("/").pop(), foreign: item.parentForeign === true,
  };
}

// "tender#3002", "AB#7".
export const parentLabel = (item) => itemLabel(parentOf(item));

export const relativeLabel = (root, item) => (item.source === "github" && item.repo === root.repo ? `#${item.number}` : cardLabel(item));

export function partOfText(item) {
  if (!Number.isInteger(item.parent)) return null;
  return ["Teil von", relativeLabel(item, parentOf(item)), item.parentTitle].filter(Boolean).join(" ");
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

// A day as the board writes it, from a date that parses as the day's start
// in UTC (Azure's, GitHub's "2026-12-03"): "3.12.", with its year where
// that is not `year`; null for none.
export function dayText(date, year) {
  const at = new Date(date ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getUTCDate()}.${at.getUTCMonth() + 1}.${at.getUTCFullYear() === year ? "" : at.getUTCFullYear()}`;
}

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
// or for a view whose source reads nothing for it yet the `text` it shows
// (text(view)). A new view kind is: an entry here; its loading in its
// source's module (make<Source>().views[layout]); for an Azure team view,
// its entry in TEAM_VIEWS (config.js); for a new kind of tab, its entry in
// TAB_KINDS (contexts.js), and on GitHub its builder in GITHUB_TABS
// (contexts.js) and its entry kind in ENTRY_KINDS (config.js), which what
// views.json says of a GitHub tab follows; and for a new way to draw, a
// shape. A GitHub project's views take their layout from GitHub.

// A view's kind: the key of KINDS.
export const viewKind = (v) => `${v.source} ${v.layout}`;

// What every view carries with its defaults, fresh for each view: the
// columns hidden by default (none) and its own start settings (none).
export const viewDefaults = () => ({ hide: [], start: {} });

export const KINDS = {
  "github board": { shape: "board" },
  "github table": { shape: "table" },
  // GitHub's API names no dates or zoom a roadmap shows: it draws as a table.
  "github roadmap": { shape: "table" },
  "github issues": { shape: "issues" },
  "github list": { shape: "prs" },
  "azure sprint": { shape: "sprint" },
  "azure backlog": { shape: "backlog" },
  "azure prs": { text: () => "PR-Ansicht folgt" },
};

// A view's entry in KINDS (null for a kind it does not have).
export const kindOf = (view) => KINDS[viewKind(view)] ?? null;

// ==== src/settings.js ====

// This machine's settings over views.json; where they lie, how they merge
// and how they are written: README, "herdr app". A path names keys from the
// top, an entry of a list by its name: the value of the key `nameKeyAt(path
// of the list)` names (config.js; null: settings set the list only as a
// whole), which each function that walks a path takes.

export const SETTINGS_FILE = "board/settings.json";
export const settingsFileIn = (appHome) => `${appHome}/${SETTINGS_FILE}`;

export const ORIGIN = { machine: "dieser Rechner", base: `${CONFIG_NAME}.json`, builtin: "Standard" };

export const pathText = (path) => `„${path.join(".")}“`;
const pathKey = (path) => JSON.stringify(path);
// A name is a text, or a number (a project's), which a path names as its
// digits.
const hasName = (entry, key) => isObject(entry) && (isText(entry[key]) || Number.isInteger(entry[key]));
const sameName = (own, name) => String(own) === String(name);

export const entryByName = (list, name, key) => list.find((e) => hasName(e, key) && sameName(e[key], name));

function child(node, key, path, nameKeyAt) {
  if (Array.isArray(node)) {
    const nameKey = nameKeyAt(path);
    return nameKey === null ? undefined : entryByName(node, key, nameKey);
  }
  return isObject(node) ? node[key] : undefined;
}

export function valueAt(node, keys, nameKeyAt) {
  for (const [i, key] of keys.entries()) {
    if (node === undefined) return undefined;
    node = child(node, key, keys.slice(0, i), nameKeyAt);
  }
  return node;
}

export function readSettings(text, name) {
  if (text === null || text === undefined) return { settings: {}, errors: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { settings: null, errors: [`${name} ist kein gültiges JSON: ${e.message}`] };
  }
  return isObject(raw) ? { settings: raw, errors: [] } : { settings: null, errors: [`${name}: Oben muss ein Objekt stehen`] };
}

function mergeAt(base, over, path, out) {
  if (!isObject(over)) {
    out.set.set(pathKey(path), over);
    for (let i = 1; i < path.length; i++) out.below.add(pathKey(path.slice(0, i)));
    return over;
  }
  if (!Array.isArray(base)) {
    const merged = isObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(over)) merged[key] = mergeAt(merged[key], value, [...path, key], out);
    return merged;
  }
  const nameKey = out.nameKeyAt(path);
  if (nameKey === null) {
    out.errors.push(`${pathText(path)} lässt sich hier nur als ganze Liste setzen`);
    return base;
  }
  if (!base.some((e) => hasName(e, nameKey))) {
    out.errors.push(`${pathText(path)} hat in ${ORIGIN.base} keinen Eintrag mit eigenem Namen („${nameKey}“): hier nur als ganze Liste`);
    return base;
  }
  const merged = [...base];
  for (const [name, value] of Object.entries(over)) {
    const at = base.indexOf(entryByName(base, name, nameKey));
    if (at < 0) {
      out.errors.push(`${pathText([...path, name])}: einen Eintrag mit „${nameKey}“ „${name}“ gibt es in ${ORIGIN.base} nicht`);
      continue;
    }
    let own = value;
    if (isObject(value) && Object.hasOwn(value, nameKey) && !sameName(value[nameKey], name)) {
      out.errors.push(`${pathText([...path, name, nameKey])}: der Name des Eintrags ändert sich nur in ${ORIGIN.base}`);
      own = Object.fromEntries(Object.entries(value).filter(([key]) => key !== nameKey));
    }
    merged[at] = mergeAt(base[at], own, [...path, name], out);
  }
  return merged;
}

// → { merged, errors, origin }: origin(path) is one of ORIGIN, never this
// machine's where the merge refused what it set.
export function mergeSettings(base, over, nameKeyAt) {
  const out = { errors: [], set: new Map(), below: new Set(), nameKeyAt };
  const merged = mergeAt(base, over, [], out);
  const origin = (path) => {
    for (let i = 1; i <= path.length; i++) {
      const key = pathKey(path.slice(0, i));
      if (out.set.has(key)) return valueAt(out.set.get(key), path.slice(i), (rest) => nameKeyAt([...path.slice(0, i), ...rest])) === undefined ? ORIGIN.builtin : ORIGIN.machine;
    }
    if (out.below.has(pathKey(path))) return ORIGIN.machine;
    return valueAt(base, path, nameKeyAt) === undefined ? ORIGIN.builtin : ORIGIN.base;
  };
  return { merged, errors: out.errors, origin };
}

const copied = (value) =>
  Array.isArray(value) ? value.map(copied) : isObject(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copied(v)])) : value;

// An undefined `value` resets: it takes the value out, and the objects that
// leaves empty.
export function withSetting(settings, path, value, nameKeyAt) {
  const top = copied(settings);
  const parents = [top];
  for (const [i, key] of path.slice(0, -1).entries()) {
    const node = parents.at(-1);
    let next = child(node, key, path.slice(0, i), nameKeyAt);
    if (next === undefined || (!isObject(next) && !Array.isArray(next))) {
      if (value === undefined) return top;
      if (next !== undefined) throw new BoardError(`${pathText(path)}: ${pathText(path.slice(0, i + 1))} ist auf diesem Rechner ein Wert, kein Objekt`);
      if (Array.isArray(node)) throw new BoardError(`${pathText(path)}: in der Liste dieses Rechners gibt es keinen Eintrag „${key}“`);
      next = node[key] = {};
    }
    parents.push(next);
  }
  const node = parents.at(-1);
  const last = path.at(-1);
  if (Array.isArray(node)) throw new BoardError(`${pathText(path)}: ein Eintrag einer Liste dieses Rechners ändert sich nur in seinen Werten oder mit der ganzen Liste`);
  if (value !== undefined) {
    node[last] = value;
    return top;
  }
  delete node[last];
  for (let i = parents.length - 1; i > 0; i--) {
    if (!isObject(parents[i]) || Object.keys(parents[i]).length) break;
    const parent = parents[i - 1];
    if (Array.isArray(parent)) break;
    delete parent[path[i - 1]];
  }
  return top;
}

// herdr's refusals of a write whose expected text is stale (mod_files.rs).
export const staleRefusal = (e) => /^The file changed (outside Herdr|while saving)\./.test(String(e?.message ?? e));
export const CHANGED_SINCE = "die Datei hat sich inzwischen geändert";
export const CHANGED_MEANWHILE = `${CHANGED_SINCE}; bitte die Änderung noch einmal machen`;

export const settingsText = (settings) => `${JSON.stringify(settings, null, 2)}\n`;

// The file's text (null: there is none) after `changes`, [path, value] each:
// { text } (null: still none) or { error }.
export function settingsAfter(text, changes, name, nameKeyAt) {
  const { settings, errors } = readSettings(text, name);
  if (!settings) return { error: errors[0] };
  try {
    const next = changes.reduce((s, [path, value]) => withSetting(s, path, value, nameKeyAt), settings);
    return { text: text === null && !Object.keys(next).length ? null : settingsText(next) };
  } catch (e) {
    if (!(e instanceof BoardError)) throw e;
    return { error: e.message };
  }
}

export function sameAtPaths(then, now, changes, name, nameKeyAt) {
  const before = readSettings(then, name).settings;
  const after = readSettings(now, name).settings;
  if (!before || !after) return false;
  return changes.every(([path]) => JSON.stringify(valueAt(before, path, nameKeyAt)) === JSON.stringify(valueAt(after, path, nameKeyAt)));
}

// ==== src/config.js ====

// views.json: reading it with this machine's settings over it, what is
// wrong with them, and the start settings for an item.

export const START_DEFAULTS = { agent: null, machine: null, checkout: null, message: "", review: "" };
const START_KEYS = Object.keys(START_DEFAULTS);
// Keys of a start that made a worktree or set the status: the agent's own
// skills do both.
const GONE = "gibt es nicht mehr: der Start öffnet eine Sitzung im Checkout, den Worktree legt der Agent an";
const GONE_START = ["branch", "worktree", "base"];
const GONE_OPEN = "gibt es nicht mehr: „Öffnen in“ im Startdialog wählt den Space";
const GONE_STATUS = "„startColumn“ gibt es nicht mehr: den Status setzt der Agent selbst";
const TOP_KEYS = ["refreshMinutes", "start", "repos", "sources"];
// What an old views.json, with its views at the top, is told.
const OLD_SHAPE = "views.json hat noch die alte Form: die Einträge von „views“ stehen jetzt unter „sources“, die von GitHub in " +
  "„sources.github.contexts“, die von Azure in „sources.azure“ mit „org“ und „contexts“ (Kopf von mods/board/src/main.js)";
// What a views.json from before the contexts is told.
const BEFORE_CONTEXTS = "views.json hat noch die Form vor den Kontexten: die Einträge von „sources.github.views“ stehen jetzt je Besitzer in " +
  "„sources.github.contexts“ ({ \"owner\", \"projects\": [die Projects als { \"number\" }, ihre Ansichten von GitHub], " +
  "\"prs\": der PR-Tab, ohne „source“, „layout“, „sections“ und „limit“, die für alle PR-Tabs in „sources.github.prs“ stehen }), " +
  "die Azure-Teams je Projekt in „sources.azure.contexts“ ({ \"project\", \"teams\": [{ \"team\", \"views\" }] }; den PR-Tab hat jedes Projekt von selbst) " +
  "(Kopf von mods/board/src/main.js)";

function startProblems(start, where) {
  if (start === undefined) return [];
  if (!isObject(start)) return [`„${where}“ muss ein Objekt sein`];
  const out = [];
  for (const [key, value] of Object.entries(start)) {
    if (GONE_START.includes(key)) out.push(`„${where}.${key}“ ${GONE}`);
    else if (key === "open") out.push(`„${where}.open“ ${GONE_OPEN}`);
    else if (!START_KEYS.includes(key)) out.push(`„${where}.${key}“ gibt es nicht`);
    else if (value !== null && typeof value !== "string") out.push(`„${where}.${key}“ muss Text sein`);
  }
  return out;
}

// Keys every GitHub entry may have; each entry kind adds its own (ENTRY_KINDS).
const COMMON_KEYS = ["start"];

// The most items a board reads, and its default limit: ten of GitHub's
// pages (PAGE).
const BOARD_LIMIT = 10 * PAGE;

// A repo by its owner and name, as GitHub's nameWithOwner gives it.
const FULL_REPO = /^[^/\s]+\/[^/\s]+$/;

// A list section's keys, and the tones it may take, as an error names them.
const SECTION_KEYS = ["name", "query", "tone"];
const TONE_NAMES = Object.keys(SECTION_TONES).map((n) => `"${n}"`).join(", ").replace(/, ([^,]+)$/, " oder $1");

const hideReposProblems = (list) =>
  (list === undefined || (textList(list) && list.every((r) => FULL_REPO.test(r))) ? [] : ["„hideRepos“ ist eine Liste von Repos mit Besitzer, etwa [\"owner/repo\"]"]);

const limitProblems = (limit, most, at = "„limit“") =>
  (limit === undefined || (Number.isInteger(limit) && limit >= 1 && limit <= most) ? [] : [`${at} ist eine ganze Zahl von 1 bis ${most}`]);

// What a PR tab's „sections“ or „limit“ is told: the PR tabs of all
// contexts share them.
const SHARED_PRS = "steht jetzt in „sources.github.prs“, für die PR-Tabs aller Kontexte gleich (Kopf von mods/board/src/main.js)";
const SHARED_PRS_KEYS = ["sections", "limit"];
const PRS_LIMIT = 50;

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

// A project's keys of the form before its views came from GitHub, and what
// such a project is told; it is left out.
const PROJECT_BEFORE = ["id", "name", "field", "filter", "priorityField", "hide"];
const PROJECT_SHAPE = "{ \"number\" }, dazu „limit“, „start“ und je Ansicht „views“: { \"<Nummer der Ansicht>\": { \"hide\": [...] } }";
const projectBefore = (keys) =>
  `${keys.map((k) => `„${k}“`).join(", ")} ${keys.length > 1 ? "stammen" : "stammt"} aus der Form vor den Ansichten von GitHub: ein Project ist jetzt ${PROJECT_SHAPE}; ` +
  "Name, Ansichten, Filter, Spalten und Priorität kommen von GitHub (Kopf von mods/board/src/main.js)";

// A project's per-view keys: { "<view number>": { hide } }, its hidden
// board columns, which GitHub's API does not give.
const VIEW_NUMBER = /^[1-9][0-9]*$/;
function projectViewsProblems(views) {
  if (views === undefined) return [];
  if (!isObject(views) || !Object.keys(views).every((n) => VIEW_NUMBER.test(n))) {
    return ["„views“ ist ein Objekt mit den Nummern der Ansichten als Schlüsseln, etwa { \"1\": { \"hide\": [\"Done\"] } }"];
  }
  return Object.entries(views).flatMap(([n, v]) => {
    if (!isObject(v)) return [`„views.${n}“ muss ein Objekt sein`];
    return [
      ...Object.keys(v).filter((k) => k !== "hide").map((k) => `„views.${n}.${k}“ gibt es nicht`),
      ...(v.hide === undefined || textList(v.hide) ? [] : [`„views.${n}.hide“ muss eine Liste von Texten sein`]),
    ];
  });
}

// Per kind of a GitHub context's entry (its `entryKind`: a project, whose
// views come from GitHub, the context's Issues tab, with a view of kind
// "github issues" per state, or its PR list, a view of kind "github
// list"): its own keys, the keys of an older form that leave it out
// (`before`), what is wrong with its keys, the key that names it (`name`;
// `named`: whether a value of it names one; `nameIn`: whose entries it is
// its own among, its context's or all contexts' of its kind), its place as
// an error names it (`at`), its id (and its tab's, `tabId`, where that is
// another; a tab's is its own among all contexts' tabs) and its settings'
// path, whether it needs the PR sections of sources.github.prs
// (`needsShared`), and its fields with their defaults filled in (`owner`:
// the context's; `shared`: those sections).
const ENTRY_KINDS = {
  project: {
    keys: ["number", "limit", "views"],
    before: PROJECT_BEFORE,
    problems(v) {
      const out = limitProblems(v.limit, BOARD_LIMIT);
      if (!(Number.isInteger(v.number) && v.number >= 1)) out.push("„number“ ist die Nummer des Projects, eine ganze Zahl ab 1");
      return [...out, ...projectViewsProblems(v.views)];
    },
    name: "number",
    named: Number.isInteger,
    nameIn: "context",
    at: (v, j) => `Project ${j + 1}${Number.isInteger(v?.number) ? ` (${v.number})` : ""}`,
    id: (v, owner) => projectTabId(owner, v.number),
    settingsPath: (v, context) => [...context, "projects", String(v.number)],
    defaults: (v, owner) => ({ owner, number: v.number, limit: v.limit ?? BOARD_LIMIT, start: v.start ?? {}, views: v.views ?? {} }),
  },
  issues: {
    keys: ["id", "name", "limit", "hideRepos"],
    before: [],
    problems: (v) => [
      ...(isText(v.id) ? [] : ["„id“ fehlt"]),
      ...(v.name === undefined || isText(v.name) ? [] : ["„name“ muss Text sein"]),
      ...limitProblems(v.limit, ISSUES_LIMIT),
      ...hideReposProblems(v.hideRepos),
    ],
    name: "id",
    named: isText,
    nameIn: "kind",
    at: () => "Issues-Tab",
    id: (v) => issuesTabId(v.id),
    settingsPath: (v, context) => [...context, "issues"],
    defaults: (v, owner) => ({
      ...viewDefaults(), ...(v.start && { start: v.start }),
      owner, name: v.name ?? ISSUES_NAME, limit: v.limit ?? ISSUES_LIMIT, hideRepos: v.hideRepos ?? [],
    }),
  },
  prs: {
    keys: ["id", "name", "hide", "hideRepos", ...SHARED_PRS_KEYS],
    before: [],
    problems: (v) => [
      ...(isText(v.id) ? [] : ["„id“ fehlt"]),
      ...(v.name === undefined || isText(v.name) ? [] : ["„name“ muss Text sein"]),
      ...(v.hide === undefined || textList(v.hide) ? [] : ["„hide“ muss eine Liste von Texten sein"]),
      ...SHARED_PRS_KEYS.filter((k) => v[k] !== undefined).map((k) => `„${k}“ ${SHARED_PRS}`),
      ...hideReposProblems(v.hideRepos),
    ],
    name: "id",
    named: isText,
    nameIn: "kind",
    at: () => "PR-Tab",
    id: (v) => v.id,
    tabId: (v) => githubTabId(v.id),
    settingsPath: (v, context) => [...context, "prs"],
    needsShared: true,
    defaults: (v, _owner, shared) => ({
      ...viewDefaults(), ...(v.hide && { hide: v.hide }), ...(v.start && { start: v.start }),
      layout: "list", name: v.name ?? PRS_NAME, ...shared, hideRepos: v.hideRepos ?? [],
    }),
  },
};

const PRS_NAME = "PRs";
const ISSUES_NAME = "Issues";

// GitHub's search finds a thousand results at most.
const ISSUES_LIMIT = 10 * PAGE;

export const issuesTabId = (id) => `github:issues:${id}`;

// The id of a GitHub PR tab.
export const githubTabId = (viewId) => `github:${viewId}`;

function tabProblems(v, entryKind) {
  if (!isObject(v)) return ["muss ein Objekt sein"];
  const kind = ENTRY_KINDS[entryKind];
  const before = kind.before.filter((k) => Object.hasOwn(v, k));
  if (before.length) return [projectBefore(before)];
  const out = [];
  for (const key of Object.keys(v)) {
    if (key === "startColumn") out.push(GONE_STATUS);
    else if (!COMMON_KEYS.includes(key) && !kind.keys.includes(key)) out.push(`„${key}“ gibt es nicht`);
  }
  return [...out, ...kind.problems(v), ...startProblems(v.start, "start")];
}

// A project's tab id: its owner's and its number, which name it on GitHub.
export const projectTabId = (owner, number) => `github:project:${owner}/${number}`;

function normalizeTab(v, entryKind, owner, shared) {
  const kind = ENTRY_KINDS[entryKind];
  const common = { entryKind, id: kind.id(v, owner), source: "github", settingsPath: kind.settingsPath(v, [...GITHUB_CONTEXTS, owner]) };
  return { ...common, ...kind.defaults(v, owner, shared) };
}

const GITHUB_CONTEXT_KEYS = ["owner", "projects", "issues", "prs"];
const GITHUB_CONTEXTS = ["sources", "github", "contexts"];
const AZURE_CONTEXTS = ["sources", "azure", "contexts"];

const LIST_NAMES = [[GITHUB_CONTEXTS, "owner"], [AZURE_CONTEXTS, "project"], [[...GITHUB_CONTEXTS, "*", "projects"], "number"]];
export const nameKeyAt = (path) => LIST_NAMES.find(([at]) => at.length === path.length && at.every((k, i) => k === "*" || k === path[i]))?.[1] ?? null;

// sources.github → { github: { contexts: [{ owner, tabs }] } or null,
// errors }: tabs are the context's projects (entryKind "project", whose
// views GitHub names: contexts.js), its Issues tab (entryKind "issues") and
// its PR list (entryKind "prs", layout "list"). A context or a tab with
// problems is left out and each problem is listed; a project's number is the
// first of its context's that has it, an Issues or PR tab's id the first of
// all contexts' tabs of its kind. Each tab carries `owners`
// (repoOwnership, kinds/list.js), folded. The PR tabs all take the sections
// of sources.github.prs (readSharedPrs); without valid ones there are none.
function readGithub(raw) {
  if (!isObject(raw)) return { github: null, errors: ["„sources.github“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["contexts", "views", "prs"].includes(k)).map((k) => `„sources.github.${k}“ gibt es nicht`);
  if ((!Array.isArray(raw.contexts) || !raw.contexts.length) && raw.views === undefined) {
    errors.push("„sources.github.contexts“ braucht mindestens einen Kontext: { \"owner\", \"projects\": [...], \"prs\": { \"id\" } }");
  }
  const list = Array.isArray(raw.contexts) ? raw.contexts : [];
  const wanted = raw.prs !== undefined || list.some((a) => isObject(a) && a.prs !== undefined);
  const { shared, errors: sharedErrors } = wanted ? readSharedPrs(raw.prs) : { shared: null, errors: [] };
  errors.push(...sharedErrors);
  const names = {};
  const tabIds = new Set();
  const contexts = [];
  list.forEach((a, i) => {
    const where = `GitHub-Kontext ${i + 1}${isText(a?.owner) ? ` („${a.owner}“)` : ""}`;
    const problems = contextProblems(a, list, GITHUB_CONTEXT_KEYS, nameKeyAt(GITHUB_CONTEXTS), "„owner“ fehlt: der Benutzer oder die Organisation auf GitHub, der die Projects gehören");
    if (!problems.length) {
      const first = list.find((o) => isObject(o) && isText(o.owner) && foldedName(o.owner) === foldedName(a.owner));
      if (first !== a) problems.push(`„owner“ ${a.owner} gibt es schon als „${first.owner}“`);
    }
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    if (a.projects !== undefined && !Array.isArray(a.projects)) errors.push(`${where}: „projects“ ist eine Liste von Projects`);
    if (a.prs === undefined) errors.push(`${where}: „prs“ fehlt: der PR-Tab, der letzte Tab des Kontexts, mit „id“`);
    const entries = [
      ...(Array.isArray(a.projects) ? a.projects : []).map((v) => ({ v, entryKind: "project" })),
      ...(a.issues === undefined ? [] : [{ v: a.issues, entryKind: "issues" }]),
      ...(a.prs === undefined ? [] : [{ v: a.prs, entryKind: "prs" }]),
    ];
    const tabs = [];
    names.context = new Set();
    entries.forEach(({ v, entryKind }, j) => {
      const kind = ENTRY_KINDS[entryKind];
      const problems = tabProblems(v, entryKind);
      const seen = kind.nameIn === "kind" ? (names[entryKind] ??= new Set()) : names.context;
      const name = v?.[kind.name];
      if (!problems.length && seen.has(name)) problems.push(`„${kind.name}“ ${name} gibt es schon`);
      if (kind.named(name)) seen.add(name);
      const id = problems.length ? null : (kind.tabId ?? kind.id)(v, a.owner);
      if (id !== null && tabIds.has(id)) problems.push(`„${kind.name}“ ${name} ergibt die Kennung „${id}“, die schon ein anderer Tab hat`);
      if (id !== null) tabIds.add(id);
      if (problems.length) errors.push(...problems.map((p) => `${where}, ${kind.at(v, j)}: ${p}`));
      else if (!kind.needsShared || shared) tabs.push(normalizeTab(v, entryKind, a.owner, shared));
    });
    if (tabs.length) contexts.push({ owner: a.owner, tabs });
  });
  const withPrs = contexts.filter((c) => c.tabs.some((t) => t.entryKind === "prs")).map((c) => foldedName(c.owner));
  for (const c of contexts) {
    const tabOwner = foldedName(c.owner);
    const owners = { tabOwner, otherOwners: withPrs.filter((o) => o !== tabOwner) };
    c.tabs = c.tabs.map((t) => ({ ...t, owners }));
  }
  return { github: contexts.length ? { contexts } : null, errors };
}

function sectionsProblems(sections) {
  if (!(Array.isArray(sections) && sections.length && sections.every((s) => isObject(s) && isText(s.name) && isText(s.query)))) {
    return ["„sections“ braucht Einträge mit „name“ und „query“"];
  }
  return sections.flatMap((s) => [
    ...Object.keys(s).filter((k) => !SECTION_KEYS.includes(k)).map((k) => `Abschnitt „${s.name}“: „${k}“ gibt es nicht`),
    ...(s.tone === undefined || Object.hasOwn(SECTION_TONES, s.tone) ? [] : [`Abschnitt „${s.name}“: „tone“ ist ${TONE_NAMES}`]),
  ]);
}

// sources.github.prs → { shared: { sections (each with its tone), limit
// (each search's `first`) } or null, errors }.
function readSharedPrs(raw) {
  const at = "„sources.github.prs“";
  if (raw === undefined) return { shared: null, errors: [`${at} fehlt: die Abschnitte der PR-Tabs aller Kontexte, { \"sections\": [{ \"name\", \"query\" }] }`] };
  if (!isObject(raw)) return { shared: null, errors: [`${at} muss ein Objekt sein`] };
  const errors = [
    ...Object.keys(raw).filter((k) => !SHARED_PRS_KEYS.includes(k)).map((k) => `„sources.github.prs.${k}“ gibt es nicht`),
    ...sectionsProblems(raw.sections).map((p) => `${at}: ${p}`),
    ...limitProblems(raw.limit, PAGE, "„sources.github.prs.limit“"),
  ];
  return errors.length ? { shared: null, errors } : { shared: { sections: sectionsWithTones(raw.sections), limit: raw.limit ?? PRS_LIMIT }, errors };
}

function contextProblems(a, list, keys, nameKey, missing) {
  if (!isObject(a)) return ["muss ein Objekt sein"];
  const out = Object.keys(a).filter((k) => !keys.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  if (!isText(a[nameKey])) out.push(missing);
  else if (entryByName(list, a[nameKey], nameKey) !== a) out.push(`„${nameKey}“ ${a[nameKey]} gibt es schon`);
  return out;
}

// The views a team tab may show, in the order of its switch: the id
// views.json names, and the name the switch shows.
export const TEAM_VIEWS = [
  { id: "sprint", name: "Sprint" },
  { id: "backlog", name: "Backlog" },
];
const TEAM_VIEW_IDS = TEAM_VIEWS.map((v) => v.id);
const TEAM_VIEWS_TEXT = TEAM_VIEW_IDS.map((v) => `"${v}"`).join(" und ");

const REPO_FOLDERS_TEXT = "ist eine Liste aus mindestens einem Ordner (Text), jeder höchstens einmal, etwa [\"~/Repos\"]";
const trimFolders = (v) => v.map((f) => f.replace(/(.)\/+$/, "$1"));
const repoFoldersOk = (v) => v === undefined || (Array.isArray(v) && v.length > 0 && v.every(isText) && new Set(trimFolders(v)).size === v.length);

const TEAM_KEYS = ["team", "views", "repoFolders"];

// What is wrong with a team of an Azure context: { "team", "views"?: [...],
// "repoFolders"?: [...] }.
function teamProblems(t) {
  if (!isObject(t)) return ["muss ein Objekt sein"];
  const out = Object.keys(t).filter((k) => !TEAM_KEYS.includes(k)).map((k) => `„${k}“ gibt es nicht`);
  if (!isText(t.team)) out.push("„team“ fehlt: der Name des Teams im Projekt");
  const views = t.views;
  if (views !== undefined && !(textList(views) && views.length && views.every((v) => TEAM_VIEW_IDS.includes(v)) && new Set(views).size === views.length)) {
    out.push(`„views“ ist eine Liste aus ${TEAM_VIEWS_TEXT}, jede höchstens einmal`);
  }
  if (!repoFoldersOk(t.repoFolders)) out.push(`„repoFolders“ ${REPO_FOLDERS_TEXT}`);
  return out;
}

// The tabs of an Azure context: { id, source: "azure", kind: "team", name,
// org, project, team, views, repoFolders } per team, views in the switch's
// order, then { id, source: "azure", kind: "prs", name, org, project } for
// the project's pull requests; org the organisation's address (orgUrl).
function teamTab(t, project, org, folders) {
  const views = t.views ?? TEAM_VIEW_IDS;
  const repoFolders = t.repoFolders ? trimFolders(t.repoFolders) : folders;
  return { id: `azure:team:${project}/${t.team}`, source: "azure", kind: "team", name: t.team, org, project, team: t.team, views: TEAM_VIEW_IDS.filter((v) => views.includes(v)), repoFolders };
}
const prsTab = (project, org) => ({ id: `azure:prs:${project}`, source: "azure", kind: "prs", name: PRS_NAME, org, project });

// An organisation's address: https://<host>/<organisation>, a trailing /
// dropped; null for anything else.
function orgUrl(value) {
  const url = isText(value) ? value.trim().replace(/\/+$/, "") : "";
  return /^https:\/\/[^/\s]+\/[^/\s]+$/.test(url) ? url : null;
}

const AZURE_CONTEXT_KEYS = ["project", "teams"];

// An entry of sources.azure.contexts in the form before the contexts: { team:
// { project, team }, … } or { prs: { project } }.
const beforeContexts = (entry) => isObject(entry) && (Object.hasOwn(entry, "team") || Object.hasOwn(entry, "prs"));
const holdsBeforeContexts = (contexts) => Array.isArray(contexts) && contexts.some(beforeContexts);

// sources.azure → { azure: { org, contexts: [{ project, tabs }] } or null,
// errors }. Without a valid org (orgUrl) nothing of it is usable; a context
// or a team with problems is left out and each problem is listed.
function readAzure(raw) {
  if (!isObject(raw)) return { azure: null, errors: ["„sources.azure“ muss ein Objekt sein"] };
  const errors = Object.keys(raw).filter((k) => !["org", "contexts", "repoFolders"].includes(k)).map((k) => `„sources.azure.${k}“ gibt es nicht`);
  const org = orgUrl(raw.org);
  const foldersOk = repoFoldersOk(raw.repoFolders);
  if (!foldersOk) errors.push(`„sources.azure.repoFolders“ ${REPO_FOLDERS_TEXT}`);
  const folders = foldersOk && raw.repoFolders ? trimFolders(raw.repoFolders) : [];
  if (!org) errors.push("„sources.azure.org“ ist die Adresse der Organisation, etwa https://dev.azure.com/<Organisation>");
  const list = Array.isArray(raw.contexts) ? raw.contexts.filter((c) => !beforeContexts(c)) : [];
  if (!list.length && !holdsBeforeContexts(raw.contexts)) {
    errors.push("„sources.azure.contexts“ braucht mindestens einen Kontext: { \"project\", \"teams\": [{ \"team\" }] }");
  }
  const contexts = [];
  list.forEach((a, i) => {
    const where = `Azure-Kontext ${i + 1}${isText(a?.project) ? ` („${a.project}“)` : ""}`;
    const problems = contextProblems(a, list, AZURE_CONTEXT_KEYS, nameKeyAt(AZURE_CONTEXTS), "„project“ fehlt: der Name des Projekts in der Organisation");
    if (problems.length) return errors.push(...problems.map((p) => `${where}: ${p}`));
    if (a.teams !== undefined && !Array.isArray(a.teams)) errors.push(`${where}: „teams“ ist eine Liste von Teams`);
    const tabs = [];
    (Array.isArray(a.teams) ? a.teams : []).forEach((t, j) => {
      const at = `${where}, Team ${j + 1}${isText(t?.team) ? ` („${t.team}“)` : ""}`;
      const team = teamProblems(t);
      if (!team.length && tabs.some((c) => c.team === t.team)) team.push("gibt es schon");
      if (team.length) return errors.push(...team.map((p) => `${at}: ${p}`));
      tabs.push(teamTab(t, a.project, org, folders));
    });
    contexts.push({ project: a.project, tabs: [...tabs, prsTab(a.project, org)] });
  });
  return { azure: org && contexts.length ? { org, contexts } : null, errors };
}

// views.json as text (null: there is none) and this machine's settings as
// read (`settingsRead`: { name, text }, text null for no file, or { name,
// error }) → { config, errors, settings, origin, moving? }: config is {
// refreshMinutes, start, repos, azure: { org, contexts } or null, github: {
// contexts } or null }, settings those applied (null: none), origin
// mergeSettings's, moving settingsForContexts's move where the settings can
// move. A context or a tab with problems is left out and each problem is
// listed; config is null only when nothing usable is left.
export function readConfig(text, settingsRead = null) {
  const none = (error) => ({ config: null, errors: [error], settings: null, origin: mergeSettings(null, {}, nameKeyAt).origin });
  if (text === null || text === undefined) return none(`${CONFIG_NAME}.json fehlt im Ordner der Mod`);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return none(`${CONFIG_NAME}.json ist kein gültiges JSON: ${e.message}`);
  }
  const alone = { ...validateConfig(raw), settings: null, origin: mergeSettings(raw, {}, nameKeyAt).origin };
  if (!settingsRead) return alone;
  const { name } = settingsRead;
  const named = (errors) => errors.map((e) => `${name}: ${e}`);
  const unused = (errors) => ({ ...alone, errors: [...alone.errors, ...errors, settingsAlone(name)] });
  if (settingsRead.error !== undefined) return unused([`${name} ließ sich nicht lesen: ${settingsRead.error}`]);
  const { settings, errors } = readSettings(settingsRead.text, name);
  if (!settings) return unused(errors);
  const moving = settingsForContexts(raw, settings);
  if (moving?.problems) return unused(named(moving.problems));
  if (moving) return { ...unused([`${name} hat noch die Form vor den Kontexten und ist nicht umgestellt; ${MOVE_AGAIN}`]), moving };
  const { settings: applied, errors: before } = withoutProjectsBefore(settings);
  const { merged, errors: unmatched, origin } = mergeSettings(raw, applied, nameKeyAt);
  const read = validateConfig(merged);
  const added = read.errors.filter((e) => !alone.errors.includes(e));
  if (added.length) return unused(named([...before, ...unmatched, ...added]));
  return { ...read, errors: [...read.errors, ...named([...before, ...unmatched])], settings: applied, origin };
}

// This machine's settings of a project in the form before its views came
// from GitHub: an entry named by its id, or one by its number with keys of
// that form. Each is named and left out of what applies; it stays in the
// file. Lists set whole are left to the check of views.json.
const VIEW_HIDE_PATH = "„sources.github.contexts.<owner>.projects.<Nummer>.views.<Nummer der Ansicht>.hide“";
const BEFORE_VIEWS = `gilt nicht, aus der Form vor den Ansichten von GitHub: ein Project heißt jetzt nach seiner Nummer, die ausgeblendeten Spalten stehen je Ansicht in ${VIEW_HIDE_PATH}; bitte von Hand übertragen`;
// What a GitHub view's settings from before the contexts are told where no
// PR tab has their id.
const PROJECT_NO_ID = `ein Project hat keine „id“ mehr, seine ausgeblendeten Spalten stehen je Ansicht in ${VIEW_HIDE_PATH}; bitte von Hand übertragen`;
function withoutProjectsBefore(settings) {
  const contexts = settings.sources?.github?.contexts;
  if (!isObject(contexts)) return { settings, errors: [] };
  const errors = [];
  let next = settings;
  for (const [owner, context] of Object.entries(contexts)) {
    const projects = isObject(context) ? context.projects : undefined;
    if (!isObject(projects)) continue;
    const at = [...GITHUB_CONTEXTS, owner, "projects"];
    for (const [name, project] of Object.entries(projects)) {
      const keys = VIEW_NUMBER.test(name) ? (isObject(project) ? PROJECT_BEFORE.filter((k) => Object.hasOwn(project, k)) : []).map((k) => [name, k]) : [[name]];
      for (const path of keys) {
        errors.push(`${pathText([...at, ...path])} ${BEFORE_VIEWS}`);
        next = withSetting(next, [...at, ...path], undefined, () => null);
      }
    }
  }
  return { settings: next, errors };
}

export const MOVE_AGAIN = "das nächste Lesen (r) versucht es noch einmal";

export const settingsAlone = (subject) => `${subject} gilt nicht: das Board zeigt ${CONFIG_NAME}.json allein`;

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
    if ((isObject(sources.github) && sources.github.views !== undefined) || (isObject(sources.azure) && holdsBeforeContexts(sources.azure.contexts))) errors.push(BEFORE_CONTEXTS);
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
    if (!azure && !github) errors.push("„sources“ braucht mindestens einen Kontext: in „sources.github.contexts“ oder „sources.azure.contexts“");
  } else if (raw.sources !== undefined) errors.push("„sources“ muss ein Objekt sein");
  else if (!old) errors.push("„sources“ fehlt: „sources.azure“ oder „sources.github“");
  const start = startErrors.length ? {} : raw.start ?? {};
  return { config: azure || github ? { refreshMinutes, start, repos, azure, github } : null, errors };
}

export const hidePath = (view) => [...view.settingsPath, "hide"];
export const repoHidePath = (view) => [...view.settingsPath, "hideRepos"];

const viewPath = (...id) => ["sources", "github", "views", ...id];
const SHARED_PRS_PATH = ["sources", "github", "prs"];

// The keys of a GitHub PR view of the form before the contexts that its tab
// holds as they were (value), those that are the PR tabs' together now
// (shared: its sections and limit), and those it says through its context:
// its source and its layout.
function tabSettings(value, owner) {
  if (!isObject(value)) return { problem: "ist kein Objekt" };
  const kind = ENTRY_KINDS.prs;
  const out = {};
  const shared = {};
  for (const [key, v] of Object.entries(value)) {
    if ((key === "source" && v === "github") || (key === "layout" && v === "list")) continue;
    if (SHARED_PRS_KEYS.includes(key)) shared[key] = v;
    else if (COMMON_KEYS.includes(key) || kind.keys.includes(key)) out[key] = v;
    else return { problem: `„${key}“ hat im Kontext ${owner} keinen Platz` };
  }
  return { value: out, shared };
}

function partsBeforeContexts(settings) {
  const sources = isObject(settings) && isObject(settings.sources) ? settings.sources : {};
  return { sources, views: isObject(sources.github) ? sources.github.views : undefined, teams: isObject(sources.azure) && holdsBeforeContexts(sources.azure.contexts) };
}

export function settingsBeforeContexts(settings) {
  const { views, teams } = partsBeforeContexts(settings);
  return views !== undefined || teams;
}

// → null, { problems }, or { settings, moved: [[from, to]] }. Where any
// value has no place in the contexts, two differ for one place, or
// views.json has problems, nothing moves.
export function settingsForContexts(raw, settings) {
  if (!settingsBeforeContexts(settings)) return null;
  const { sources, views, teams } = partsBeforeContexts(settings);
  const { config, errors } = validateConfig(raw);
  if (errors.length) return { problems: [`noch in der Form vor den Kontexten; erst ${CONFIG_NAME}.json berichtigen, dann werden die Einstellungen umgestellt`] };
  const cannot = (path, why) => `${pathText(path)} lässt sich nicht auf die Kontexte umstellen: ${why}`;
  const problems = [];
  if (teams) problems.push(cannot(AZURE_CONTEXTS, "die Teams stehen jetzt je Projekt in „sources.azure.contexts“ ({ \"project\", \"teams\" }); bitte von Hand übertragen"));
  if (views !== undefined && !isObject(views)) problems.push(cannot(viewPath(), "hier eine ganze Liste; bitte von Hand nach „sources.github.contexts“ übertragen"));
  if (sources.github?.contexts !== undefined && !isObject(sources.github.contexts)) problems.push(cannot(GITHUB_CONTEXTS, "hier eine ganze Liste"));
  // Only a PR tab's id stands in views.json, so only a PR tab takes a view's settings.
  const tabs = new Map((config.github?.contexts ?? []).flatMap((c) => c.tabs.filter((t) => t.entryKind === "prs").map((t) => [t.id, { entry: t, owner: c.owner }])));
  let next = isObject(views) ? withSetting(settings, viewPath(), undefined, nameKeyAt) : settings;
  const moved = [];
  for (const [id, value] of Object.entries(isObject(views) ? views : {})) {
    const from = viewPath(id);
    const tab = tabs.get(id);
    if (!tab) {
      problems.push(cannot(from, `${CONFIG_NAME}.json hat keinen PR-Tab mit „id“ „${id}“; ${PROJECT_NO_ID}`));
      continue;
    }
    const kept = tabSettings(value, tab.owner);
    if (kept.problem) {
      problems.push(cannot(from, kept.problem));
      continue;
    }
    const moves = Object.entries(kept.shared).map(([key, v]) => ({ at: [...from, key], to: [...SHARED_PRS_PATH, key], v, shared: true }));
    if (Object.keys(kept.value).length || !moves.length) moves.unshift({ at: from, to: tab.entry.settingsPath, v: kept.value, shared: false });
    for (const { at, to, v, shared } of moves) {
      const there = valueAt(next, to, nameKeyAt);
      if (there !== undefined && !(shared && JSON.stringify(there) === JSON.stringify(v))) {
        problems.push(cannot(at, `${pathText(to)} steht hier schon${shared ? " anders" : ""}`));
      } else if (there !== undefined) moved.push([at, to]);
      else if (!problems.length) {
        try {
          next = withSetting(next, to, v, nameKeyAt);
          moved.push([at, to]);
        } catch (e) {
          if (!(e instanceof BoardError)) throw e;
          problems.push(cannot(at, e.message));
        }
      }
    }
  }
  return problems.length ? { problems } : { settings: next, moved };
}

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

// A menu's filter (rankByName): { entry, at } for each entry of `list` whose
// text (`textOf`) holds the letters of `query` in its order, `at` where they
// stand in it (fuzzyMatch), best first. A tie keeps the shorter text first,
// then the list's order. An empty query keeps the list as it is, with no
// letters.
export function fuzzyRank(list, query, textOf) {
  if (!String(query ?? "").trim()) return list.map((entry) => ({ entry, at: [] }));
  const scored = list.map((entry, n) => ({ entry, n, text: textOf(entry), match: fuzzyMatch(textOf(entry), query) }));
  return scored
    .filter((s) => s.match)
    .sort((x, y) => y.match.score - x.match.score || x.text.length - y.text.length || x.n - y.n)
    .map((s) => ({ entry: s.entry, at: s.match.at }));
}

// The entries of `list` the filter `query` leaves by their names, best
// first (fuzzyRank), each with `at`, where its letters stand in the name.
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

// What an older board stored of a view's columns, { hide: [names], show:
// [names] }, or null when what was stored is not that.
export function readStoredHidden(value) {
  return isObject(value) && textList(value.hide) && textList(value.show) ? { hide: [...value.hide], show: [...value.show] } : null;
}

export const hiddenKey = (id) => `hidden:${id}`;

export function storedHiddenList(view, stored) {
  const hidden = new Set(view.hide);
  for (const name of stored.hide) hidden.add(name);
  for (const name of stored.show) hidden.delete(name);
  return [...hidden];
}

// `entryOf(view)`: what the store holds for the view, undefined for nothing.
// → { moves: [{ view, list }], drop: [view] }: an entry is dropped where it
// is no stored hide, its view no board or one without settings of its own
// (settingsPath null), this machine sets the view's hide already, or it
// changes nothing.
export function storedHiddenMoves(views, entryOf, originAt) {
  const moves = [];
  const drop = [];
  for (const view of views) {
    const entry = entryOf(view);
    if (entry === undefined) continue;
    const stored = readStoredHidden(entry);
    const list = stored && view.layout === "board" && view.settingsPath && originAt(hidePath(view)) !== ORIGIN.machine ? storedHiddenList(view, stored) : null;
    if (list && !sameNames(list, view.hide)) moves.push({ view, list });
    else drop.push(view);
  }
  return { moves, drop };
}

export function sameNames(a, b) {
  const one = new Set(a);
  const other = new Set(b);
  return one.size === other.size && [...one].every((n) => other.has(n));
}

export const hiddenColumns = (view) => new Set(view.hide);

// Whether a column can be hidden: one with a target (an option or an
// iteration of the view's column field); the column without a value is
// always shown.
export const hideable = (column) => Boolean(column?.target);

// null for a column that cannot be hidden.
export function toggledHidden(view, column) {
  if (!hideable(column)) return null;
  return view.hide.includes(column.name) ? view.hide.filter((n) => n !== column.name) : [...view.hide, column.name];
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

// Why a card may not go to a column, as the board says it, or null where it
// may. A taskboard's column names the types it takes (column.types), since
// its name is no state; no board carries meta.types yet. The sprint names
// its types' states as meta.typeStates instead, for the status menu.
export function dropRefusal(board, card, column) {
  const refused = (why = "") => `${itemLabel(card)} kann nicht nach „${column?.name}“${why}`;
  if (!column?.target) return refused();
  if (column.types && !column.types.includes(card.type)) return refused(`: Die Spalte hat für ${card.type} keinen Status`);
  const states = board.meta?.types?.[card.type];
  return !states || states.includes(column.name) ? null : refused();
}

export const canDrop = (board, card, column) => !dropRefusal(board, card, column);

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
  return { ...board, columns: board.columns.map((c) => ({ ...c, hidden: hideable(c) && hidden.has(c.name) })) };
}

export const waitsForCards = (column) => !column.hidden && Boolean(column.cardsNotRead);

export function withOlderCards(board, before) {
  if (before?.shape !== board.shape || !board.columns.some(waitsForCards)) return board;
  const drawnKeys = new Set(board.columns.filter((c) => !waitsForCards(c)).flatMap((c) => c.cards.map((card) => card.key)));
  const older = new Map(before.columns.map((c) => [c.name, c.cards]));
  return {
    ...board,
    columns: board.columns.map((c) => (waitsForCards(c) && older.has(c.name) ? { ...c, cards: older.get(c.name).filter((card) => !drawnKeys.has(card.key)) } : c)),
  };
}

// The columns as the board shows them: hidden ones left out, the others with
// the cards that show (`mine`: only one's own).
export function shownColumns(board, filter, mine = false) {
  const all = showsAll(filter, mine);
  return (board?.columns ?? []).filter((c) => !c.hidden).map((c) => ({ ...c, shown: all ? c.cards : c.cards.filter((card) => shows(card, filter, mine, board.viewer)) }));
}

// The rows of a board with swimlanes (data.lanes), as it draws them: per
// swimlane that shows a card, its head and then its rows, the n-th of which
// holds the n-th card the swimlane has in each column (null where it has
// fewer). `columns` are the shown ones (shownColumns).
export function laneRows(lanes, columns) {
  const rows = [];
  for (const lane of lanes) {
    const cells = columns.map((c) => c.shown.filter((card) => card.lane === lane.id));
    const count = cells.reduce((n, cards) => n + cards.length, 0);
    if (!count) continue;
    rows.push({ head: true, lane, count });
    const depth = Math.max(...cells.map((cards) => cards.length));
    for (let r = 0; r < depth; r++) rows.push({ head: false, lane, cards: cells.map((cards) => cards[r] ?? null) });
  }
  return rows;
}

// Keyboard movement on a board with swimlanes: up and down within the
// column, through its swimlanes in their order (navigate); left and right
// to the next column's card in the same swimlane and row, else its swimlane's
// last there, else as navigate goes.
export function laneNavigate(columns, sel, dir) {
  if (dir !== "left" && dir !== "right") return navigate(columns, sel, dir);
  const from = columns[sel?.col];
  const card = from?.shown.find((c) => c.key === sel?.key);
  const to = Math.min(Math.max((sel?.col ?? 0) + (dir === "left" ? -1 : 1), 0), columns.length - 1);
  if (!card || !columns[to]) return navigate(columns, sel, dir);
  const row = from.shown.filter((c) => c.lane === card.lane).indexOf(card);
  const there = columns[to].shown.filter((c) => c.lane === card.lane);
  return there.length ? { col: to, key: there[Math.min(row, there.length - 1)].key } : navigate(columns, sel, dir);
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

// A sprint's taskboard: its rows (one per story, one per task's parent
// outside the sprint, and "Ohne Story" for tasks without a parent read),
// the items it holds, what shows and how the keys walk it, a task's state
// as shown, a state change laid over the data, its warnings
// (sprintWarnings), which folds hold (foldsOf) and its dates as written.
// The data is a board's (kinds/board.js: its columns hold the tasks, so
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
// column maps its type to, until a refresh reads it; else its own.
export function shownState(item, column) {
  if (!isTask(item) || !column || item.column === item.readColumn) return item.state;
  return column.mappings?.[item.type] ?? item.state;
}

// The columns keyboard movement and selection walk: the stories that show,
// then the taskboard's columns with the tasks that show, each in row order
// and in a row by the backlog's order, as Azure's taskboard stacks them (a
// task moved in comes last in its column's data). withoutFolded leaves the
// tasks of folded rows out of them.
export function sprintNav(data, filter, mine) {
  const order = new Map(data.rows.map((r, i) => [r.key, i]));
  const stories = { id: STORY_COLUMN, name: "Story", shown: sprintStories(data).filter((s) => shows(s, filter, mine, data.viewer)) };
  const inRow = byOrder((a, b) => a.number - b.number);
  const byRow = (a, b) => order.get(rowOf(a)) - order.get(rowOf(b)) || inRow(a, b);
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

// The top bar's order of things: the contexts it switches between, grouped
// by their source, the tabs of each, and the view a tab shows.

// A team view's name, as the switch shows it.
export const teamViewName = (id) => TEAM_VIEWS.find((v) => v.id === id)?.name ?? id;

export const ISSUE_VIEWS = [
  { id: "open", name: "Offen" },
  { id: "closed", name: "Geschlossen" },
];
const issueViewName = (id) => ISSUE_VIEWS.find((v) => v.id === id)?.name ?? id;

// What the board knows of a project from its last read, by its tab's id
// (`known.get(id)`: { title, url, views: [{ number, name, layout, filter }]
// in GitHub's order, layout as parseGithubProject names it (viewLayout:
// "board", "table", "roadmap" or another's name) }, null before any):
// Board.learnProject keeps it.
export const NO_PROJECTS = { get: () => null };

// Where the store keeps what the board knows of a project, by its tab's id,
// and the keys of the projects whose tabs (`tabs`, their ids) are gone.
export const PROJECT_PREFIX = "project:";
export const projectKey = (id) => `${PROJECT_PREFIX}${id}`;
export const goneProjects = (keys, tabs) => keys.filter((k) => k.startsWith(PROJECT_PREFIX) && !tabs.has(k.slice(PROJECT_PREFIX.length)));

// A project's tab, its views.json entry as `entry`: named as GitHub names
// the project, its views GitHub's (their numbers) once the board knows
// them.
function projectTab(entry, known) {
  const meta = known.get(entry.id);
  return { id: entry.id, source: "github", kind: "project", name: meta?.title ?? `Projekt ${entry.number}`, entry, meta, views: (meta?.views ?? []).map((v) => v.number) };
}

// A PR tab: its entry is its view, as GitHub's "list".
const githubPrsTab = (entry) => ({ id: githubTabId(entry.id), source: "github", kind: "view", name: entry.name, view: entry });

const issuesTab = (entry) => ({ id: entry.id, source: "github", kind: "issues", name: entry.name, entry, views: ISSUE_VIEWS.map((v) => v.id) });

const GITHUB_TABS = { project: projectTab, issues: issuesTab, prs: githubPrsTab };
const githubTab = (entry, known) => GITHUB_TABS[entry.entryKind](entry, known);

// The sources in the switch's order, each with its contexts in views.json's.
export const SOURCES = [
  {
    id: "github",
    name: "GitHub",
    contexts: (config, known) => (config?.github?.contexts ?? []).map((c) => ({ id: `github:${c.owner}`, name: c.owner, tabs: c.tabs.map((t) => githubTab(t, known)) })),
  },
  {
    id: "azure",
    name: "Azure",
    contexts: (config) => (config?.azure?.contexts ?? []).map((c) => ({ id: `azure:${c.project}`, name: c.project, tabs: c.tabs })),
  },
];

// The contexts of a config, in the switch's order: { id, source, name,
// tabs }, a tab { id, source, kind (one of TAB_KINDS), name, … } (a team's
// fields, an Azure project's, a GitHub project's views.json entry as
// `entry` with what the board knows of it, `known`, as `meta`, an Issues
// tab's entry as `entry`, or the GitHub PR view as `view`).
export const contextsOf = (config, known = NO_PROJECTS) => SOURCES.flatMap((s) => s.contexts(config, known).map((c) => ({ ...c, source: s.id })));

// Whether a tab shows one of its own views (`views`), a kind with a
// storeKey; and whether it has a switch between them, more than one.
export const hasViews = (tab) => Boolean(TAB_KINDS[tab?.kind]?.storeKey);
export const hasViewSwitch = (tab) => hasViews(tab) && tab.views.length > 1;

export const tabViewName = (tab, id) => TAB_KINDS[tab.kind].viewName(tab, id);

export const tabViewKey = (tab) => `${TAB_KINDS[tab.kind].storeKey}:${tab.id}`;

// The hint line's name for a tab's switch: its views' names, "Sprint/Backlog".
export const viewSwitchHint = (tab) => tab.views.map((v) => tabViewName(tab, v)).join("/");

// The index `by` places on from `at` in a list `length` long, round past
// its end to its start and back: the next or previous tab, context or view.
export const stepIndex = (length, at, by) => (at + by + length) % length;

// The index in `list` of `shown` (by its id), -1 for none: the shown tab
// among the tabs, the shown context among the contexts.
export const shownIndex = (list, shown) => list.findIndex((x) => x.id === shown?.id);

// The view a team's or a project's tab shows after `shown`, one of its
// views.
export const tabViewAfter = (tab, shown) => tab.views[stepIndex(tab.views.length, tab.views.indexOf(shown), 1)];

// The entry of `list` whose id is `id`, else the first; null in an empty
// list. A remembered choice that views.json no longer has falls back so.
export const pick = (list, id) => list.find((x) => x.id === id) ?? list[0] ?? null;

// The view a team's or a project's tab shows: the remembered one where it
// has it, else its first (null for a project whose views are not known yet).
export const tabView = (tab, remembered) => (tab.views.includes(remembered) ? remembered : tab.views[0] ?? null);

// The id of the view that reads a project's views (projectView without
// one shown).
export const firstViewId = (tab) => `${tab.id}:first`;

// A project's view as the board shows it: { id, source: "github", layout,
// name, tab, address: { owner, number, view } (the project's and the
// view's number on GitHub), limit, start, hide (this view's hidden
// columns), settingsPath (the view's own, under the project's), owners },
// for `shown`, one of its tab's meta.views. Without one, the view whose
// read learns the project's views and then reads the view `wanted` (the
// one remembered, where the project still has it) or else the first: a
// board with address.view null that hides nothing and has no settings of
// its own (settingsPath null).
export function projectView(tab, shown, wanted = null) {
  const p = tab.entry;
  const common = { source: "github", tab, limit: p.limit, start: p.start, owners: p.owners };
  const address = (view) => ({ owner: p.owner, number: p.number, view });
  if (!shown) return { ...common, id: firstViewId(tab), layout: "board", name: tab.name, address: address(null), wanted, hide: [], settingsPath: null };
  const settingsPath = [...p.settingsPath, "views", String(shown.number)];
  return { ...common, id: `${tab.id}:${shown.number}`, layout: shown.layout, name: shown.name, address: address(shown.number), hide: p.views[shown.number]?.hide ?? [], settingsPath };
}

// Per kind of tab (a tab's `kind`): for one with views of its own, where
// the store keeps the one it shows (storeKey, tabViewKey) and a view's name
// (viewName: an Azure team's, an Issues tab's, a project's as GitHub names
// it); and the view it shows (viewOf, of its view `viewId` where it has
// views): a GitHub PR view as views.json has it ("view"), a project's
// (projectView), an Issues tab's { id, source: "github", layout: "issues",
// issueState ("open" or "closed"), name, tab, owner, limit, hideRepos,
// start, hide, settingsPath (its tab's), owners }, an Azure one { id,
// source: "azure", layout: "sprint" | "backlog" | "prs", name, tab, hide,
// start }. A view's kind is viewKind(view).
const TAB_KINDS = {
  team: {
    storeKey: "teamView",
    viewName: (_tab, id) => teamViewName(id),
    viewOf: (tab, viewId) => ({ id: `${tab.id}:${viewId}`, source: "azure", layout: viewId, name: teamViewName(viewId), tab, ...viewDefaults() }),
  },
  project: {
    storeKey: "projectView",
    viewName: (tab, id) => tab.meta?.views.find((v) => v.number === id)?.name ?? String(id),
    viewOf(tab, viewId) {
      const shown = tab.meta?.views.find((v) => v.number === viewId);
      return shown ? projectView(tab, shown) : projectView(tab, null, viewId ?? null);
    },
  },
  issues: {
    storeKey: "issuesView",
    viewName: (_tab, id) => issueViewName(id),
    viewOf(tab, viewId) {
      const { owner, limit, hideRepos, start, hide, settingsPath, owners } = tab.entry;
      return { id: `${tab.id}:${viewId}`, source: "github", layout: "issues", issueState: viewId, name: issueViewName(viewId), tab, owner, limit, hideRepos, start, hide, settingsPath, owners };
    },
  },
  view: { viewOf: (tab) => tab.view },
  prs: { viewOf: (tab) => ({ id: tab.id, source: "azure", layout: "prs", name: tab.name, tab, ...viewDefaults() }) },
};

export const viewOf = (tab, viewId) => TAB_KINDS[tab.kind].viewOf(tab, viewId);

// A project the board knows no views of has one view: the one that learns them.
export const viewsOfTab = (t) => (hasViews(t) && t.views.length ? t.views.map((v) => viewOf(t, v)) : [viewOf(t, null)]);
export const contextViews = (context) => context.tabs.flatMap(viewsOfTab);
export const viewsOf = (config, known = NO_PROJECTS) => contextsOf(config, known).flatMap(contextViews);

// The first context of `source`, which a source alone names.
export const firstContextOf = (contexts, source) => contexts.find((c) => c.source === source) ?? null;

// While `complete` is false (views.json has problems), a key that names no
// context stays, and so does a source whose tab names none.
export function shownContextMoves(contexts, get, complete) {
  const set = [];
  const gone = new Set();
  const view = get("view");
  const before = typeof view === "string" ? { source: "github", "tab:github": githubTabId(view) } : {};
  const old = (key) => get(key) ?? before[key] ?? null;
  const contextOf = (tab) => contexts.find((c) => c.tabs.some((t) => t.id === tab)) ?? null;
  const move = (key, context, to, value) => {
    if (context && get(to) === null) set.push([to, value]);
    if (context || complete) gone.add(key);
  };
  for (const s of SOURCES) {
    const tab = old(`tab:${s.id}`);
    const context = tab === null ? null : contextOf(tab);
    if (tab !== null) move(`tab:${s.id}`, context, `tab:${context?.id}`, tab);
  }
  const source = old("source");
  const tab = source === null ? null : old(`tab:${source}`);
  const named = tab === null ? null : contextOf(tab);
  if (source !== null && (complete || tab === null || named)) {
    const context = (named?.source === source ? named : null) ?? firstContextOf(contexts, source);
    move("source", context, "context", context?.id);
  }
  const remove = [...gone].filter((key) => get(key) !== null);
  if (Object.keys(before).length && Object.keys(before).every((key) => get(key) !== null || gone.has(key))) remove.push("view");
  return { set, remove };
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
// bar's words for a read, an age and a state not saved.

// herdr's store refuses a value whose JSON string takes more than 1 MiB in
// UTF-8, and a file of more than 8 MiB for all keys (gpui-kit's
// storage.rs).
export const SAVED_MAX = 1000000;
export const SAVED_PREFIX = "board:data:";
// Raised when what a shape draws from changes, so that no older data is drawn.
export const SAVED_VERSION = 5;
export const savedKey = (id) => `${SAVED_PREFIX}${id}`;
// What a view says beside its age where the store did not take its last
// read: more than SAVED_MAX bytes, or refused by the store itself (the 8
// MiB of all keys, say).
export const UNSAVED = { big: "Stand nicht gespeichert: zu groß", refused: "Stand nicht gespeichert: vom Speicher abgelehnt" };

// Data read for other hidden columns, another form of the view or another
// organisation, project or team of its Azure tab is not its data; where its
// settings lie, the rest of its tab and the repos a PR or Issues tab hides
// are not its form (a PR tab reads them all; an Issues tab's data names
// those turned off as its read began, readHidden, and its shape reads again
// where they differ: readsAgain). A GitHub view signs without its tab.
const savedSig = (view, hidden) => {
  const { settingsPath, tab, hideRepos, ...form } = view;
  const reads = view.source === "azure" && tab ? [{ org: tab.org, project: tab.project, team: tab.team }] : [];
  return JSON.stringify([SAVED_VERSION, form, ...reads, [...hidden].sort()]);
};

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

// Rows (objects) as a shape keeps them in its saved state (toSaved): per
// trait (a row's property), the values its rows hold, each once, and each
// row's index into them (-1: the row lacks the trait; none where each row
// holds a value of its own, in their order); unpackRows makes the rows of
// them again, rows that share a value sharing it.
export function packRows(rows) {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return {
    count: rows.length,
    traits: names.map((trait) => {
      const seen = new Map();
      const values = [];
      const index = rows.map((r) => {
        if (!Object.hasOwn(r, trait)) return -1;
        const text = JSON.stringify(r[trait]);
        if (!seen.has(text)) seen.set(text, values.push(r[trait]) - 1);
        return seen.get(text);
      });
      return index.every((k, i) => k === i) ? { trait, values } : { trait, values, index };
    }),
  };
}

export function unpackRows({ count, traits }) {
  const rows = Array.from({ length: count }, () => ({}));
  for (const { trait, values, index = values.map((_, i) => i) } of traits) {
    index.forEach((k, i) => {
      if (k >= 0) rows[i][trait] = values[k];
    });
  }
  return rows;
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
// under way; project(meta) hands the board what a GitHub project's read
// learnt of it (Board.learnProject) and gives the view to read on as the
// board shows it now (null: the one loaded; false: none, the read ends).
export const NO_LIVE = { partial() {}, page() {}, project: () => null };

export const refreshDue = (st, now, every) => now - st.tried >= every;

export function prefetchOrder(views, { shown, contextViewIds, source, now, every, stateOf, loads }) {
  const due = views.filter((v) => {
    if (v.id === shown?.id || !loads(v)) return false;
    const st = stateOf(v.id);
    return !st.loading && !st.unavailable && refreshDue(st, now, every);
  });
  const rank = (v) => [contextViewIds.has(v.id) ? 0 : v.source === source ? 1 : 2, stateOf(v.id).at];
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
  if (!st) return { reading: "", age: "", unsaved: "" };
  const page = st.progress?.pages > 1 ? ` Seite ${st.progress.page} von ${st.progress.pages}` : "";
  return { reading: st.loading ? `lädt …${page}` : "", age: st.at ? `Stand ${sinceLabel(st.at, now)}` : "", unsaved: st.unsaved ?? "" };
}

// ==== src/actions/start.js ====

const NAME_MAX = 60;

// The tab's name, by which itemSessions (sessions.js) finds the session again.
export function sessionName(item) {
  const key = itemKey(item);
  const full = key ? `${key} ${item.title}` : item.title;
  return full.length <= NAME_MAX ? full : `${full.slice(0, NAME_MAX - 1)}…`;
}

// `{name}` placeholders filled from vars; unknown ones stay.
export function renderTemplate(template, vars) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (all, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : all));
}

export function templateVars(item) {
  const name = item.repo ?? "";
  const [owner, repo] = name.includes("/") ? name.split("/") : ["", name];
  return { number: item.number ?? "", title: item.title, url: item.url ?? "", owner, repo, key: itemKey(item) ?? "" };
}

// Sets dir to the folder $1 names, a leading ~ that machine's home.
const TO_DIR = "to_dir() { case $1 in \\~) dir=$HOME ;; \\~/*) dir=$HOME/${1#\\~/} ;; *) dir=$1 ;; esac; }";

// Prints the checkout's folder on the chosen machine ($1), or exits 3 when
// there is none.
export const CHECKOUT_SCRIPT = [
  TO_DIR,
  'to_dir "$1"',
  '[ -d "$dir" ] || { echo "Kein Checkout unter $dir" >&2; exit 3; }',
  'cd "$dir" && pwd',
].join("\n");

export const checkoutArgs = (checkout) => ["-c", CHECKOUT_SCRIPT, "board-checkout", checkout];

// Prints, per folder given ($@) by its place among them, "<place><tab><repo's
// folder>" for each folder directly beneath it that holds a .git (a folder,
// or a worktree's file); "<place><tab>" alone for a folder that is not
// there, "<place><tab><tab>" for one it cannot enter or list.
export const REPOS_SCRIPT = [
  TO_DIR,
  "i=0",
  'for f in "$@"; do',
  '  to_dir "$f"',
  '  if [ ! -d "$dir" ]; then printf \'%s\\t\\n\' "$i"',
  '  elif [ -r "$dir" ] && dir=$(cd "$dir" && pwd); then',
  '    for d in "$dir"/*/; do [ -e "$d.git" ] && printf \'%s\\t%s\\n\' "$i" "${d%/}"; done',
  "  else printf '%s\\t\\t\\n' \"$i\"; fi",
  "  i=$((i + 1))",
  "done",
  "exit 0",
].join("\n");

export const reposArgs = (folders) => ["-c", REPOS_SCRIPT, "board-repos", ...folders];

// REPOS_SCRIPT's answer for `folders` → { repos, missing, unreadable }:
// repos [{ key, name, folder, parent }] by name, then in the order of the
// folders; key the parent as views.json writes it and the repo's name (the
// same on every machine), folder where it is on that machine.
export function parseRepos(stdout, folders) {
  const repos = [];
  const missing = [];
  const unreadable = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const tab = line.indexOf("\t");
    const parent = folders[Number(line.slice(0, tab))];
    if (tab < 1 || parent === undefined) continue;
    const folder = line.slice(tab + 1);
    if (!folder) missing.push(parent);
    else if (folder === "\t") unreadable.push(parent);
    else {
      const name = folder.split("/").pop();
      repos.push({ key: `${parent.endsWith("/") ? parent : `${parent}/`}${name}`, name, folder, parent });
    }
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, missing, unreadable };
}

export const spacesOn = (allSpaces, on) => allSpaces.filter((s) => (s.machine ?? null) === (on ?? null));

export function preselectedSpace(here, name) {
  const wanted = String(name ?? "").toLowerCase();
  return (wanted && here.find((s) => s.name.toLowerCase() === wanted)) || here.find((s) => s.active) || here[0] || null;
}

// The app command that opens a session: [name, args].
export function startCommand({ on, folder, argv, task, name, space, spaceName }) {
  const common = { folder, argv, ...(task ? { task } : {}) };
  if (space) return ["tab.new", { name, space, ...common }];
  return ["space.new", { name: spaceName, tab: name, machine: on ?? "", ...common }];
}

// ==== src/sessions.js ====

// Nothing here reads a file in a draw: Claude Code's files are read off it
// (readClaudeSessions), and a draw builds one index (sessionIndex) that
// each card looks itself up in.

export const AGENT_STATUS = { working: "arbeitet", blocked: "wartet auf dich", done: "fertig", idle: "bereit" };
const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const urgencyOf = (status) => URGENCY[status] ?? 4;

const isDigit = (c) => c >= 48 && c <= 57;
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
// What GitHub allows in a repo's name.
const isNameChar = (c) => isDigit(c) || isLetter(c) || c === 45 || c === 46 || c === 95;

function ownerStart(s, start) {
  if (s[start - 1] !== "/") return start;
  let at = start - 1;
  while (at > 0 && isNameChar(s.charCodeAt(at - 1))) at--;
  return at < start - 1 ? at : start;
}

// No RegExp: this runs for each name at every draw.
export function references(text) {
  const s = String(text ?? "");
  const keys = [];
  const bare = [];
  for (let at = s.indexOf("#"), bang = s.indexOf("!"); at >= 0 || bang >= 0; ) {
    const i = at < 0 ? bang : bang < 0 ? at : Math.min(at, bang);
    let end = i + 1;
    while (end < s.length && isDigit(s.charCodeAt(end))) end++;
    const next = end < s.length ? s.charCodeAt(end) : 0;
    let start = i;
    while (start > 0 && isNameChar(s.charCodeAt(start - 1))) start--;
    if (end > i + 1 && !isLetter(next) && !isDigit(next) && next !== 95) {
      const number = s.slice(i + 1, end);
      if (s[i] === "!") {
        if (start === i) keys.push(`!${number}`);
      } else if (start === i) bare.push(number);
      else {
        // Azure's "AB#4711" names no repo, so nothing before it is an owner.
        const from = s.slice(start, i).toLowerCase() === "ab" ? start : ownerStart(s, start);
        keys.push(`${s.slice(from, i).toLowerCase()}#${number}`);
      }
    }
    if (i === at) at = s.indexOf("#", i + 1);
    else bang = s.indexOf("!", i + 1);
  }
  return { keys, bare };
}

export function branchNumbers(branch) {
  const parts = String(branch ?? "").split("/");
  const numbers = [];
  parts.forEach((part, i) => {
    let end = 0;
    while (end < part.length && isDigit(part.charCodeAt(end))) end++;
    if (end > 0 && (part[end] === "-" || (end === part.length && i === parts.length - 1))) numbers.push(part.slice(0, end));
  });
  return numbers;
}

// The worktree a folder is in, below `<repo>.worktrees/`: its first two
// parts there (`feat/3000-x`, the way the worktrees are laid out), or null.
export function worktreeOf(folder) {
  const parts = String(folder ?? "").split("/");
  const at = parts.findIndex((p) => p.endsWith(".worktrees") && p.length > ".worktrees".length);
  if (at < 0 || at === parts.length - 1) return null;
  return parts.slice(at + 1, at + 3).filter(Boolean).join("/") || null;
}

export function inRepo(folder, repo) {
  const name = String(repo ?? "").toLowerCase();
  if (!name || !folder) return false;
  return String(folder).toLowerCase().split("/").some((p) => p === name || p === `${name}.worktrees`);
}

// ---- Claude Code's sessions on this machine ----

// A record's mark in the scripts' output: no JSON text holds it unescaped.
const RS = "\x1e";

// Never reads the `.key` files beside the sessions' `<pid>.json`. Where
// ps runs, a file whose pid now runs another program than Claude Code is
// one of a session that ended, named by `RS O`. Claude Code's comm:
// `claude`, npm's `bin/claude.exe` (its copy of the native binary)
// started by that path, its version (the native install's `versions/<v>`,
// likewise), or node's (`node`, or `MainThread` as node 24.16 calls its
// main thread) with Claude Code in its arguments: an npm install from
// before the native binary, which names itself `claude` unless
// CLAUDE_CODE_DISABLE_TERMINAL_TITLE is set. herdr cuts a program's
// output at 8 MiB without a sign: only the end record `RS Z` tells the
// output came whole.
export const CLAUDE_SESSIONS_SCRIPT = [
  'dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sessions"',
  "end() { printf '\\036Z\\n'; exit 0; }",
  "other() { printf '\\036O\\t%s\\t%s\\n' \"$pid\" \"$(printf %s \"$comm\" | tr -d '\\036\\t\\n')\"; }",
  '[ -d "$dir" ] || end',
  "if list=$(ps -A -o pid= -o ppid= 2>/dev/null); then ps=1; else ps=; fi",
  "if [ -r \"$dir\" ] && [ -x \"$dir\" ]; then",
  '  for f in "$dir"/*.json; do',
  '    [ -e "$f" ] || continue',
  '    pid=${f##*/}; pid=${pid%.json}',
  '    case $pid in ""|*[!0-9]*) printf \'\\036N\\t%s\\n\' "$pid"; continue ;; esac',
  '    kill -0 "$pid" 2>/dev/null || continue',
  '    if [ -n "$ps" ]; then',
  '      comm=$(ps -o comm= -p "$pid" 2>/dev/null) || continue',
  '      comm=${comm##*/}',
  '      case $comm in',
  '        claude|claude.exe|[0-9]*.[0-9]*.[0-9]*) ;;',
  '        node|MainThread) case $(ps -o args= -p "$pid" 2>/dev/null) in',
  '            */claude|*/claude\\ *|*@anthropic-ai/claude-code*) ;;',
  '            *) other; continue ;;',
  '          esac ;;',
  '        *) other; continue ;;',
  '      esac',
  '    fi',
  '    if text=$(cat "$f" 2>/dev/null); then printf \'\\036S\\t%s\\n%s\\n\' "$pid" "$text"; else printf \'\\036U\\t%s\\n\' "$pid"; fi',
  "  done",
  "else printf '\\036D\\n'; fi",
  "if [ -n \"$ps\" ]; then printf '\\036P\\n%s\\n' \"$list\"; else printf '\\036X\\n'; fi",
  "end",
].join("\n");

export const claudeSessionsArgs = () => ["-c", CLAUDE_SESSIONS_SCRIPT, "board-claude"];

export const CLAUDE_TASKS_SCRIPT = [
  'base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/tasks"',
  'for id in "$@"; do',
  '  dir="$base/session-$id"',
  '  [ -d "$dir" ] || continue',
  '  if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then printf \'\\036E\\t%s\\n\' "$id"; continue; fi',
  '  for f in "$dir"/*.json; do',
  '    [ -e "$f" ] || continue',
  '    n=${f##*/}; n=${n%.json}',
  '    if text=$(cat "$f" 2>/dev/null); then printf \'\\036T\\t%s\\t%s\\n%s\\n\' "$id" "$n" "$text"; else printf \'\\036V\\t%s\\t%s\\n\' "$id" "$n"; fi',
  "  done",
  "done",
  "printf '\\036Z\\n'",
].join("\n");

export const claudeTasksArgs = (lists) => ["-c", CLAUDE_TASKS_SCRIPT, "board-claude-tasks", ...lists];

// An output without its end record was cut: its last record may be cut
// too, so it goes with the rest, and `cut` says so in `notes`.
function records(stdout, notes, cut) {
  const all = String(stdout ?? "")
    .split(RS)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      const [kind, ...fields] = (nl < 0 ? chunk : chunk.slice(0, nl)).split("\t");
      return { kind, fields, text: nl < 0 ? "" : chunk.slice(nl + 1) };
    });
  if (all.at(-1)?.kind === "Z") return all.slice(0, -1);
  notes.push(cut);
  return all.slice(0, -1);
}

const optionalText = (v) => v === undefined || v === null || typeof v === "string";

// A task list's folder: `session-` and the first eight characters of the
// session's id.
export const taskList = (sessionId) => sessionId.slice(0, 8);

// The states Claude Code writes into a session's file (its own reader of
// them takes these four, 2.1.332), as herdr's agent status: `shell` is a
// turn that ended with a shell still running in the background, `waiting`
// a question to the person (a permission, a dialog).
const CLAUDE_STATUS = { busy: "working", shell: "working", waiting: "blocked", idle: "idle" };

export function parseClaudeSessions(stdout) {
  const sessions = [];
  const notes = [];
  let parents = null;
  for (const r of records(stdout, notes, "Claude: Ausgabe abgeschnitten, Rest übersprungen")) {
    const file = `sessions/${r.fields[0]}.json`;
    if (r.kind === "D") notes.push("Claude: Ordner sessions nicht lesbar, Sitzungen übersprungen");
    else if (r.kind === "U") notes.push(`Claude: ${file} nicht lesbar, übersprungen`);
    else if (r.kind === "N") notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
    else if (r.kind === "X") notes.push("Claude: Prozessliste (ps) nicht gelesen, Sitzungen ohne Prüfung ihres Programms übernommen und nur über ihren eigenen Prozess oder den Ordner zugeordnet");
    else if (r.kind === "O") notes.push(`Claude: ${file} gehört zu Prozess „${String(r.fields[1] ?? "").slice(0, 40)}“, übersprungen`);
    else if (r.kind === "P") {
      parents = new Map();
      for (const line of r.text.split("\n")) {
        const [pid, ppid] = line.trim().split(/\s+/).map(Number);
        if (Number.isInteger(pid) && Number.isInteger(ppid)) parents.set(pid, ppid);
      }
    } else if (r.kind === "S") {
      const s = jsonOrNull(r.text);
      const shaped = isObject(s) && s.pid === Number(r.fields[0]) && typeof s.sessionId === "string" && s.sessionId.length >= 8
        && typeof s.cwd === "string" && optionalText(s.name) && optionalText(s.status);
      if (!shaped) {
        notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
        continue;
      }
      const known = s.status === undefined || s.status === null || Object.hasOwn(CLAUDE_STATUS, s.status);
      if (!known) notes.push(`Claude: ${file} mit unbekanntem Status „${s.status.slice(0, 40)}“, Status übergangen`);
      sessions.push({ pid: s.pid, sessionId: s.sessionId, cwd: s.cwd, name: s.name ?? null, status: known ? s.status ?? null : null });
    }
  }
  return { sessions, parents, notes };
}

const TASK_STATES = ["pending", "in_progress", "completed"];

// Claude Code sets a task's id, subject and status; its description may be
// missing.
export function parseClaudeTasks(stdout) {
  const tasks = new Map();
  const notes = [];
  for (const r of records(stdout, notes, "Claude: Ausgabe der Aufgaben abgeschnitten, Rest übersprungen")) {
    const [list, n] = r.fields;
    const file = `tasks/session-${list}/${n}.json`;
    if (r.kind === "E") notes.push(`Claude: Ordner tasks/session-${list} nicht lesbar, Aufgaben übersprungen`);
    else if (r.kind === "V") notes.push(`Claude: ${file} nicht lesbar, übersprungen`);
    else if (r.kind === "T") {
      const t = jsonOrNull(r.text);
      const shaped = isObject(t) && typeof t.id === "string" && typeof t.subject === "string" && TASK_STATES.includes(t.status) && optionalText(t.description);
      if (!shaped) notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
      else {
        if (!tasks.has(list)) tasks.set(list, []);
        tasks.get(list).push({ id: t.id, subject: t.subject, description: t.description ?? "", status: t.status });
      }
    }
  }
  return { tasks, notes };
}

export function claudeSnapshot(read, tasks) {
  const sessions = read.sessions.map((s) => {
    const chain = [s.pid];
    for (let p = read.parents?.get(s.pid); p > 1 && chain.length < 64 && !chain.includes(p); p = read.parents.get(p)) chain.push(p);
    const open = (tasks?.tasks.get(taskList(s.sessionId)) ?? []).filter((t) => t.status !== "completed");
    return {
      pid: s.pid, cwd: s.cwd, name: s.name, agentStatus: CLAUDE_STATUS[s.status] ?? null, chain,
      refs: references(s.name), tasks: open.map((t) => ({ subject: t.subject, refs: references(`${t.subject}\n${t.description}`) })),
    };
  });
  return { sessions, notes: [...read.notes, ...(tasks?.notes ?? [])] };
}

// `run(args, kind)` runs sh with `args` and resolves to its result (the
// Board's: tools.js call, which logs it and words a failure to start).
export async function readClaudeSessions(run) {
  const failed = (r) => (r.code === 0 ? null : `sh endete mit ${r.code}${r.stderr ? `: ${firstLine(r.stderr)}` : ""}`);
  try {
    const listed = await run(claudeSessionsArgs(), "claude-sessions");
    if (failed(listed)) throw new Error(failed(listed));
    const read = parseClaudeSessions(listed.stdout);
    let tasks = null;
    if (read.sessions.length) {
      try {
        const r = await run(claudeTasksArgs(read.sessions.map((s) => taskList(s.sessionId))), "claude-tasks");
        if (failed(r)) throw new Error(failed(r));
        tasks = parseClaudeTasks(r.stdout);
      } catch (e) {
        tasks = { tasks: new Map(), notes: [`Claude-Aufgaben nicht gelesen: ${firstLine(e?.message ?? e)}`] };
      }
    }
    return claudeSnapshot(read, tasks);
  } catch (e) {
    return { sessions: [], notes: [`Claude-Sitzungen nicht gelesen: ${firstLine(e?.message ?? e)}`] };
  }
}

// ---- the index ----

// What herdr gives a pane whose agent reports itself as Claude Code.
const CLAUDE_APP = "claude-code";

// An entry's or hit's place: { space, tab, pane } (tab and pane null where
// it names none), or { claude: pid } for a Claude session in no terminal.
// claudePid: the pid of the Claude session an entry holds, wherever that
// is (null for none); a Claude hit carries its own.
export const placed = (s) => s.place.claude === undefined;
export const placeKey = (s) => (placed(s) ? s.place.pane ?? s.place.tab ?? s.place.space : `claude:${s.place.claude}`);

const add = (map, key, hit) => {
  const list = map.get(key);
  if (list) list.push(hit);
  else map.set(key, [hit]);
};

export function sessionIndex({ spaces = [], panes = [], terminals = [], claude = null } = {}) {
  const index = { byKey: new Map(), byBare: new Map(), byNumber: new Map(), byBranch: new Map(), places: new Map(), cache: new Map(), notes: claude?.notes ?? [] };
  const spaceOfTab = new Map();
  const named = (text, hit, folder) => {
    const { keys, bare } = references(text);
    for (const k of keys) add(index.byKey, k, hit);
    for (const n of bare) add(index.byBare, n, { ...hit, folder });
  };
  const branched = (branch, hit, folder) => {
    if (!branch) return;
    add(index.byBranch, branch, { ...hit, folder });
    for (const n of branchNumbers(branch)) add(index.byNumber, n, { ...hit, why: `Branch ${branch}`, folder });
  };
  for (const s of spaces) {
    index.places.set(s.id, { label: s.name, placeStatus: s.status ?? null });
    const place = { space: s.id, tab: null, pane: null };
    named(s.name, { sure: true, why: "Space-Name", place }, s.folder);
    branched(s.branch, { sure: true, why: "", place }, s.folder);
    for (const t of s.tabs ?? []) {
      spaceOfTab.set(t.id, s.id);
      index.places.set(t.id, { label: t.name, placeStatus: t.status ?? null });
      named(t.name, { sure: true, why: "Tab-Name", place: { space: s.id, tab: t.id, pane: null } }, s.folder);
    }
  }
  const paneOfTerminal = new Map();
  const panesIn = new Map();
  for (const p of panes) {
    const space = spaceOfTab.get(p.tab);
    if (!p.terminal || !space) continue;
    paneOfTerminal.set(p.terminal, p);
    const tab = index.places.get(p.tab);
    const label = `${tab.label} · ${p.name ?? p.program?.name ?? p.title}`;
    const nth = (panesIn.get(p.tab) ?? 0) + 1;
    panesIn.set(p.tab, nth);
    index.places.set(p.pane, { label, placeStatus: p.status ?? null, nth });
    const place = { space, tab: p.tab, pane: p.pane };
    named(p.name, { sure: true, why: "Pane-Name", place }, p.cwd);
    branched(p.branch, { sure: true, why: "", place }, p.cwd);
    const worktree = worktreeOf(p.cwd);
    for (const n of branchNumbers(worktree)) add(index.byNumber, n, { sure: true, why: `Worktree ${worktree}`, place, folder: p.cwd });
    named(p.title, { sure: false, why: `Terminal-Titel „${p.title}“`, place }, p.cwd);
  }
  const local = (terminal) => !String(terminal).includes("/");
  const paneOfPid = new Map();
  for (const t of terminals) {
    const pane = paneOfTerminal.get(t.address);
    if (!pane || !local(t.address)) continue;
    for (const pid of [t.pid, t.foreground?.pid]) if (Number.isInteger(pid)) paneOfPid.set(pid, pane);
  }
  const sessions = claude?.sessions ?? [];
  const byProcess = new Map(sessions.map((c) => [c, c.chain.map((pid) => paneOfPid.get(pid)).find(Boolean) ?? null]));
  const claimed = new Set(byProcess.values());
  const claudePanes = panes.filter((p) => paneOfTerminal.get(p.terminal) === p && local(p.terminal) && !claimed.has(p) && p.app === CLAUDE_APP);
  for (const c of sessions) {
    const lost = sessions.filter((o) => o.cwd === c.cwd && !byProcess.get(o));
    const there = claudePanes.filter((p) => p.cwd === c.cwd);
    const pane = byProcess.get(c) ?? (lost.length === 1 && there.length === 1 ? there[0] : null);
    const place = pane ? { space: spaceOfTab.get(pane.tab), tab: pane.tab, pane: pane.pane } : { claude: c.pid };
    const label = `Claude-Sitzung „${c.name ?? c.pid}“`;
    const own = { place, label, agentStatus: c.agentStatus, claudePid: c.pid };
    for (const k of c.refs.keys) add(index.byKey, k, { ...own, sure: true, why: label });
    for (const n of c.refs.bare) add(index.byBare, n, { ...own, sure: true, why: label, folder: c.cwd });
    for (const task of c.tasks) {
      const why = `offene Aufgabe: ${task.subject}`;
      for (const k of task.refs.keys) add(index.byKey, k, { ...own, sure: false, why });
      for (const n of task.refs.bare) add(index.byBare, n, { ...own, sure: false, why, folder: c.cwd });
    }
  }
  return index;
}

// Whether hit `h` is at entry `e`'s place, or `e` at `h`'s: a tab or pane
// that one names and the other does not is no difference.
export function fits(e, h) {
  if (!placed(e) || !placed(h)) return !placed(e) && !placed(h) && e.place.claude === h.place.claude;
  const same = (a, b) => a === null || b === null || a === b;
  return e.place.space === h.place.space && same(e.place.tab, h.place.tab) && same(e.place.pane, h.place.pane);
}

// A bare "repo#n" in a session's text never names an item of a foreign repo.
function sessionKeys(item) {
  const key = itemKey(item);
  if (!key) return [];
  if (item.source !== "github") return [key.toLowerCase()];
  return [`${item.repo}#${item.number}`, ...(item.foreign ? [] : [`${item.repoShort}#${item.number}`])].map((k) => k.toLowerCase());
}

export function itemSessions(index, item) {
  const keys = sessionKeys(item);
  if (!keys.length) return [];
  const branch = item.kind === "pr" && item.branch ? item.branch : null;
  const cacheKey = `${item.source}\n${keys.join(" ")}\n${branch ?? ""}`;
  const kept = index.cache.get(cacheKey);
  if (kept) return kept;
  const hits = keys.flatMap((k) => index.byKey.get(k) ?? []);
  if (item.source === "github") {
    const number = String(item.number);
    const ours = (h) => inRepo(h.folder, item.repoShort);
    for (const h of index.byBare.get(number) ?? []) if (ours(h)) hits.push(h);
    const byBranch = branch ? (index.byBranch.get(branch) ?? []).map((h) => ({ ...h, why: `Branch ${branch}` })) : index.byNumber.get(number) ?? [];
    for (const h of byBranch) if (ours(h)) hits.push(h);
  }
  const entries = [];
  for (const h of hits) {
    const e = entries.find((x) => fits(x, h));
    if (!e) {
      entries.push({ sure: h.sure, place: { ...h.place }, claudePid: h.claudePid ?? null, label: h.label ?? null, status: h.agentStatus ?? null, paneNumber: null, reasons: [h.why] });
      continue;
    }
    e.sure ||= h.sure;
    e.status ??= h.agentStatus ?? null;
    e.claudePid ??= h.claudePid ?? null;
    if (!e.reasons.includes(h.why)) e.reasons.push(h.why);
    if (placed(e)) e.place = { space: e.place.space, tab: e.place.tab ?? h.place.tab, pane: e.place.pane ?? h.place.pane };
  }
  for (const e of entries) {
    if (!placed(e)) continue;
    const place = index.places.get(placeKey(e));
    e.label = place?.label ?? e.place.space;
    e.status = place?.placeStatus ?? e.status;
    e.paneNumber = place?.nth ?? null;
  }
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.sure - a.e.sure || urgencyOf(a.e.status) - urgencyOf(b.e.status) || a.i - b.i).map(({ e }) => e);
  index.cache.set(cacheKey, sorted);
  return sorted;
}

export const linkedSession = (item, index) => itemSessions(index, item).find((s) => s.sure && placed(s)) ?? null;

// What the second Enter on an item does: go to its linkedSession, else ask
// where it has other sessions (ui/modals/sessions.js), else start one.
export function secondEnter(index, item) {
  const go = linkedSession(item, index);
  if (go) return { go };
  const listed = itemSessions(index, item);
  return listed.length ? { ask: listed } : { start: true };
}

// ==== src/sources/azure/common.js ====

// Azure DevOps, what its two team views and a work item's related items
// share: states and their categories, what az's failures mean, how az is
// called, the work items' fields and how az's answers are read, a work
// item's sprint, who az is, and a state change. The Sprint's own calls are
// in sprint.js, the Backlog's in backlog.js, the related items' in
// related.js, the source as the board uses it in index.js (makeAzure).

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
// does not exist, a taskboard column that does not map the work item's
// state, az's own argument errors, and 4xx status lines.
const AZ_REFUSED =
  /^TF401320\b|does not exist|is not mapped to current work item state|^argument |the following arguments are required|unrecognized arguments|Operation returned a 4\d\d status code|requires user authentication/i;

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

// A WIQL query's SELECT list: WORK_ITEM_FIELDS and `extraFields`.
export const wiqlFields = (extraFields = []) => [...WORK_ITEM_FIELDS, ...extraFields].map((f) => `[${f}]`).join(", ");

// The extra fields that read a backlog's order field (parseBacklogConfig),
// none where it names none.
export const orderFields = (orderField) => (orderField ? [orderField] : []);

// One WIQL query for the fields of the work items `ids` (wiqlFields), in
// the order of their ids.
export function idsWiql(ids, extraFields = []) {
  return `SELECT ${wiqlFields(extraFields)} FROM WorkItems WHERE [${SYSTEM}Id] IN (${ids.join(", ")}) ORDER BY [${SYSTEM}Id]`;
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

// A list Azure sends either as it is or wrapped in { count, value } (az
// devops invoke prints REST's wrapper, with its continuation_token).
export const azList = (json) => (Array.isArray(json) ? json : Array.isArray(json?.value) ? json.value : null);

// The team's areas → { field (the team field, System.AreaPath by default),
// values: [{ value, includeChildren }], default (the area a new work item
// gets, or null) }.
export function parseAreas(stdout) {
  const json = azJson(stdout, "die Bereichspfade des Teams");
  const values = (Array.isArray(json?.values) ? json.values : []).filter((v) => typeof v?.value === "string" && v.value);
  if (!values.length) throw new BoardError("Azure nannte keine Bereichspfade des Teams");
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

const PRIORITY_COLORS = { 1: "ansi1", 2: "ansi11" };

export function azPriority(value) {
  return Number.isInteger(value) ? { name: `P${value}`, color: PRIORITY_COLORS[value] ?? "muted" } : null;
}

// A work item of az boards query's answer as the board shows it, keyed as
// itemKey names it; with an `orderField`, its value there as `order` (a
// number, else null). az's answer holds no parent's title: the Sprint reads
// it (parentsOutside).
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

// The sprint a work item is in, as the views show it: the last part of its
// iteration's path, or null for none, which is the team's backlog
// iteration (the root of its iterations, parseTeamSettings) or the
// project's root (a path without a level below).
export function sprintName(path, backlogIteration) {
  if (typeof path !== "string" || !path || path === backlogIteration || !path.includes("\\")) return null;
  return path.split("\\").at(-1);
}

// How long a team's settings that change rarely stay kept (ms): those both
// views read (makeAzure's teamRead), and the Backlog's (BACKLOG_KEEP_MS).
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

// ==== src/kinds/backlog.js ====

// A team's backlog: its rows in backlog order, a state change laid over the
// data, what a new work item may be, and the backlog's warnings.
// backlogList (sources/azure/backlog.js) builds the data.

// The data with the item `key` in `state`.
export const withBacklogState = (data, key, state) => withRow(data, key, { state });

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

// The warning of an order that cannot be checked (no order field), which
// the Sprint gives too.
export const ORDER_UNCHECKED = "Reihenfolge ungeprüft: Azure nannte kein Order-Feld";

// The warnings of a backlog: an order it cannot check, ids its query did
// not find, and a backlog longer than one query reads.
export function backlogWarnings(data) {
  const { missing } = data.meta;
  return [
    ...(data.meta.orderField ? [] : [ORDER_UNCHECKED]),
    ...(missing > 0 ? [`${missing} ${missing === 1 ? "Eintrag" : "Einträge"} des Backlogs ohne Felder (nicht gefunden)`] : []),
    ...(data.limited ? [`Nur die ersten ${data.limit} von ${data.total} Einträgen des Backlogs (so viele liest eine Abfrage)`] : []),
  ];
}

// ==== src/sources/azure/sprint.js ====

// The Azure Sprint: its calls, what they answer, the sprint as the sprint
// shape shows it (sprintBoard), a task's move on the taskboard, and the
// view as makeAzure uses it (sprintView).

// The Sprint view's calls for a team tab `c` ({ org, project, team }):
// its current iteration, its areas (azAreasArgs), its taskboard's columns,
// the project's work item types with their states, the team's backlog
// configuration for its order field (s.backlogConfig), and per refresh the
// taskboard's column of each work item, the fields of the sprint's work
// items (azQueryArgs), and in one query more those of its tasks' parents
// outside the sprint and of its other items' parents whose titles are not
// kept, where it has any, with the team's settings for the tasks' parents'
// sprint where they are not kept (parentsOutside); for the sprint picker,
// all the team's iterations (azIterationsArgs without a timeframe).
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
export function sprintWiql(iteration, areas, extraFields = []) {
  const field = `[${areas.field}]`;
  const tree = areas.field === AREA_PATH;
  const inArea = areas.values.map((a) => `${field} ${tree && a.includeChildren ? "UNDER" : "="} ${wiqlText(a.value)}`).join(" OR ");
  return `SELECT ${wiqlFields(extraFields)} FROM WorkItems WHERE [System.IterationPath] = ${wiqlText(iteration.path)} AND (${inArea}) ORDER BY [System.Id]`;
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

// The work item types the taskboard's columns map: its tasks'.
const taskTypesOf = (columns) => new Set(columns.flatMap((c) => c.mappings.map((m) => m.type)));

// The numbers of the tasks of `items` the taskboard places (`places`,
// parseTaskboard) in one of its `columns`: the cards sprintBoard shows.
export function placedTasks(columns, items, places) {
  const types = taskTypesOf(columns);
  const known = new Set(columns.map((c) => c.id));
  return new Set(items.filter((i) => types.has(i.type) && known.has(places.get(i.number)?.columnId)).map((i) => i.number));
}

// The sprint as the sprint shape shows it (kinds/sprint.js). Its tasks are
// the work items of the types the taskboard's columns map; each goes to the
// column the taskboard places it in (`places`, parseTaskboard). Every other
// work item of the sprint is a story with a row of its own, and so is a
// placed task's parent outside the sprint (`parents`, parentsOutside), in
// the backlog's order (byOrder, ties by id), after the row "Ohne Story" for
// tasks without a parent or with one not read (only where there is one).
// A task the taskboard does not place is left out and counted
// (meta.unplaced), as is one placed in a column the columns read do not
// list (meta.unknownColumns). A column's color is that of the state its
// first mapping names; it takes the types it maps (types) and says which
// state each gets (mappings).
// meta.currentId is the team's current sprint's id (null where it has
// none running; the shown one's by default), which sprintIs
// (kinds/sprint.js) compares the shown one with; meta.gone ({ id, name })
// a chosen sprint the team no longer has, which the current one, or none
// where none runs, stands in for (sprintView). Without an `iteration` (the
// team has no sprint running and none is chosen) it holds no work items,
// and meta.iterationId, iteration and finish are null.
export function sprintBoard({ iteration, currentId = iteration?.id ?? null, gone = null, columns, types, items, parents = new Map(), places, viewer }) {
  const colors = new Map(types.states.map((s) => [s.name, s.color]));
  const cols = columns.map((c) => ({
    id: c.id, name: c.name, color: colors.get(c.mappings[0]?.state) ?? "muted", hidden: false, count: 0, target: true,
    types: c.mappings.map((m) => m.type), mappings: Object.fromEntries(c.mappings.map((m) => [m.type, m.state])), cards: [],
  }));
  const byId = new Map(cols.map((c) => [c.id, c]));
  const taskTypes = taskTypesOf(columns);
  const stories = new Map(items.filter((i) => !taskTypes.has(i.type)).map((s) => [s.number, s]));
  const outside = new Map();
  const storyOf = (id) => {
    if (stories.has(id)) return stories.get(id);
    const parent = parents.get(id);
    if (parent) outside.set(id, parent);
    return parent ?? null;
  };
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
    col.cards.push({ ...item, column: col.id, readColumn: col.id, row: storyOf(item.parent)?.key ?? NO_STORY });
    col.count++;
  }
  const loose = cols.some((c) => c.cards.some((card) => card.row === NO_STORY));
  const ranked = [...stories.values(), ...outside.values()].sort(byOrder((a, b) => a.number - b.number));
  return {
    shape: "sprint",
    meta: {
      iterationId: iteration?.id ?? null, iteration: iteration?.name ?? null, finish: iteration?.finish ?? null, currentId, gone,
      typeStates: types.types, states: types.states, typeColors: types.colors, unplaced, unknownColumns,
    },
    columns: cols,
    rows: [...(loose ? [{ key: NO_STORY, story: null }] : []), ...ranked.map((s) => ({ key: s.key, story: s }))],
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

// Azure takes a taskboard column only where it maps the work item's
// current state.
// Which of the columns sharing a state a state change puts a task in, the
// docs do not say.
export function movePlan(data, card, column) {
  const state = column.mappings?.[card.type];
  if (!state) throw new BoardError(`Die Spalte „${column.name}“ hat für ${card.type} keinen Status`);
  if (state === shownState(card, data.columns.find((c) => c.id === card.column))) return { state: null, sendColumn: true };
  return { state, sendColumn: data.columns.some((c) => c.id !== column.id && c.mappings?.[card.type] === state) };
}

function columnNotMoved(state, e) {
  const column = e instanceof BoardError && e.unclear ? `Spalte: ${e.message}` : `Spalte nicht geändert: ${report(e)}`;
  return partly(`Status ist jetzt „${state}“, ${column}`);
}

export const PARENTS_UNREAD = "Übergeordnete Work Items außerhalb des Sprints nicht gelesen, ihre Tasks stehen unter „Ohne Story“";
export const TITLES_UNREAD = "Titel der übergeordneten Work Items nicht gelesen";
export function parentsLost(ids) {
  const named = ids.map((id) => `#${id}`).join(", ");
  return ids.length === 1
    ? `Übergeordnetes Work Item ${named} nicht gefunden (gelöscht oder ohne Leserecht), seine Tasks stehen unter „Ohne Story“`
    : `Übergeordnete Work Items ${named} nicht gefunden (gelöscht oder ohne Leserecht), ihre Tasks stehen unter „Ohne Story“`;
}
export const BACKLOG_ROOT_UNREAD = "Backlog-Iteration des Teams nicht gelesen, „ohne Sprint“ ungeprüft";
export const ORDER_UNREAD = "Reihenfolge des Backlogs nicht gelesen, Zeilen nach Id";

// The team's backlog iteration (parseTeamSettings, s.teamSettings, kept no
// longer than `until`) → { path, warning }: a read that fails, or settings
// that name none, give none and the warning that says so.
async function backlogIterationOf(s, c, view, until) {
  try {
    const settings = await s.teamSettings.of(c, view);
    s.teamSettings.keepUntil(c, until);
    if (!settings.backlogIteration) throw new BoardError("Azure nannte keine Backlog-Iteration");
    return { path: settings.backlogIteration, warning: null };
  } catch (e) {
    return { path: null, warning: `${BACKLOG_ROOT_UNREAD}: ${errorText(e)}` };
  }
}

const titlesKey = (s, c) => `parent-titles\n${s.teamKey(c)}`;

// The parents of `items` outside them, in one query by id (az boards query
// reads no linked item, sources/azure/related.js): those of the `tasks`
// (placedTasks), which get rows, at every call, with the team's backlog
// iteration beside it (backlogIterationOf), which says their sprint
// (sprintName); the other items' parents only for their titles, where those
// are not kept, which are then kept TEAM_KEEP_MS. Without either it asks
// nothing. `lost` are the tasks' parents the query did not find. `before`
// gets the items and the parents of the last draw (`last`: id → its row's
// story) before that query.
export async function parentsOutside(s, c, items, { tasks = new Set(), orderField = null, view = null, last = new Map(), before = null, until = Infinity } = {}) {
  const own = new Map(items.map((i) => [i.number, i]));
  const outsideOf = (list) => [...new Set(list.map((i) => i.parent).filter((id) => Number.isInteger(id) && !own.has(id)))];
  const rowIds = outsideOf(items.filter((i) => tasks.has(i.number)));
  const held = s.keptValue(titlesKey(s, c));
  const titles = new Map(held?.value ?? []);
  const asked = outsideOf(items).filter((id) => rowIds.includes(id) || !titles.has(id));
  const titleOf = (id, parents) => (own.get(id) ?? parents.get(id))?.title ?? titles.get(id) ?? null;
  const withParents = (parents) => items.map((i) => (Number.isInteger(i.parent) ? { ...i, parentTitle: titleOf(i.parent, parents) } : i));
  if (!asked.length) return { items: withParents(new Map()), parents: new Map(), lost: [], warnings: [] };
  const drawn = new Map(rowIds.filter((id) => last.has(id)).map((id) => [id, last.get(id)]));
  before?.(withParents(drawn), drawn);
  const root = rowIds.length ? backlogIterationOf(s, c, view, until) : null;
  let read;
  try {
    read = parseWorkItems(await s.az(azQueryArgs(c, idsWiql(asked, orderFields(orderField))), what(view, "parents")), c, orderField);
  } catch (e) {
    return { items: withParents(new Map()), parents: new Map(), lost: [], warnings: [`${rowIds.length ? PARENTS_UNREAD : TITLES_UNREAD}: ${errorText(e)}`] };
  }
  const found = new Map(read.map((p) => [p.number, p]));
  const titled = asked.filter((id) => !rowIds.includes(id));
  if (titled.length) {
    for (const id of titled) titles.set(id, found.get(id)?.title ?? null);
    s.keep(titlesKey(s, c), titles, held?.until ?? Date.now() + TEAM_KEEP_MS);
  }
  const { path, warning } = root ? await root : { path: null, warning: null };
  const parents = new Map(rowIds.filter((id) => found.has(id)).map((id) => [id, { ...found.get(id), outside: true, sprint: sprintName(found.get(id).iteration, path) }]));
  return { items: withParents(parents), parents, lost: rowIds.filter((id) => !found.has(id)), warnings: warning ? [warning] : [] };
}

// The stories of the rows the data `last` drew, by id.
const lastStories = (last) => new Map((last?.shape === "sprint" ? last.rows : []).filter((r) => r.story).map((r) => [r.story.number, r.story]));

// The Sprint as makeAzure uses it, on the source's shared parts `s` (see
// makeAzure, which says what is kept and for how long): what it keeps per
// team and project (settingsOf; the team's areas and backlog configuration
// are the source's, s.areas and s.backlogConfig), how it loads and writes,
// the team's iterations for the sprint picker (iterations: each with
// `current`, whether it is the team's current iteration as the Sprint
// keeps it, so that a kept list never names a sprint current that has
// ended), and what a refused write or a task in a column the columns read
// do not know drops (forgetSettings: the team's sprint and columns and the
// source's team reads, not the project's types); `r` drops the team's
// iterations and the titles of its items' parents too (forget).
//
// load(view, { chosen, last }) shows the sprint `chosen` ({ id, name };
// null: the current one), looked up by its id among the team's
// iterations: its taskboard and query by its id and path, the team's
// settings as for the current one. Where the team no longer has it, the
// current sprint, or none where none runs, shows, meta.gone names it and
// the load says so (notice); a read of it that fails names it. Where the
// team has no sprint running and none is chosen, it reads no work items
// (sprintBoard without an iteration). `last` is the data the view showed
// as the load began (null for none): what it draws before the parents'
// query keeps their rows from there.
export function sprintView(s) {
  const iterations = readMemo();
  const iterationsOf = (c, view) => iterations.get(s.teamKey(c), () => s.az(azIterationsArgs(c), what(view, "iterations")).then(parseIterations));
  const currentKey = (c) => `iteration\n${s.teamKey(c)}`;
  function settingsOf(c, view) {
    const team = s.teamKey(c);
    const [iteration, board] = [s.keptValue(currentKey(c)), s.keptValue(`board\n${team}`)];
    const parts = {
      iteration: iteration ? Promise.resolve(iteration.value) : s.az(azIterationArgs(c), what(view, "iteration")).then(parseIteration),
      areas: s.areas.of(c, view),
      columns: board ? Promise.resolve(board.value.columns) : s.az(azColumnsArgs(c), what(view, "columns")).then(parseColumns),
      types: s.typesOf(c, view),
      order: s.backlogConfig.of(c, view).then(
        ({ orderField }) => ({ field: orderField, warning: orderField ? null : ORDER_UNCHECKED }),
        (e) => ({ field: null, warning: `${ORDER_UNREAD}: ${errorText(e)}` }),
      ),
    };
    const all = Promise.all([parts.iteration, parts.areas, parts.columns, parts.types, parts.order]).then(([it, areas, columns, { types: ty, fresh }, order]) => {
      const until = iteration?.until ?? (it ? iterationUntil(it.finish, Date.now()) : dayEnd(Date.now()));
      s.areas.keepUntil(c, until);
      s.backlogConfig.keepUntil(c, until);
      if (!iteration) s.keep(currentKey(c), it, until);
      if (!board) s.keep(`board\n${team}`, { columns }, until);
      if (fresh) s.keepTypesUntil(c, until);
      return { iteration: it, areas, columns, types: ty, order, until };
    });
    return { ...parts, all };
  }
  const forgetSettings = (c) => {
    s.drop(currentKey(c));
    s.drop(`board\n${s.teamKey(c)}`);
    s.forgetTeamReads(c);
  };
  const onRefusal = (c) => s.dropOnRefusal(forgetSettings, c);
  // The team's current iteration's id: as the Sprint keeps it, else read
  // (and not kept: settingsOf keeps it with the settings it belongs to).
  async function currentIdOf(c, view) {
    const kept = s.keptValue(currentKey(c));
    return (kept ? kept.value : parseIteration(await s.az(azIterationArgs(c), what(view, "iteration"))))?.id ?? null;
  }
  async function loadSprint(view, chosen, live, last) {
    const c = view.tab;
    const me = s.whoAmI(view);
    const settings = settingsOf(c, view);
    const listed = chosen ? iterationsOf(c, view) : null;
    const shown = Promise.all([settings.iteration, listed]).then(([current, list]) => list?.find((i) => i.id === chosen.id) ?? current);
    const placesRead = shown.then((it) => (it ? s.az(azTaskboardArgs(c, it.id), what(view, "taskboard")) : null));
    const itemsRead = Promise.all([shown, settings.areas, settings.order])
      .then(([it, areas, order]) => (it ? s.az(azQueryArgs(c, sprintWiql(it, areas, orderFields(order.field))), what(view, "sprint-items")) : null));
    const [kept, list, iteration, places, items] = await Promise.all([settings.all, listed, shown, placesRead, itemsRead]);
    const found = list?.find((i) => i.id === chosen.id) ?? null;
    const gone = chosen && !found ? { id: chosen.id, name: chosen.name } : null;
    const currentId = kept.iteration?.id ?? null;
    const placed = places === null ? new Map() : parseTaskboard(places);
    const orderField = kept.order.field;
    const warnings = [...kept.types.warnings, ...(iteration && kept.order.warning ? [kept.order.warning] : [])];
    const board = (withParents, parents, viewer) => {
      const data = sprintBoard({ ...kept, iteration, currentId, gone, items: withParents, parents, places: placed, viewer });
      s.noViewerOf(data);
      return data;
    };
    const drawSoFar = (soFar, parents) => void me.then((viewer) => live.partial(() => ({ data: board(soFar, parents, viewer), warnings }))).catch(report);
    const read = items === null ? [] : parseWorkItems(items, c, orderField);
    const tasks = placedTasks(kept.columns, read, placed);
    const outside = await parentsOutside(s, c, read, { tasks, orderField, view, last: lastStories(last), before: drawSoFar, until: kept.until });
    const data = board(outside.items, outside.parents, await me);
    if (data.meta.unknownColumns) forgetSettings(c);
    const instead = currentId ? "der aktuelle Sprint wird gezeigt" : "das Team hat keinen laufenden Sprint";
    return {
      data, warnings: [...warnings, ...(outside.lost.length ? [parentsLost(outside.lost)] : []), ...outside.warnings],
      notice: gone ? `${gone.name} gibt es im Team nicht mehr: ${instead}` : null,
    };
  }
  return {
    forget: (c) => {
      forgetSettings(c);
      iterations.drop(s.teamKey(c));
      s.drop(titlesKey(s, c));
    },
    async iterations(view) {
      const c = view.tab;
      const [list, current] = await Promise.all([iterationsOf(c, view), currentIdOf(c, view)]);
      return list.map((i) => ({ ...i, current: i.id === current }));
    },
    load: (view, { chosen = null, live = NO_LIVE, last = null }) =>
      loadSprint(view, chosen, live, last).catch((e) => {
        throw chosen && e instanceof BoardError ? new BoardError(`${chosen.name} ließ sich nicht lesen: ${e.message}`, e) : e;
      }),
    async move(view, data, card, column) {
      const plan = movePlan(data, card, column);
      const file = plan.sendColumn ? await writeMoveBody(card.number, column) : null;
      if (plan.state) await s.setState(view, card, plan.state, onRefusal);
      if (!file) return plan;
      try {
        const out = await s.az(azMoveArgs(view.tab, data.meta.iterationId, card.number, file), { write: true, ...what(view, "move") }).catch(onRefusal(view.tab));
        checkTaskboardMove(out, card, column);
      } catch (e) {
        throw plan.state ? columnNotMoved(plan.state, e) : e;
      }
      return plan;
    },
    setState: (view, item, state) => s.setState(view, item, state, onRefusal),
  };
}

// ==== src/sources/azure/backlog.js ====

// The Azure Backlog: its calls, what they answer, the backlog as the
// backlog shape shows it (backlogList), a create and a parent link, and
// the view as makeAzure uses it (backlogView).

// The Backlog view's calls for a team tab `c`: the team's backlog
// levels; its backlog configuration (the order field, each type's states
// and their categories) and its settings (default and backlog iteration;
// its default area comes from azAreasArgs' defaultValue), both of which the
// Sprint reads too (makeAzure's teamRead); and per refresh the level's work
// items in their list (az rest: az devops invoke picks a location by area
// and resource, the first that fits, which does not reliably reach
// backlogs/{id}/workItems) and one WIQL query for their fields
// (azQueryArgs).
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
  const rows = items
    .filter((i) => at.has(i.number))
    .map((i) => ({ ...i, sprint: sprintName(i.iteration, settings.backlogIteration) }))
    .sort(byOrder((a, b) => at.get(a.number) - at.get(b.number)));
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
    const config = s.backlogConfig.of(c, view);
    const all = Promise.all([levels, config, s.teamSettings.of(c, view), s.areas.of(c, view)]).then(([lv, cf, settings, areas]) => {
      const value = { ...backlogLevels(lv, cf), config: cf, settings, area: areas.default };
      const until = backlogUntil(settings, Date.now());
      s.keep(key(c), value, until);
      for (const read of [s.backlogConfig, s.teamSettings, s.areas]) read.keepUntil(c, until);
      return value;
    });
    return { level: levels.then(requirementLevel), config, all };
  }
  const forget = (c) => {
    s.drop(key(c));
    s.forgetTeamReads(c);
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
      const c = view.tab;
      const me = s.whoAmI(view);
      const settings = backlogSettingsOf(c, view);
      let types = null;
      const typesRead = typeColorsOf(c, view).then((t) => (types = t));
      const idsRead = settings.level.then((level) => s.az(azBacklogIdsArgs(c, level.id), { failure: azRestFailure, ...what(view, "backlog-ids") })).then(parseBacklogIds);
      const outRead = Promise.all([idsRead, settings.config]).then(([ids, config]) => {
        const read = ids.slice(0, AZ_QUERY_LIMIT);
        return read.length ? s.az(azQueryArgs(c, idsWiql(read, orderFields(config.orderField))), what(view, "backlog-items")) : "";
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
      const c = view.tab;
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
      checkParentLink(await s.az(azParentArgs(view.tab, id, parent), { write: true, ...what(view, "parent-link") }), parent);
    },
    // The work items createdWiql finds for a create ({ type, title,
    // child }) in the view's project, as parseWorkItems reads them.
    async findCreated(view, { type, title, child }) {
      const c = view.tab;
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
// columns. Its tasks' parents outside the sprint are read with each refresh,
// after its work items, and not kept; its other items' parents outside it
// only for their titles, where those are not kept yet (in the tasks'
// parents' query where there is one), and kept TEAM_KEEP_MS
// (parentsOutside). The team's iterations, which the sprint picker lists,
// are read when it first opens and kept while the board runs (one that fails
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
// iterations and its parents' titles only by `r`.
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
// Both views read the team's areas (the Backlog for its default area), its
// backlog configuration (the Sprint for its order field) and its settings
// (the Sprint for its backlog iteration, only where its tasks have parents
// outside the sprint), and keep each as one, for the shorter of their times
// (teamRead); `r` on either, or a refusal there, drops them.
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
  // A team's part both views read, `name` (its key's start and its log
  // line's): of(c, view) gives it, read where it is not kept and kept
  // TEAM_KEEP_MS; keepUntil(c, until) keeps it shorter where a view keeps
  // its own settings for a shorter time (the Sprint's as long as its
  // settings, the Backlog's until backlogUntil).
  const teamRead = (name, args, parse) => {
    const key = (c) => `${name}\n${teamKey(c)}`;
    return {
      async of(c, view = null) {
        const held = keptValue(key(c));
        if (held) return held.value;
        const value = parse(await az(args(c), what(view, name)));
        keep(key(c), value, Date.now() + TEAM_KEEP_MS);
        return value;
      },
      keepUntil(c, until) {
        const entry = kept.get(key(c));
        if (entry) entry.until = Math.min(entry.until, until);
      },
      forget: (c) => kept.delete(key(c)),
    };
  };
  const teamReads = {
    areas: teamRead("areas", azAreasArgs, parseAreas),
    backlogConfig: teamRead("backlog-config", azBacklogConfigArgs, parseBacklogConfig),
    teamSettings: teamRead("team-settings", azTeamSettingsArgs, parseTeamSettings),
  };
  // What the views share: az, what is kept, who az is (and the data's words
  // for why it is not known), a project's work item types (typesOf), the
  // team's parts both read (teamReads; either view's forget drops them all:
  // forgetTeamReads), and a state change.
  const shared = {
    ...teamReads,
    forgetTeamReads: (c) => Object.values(teamReads).forEach((read) => read.forget(c)),
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
      az(azStateArgs(view.tab, item.number, state), { write: true, ...what(view, "state") }).catch(onRefusal(view.tab)).then((out) => checkStateResult(out, state)),
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
        const c = view.tab;
        const [list, me] = await Promise.all([members.get(teamKey(c), () => az(azMembersArgs(c), what(view, "members")).then(parseMemberList)), whoAmI(view)]);
        return membersFor(list, me);
      },
      // Without the list, az still knows its own account: "me".
      fallbackMe: () => ({ login: viewer, name: null, me: true }),
      write: async (view, item, person) => checkAzAssigned(await az(azAssignArgs(view.tab, item.number, person), { write: true, ...what(view, "assign") }), item.number, person),
    },
    // Drops what the view keeps of its team (r, Board.reload).
    forget(view) {
      if (view.tab?.kind === "team") views[view.layout]?.forget(view.tab);
    },
    views,
  };
}

// ==== src/kinds/list.js ====

// A GitHub PR or Issues tab's repos: whose they are (repoOwnership), the
// ones this machine turns off (hideRepos, whose rows do not show), rows
// grouped by repo, and the switches of the repo menu.

// Whose the repo `repo` ("owner/repo") is, for a tab of the context whose
// owner is owners.tabOwner: "own"; "other" where its owner is another
// context the board reads with a PR tab (owners.otherOwners), whose PR tab
// its pull requests show in; else "foreign". The owners come folded
// (readGithub).
export function repoOwnership(repo, owners) {
  const owner = foldedName(repo.split("/")[0]);
  if (owner === owners.tabOwner) return "own";
  return owners.otherOwners.includes(owner) ? "other" : "foreign";
}

export const hidesRepo = (data, repo) => (data.hideRepos ?? []).some((r) => foldedName(r) === foldedName(repo));

export const keptRows = (data, section) => section.rows.filter((r) => !hidesRepo(data, r.repo));

// The data as the view's repos turned off show it now; the same data where
// they are those it has.
export const withRepoView = (data, view) => (sameNames(data.hideRepos ?? [], view.hideRepos) ? data : { ...data, hideRepos: [...view.hideRepos] });

export const toggledRepos = (list, repo) =>
  (list.some((r) => foldedName(r) === foldedName(repo)) ? list.filter((r) => foldedName(r) !== foldedName(repo)) : [...list, repo]);

export function repoLook(data, repo) {
  const ownership = repoOwnership(repo, data.owners);
  return { repo, name: ownership === "own" ? repo.split("/").pop() : repo, foreign: ownership === "foreign" };
}

// A section's rows `rows` (those of repos turned on) that `visible` lets
// through, grouped by repo, each group where its first such row stands: {
// repo, name, foreign, rows, held (its rows among `rows`), headed }. A
// group has its repo row (headed) where the section shows more than one
// group, and a foreign one always.
export function repoGroups(data, rows, visible) {
  const groups = new Map();
  const held = new Map();
  for (const r of rows) {
    const key = foldedName(r.repo);
    held.set(key, (held.get(key) ?? 0) + 1);
    if (!visible(r)) continue;
    if (!groups.has(key)) groups.set(key, { ...repoLook(data, r.repo), rows: [] });
    groups.get(key).rows.push(r);
  }
  const all = [...groups.entries()];
  return all.map(([key, g]) => ({ ...g, held: held.get(key), headed: all.length > 1 || g.foreign }));
}

// The switches of the repos of `rows` by folded name, each where its first
// row stands, with how many of them it holds (held) and `visible` lets
// through (shown); `add` adds a repo's switch after them where it has none,
// `fields` over its counts.
export function countedSwitches(data, rows, visible) {
  const switches = new Map();
  const add = (repo, fields = {}) => {
    const key = foldedName(repo);
    if (!switches.has(key)) switches.set(key, { ...repoLook(data, repo), hidden: hidesRepo(data, repo), held: 0, shown: 0, ...fields });
    return switches.get(key);
  };
  for (const r of rows) {
    const entry = add(r.repo);
    entry.held++;
    if (visible(r)) entry.shown++;
  }
  return { switches, add };
}

// The repos of the tab's switches: those with pull requests in it, the tab
// owner's before foreign ones, each in the order their first row stands,
// then those turned off that hold none, in their order: { repo, name,
// foreign, hidden, held (its pull requests), shown (those `visible` lets
// through) }.
export function repoSwitches(data, visible) {
  const { switches, add } = countedSwitches(data, data.sections.flatMap((s) => s.rows), visible);
  const found = [...switches.values()];
  for (const repo of data.hideRepos ?? []) add(repo);
  return [...found.filter((e) => !e.foreign), ...found.filter((e) => e.foreign), ...[...switches.values()].slice(found.length)];
}

// ==== src/kinds/fields.js ====

// A GitHub project's fields as the board reads them: per kind of field, an
// item's value of it, and items in a view's order, in the groups of its
// "Group by" field and by its sort keys. sources/github.js reads the values
// from GitHub's answers; a table (kinds/table.js, ui/shapes/table.js) draws
// its rows' values and places a changed row anew by the same rules.

// Theme colors for GitHub's named colors: a Projects v2 option's and an
// issue type's (IssueTypeColor), which share the names.
export const GITHUB_COLORS = {
  GRAY: "muted", BLUE: "ansi4", GREEN: "ansi2", YELLOW: "ansi3", ORANGE: "ansi11", RED: "ansi1", PINK: "ansi13", PURPLE: "ansi5",
};

// The id of the column and of the group of the items without a value,
// outside the ids of the others (a group's is `v:` and its value's key).
export const NO_VALUE = "none";

const lower = (text) => String(text ?? "").toLowerCase();
const textValue = (name) => (name ? { key: name, name, rank: lower(name) } : null);
const countValue = (n) => ({ key: String(n), name: String(n), rank: n });

// Per type of a project's field, an item's value of it as the board groups,
// sorts and draws it: { key (the value's own), name (as a column, group or
// cell names it), rank (its place: a number, else a text compared as such),
// color (a single-select option's, as a theme name) }, or null for no value.
// `byName`: the items' query reads it by name (fieldValueByName, `value`);
// of the others an item's card holds it. A field of a type not here is one
// the board does not read.
const VALUES = {
  SINGLE_SELECT: {
    byName: true,
    of(field, value) {
      const at = (field.options ?? []).findIndex((o) => (value?.optionId ? o.id === value.optionId : o.name === value?.name));
      if (at < 0) return null;
      const option = field.options[at];
      return { key: option.id, name: option.name, rank: at, color: GITHUB_COLORS[option.color] ?? "muted" };
    },
  },
  ITERATION: {
    byName: true,
    of(field, value) {
      const at = (field.iterations ?? []).findIndex((i) => i.id === value?.iterationId);
      if (at >= 0) return { key: value.iterationId, name: field.iterations[at].title, rank: at };
      return value?.iterationId ? { key: value.iterationId, name: value.title ?? value.iterationId, rank: -1 } : null;
    },
  },
  NUMBER: { byName: true, of: (_f, value) => (typeof value?.number === "number" ? countValue(value.number) : null) },
  DATE: { byName: true, of: (_f, value) => (typeof value?.date === "string" && value.date ? { key: value.date, name: value.date, rank: value.date } : null) },
  TEXT: { byName: true, of: (_f, value) => textValue(typeof value?.text === "string" ? value.text : null) },
  // None linked counts as no value, an empty cell as on GitHub.
  LINKED_PULL_REQUESTS: { byName: true, of: (_f, value) => (value?.pullRequests?.totalCount > 0 ? countValue(value.pullRequests.totalCount) : null) },
  TITLE: { of: (_f, _v, card) => textValue(card.title) },
  ASSIGNEES: { of: (_f, _v, card) => textValue(card.assignees.join(", ")) },
  LABELS: { of: (_f, _v, card) => textValue(card.labels.join(", ")) },
  MILESTONE: { of: (_f, _v, card) => textValue(card.milestone) },
  REPOSITORY: { of: (_f, _v, card) => textValue(card.repo) },
  PARENT_ISSUE: { of: (_f, _v, card) => (card.parent === null ? null : textValue(card.parentTitle ?? `#${card.parent}`)) },
  ISSUE_TYPE: { of: (_f, _v, card) => textValue(card.type) },
  SUB_ISSUES_PROGRESS: {
    of: (_f, _v, card) => (card.sub ? { key: `${card.sub.done}/${card.sub.total}`, name: `${card.sub.done}/${card.sub.total}`, rank: card.sub.done / card.sub.total } : null),
  },
};
export const readable = (field) => Object.hasOwn(VALUES, field.type);
export const readByName = (field) => VALUES[field.type]?.byName === true;
export const valueOf = (field, value, card) => VALUES[field.type]?.of(field, value, card) ?? null;

// Where a table's row holds a field's value: "cell" (read by name, in the
// row's cells), "card" (the row's card holds it, read as it draws), or null
// (a kind the board does not read).
export const fromOf = (field) => (!readable(field) ? null : readByName(field) ? "cell" : "card");
export const cardValue = (field, card) => valueOf(field, null, card);

const byRank = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

// Two ranks by a sort key, those without one (null) last whichever the
// direction.
function bySort(a, b, direction) {
  const none = (rank) => rank === null || rank === undefined;
  if (none(a) || none(b)) return Number(none(a)) - Number(none(b));
  const diff = byRank(a, b);
  return direction === "DESC" ? -diff : diff;
}

export const groupId = (value) => (value ? `v:${value.key}` : NO_VALUE);

// The groups of a view's "Group by" field `field` (a board's swimlanes, a
// table's groups): one per value its items hold (`entries`, each with its
// `groupValue`), in the field's order (a single-select's options, an
// iteration's iterations, else by value), the items without one last.
export function groupsOf(field, entries) {
  const seen = new Map();
  for (const e of entries) if (e.groupValue && !seen.has(e.groupValue.key)) seen.set(e.groupValue.key, e.groupValue);
  const groups = [...seen.values()].sort((a, b) => byRank(a.rank, b.rank)).map((v) => ({ id: groupId(v), name: v.name, color: v.color ?? "muted" }));
  if (entries.some((e) => !e.groupValue)) groups.push({ id: NO_VALUE, name: `Ohne ${field.name}`, color: "dim" });
  return groups;
}

export function orderEntry(order, groupBy, sorts, value) {
  const groupValue = groupBy ? value(groupBy) : null;
  return { order, groupValue, group: groupId(groupValue), ranks: sorts.map((s, k) => value(s.field, k)?.rank ?? null) };
}

// Items in the order a view shows them (`entries`, each with its `group`'s
// id, the `ranks` of its sort keys and its place in GitHub's order, `order`):
// by their group's place in `groups` where the view groups, then by the
// sort keys `sorts` ([{ direction }]) one after the other, those without a
// value last, then in GitHub's order.
export function viewOrder(entries, groups, sorts) {
  const groupAt = new Map((groups ?? []).map((g, i) => [g.id, i]));
  return [...entries].sort((a, b) => {
    if (groups) {
      const group = groupAt.get(a.group) - groupAt.get(b.group);
      if (group) return group;
    }
    for (const [k, s] of sorts.entries()) {
      const diff = bySort(a.ranks[k], b.ranks[k], s.direction);
      if (diff) return diff;
    }
    return a.order - b.order;
  });
}

// ==== src/sources/github.js ====

// GitHub: the queries for a Projects v2 project (its views and fields) and
// a view's items, a pull request list, their parsing, the column mutation,
// what gh's answers and failures mean, and the source as the board uses it
// (makeGithub).

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
// draft, and on GitHub repo, repoShort, foreign (itemKey), color (its
// chip's theme color) and done (dimmed); on Azure type, its color and
// whether it is done coming from the view's states when drawn }. warnings:
// what the source said besides, one line each. retry: a part failed that is
// to be read again after the next refresh.
//
// A source whose pull requests the details panel can go down to gives
// `pullRequest: { reads(item), load(item, view) }` the same way: load
// reads the pull request's details as the PR list has a row's (title,
// state, color, done, draft, author, review, branch; on GitHub its checks
// and assignees too, and warnings: what GitHub said besides; on Azure
// azureRepo, its repository's name), which the panel shows as the PR
// list's details do; the Board keeps them as { pr } beside the related
// items.

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

// The details panel's lines are { related (relatedLines), sessions
// (itemSessions) }, walked in that order. The panel keeps its selected line
// by what it is (lineId), not by where it stands: the lines move when the
// related items come, the sessions sort anew or the Claude sessions are
// read again. A session's place may name a tab or pane more or less while
// it stays (a pane's title comes to name the item, a Claude session's
// pane is found or lost): its line is then the one still at its place,
// else the one that holds the Claude session it held, else the one
// session whose place fits the one it had.
export const lineCount = (lines) => lines.related.length + lines.sessions.length;

export function lineAt(lines, n) {
  if (n === null) return null;
  if (n < lines.related.length) return { related: lines.related[n] };
  const session = lines.sessions[n - lines.related.length];
  return session ? { session } : null;
}

export const lineId = (line) =>
  line.session ? { session: placeKey(line.session), place: line.session.place, claudePid: line.session.claudePid } : { related: lineKey(line.related) };

export function lineIndex(lines, id) {
  if (!id) return null;
  if (id.session === undefined) {
    const i = lines.related.findIndex((l) => lineKey(l) === id.related);
    return i < 0 ? null : i;
  }
  const i = lines.sessions.findIndex((s) => placeKey(s) === id.session);
  if (i >= 0) return lines.related.length + i;
  const held = id.claudePid === null ? -1 : lines.sessions.findIndex((s) => s.claudePid === id.claudePid);
  if (held >= 0) return lines.related.length + held;
  const fitting = lines.sessions.flatMap((s, j) => (fits(s, id) ? [j] : []));
  return fitting.length === 1 ? lines.related.length + fitting[0] : null;
}

// The selected line `id` as it stands among `lines` now: a session's by its
// place there, or none where it went, so that Enter is the item's again;
// a related item's line keeps its id while it is gone, until a read brings
// it again.
export function lineNow(lines, id) {
  if (!id || id.session === undefined) return id;
  const at = lineIndex(lines, id);
  return at === null ? null : lineId(lineAt(lines, at));
}

// The line `id` names among `lines` ({ related } or { session }), or null
// where it is not among them.
export const pickedLine = (lines, id) => lineAt(lines, lineIndex(lines, id));

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
// that the copies match.) Its layer shape is in focus-history/main.js and
// board-tabs/main.js too.

// ---- layer shape: the same in leader/main.js, board-button/main.js, board-tabs/main.js, focus-history/main.js and board/src/ui/layer.js ----
// The board layer (README, "herdr app") is a stack in the layout with a
// block that shows the board mod with props { layer: true } and a block
// that shows the shown tab. It is found by that shape, so its ids live in
// the layout alone.

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

// What lasts across reloads beside this machine's settings (settings.js):
// the shown context ("context"), each context's tab ("tab:<context>"),
// each team's view ("teamView:<tab>"), each GitHub project's view
// ("projectView:<tab>") and what the board knows of the project
// ("project:<tab>", Board.learnProject), each Issues tab's view
// ("issuesView:<tab>") and each of its views' solo repo
// ("soloRepo:<view>", kinds/issues.js), "nur meine" ("mine"), a Sprint's
// folded stories ("folded:<view>", readStoredFolds), the repo a
// view's work item last started in ("repo:<view>", ui/modals/start.js) and
// each view's last good data ("board:data:<view>", loading.js). A full or
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

// herdr before 0.1.18 has no on_window_mouse_up.
export const observesReleases = (el) => typeof el.on_window_mouse_up === "function";

export const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
export const spinner = () => div().frames(SPINNER_FRAMES, 150);

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
export function backdrop(t, id, panel, over = null) {
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
    .child(panel)
    .when(Boolean(over), (el) => el.child(over));
}

export const menu = (t, spec) => backdrop(t, `${spec.id}-backdrop`, menuPanel(t, spec));

export function menuPanel(t, { id, rowId, width, title, rows, at, pick, head = [], digits = true, from = 0, count = from + rows.length, heads = [], wheel = null, foot = [] }) {
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
      div().id(`${id}-thumb`).absolute().right(0).top(share(from)).w(3).h(share(rows.length)).map(thumbLook(t)),
    ));
  return v_flex()
    .id(`${id}-menu`)
    .w(width)
    .p(8)
    .gap(2)
    .rounded(10)
    .border_1()
    .border_color(t.input)
    .bg(t.popover)
    .shadow_lg()
    .when(title !== null, (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.muted).child(`${title} · Enter · Esc`)))
    .children(head)
    .child(list)
    .when(below > 0, (el) => el.child(div().id(`${id}-below`).px(8).text_size(11).text_color(t.dim).child(`↓ ${below} weitere`)))
    .children(foot);
}

// A length herdr measured, or a wheel's move, in the script's pixels: herdr
// reports them in the window's pixels and scales a script's lengths by its
// zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
export const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

export const wheelMove = (e) => -unzoomed(e.delta?.y ?? 0);

export function sideMove(e) {
  const x = e.delta?.x ?? 0;
  if (Math.abs(x) > Math.abs(e.delta?.y ?? 0)) return -unzoomed(x);
  return e.modifiers?.shift ? wheelMove(e) : 0;
}

export const thumbLook = (t) => (el) => el.rounded(2).bg(t.muted).opacity(0.6);

// How many rows a menu with a filter shows at once (menuWindow).
const MENU_ROWS = 10;
// How far the wheel moves such a menu's window by one row: about a row's
// height in the script's pixels.
export const MENU_ROW_PX = 28;

// The window of a menu with a filter over the rows of `list` the filter
// leaves: MENU_ROWS at once from m.top, the marked row m.at (-1 for none).
// Its window follows the mark where a key moves it (followMark); the wheel
// moves it alone (menuWheel). menuWindow keeps both within the rows and gives
// the rows it shows (`shown`) and what menu() takes for them.
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

// A row's name in a menu with a fuzzy filter, the filter's letters in it
// (`at`, fuzzyRank) in the accent color.
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
  if (!by) return false;
  cx.stop_propagation();
  m.at = Math.max(0, Math.min(m.at + by, count - 1));
  followMark(m, count);
  cx.notify();
  return true;
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

// A filter over rows, on `holder` (a menu with a filter, or a list in a
// dialog); the returned mark() is for rows that come later.
export function wireFilter(m, holder, { placeholder, count, startAt, pick }) {
  const mark = () => {
    holder.at = startAt(holder);
    holder.top = 0;
    followMark(holder, count(holder));
  };
  const input = InputState.new({ placeholder });
  Object.assign(holder, { input, filter: "", wheel: 0 });
  mark();
  trackFocus(m, input, "filter");
  input.on("submit", (_e, cx) => pick(holder.at, cx));
  input.on("change", (_e, cx) => {
    holder.filter = input.value();
    mark();
    cx.notify();
  });
  return mark;
}

// A menu with a filter: opens the dialog `m` ({ kind, view, … }) as b.modal
// with its filter (wireFilter, on m itself; field "filter", inputs).
export function openFilterMenu(b, m, spec, cx) {
  const mark = wireFilter(m, m, spec);
  m.field = "filter";
  m.inputs = { filter: m.input };
  b.modal = m;
  m.input.focus();
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

// A dialog's text field, the text input `input` for the dialog m's field
// `field`, kept as m.inputs[field] (Board.takeKeyboard): a focus moves the
// dialog onto that field (trackFocus), and Enter in it runs `submit(e, cx)`.
export function wireTextField(b, m, input, field, submit) {
  m.inputs = { ...m.inputs, [field]: input };
  trackFocus(m, input, field, () => {
    if (b.modal === m) m.field = field;
  });
  input.on("submit", submit);
}

// m.inputFocused, which Board.boardHasKeyboard reads, follows the focus of
// the dialog m's inputs.
function trackFocus(m, input, name, focused = () => {}) {
  m.inputFocused = false;
  input.on("focus", (_e, cx) => {
    m.inputFocused = true;
    m.focusedField = name;
    focused();
    cx.notify();
  });
  // A blur that comes after another input of the dialog took the focus
  // leaves it.
  input.on("blur", () => {
    if (m.focusedField !== name) return;
    m.inputFocused = false;
    m.focusedField = null;
  });
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
export const fieldBox = (t, m, field) => h_flex().px(10).rounded(6).border_1().border_color(m.field === field ? t.accent : t.input).bg(t.background);
export const fieldFrame = (t, m, field, inner) => fieldBox(t, m, field).h(34).items_center().child(inner);

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

export const ROW_GAP = 12;
export const ROW_PAD = 18;
export const ROW_BORDER = 2;

export const listRow = (b, t, view, st, item, rest = t.background) =>
  h_flex()
    .id(`row-${item.key}`)
    .relative()
    .flex_none()
    .gap(ROW_GAP)
    .px(ROW_PAD)
    .items_center()
    .border_l(ROW_BORDER)
    .map(selectedLook(t, st.sel?.key === item.key, rest))
    .opacity(st.pending[item.key] ? 0.7 : 1)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      if (!b.modal) b.clickItem(view, { col: 0, key: item.key }, cx);
    });

export const groupHead = (t, group, count) =>
  h_flex().flex_none().gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().size(9).flex_none().rounded(5).bg(toneColor(t, group.color)))
    .child(div().text_size(12.5).font_semibold().child(group.name))
    .child(div().text_size(12).text_color(t.muted).child(count));

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

export const foreignChip = (t) => toneChip(t, "fremd", COPPER_HUES.yellow);

// A switch such as „nur meine“: on, on the theme's `selected` as a chosen
// tab is, with the accent border of its own; not as a primary button
// (solid), which it is not. „nur meine“ keeps its text and weight, so its
// size never changes.
export const toggleSwitch = (b, t, id, on, toggle) =>
  h_flex().id(id).flex_none().gap(6).px(10).py(5).rounded(6).text_size(12).cursor_pointer()
    .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      if (!b.modal) toggle(cx);
    });

// The note below a list its limit cut, `text`, once the read is whole;
// null for none.
export const limitNote = (t, data, text) =>
  (data.limited && !data.partial ? div().px(16).py(8).text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(text) : null);

// A repo turned off or on in the settings of the view as views.json has it
// now (a shape's toggleRepo).
export function toggleRepoSetting(b, view, repo, cx) {
  const now = b.viewById(view.id) ?? view;
  b.changeSetting(repoHidePath(now), toggledRepos(now.hideRepos, repo), cx);
}

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

export const CANDIDATE = "Kandidat";
export const CANDIDATE_CHIP = `○ ${CANDIDATE}`;
export const sessionChip = (t, session) =>
  session.sure ? chip(t, AGENT_STATUS[session.status] ?? "Sitzung", t.background, t[session.status] ?? t.idle) : chip(t, CANDIDATE_CHIP);

// A Claude session's name is its label where it is in no terminal, so not
// again among its reasons.
export const sessionReasons = (s) =>
  [...s.reasons.filter((r) => r !== s.label), ...(placed(s) ? [] : ["kein Terminal gefunden"])].join(" · ");

export function priorityChip(t, item) {
  if (!item.priority) return null;
  return toneChip(t, item.priority.name, namedTone(t, item.priority.color)).id("priority").flex_none();
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

// ==== src/actions/write.js ====

// Writing a change of an item at once: it shows before it is written, one
// write per item at a time; a refusal undoes it and says why, and a write
// whose outcome is unclear keeps the change, refreshes the view and leaves
// the outcome for the next refresh to settle (Board.settleUnclear, the
// shape's settle, which says the outcomes with tellOutcomes). A card's
// move, a work item's state change, a create, a parent link and an
// assignment are written so.

// Whether a write's view still stands, the one rule for following a write
// up: the config, as its last valid form says (an invalid one in between
// keeps it), still has that view, of the same kind (followed); and the
// view as the config has it now (current, null while it is not there).
export function viewStands(b, view) {
  return { followed: b.configState.kinds?.get(view.id) === viewKind(view), current: b.viewById(view.id) };
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
// - w.again: refresh after a write that landed too (looked up after the
//   write, so a getter may go by its answer); w.againOnRefusal: after one
//   that was refused too (what it met may have been out of date).
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
    const now = findRow(data, u.key);
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

// Hides or shows the column at `at`, on the view as the config has it now.
function toggleAt(b, m, at, cx) {
  const col = columnsOf(b, m)[at];
  if (!col) return;
  m.at = at;
  b.toggleColumn(b.viewById(m.view.id) ?? m.view, col, cx);
  cx.notify();
}

export const columnsModal = {
  needsData: true,

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

export function thumbOf(s, min = 16) {
  if (!(s.content > s.viewport) || s.viewport <= 0) return null;
  const length = Math.max(min, Math.round((s.viewport * s.viewport) / s.content));
  const start = Math.round(((s.viewport - length) * clampOffset(s.offset, s.content, s.viewport)) / (s.content - s.viewport));
  return { start, length };
}

export function spanStarts(lengths, gap, pad = 0) {
  const starts = [];
  let at = pad;
  for (const length of lengths) {
    starts.push(at);
    at += length + gap;
  }
  return { starts, content: lengths.length ? at - gap : pad };
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
  return { top: spanStarts(heights, FRAME.gap, FRAME.py).starts[i], height: heights[i] };
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
      div().id("related-thumb").absolute().right(3).top(thumb?.start ?? 0).transition("top", motion)
        .w(3).h(thumb?.length ?? 0).map(thumbLook(t)),
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
//   contexts, the team view, nur meine, the filter, reload, the menu), which
//   runs on the situation as it is, without the board keeping its selection
//   first (Board.keptSituation);
// - run(b, c, cx); aim(c) and gone(c) where it aims closer than its group
//   (menuActions);
// - hint(c): its text on the hint line, null for none; hintKey: the key
//   the hint line names (its key by default). The hint line names each key
//   once (hintsOf), and neither the moves nor a key named elsewhere (where
//   it acts, or only in the menu); README, "herdr app", lists those it
//   leaves out.
// An entry without run is a hint only: a core key the Board handles itself
// (Tab, Esc).
// `c` is the situation an action runs in (Board.situation): { b, view, st,
// shape, item (the selected one), details (the item whose details show:
// where the panel went down into a related item, that one), related
// (whether those read related items), sessions (how many sessions they
// list: itemSessions), panel (the details panel's keyboard, or null), lines
// (its lines now: Board.linesOf; null without it), line (its selected line
// by what it is, related.js lineId, or null), picked (that line among the
// panel's lines now: { related } or { session }, null where it is not
// there, as a related item's line until a read brings it again), drilled
// (whether the panel shows a related item rather than the board's selected
// one), trail (the keys of the items on the panel's way down, the board's
// selected one first) }.

// What a key event names (an action's key), or null for one no action has:
// [ ] { } / and : as typed (with Shift, or with Control+Alt, as AltGr
// types { } on a German layout; Control alone stays herdr's, and Alt alone
// is let through: a key herdr binds with Alt never reaches a mod), else
// with no Control, Alt or platform key a digit, Enter, or a letter: upper
// case with Shift alone, so that Caps Lock changes no key, and an upper
// case letter is its own key (Shift+S is no s). A digit after a g is the
// key g and the digit (jumpKey, main.js).
export function keyName(k, ch, mod) {
  const typed = !(mod.control && !mod.alt) && !mod.platform;
  if (typed && ["[", "]", "{", "}", "/", ":"].includes(ch)) return ch;
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

// The command menu's entries now: { action, name, key, group, head, aim, gone,
// groupAim, groupGone, line (the marked line) } for each action the menu lists
// that can run, in the menu's order, with its key where that key runs it now
// (actionFor), else none; its group's heading; and what it aims at and what is
// said where that has gone (GROUPS; an action may aim closer, as "Spalte
// ausblenden" at its column, and what its group aims at, and says, apart:
// where that has gone, the menu says so first).
export function menuActions(c) {
  return ACTIONS.filter((a) => a.menu != null && a.when(c))
    .sort((x, y) => x.menu - y.menu)
    .map((a) => {
      const group = GROUPS[a.group];
      return {
        action: a, name: nameOf(a, c), key: keyShown(a.id, c), group: a.group, head: group.title(c),
        aim: aimOf(a, c), gone: a.gone?.(c) ?? group.gone(c), groupAim: groupAimOf(a, c), groupGone: group.gone(c), line: c.line,
      };
    });
}

// What the action `a` acts on now, as a text to compare (menuActions), and
// what its group does; `line`: the line marked when the menu opened.
export const aimOf = (a, c, line = c.line) => JSON.stringify([...GROUPS[a.group].aim(c), ...(a.aim?.(c, line) ?? [])]);
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

const tabsOf = (c) => c.b.tabs();
const tabAt = (c) => shownIndex(tabsOf(c), c.b.tab());
const contextsNow = (c) => c.b.contexts();
const contextAt = (c) => shownIndex(contextsNow(c), c.b.context());

const nextView = (c) => tabViewAfter(c.b.tab(), c.b.tabViewOf(c.b.tab()));

function soloName(c) {
  const { choices, after } = c.shape.soloSwitch(c.b, c.st);
  return after === null ? "Alle Repos zeigen" : `Nur ${choices.find((x) => x.id === after).label} zeigen`;
}

// Whether the shown view has items to move over (none: the placeholder).
const walks = (c) => Boolean(c.shape?.dirs.length);
// Whether an item is selected and no line of the details panel, which
// takes Enter while one is, and the panel shows that item's details (held
// while drilled).
const onItem = (c) => Boolean(c.item) && c.line === null;
// Whether a related item's line is selected, there or not: its actions take
// Enter and o.
const relatedChosen = (c) => c.line?.related !== undefined;
// Whether the panel shows a related item it went down to, and whether no
// line of it is selected, when Enter acts on that item.
const onLevel = (c) => Boolean(c.details) && Boolean(c.drilled);
const onLevelItem = (c) => onLevel(c) && c.line === null;
const sessionLine = (c) => c.picked?.session ?? null;
// Whether the line hints name a related item's line's keys (else Enter and
// o are the item's the panel shows: at the top the board's, on a level that
// item's; on a session's line Enter goes to the session).
const lineHints = (c) => Boolean(c.panel) && relatedChosen(c);
// What the marked line's actions aim at: whether the line marked when the
// menu opened (`line`) is the marked one still, found among the lines as
// the panel finds it, so that one a read took away while the menu is open
// runs nothing, and one whose place a read changed still runs.
const lineAim = (c, line) => [Boolean(c.picked) && lineIndex(c.lines, line) === lineIndex(c.lines, c.line)];
const lineGone = (c) => `${c.picked.session?.label ?? itemLabel(c.picked.related)} ist nicht mehr markiert`;
const onLine = (c) => Boolean(c.details) && Boolean(c.picked?.related);
const onSession = (c) => Boolean(c.details) && Boolean(sessionLine(c));
// Whether a view shows, its data is read, and its shape has `what`.
const has = (c, what) => Boolean(c.view && c.st?.data && c.shape?.[what]);

// The selected column, where the shape hides columns and can hide it
// (its canHide).
function hideableColumn(c) {
  if (!has(c, "toggleColumn")) return null;
  const col = c.b.navColumns(c.view)[c.st.sel?.col];
  return col && c.shape.canHide(col) ? col : null;
}

// The second Enter's name (secondEnter's `enter`) on its action and its
// button: where its question has no session to go to, it only confirms a
// start.
export function startName(enter, item) {
  if (enter.go) return "Zur Sitzung";
  if (enter.ask?.some(placed)) return "Sitzung wählen";
  return item.kind === "pr" ? "Review starten" : "Agent starten";
}

function startAction(c, item) {
  const enter = secondEnter(c.b.sessionsNow(), item);
  return `${startName(enter, item)}${enter.go ? "" : "…"}`;
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

const contextAction = (n) => ({
  id: `context-${n}`,
  group: "board",
  name: (c) => `Kontext ${n}: ${contextsNow(c)[n - 1].name}`,
  key: `g${n}`,
  menu: 42,
  bar: true,
  when: (c) => Boolean(contextsNow(c)[n - 1]) && n - 1 !== contextAt(c),
  takes: () => true,
  run: (b, c, cx) => b.switchContext(n - 1, cx),
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
    id: "context-next", group: "board", name: "Nächster Kontext", key: "}", menu: 43, bar: true,
    when: (c) => contextsNow(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepContext(1, cx),
    hint: (c) => (contextsNow(c).length > 1 ? "Kontext" : null), hintKey: "{ }",
  },
  {
    id: "context-previous", group: "board", name: "Vorheriger Kontext", key: "{", menu: 44, bar: true,
    when: (c) => contextsNow(c).length > 1, takes: () => true,
    run: (b, c, cx) => b.stepContext(-1, cx),
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(contextAction),
  {
    id: "tab-view", group: "view", name: (c) => `Ansicht wechseln: ${tabViewName(c.b.tab(), nextView(c))}`, key: "v", menu: 25, bar: true,
    when: (c) => Boolean(c.view) && hasViewSwitch(c.b.tab()), takes: () => true,
    run: (b, c, cx) => b.nextTabView(cx),
    hint: (c) => (hasViewSwitch(c.b.tab()) ? viewSwitchHint(c.b.tab()) : null),
  },
  {
    id: "solo-repo", group: "view", name: (c) => soloName(c), key: "V", menu: 25, bar: true,
    when: (c) => has(c, "soloSwitch"),
    run: (b, c, cx) => b.nextSoloRepo(cx),
    hint: (c) => (has(c, "soloSwitch") && hasViewSwitch(c.b.tab()) ? "Alle/Repo" : null),
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
    id: "status", group: "item", name: (c) => `${c.b.statusField(c.view)} ändern…`, key: "s", menu: 3,
    when: (c) => has(c, "openStatusMenu") && Boolean(c.item), takes: (c) => has(c, "openStatusMenu"),
    run: (b, c, cx) => b.openStatusMenu(c.view, cx),
    hint: (c) => (c.shape?.openStatusMenu ? c.b.statusField(c.view) : null),
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
    id: "start", group: "item", name: (c) => startAction(c, c.item), key: "enter", menu: 2,
    when: (c) => Boolean(c.item) && c.st.detail, takes: (c) => onItem(c) && c.st.detail,
    run: (b, c, cx) => b.enter(c.view, cx),
  },
  {
    id: "open", group: "item", name: "Im Browser öffnen", key: "o", menu: 7,
    when: (c) => Boolean(c.item), takes: (c) => Boolean(c.item) && !relatedChosen(c),
    run: (b, c, cx) => b.open(c.item, cx),
    hint: (c) => (walks(c) ? "öffnen" : null),
  },
  { id: "tab-hint", hint: (c) => (c.related || c.sessions || c.panel ? (c.panel ? "Board" : "Details") : null), hintKey: "Tab" },
  {
    id: "fold-description", group: "details", key: "z", menu: 9,
    name: (c) => (c.b.relatedUi.unfolded === c.details.key ? "Beschreibung weniger" : "Beschreibung mehr"),
    when: (c) => Boolean(c.details) && c.related && descriptionFolds(c.b.relatedUi, c.details),
    run: (b, c, cx) => b.toggleFold(cx),
  },
  // The details panel's selected line: a session's goes there; a related
  // item's (a line selected before `r` read the related items again is
  // gone until they come: its key does nothing) shows its item.
  {
    id: "line-session", group: "details", name: "Zur markierten Sitzung", key: "enter", menu: 10,
    when: onSession, takes: (c) => c.line !== null && !relatedChosen(c), aim: lineAim, gone: lineGone,
    run: (b, c, cx) => onSession(c) && b.goToSession(sessionLine(c), cx),
    hint: (c) => (c.panel && sessionLine(c) ? "zur Sitzung" : null),
  },
  {
    id: "line-details", group: "details", name: "Zeile im Detailfenster zeigen", key: "enter", menu: 10,
    when: onLine, takes: relatedChosen, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => onLine(c) && b.drillLine(c.view, c.picked.related, cx),
    hint: (c) => (lineHints(c) ? "Zeile zeigen" : null),
  },
  {
    id: "line-board", group: "details", name: "Zeile auf dem Board", key: null, menu: 11,
    when: onLine, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => b.enterLine(c.view, c.picked.related, cx),
  },
  {
    id: "line-open", group: "details", name: "Zeile im Browser öffnen", key: "o", menu: 12,
    when: onLine, takes: relatedChosen, aim: lineAim, gone: lineGone,
    run: (b, c, cx) => onLine(c) && b.open(c.picked.related, cx),
    hint: (c) => (lineHints(c) ? "Zeile öffnen" : null),
  },
  // The item the panel went down to: Enter acts on it where no line is
  // selected, o where no related item's line is (the line's actions come
  // first in the table and take them while one is).
  {
    id: "level-start", group: "details", name: (c) => startAction(c, c.details), key: "enter", menu: 13,
    when: onLevel,
    run: (b, c, cx) => b.startSession(c.view, c.details, cx),
    hint: (c) => (onLevelItem(c) ? (c.details.kind === "pr" ? "Review" : "Agent") : null),
  },
  {
    id: "level-open", group: "details", name: "Im Browser öffnen", key: "o", menu: 14,
    when: onLevel,
    run: (b, c, cx) => b.open(c.details, cx),
    hint: (c) => (onLevel(c) && !relatedChosen(c) ? "öffnen" : null),
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
  {
    id: "repos", group: "view", name: "Repos…", key: "R", menu: 22,
    when: (c) => has(c, "toggleRepo"),
    run: (b, c, cx) => b.openRepos(c.view, cx),
    hint: (c) => (c.shape?.toggleRepo ? "Repos" : null),
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
    when: (c) => Boolean(c.b.context()), takes: () => true,
    run: (b, c, cx) => b.toggleMine(cx),
    hint: (c) => (c.b.context() ? "nur meine" : null),
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
  // Opens the menu on the situation `c` (Board.openCommands).
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

// ==== src/ui/choices.js ====

// A dialog's choice fields (the start dialog's Agent, Rechner and Öffnen
// in, the create dialog's Typ; the Issues tab's field „Repo:“ opens its list
// as a dialog of its own, ui/modals/solo.js), from a table of the dialog's,
// by field: { entries(m), each { id, name, aside (the texts at its right:
// a space's folder, a repo's count) }; current(m), the id of the entry the
// field is on; value(m), the text the field shows; take(b, row, cx), which
// puts the field on that entry; fieldAfter(row), the field the dialog goes
// on to once the list took `row` (by default it stays); closes (the dialog
// ends once the list took a row or a press beside it closed it); the
// list's placeholder, none (said where the filter leaves no row), empty(m)
// (said instead where no filter is typed), notes(m) (said under the rows),
// width and anchor }. The open list is the dialog's m.list.

export const LIST_HINT = "Tippen filtert · ↑ ↓ wählt · ↵ übernimmt · Esc schließt die Liste";
export const choiceHint = (enter) => `← → wählt · Leertaste öffnet die Liste · ↵ ${enter} · Tab wechselt das Feld`;

export function choiceBox(b, t, choices, field) {
  const m = b.modal;
  const trigger = h_flex()
    .id(`choice-${field}`)
    .flex_1()
    .min_w(0)
    .gap(6)
    .cursor_pointer()
    .on_click((_e, cx) => {
      m.field = field;
      b.handle.focus();
      openList(b, choices, field, cx);
    })
    .child(div().flex_1().min_w(0).truncate().child(choices[field].value(m)))
    .child(div().text_color(t.dim).child("▾"));
  return listPopup(b, t, field, choices[field].anchor, fieldFrame(t, m, field, trigger));
}

// The frame of the choice `field`, its list under it while that list is
// open and `here` (the open dialog is the field's own).
export const listPopup = (b, t, field, anchor, frame, here = true) =>
  Popup.new(`choice-${field}-list`, frame).anchor(anchor).when(here && b.modal?.list?.choice === field, (el) => el.content(listPanel(b, t)));

export function choiceKey(b, choices, k, cx) {
  const field = b.modal.field;
  if (k === "space") return openList(b, choices, field, cx);
  if (k === "h" || k === "left") return step(b, choices[field], -1, cx);
  if (k === "l" || k === "right") return step(b, choices[field], 1, cx);
}

function step(b, spec, by, cx) {
  const m = b.modal;
  if (m.busy) return;
  const rows = spec.entries(m);
  if (rows.length) {
    const now = rows.findIndex((r) => r.id === spec.current(m));
    // An entry the field is on but does not list (a chosen space that is
    // gone, or on a machine whose spaces are not read) stands before the
    // first.
    const next = now < 0 ? (by > 0 ? 0 : rows.length - 1) : (now + by + rows.length) % rows.length;
    spec.take(b, rows[next], cx);
  }
  cx.notify();
}

export function openList(b, choices, field, cx) {
  const m = b.modal;
  const spec = choices[field];
  if (m.busy || !spec) return;
  const list = { choice: field, spec, field: "filter", mark: NOT_MOVED };
  m.field = field;
  m.list = list;
  wireFilter(m, list, {
    placeholder: spec.placeholder,
    count: () => listRows(m).length,
    startAt: () => {
      list.mark = NOT_MOVED;
      return markedAt(m, listRows(m));
    },
    pick: (_at, cx) => {
      if (m.list === list) takeRow(b, syncedRows(m)[list.at], cx);
    },
  });
  list.input.focus();
  cx.notify();
}

export function closeList(b, cx) {
  b.modal.list = null;
  b.takeKeyboard();
  cx.notify();
}

export function escapeList(b, cx) {
  if (!b.modal.list) return false;
  closeList(b, cx);
  return true;
}

export const listKeyboard = (m) => m.list?.input ?? null;

const listRows = (m) => rankByName(m.list.spec.entries(m), m.list.filter);

// The list's mark (the id of the entry ↑ ↓ moved to) before they move it:
// an entry's id may be null („Alle“ of the field „Repo:“).
const NOT_MOVED = undefined;

function markedAt(m, rows) {
  const { list } = m;
  const moved = list.mark === NOT_MOVED ? -1 : rows.findIndex((r) => r.id === list.mark);
  if (moved >= 0) return moved;
  if (!rows.length) return -1;
  if (list.filter) return 0;
  return rows.findIndex((r) => r.id === list.spec.current(m));
}

// Entries that come after the list opened (agents read, spaces herdr read)
// move the mark to where markedAt puts it now.
function syncedRows(m) {
  const rows = listRows(m);
  const at = markedAt(m, rows);
  if (at !== m.list.at) {
    m.list.at = at;
    followMark(m.list, rows.length);
  }
  return rows;
}

// herdr hands the filter's Enter to its submit as well, which then finds
// the list closed.
export function listKey(b, e, cx) {
  const list = b.modal.list;
  const rows = syncedRows(b.modal);
  if (e.key === "enter") {
    cx.stop_propagation();
    return takeRow(b, rows[list.at], cx);
  }
  if (!filterMenuKey(e, cx, list, rows.length)) return;
  const row = rows[list.at];
  list.mark = row ? row.id : NOT_MOVED;
}

function takeRow(b, row, cx) {
  const m = b.modal;
  if (!row) return;
  const { spec, choice } = m.list;
  m.list = null;
  spec.take(b, row, cx);
  if (spec.closes) return b.closeModal(cx);
  m.field = spec.fieldAfter?.(row) ?? choice;
  b.takeKeyboard();
  cx.notify();
}

function listPanel(b, t) {
  const m = b.modal;
  const { spec } = m.list;
  const rows = syncedRows(m);
  const { shown, ...win } = menuWindow(m.list, rows);
  const none = m.list.filter || !spec.empty ? spec.none : spec.empty(m);
  return div()
    .id("choice-list")
    .mt(4)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(menuPanel(t, {
      id: "choice-list",
      rowId: "choice-list-row",
      width: spec.width,
      title: null,
      head: filterMenuHead(t, m.list),
      digits: false,
      rows: shown.map((r) => [
        markedName(t, r.name, r.at),
        ...(r.aside ?? []).filter(Boolean).map((text) => div().flex_none().max_w(160).truncate().text_size(11).text_color(t.dim).child(text)),
      ]),
      ...win,
      pick: (i, cx) => takeRow(b, rows[i], cx),
      foot: [
        ...(rows.length ? [] : [menuNote(t, none, t.muted)]),
        ...(spec.notes?.(m) ?? []).map((n) => menuNote(t, n, t.muted)),
      ],
    }));
}

// A press beside the open list closes it.
export const listShield = (b) =>
  b.modal.list
    ? div().id("choice-list-shield").absolute().inset_0().on_mouse_down("left", (_e, cx) => {
      cx.stop_propagation();
      const spec = b.modal?.list?.spec;
      if (!spec) return;
      if (spec.closes) b.closeModal(cx);
      else closeList(b, cx);
    })
    : null;

// ==== src/ui/modals/create.js ====

// The create dialog: a new work item on a team's backlog, its type (the
// level's types, its default first; with an item of the level selected also
// the types of the level below, as that item's children) and its title.
// The backlog shape opens it (n). Enter or Anlegen creates
// (actions/create.js): the dialog closes and the notice says how it goes.

// The fields Tab walks, in order.
const CREATE_FIELDS = ["title", "type"];

export const CREATE_HINTS = {
  title: "↵ legt an · Tab wechselt das Feld",
  type: choiceHint("legt an"),
  list: LIST_HINT,
};

const typeName = (m, type) => (type.child ? `${type.name} (unter ${itemLabel(m.parent)})` : type.name);

const CREATE_CHOICES = {
  type: {
    entries: (m) => m.types.map((type, i) => ({ id: i, name: typeName(m, type) })),
    current: (m) => m.at,
    value: (m) => typeName(m, m.types[m.at]),
    take: (b, row) => (b.modal.at = row.id),
    placeholder: "Filter: Name des Typs",
    none: "Kein Typ passt zum Filter",
    width: 320,
    anchor: "top_left",
  },
};

// Where a new work item of the chosen type goes, as the dialog says it.
function whereText(m) {
  const meta = m.data.meta;
  const type = m.types[m.at];
  const place = type?.child ? `unter ${itemLabel(m.parent)} „${m.parent.title}“` : `in „${meta.level.name}“`;
  return `Neu ${place}; Bereichspfad ${meta.area ?? "—"}, Iteration ${meta.iteration ?? "—"}, mir zugewiesen`;
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
      const missing = [!data.meta.area && "keinen Standard-Bereichspfad", !data.meta.iteration && "keine Standard-Iteration"].filter(Boolean).join(" und ");
      return b.say(`Das Team hat ${missing}: in Azure unter Team-Einstellungen setzen`, "warning", cx);
    }
    const input = InputState.new({ placeholder: "Titel des neuen Work Items" });
    const m = { kind: "create", view, data, types, at: 0, parent, input, field: "title", list: null, error: null };
    wireTextField(b, m, input, "title", (_e, cx) => createModal.create(b, cx));
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

  keyboard: listKeyboard,
  escape: escapeList,

  // Tab and shift-Tab (`back`): the next or previous field.
  tab(b, back, cx) {
    b.modal.list = null;
    cycleField(b, CREATE_FIELDS, back, cx);
  },

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey).
  // Typing goes to the title.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.list) return listKey(b, e, cx);
    if (m.field === "title") return;
    cx.stop_propagation();
    if (k === "enter") return createModal.create(b, cx);
    choiceKey(b, CREATE_CHOICES, k, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
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
            .child(div().text_size(15).font_semibold().child(`Neues Work Item · ${m.view.tab.team}`))
            .child(div().text_size(12).text_color(t.muted).child(whereText(m))),
        )
        .child(
          v_flex().px(20).py(16).gap(14)
            .child(v_flex().gap(6).child(label("Typ")).child(choiceBox(b, t, CREATE_CHOICES, "type")))
            .child(v_flex().gap(6).child(label("Titel")).child(frame("title", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(m.error ?? ""))),
        )
        .child(
          h_flex().px(20).py(12).gap(8).items_center().border_t(1).border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.list ? CREATE_HINTS.list : CREATE_HINTS[m.field]))
            .child(button(t, "create-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx)))
            .child(button(t, "create-go", "Anlegen ↵", true, (cx) => createModal.create(b, cx))),
        ),
      listShield(b),
    );
  },
};

// ==== src/ui/modals/repos.js ====

// The repo menu reads the repos from the view's data as they are now
// (its shape's repoSwitches), so a toggle shows at once.

function menuRepos(b, m) {
  const data = b.state(m.view.id).data;
  return data ? b.shape(m.view).repoSwitches?.(b, data) ?? [] : [];
}

function toggleRepoAt(b, m, at, cx) {
  const repo = menuRepos(b, m)[at];
  if (!repo) return;
  m.at = at;
  b.toggleRepo(m.view, repo.repo, cx);
  cx.notify();
}

export const reposModal = {
  needsData: true,

  open(b, view, cx) {
    b.modal = { kind: "repos", view, at: 0 };
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "repos",
      rowId: "repo",
      width: 380,
      title: "Repos zeigen",
      at: m.at,
      pick: (i, cx) => toggleRepoAt(b, m, i, cx),
      rows: menuRepos(b, m).map((r) => [
        div().w(14).text_color(t.foreground).child(r.hidden ? "" : "✓"),
        div().flex_1().min_w(0).truncate().text_color(r.hidden ? t.muted : t.foreground).child(r.name),
        ...(r.foreign ? [foreignChip(t)] : []),
        div().flex_none().text_size(11).text_color(t.dim).child(r.held === null ? "" : shownOf(r.shown, r.held)),
        div().w(80).flex_none().text_size(11).text_color(t.dim).child(r.hidden ? "ausgeblendet" : "gezeigt"),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, menuRepos(b, b.modal).length, (i, cx) => toggleRepoAt(b, b.modal, i, cx)),
};

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
    const m = { kind: "sprints", view, team: view.tab?.team ?? view.name };
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

// The start dialog: opens an item's session in its checkout (an item
// without a repo: in the repo chosen under "Repo"), on a machine and with an
// agent chosen here, as a new tab in a space of that machine or in a new
// space ("Öffnen in"), with a first message to edit.

const SH_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
const FIELDS = ["message", "agent", "machine", "open"];
const REPO_FIELDS = ["message", "repo", "agent", "machine", "open"];
const fieldsOf = (m) => {
  const fields = m.repos ? REPO_FIELDS : FIELDS;
  return whereToOpen(m).newSpace ? [...fields, "name"] : fields;
};
const stillOpen = (b, m) => b.modal === m;
const MESSAGE_ROWS = 6;

// Not a text: a space's id, herdr's text, can never equal it.
export const NEW_SPACE = Symbol("new space");
export const NEW_SPACE_LABEL = "Neuer Space …";

// herdr's own Enter in the message is a line break; the later binding wins.
export const MESSAGE_KEY_CONTEXT = "BoardMessage";
export const START_ACTION = "board_start";
export const MESSAGE_KEYS = [{ keystroke: "enter", action: START_ACTION, context: `${MESSAGE_KEY_CONTEXT} > Input` }];

export const START_HINTS = {
  message: "↵ startet · ⇧↵ neue Zeile · PageUp/PageDown blättert · Tab wechselt das Feld",
  name: "↵ startet · Tab wechselt das Feld",
  choice: choiceHint("startet"),
  list: LIST_HINT,
};

const agentsPending = (m) => m.agentsError ?? "lädt …";

export const repoStoreKey = (view) => `repo:${view.id}`;
const reposLoading = (on, folders) => ({ state: "loading", on, folders, list: [], missing: [], unreadable: [], lost: null, error: null });
const chosenRepo = (m) => m.repos?.list.find((r) => r.key === m.repo) ?? null;

function reposPending(m) {
  const { state, error, list } = m.repos;
  if (state === "loading") return "lädt …";
  if (state === "error") return error;
  return list.length ? "Repo wählen" : "Kein Repo gefunden";
}
const openedIn = (where) => where.space ?? where.gone ?? where.unread;

const START_CHOICES = {
  repo: {
    entries: (m) => m.repos.list.map((r) => ({ id: r.key, name: r.name, aside: m.repos.folders.length > 1 ? [r.parent] : [] })),
    current: (m) => m.repo,
    value: (m) => chosenRepo(m)?.name ?? reposPending(m),
    take: (b, row) => {
      b.modal.error = null;
      b.modal.repos.lost = null;
      chooseRepo(b.modal, row.id);
    },
    notes: (m) => reposNotes(m),
    placeholder: "Filter: Name des Repos",
    none: "Kein Repo passt zum Filter",
    empty: reposPending,
    width: 360,
    anchor: "top_left",
  },
  agent: {
    entries: (m) => m.agents.map((a, i) => ({ id: i, name: a.name })),
    current: (m) => m.agent,
    value: (m) => m.agents[m.agent]?.name ?? agentsPending(m),
    take: (b, row) => (b.modal.agent = row.id),
    placeholder: "Filter: Name des Agents",
    none: "Kein Agent passt zum Filter",
    empty: agentsPending,
    width: 240,
    anchor: "top_left",
  },
  machine: {
    entries: (m) => m.machines.map((on, i) => ({ id: i, name: machineName(on) })),
    current: (m) => m.machine,
    value: (m) => machineName(m.machines[m.machine]),
    take: (b, row, cx) => chooseMachine(b, row.id, cx),
    placeholder: "Filter: Name des Rechners",
    none: "Kein Rechner passt zum Filter",
    width: 240,
    anchor: "top_left",
  },
  open: {
    entries: (m) => spaceRows(m),
    current: (m) => openedIn(whereToOpen(m))?.id ?? NEW_SPACE,
    value: (m) => openedIn(whereToOpen(m))?.name ?? NEW_SPACE_LABEL,
    take: (b, row) => chooseSpace(b.modal, row),
    fieldAfter: (row) => (row.id === NEW_SPACE ? "name" : "open"),
    notes: (m) => {
      const where = whereToOpen(m);
      return where.readable ? [] : [spacesNote(where)];
    },
    placeholder: "Filter: Name des Space",
    none: "Kein Space passt zum Filter",
    width: 360,
    anchor: "top_right",
  },
};

export function spacesNote({ on, layout }) {
  const why = layout === "loading" ? "noch nicht gelesen" : "nicht lesbar";
  return `Die Spaces ${onMachine(on)} sind ${why}; „${NEW_SPACE_LABEL}“ geht trotzdem`;
}

function reposNotes(m) {
  const { state, on, folders, list, missing, unreadable, lost } = m.repos ?? {};
  if (state !== "ready") return [];
  const notes = [
    ...missing.map((f) => `Den Repo-Ordner ${f} gibt es ${onMachine(on)} nicht`),
    ...unreadable.map((f) => `Der Repo-Ordner ${f} ist ${onMachine(on)} nicht lesbar`),
  ];
  if (!folders.length) {
    notes.push(`Kein Repo-Ordner gesetzt: in ${CONFIG_NAME}.json „repoFolders“ eintragen, unter „sources.azure“ für alle Teams oder beim Team, etwa "repoFolders": ["~/Repos"]`);
  } else if (!list.length) {
    notes.push(`In ${folders.join(", ")} liegt ${onMachine(on)} kein Git-Repo; die Ordner stehen in ${CONFIG_NAME}.json unter „repoFolders“`);
  }
  if (lost) notes.push(`„${lost}“ liegt ${onMachine(on)} in keinem Repo-Ordner; bitte ein Repo wählen`);
  return notes;
}

export const startModal = {
  // Opens the dialog for an item, or says where its checkout is missing. An
  // item without a repo takes its folder from the Repo field.
  open(b, view, item, cx) {
    const settings = startSettings(b.config, view, item.repo);
    if (item.repo && !settings.checkout) {
      const where = `„repos“ → „${item.repo}“ oder „start.checkout“ der Ansicht „${view.name}“`;
      return b.say(`Für ${item.repo} steht kein „checkout“ in ${CONFIG_NAME}.json: ${where}`, "error", cx);
    }
    const input = TextareaState.new({ placeholder: "Erste Nachricht an den Agent" });
    input.set_auto_grow(1, MESSAGE_ROWS);
    const template = item.kind === "pr" ? settings.review : settings.message;
    input.set_value(renderTemplate(template, templateVars(item)));
    const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name);
    const list = listed.length ? listed : [null];
    let machine = list.indexOf(settings.machine ?? null);
    const machineNote = machine < 0 ? `Rechner „${settings.machine}“ ist nicht verbunden; gewählt: ${machineName(list[0])}` : null;
    if (machine < 0) machine = 0;
    const spaceName = item.repoShort ?? "";
    const nameInput = InputState.new({ placeholder: "Name des neuen Space" });
    nameInput.set_value(spaceName);
    const m = {
      kind: "start", view, item, settings, input, nameInput, field: "message", agents: [], agent: 0, agentsError: null, machineNote, agentNote: null,
      notes: [machineNote].filter(Boolean), machines: list, machine, spaceName, target: null, renamed: false, list: null, busy: null, error: null,
      repos: item.repo ? null : reposLoading(null, []), repo: null,
    };
    wireMessage(b, m, input);
    wireTextField(b, m, nameInput, "name", (_e, cx) => startModal.start(b, cx));
    nameInput.on("change", () => {
      m.target = NEW_SPACE;
      m.renamed = true;
    });
    b.modal = m;
    input.focus();
    loadAgents(b, cx);
    loadRepos(b, cx);
    cx.notify();
  },

  // Opens the item's session on the chosen machine, in its checkout's folder
  // there (an item without a repo: the folder of the repo chosen), then runs
  // tab.new in the chosen space, where it is still there, or space.new with
  // the name given. run() answers nothing, so the board says the session is
  // being opened and watches for a new tab of its name (watchSession). The
  // dialog stays until run() opens the session; a failure that comes after
  // the dialog went shows in the banner and as a toast.
  start(b, cx) {
    const m = b.modal;
    if (m?.kind !== "start") return;
    m.error = null;
    if (m.busy) return void cx.notify();
    const repo = chosenRepo(m);
    if (m.repos && !repo) {
      m.error = m.repos.state === "loading" ? "Die Repos werden noch gelesen" : reposPending(m);
      m.field = "repo";
      b.takeKeyboard();
      return void cx.notify();
    }
    const agent = m.agents[m.agent];
    if (!agent) return void ((m.error = m.agentsError ?? "Kein Agent gewählt"), cx.notify());
    const { on, space, gone, unread, newSpace } = whereToOpen(m);
    if (gone || unread) return void cx.notify();
    const spaceName = m.nameInput.value().trim();
    if (newSpace && !spaceName) return void ((m.error = "Der neue Space braucht einen Namen"), cx.notify());
    const task = m.input.value().trim();
    const name = sessionName(m.item);
    m.busy = "Sitzung wird geöffnet …";
    const before = tabsNamed(name);
    cx.spawn(async (cx) => {
      try {
        const folder = repo ? repo.folder : await checkoutFolder(m, on);
        if (space && !spaces().some((s) => s.id === space.id)) {
          // Its dialog says so for a space chosen there (goneNote, unreadNote).
          if (m.target && stillOpen(b, m)) return;
          if (layoutOf(on) !== "ready") throw new BoardError(uncheckedNote(on, space));
          throw new BoardError(`Den Space „${space.name}“ ${onMachine(on)} gibt es nicht mehr`);
        }
        run(...startCommand({ on, folder, argv: agent.run, task, name, space: space?.id, spaceName }));
        if (repo && m.item.kind !== "pr") store.set(repoStoreKey(m.view), repo.key);
        if (stillOpen(b, m)) {
          b.modal = null;
          b.handle.focus();
        }
        b.say(`Sitzung wird geöffnet: ${name}${on ? ` auf ${on}` : ""}`, "info", cx);
        watchSession(b, name, before, cx);
      } catch (e) {
        const why = report(e);
        if (stillOpen(b, m)) m.error = why;
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

  keys: MESSAGE_KEYS,
  keyboard: listKeyboard,
  escape: escapeList,

  tab(b, back, cx) {
    b.modal.list = null;
    cycleField(b, fieldsOf(b.modal), back, cx);
  },

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey,
  // where Tab comes here at all rather than as the board's action).
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.list) return listKey(b, e, cx);
    if (m.inputs[m.field]) return;
    cx.stop_propagation();
    if (k === "enter") return startModal.start(b, cx);
    choiceKey(b, START_CHOICES, k, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    const choice = (field, title) => v_flex().flex_1().min_w(0).gap(6).child(label(title)).child(choiceBox(b, t, START_CHOICES, field));
    const where = whereToOpen(m);
    const notes = [...m.notes, ...reposNotes(m), ...(where.readable ? [] : [spacesNote(where)]), ...(where.gone ? [goneNote(where)] : []), ...(where.unread ? [unreadNote(where)] : [])];
    const hint = m.list ? START_HINTS.list : START_HINTS[m.field] ?? START_HINTS.choice;
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
            .child(m.repos ? v_flex().gap(6).child(label("Repo")).child(choiceBox(b, t, START_CHOICES, "repo")) : label(`Neue Sitzung im Checkout ${m.settings.checkout}`))
            .child(
              h_flex()
                .gap(12)
                .child(choice("agent", "Agent"))
                .child(choice("machine", "Rechner"))
                .child(choice("open", "Öffnen in")),
            )
            .when(where.newSpace, (el) => el.child(
              v_flex()
                .gap(6)
                .child(label("Name des neuen Space"))
                .child(frame("name", Input.new(m.nameInput).flex_1().text_size(12).text_color(t.foreground))),
            ))
            .child(
              v_flex()
                .gap(6)
                .child(label("Erste Nachricht"))
                .child(
                  fieldBox(t, m, "message")
                    .id("start-message")
                    .py(8)
                    .items_start()
                    .key_context(MESSAGE_KEY_CONTEXT)
                    .on_action(START_ACTION, (_e, cx) => {
                      cx.stop_propagation();
                      startModal.start(b, cx);
                    })
                    .child(Textarea.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
                ),
            )
            .children(notes.map((n) => div().text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(n)))
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
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.busy ?? hint))
            .child(button(t, "start-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx), Boolean(m.busy)))
            .child(button(t, "start-go", "Starten ↵", true, (cx) => startModal.start(b, cx), Boolean(m.busy))),
        ),
      listShield(b),
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
      if (!stillOpen(b, m) || m.machines[m.machine] !== on) return;
      m.agents = agents;
      const wanted = m.settings.agent;
      m.agent = Math.max(0, agents.findIndex((a) => a.key === wanted));
      if (!agents.length) m.agentsError = "Kein Agent installiert";
      else if (wanted && !agents.some((a) => a.key === wanted)) {
        m.agentNote = `Agent „${wanted}“ ist ${onMachine(on)} nicht installiert; gewählt: ${agents[0].name}`;
      }
    } catch (e) {
      if (!stillOpen(b, m) || m.machines[m.machine] !== on) return;
      m.agentsError = `Agents ${onMachine(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
    }
    m.notes = [m.machineNote, m.agentNote].filter(Boolean);
    cx.notify();
  });
}

function chooseMachine(b, machine, cx) {
  const m = b.modal;
  if (machine === m.machine) return;
  m.machine = machine;
  m.machineNote = null;
  m.target = m.target === NEW_SPACE && m.renamed ? NEW_SPACE : null;
  loadAgents(b, cx);
  loadRepos(b, cx);
}

async function shOutput(m, args, on, kind) {
  const r = await call("sh", args, on, SH_TIMEOUT, what(m.view, kind));
  if (r.code !== 0) throw new BoardError(firstLine(r.stderr) || `sh endete mit ${r.code}`);
  return r.stdout;
}

async function checkoutFolder(m, on) {
  const folder = lastLine(await shOutput(m, checkoutArgs(m.settings.checkout), on, "checkout"));
  if (!folder) throw new BoardError("Checkout-Ordner nicht gelesen");
  return folder;
}

function loadRepos(b, cx) {
  const m = b.modal;
  if (!m.repos) return;
  const on = m.machines[m.machine];
  const folders = m.view.tab?.repoFolders ?? [];
  const repos = reposLoading(on, folders);
  m.repos = repos;
  const listed = ({ repos: list, missing, unreadable }) => {
    const wanted = m.repo ?? wantedRepo(m, list);
    const there = list.some((r) => r.key === wanted);
    Object.assign(repos, { state: "ready", list, missing, unreadable, lost: wanted && list.length && !there ? wanted : null });
    if (there) chooseRepo(m, wanted);
  };
  if (!folders.length) return listed({ repos: [], missing: [], unreadable: [] });
  cx.spawn(async (cx) => {
    let found = null;
    let why = null;
    try {
      found = parseRepos(await shOutput(m, reposArgs(folders), on, "repos"), folders);
    } catch (e) {
      why = `Repos ${onMachine(on)} nicht lesbar: ${report(e)}`;
    }
    if (b.modal?.repos !== repos) return;
    if (found) listed(found);
    else Object.assign(repos, { state: "error", error: why });
    cx.notify();
  });
}

function wantedRepo(m, list) {
  if (m.item.kind === "pr") {
    const named = list.filter((r) => r.name === m.item.azureRepo);
    return named.length === 1 ? named[0].key : null;
  }
  const remembered = store.get(repoStoreKey(m.view));
  return typeof remembered === "string" ? remembered : null;
}

function chooseRepo(m, key) {
  m.repo = key;
  m.spaceName = chosenRepo(m)?.name ?? "";
  if (!m.renamed) m.nameInput.set_value(m.spaceName);
}

const layoutOf = (on) => machines().find((x) => (x.name ?? null) === (on ?? null))?.layout ?? (on ? "unavailable" : "ready");

// Without a choice preselectedSpace decides, but not while the dialog is on
// the new space's name: spaces herdr reads meanwhile must not take that
// field away.
function whereToOpen(m) {
  const on = m.machines[m.machine];
  const layout = layoutOf(on);
  const readable = layout === "ready";
  const here = readable ? spacesOn(spaces(), on) : [];
  const offer = { on, layout, readable, here };
  const chosen = m.target ?? (m.field === "name" ? NEW_SPACE : null);
  if (chosen === NEW_SPACE) return { ...offer, space: null, gone: null, unread: null, newSpace: true };
  const space = chosen ? here.find((s) => s.id === chosen.id) ?? null : preselectedSpace(here, m.spaceName);
  const missing = chosen && !space ? chosen : null;
  return { ...offer, space, gone: readable ? missing : null, unread: readable ? null : missing, newSpace: !space && !missing };
}

const goneNote = ({ on, gone }) => `Den Space „${gone.name}“ ${onMachine(on)} gibt es nicht mehr; bitte neu wählen`;
const unreadNote = ({ on, unread }) => `Den Space „${unread.name}“ ${onMachine(on)} kann das Board erst prüfen, wenn es die Spaces dort gelesen hat; warten oder neu wählen`;
const uncheckedNote = (on, space) => `Den Space „${space.name}“ ${onMachine(on)} konnte das Board nicht prüfen; die Spaces dort waren nicht gelesen`;

const spaceRows = (m) => [{ id: NEW_SPACE, name: NEW_SPACE_LABEL, aside: [] }, ...whereToOpen(m).here.map((s) => ({ id: s.id, name: s.name, aside: [s.folder] }))];

function chooseSpace(m, row) {
  m.target = row.id === NEW_SPACE ? NEW_SPACE : { id: row.id, name: row.name };
  m.error = null;
}

// A plain Enter gets to the message's submit only where the board's binding
// (MESSAGE_KEYS) is missing (dropped by a load of keys.json, or never
// bound), after herdr put a line break in place of each selection and told
// "change".
function wireMessage(b, m, input) {
  let before = input.value();
  let now = before;
  input.on("change", () => {
    before = now;
    now = input.value();
  });
  wireTextField(b, m, input, "message", (e, cx) => {
    if (e?.shift || e?.secondary) return;
    now = before;
    b.bindKeys(cx);
    const single = takeBackEnter(input, before);
    if (!single) {
      m.error = "Tasten neu gebunden – bitte Enter noch einmal";
      return cx.notify();
    }
    startModal.start(b, cx);
  });
}

// herdr's Enter leaves the active cursor after its own line break.
function takeBackEnter(input, before) {
  const text = input.value();
  const at = input.selected_range().start - 1;
  const end = before.length - (text.length - at - 1);
  const single = end >= at && text === `${before.slice(0, at)}\n${before.slice(end)}`;
  input.set_value(before);
  input.set_selected_range(single ? { start: at, end } : { start: before.length, end: before.length });
  return single;
}

const tabsNamed = (name) => new Set(spaces().flatMap((s) => s.tabs.filter((t) => t.name === name).map((t) => t.id)));

// `before`: the tabs of that name at Starten; a tab of the item left from
// before is not the session.
function watchSession(b, name, before, cx, at = 0) {
  cx.timer.after(SESSION_CHECKS[at], (cx) => {
    const there = spaces().some((s) => s.tabs.some((t) => t.name === name && !before.has(t.id)));
    if (there) return b.say(`Sitzung geöffnet: ${name}`, "success", cx);
    if (at + 1 < SESSION_CHECKS.length) return watchSession(b, name, before, cx, at + 1);
    b.say(`Kein Tab „${name}“ erschienen; die Sitzung ist wohl nicht gestartet`, "warning", cx);
    notify({ title: "Sitzung nicht erschienen", body: name, level: "warning" });
  });
}

// ==== src/ui/modals/sessions.js ====

// What the second Enter asks before the start dialog where the item has
// sessions but none sure in a terminal (Board.startSession, secondEnter's
// ask): it names them, and offers to go to each one in a terminal, to
// start a new session anyway (the start dialog) or to cancel (Esc too);
// one in no terminal has no row to go to. Opened as b.modal = { kind:
// "sessions", view, item, sessions, at }; j/k and Enter, a digit or a click
// pick a row.

const goText = (s, depth) =>
  [s.label, ...(depth > 0 ? [sessionReasons(s)] : []), ...(depth > 1 && s.paneNumber ? [`Pane ${s.paneNumber}`] : [])].filter(Boolean).join(" · ");

function goDetail(s, all) {
  let depth = 0;
  while (depth < 2 && all.some((o) => o !== s && goText(o, depth) === goText(s, depth))) depth++;
  return goText(s, depth);
}

function choicesOf(m) {
  const there = m.sessions.filter(placed);
  return [
    ...there.map((session) => ({ go: session, name: "Zur Sitzung springen", detail: goDetail(session, there) })),
    { start: true, name: "Trotzdem neue Sitzung starten", detail: "" },
    { name: "Abbrechen", detail: "" },
  ];
}

function pickChoice(b, m, i, cx) {
  const choice = choicesOf(m)[i];
  if (!choice) return;
  b.closeModal(cx);
  if (choice.go) b.goToSession(choice.go, cx);
  else if (choice.start) startModal.open(b, m.view, m.item, cx);
}

const foundLine = (s) => [`${s.sure ? "●" : `${CANDIDATE_CHIP}:`} ${s.label}`, sessionReasons(s)].filter(Boolean).join(" · ");

export const sessionsModal = {
  open(b, view, item, sessions, cx) {
    b.modal = { kind: "sessions", view, item, sessions, at: 0 };
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "sessions",
      rowId: "sessions",
      width: 460,
      title: `Sitzung zu ${itemLabel(m.item)}`,
      head: [
        menuNote(t, "Keine Sitzung, die sicher daran arbeitet, in einem Terminal. Gefunden:", t.muted),
        ...m.sessions.map((s, i) => div().id(`sessions-found-${i}`).px(8).truncate().text_size(12).text_color(t.foreground).child(foundLine(s))),
      ],
      at: m.at,
      pick: (i, cx) => pickChoice(b, m, i, cx),
      rows: choicesOf(m).map((c) => [
        div().flex_none().child(c.name),
        div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(c.detail),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, choicesOf(b.modal).length, (i, cx) => pickChoice(b, b.modal, i, cx)),
};

// ==== src/kinds/rows.js ====

// A GitHub row as a saved state keeps it (a table's, an Issues tab's).

// GitHub's address of an issue or pull request.
export const itemUrl = (row) => `https://github.com/${row.repo}/${row.kind === "pr" ? "pull" : "issues"}/${row.number}`;

// A row without its itemId and without its url where that is GitHub's
// address of it; and such a row with its url back, its itemId null, as
// outside a project.
export const keptGithubRow = ({ itemId, url, ...row }) => ({ ...row, ...(url === itemUrl(row) ? {} : { url }) });
export const githubRowBack = (row) => ({ ...row, itemId: null, url: Object.hasOwn(row, "url") ? row.url : itemUrl(row) });

// ==== src/kinds/issues.js ====

// An Issues tab's view: its rows of the repos turned on, grouped by repo,
// the repo it shows alone (its solo repo) and the choices of its switch,
// the switches of its repo menu, whether its query left out other repos
// than it hides now, how a closed issue's row is marked, and the form its
// saved state takes.
// parseGithubIssues (sources/github.js) builds the data.

const foldedRepos = (repos) => repos.map(foldedName);

export const keptIssues = (data) => data.rows.filter((r) => !hidesRepo(data, r.repo));

// The repos turned off as the read began that are turned on now: their
// issues come with the next read.
export const waitingRepos = (data) => data.readHidden.filter((r) => !hidesRepo(data, r));

// Whether the read that `read` names the hidden repos of (a view's, or its
// data's readHidden) leaves out other repos than `hideRepos`.
export const readsOtherRepos = (read, hideRepos) => !sameNames(foldedRepos(read), foldedRepos(hideRepos));

// The repos the solo switch offers: those turned on with issues in the
// read, in the order their first row stands, each named as that row names
// it.
export function soloRepos(data) {
  const repos = new Map();
  for (const { repo } of keptIssues(data)) if (!repos.has(foldedName(repo))) repos.set(foldedName(repo), repo);
  return [...repos.values()];
}

const soloAmong = (repos, chosen) => (chosen ? repos.find((r) => foldedName(r) === foldedName(chosen)) ?? null : null);

// The solo switch with `chosen` the solo repo: its choices, „Alle“ (id
// null), then the repos soloRepos offers, each { id, label }; the one shown
// (chosen; null: all), and the one after it, past the last all again.
export function issueSoloSwitch(data, chosen) {
  const repos = soloRepos(data);
  const ids = [null, ...repos];
  const shown = soloAmong(repos, chosen);
  return {
    choices: ids.map((id) => ({ id, label: id === null ? "Alle" : id.split("/").pop() })),
    chosen: shown,
    after: ids[(ids.indexOf(shown) + 1) % ids.length],
  };
}

// How many issues a choice of the solo switch holds and `visible` lets
// through, by its id: { held, shown }.
export function soloCounts(data, visible) {
  const rows = keptIssues(data);
  const { switches } = countedSwitches(data, rows, visible);
  const all = { held: rows.length, shown: [...switches.values()].reduce((n, s) => n + s.shown, 0) };
  return (id) => {
    const { held, shown } = id === null ? all : switches.get(foldedName(id));
    return { held, shown };
  };
}

// Where the store keeps a view's solo repo, as long as the view switch's
// choice.
export const soloKey = (id) => `soloRepo:${id}`;

// A solo repo as the store kept it: a repo's name, else none.
export const storedSolo = (kept) => (isText(kept) ? kept : null);

export const soloRepoOf = (data, chosen) => soloAmong(soloRepos(data), chosen);

const groupOf = ({ repo, name }) => ({ id: `repo:${foldedName(repo)}`, name, color: "muted" });

// The lines of the list, in its order: with a solo repo its rows that
// `visible` lets through ({ row }); else per repo with such a row, where its
// first row stands, its group line ({ group, shown, held: how many of its
// rows show and how many it holds }) and those rows, then a group line per
// waiting repo ({ group, waiting: true }).
export function issueLines(data, visible, solo) {
  const rows = keptIssues(data);
  const alone = soloRepoOf(data, solo);
  if (alone) return rows.filter((r) => foldedName(r.repo) === foldedName(alone) && visible(r)).map((row) => ({ row }));
  const lines = [];
  for (const g of repoGroups(data, rows, visible)) {
    lines.push({ group: groupOf(g), shown: g.rows.length, held: g.held });
    lines.push(...g.rows.map((row) => ({ row })));
  }
  for (const repo of waitingRepos(data)) lines.push({ group: groupOf(repoLook(data, repo)), waiting: true });
  return lines;
}

// The switches of the repo menu, whose counts the list of the field
// „Repo:“ shows too: the repos with issues in the read, where their first
// row stands, then the owner's other repos turned on, by name, those
// waiting among them, then those turned off: {
// repo, name, foreign, hidden, held (its issues read; null for a repo
// turned off or waiting), shown (those `visible` lets through) }.
export function issueSwitches(data, visible) {
  const { switches, add } = countedSwitches(data, keptIssues(data), visible);
  const waiting = new Set(foldedRepos(waitingRepos(data)));
  for (const repo of [...data.repos, ...waitingRepos(data)]) if (!hidesRepo(data, repo)) add(repo, { held: waiting.has(foldedName(repo)) ? null : 0 });
  for (const repo of data.hideRepos) add(repo, { held: null });
  return [...switches.values()];
}

// The tone of a row's stripe: a closed issue's by the reason GitHub gives
// (stateReason), violet for completed, grey for any other, as GitHub draws
// them; none for an open one.
export const closedTone = (data, row) => (data.meta.state !== "closed" ? null : row.stateReason === "COMPLETED" ? COPPER_HUES.violet : "muted");

// The data as its saved state keeps it: its rows packed (packRows), each
// as keptGithubRow keeps it, without its contentId, its key; and that form
// read back.
export function savedIssues(data) {
  const { rows, ...rest } = data;
  return { ...rest, packed: packRows(rows.map(({ contentId, ...row }) => keptGithubRow(row))) };
}

export function issuesFromSaved(data) {
  const { packed, ...rest } = data;
  return { ...rest, rows: unpackRows(packed).map((row) => ({ ...githubRowBack(row), contentId: row.key })) };
}

// ==== src/ui/modals/solo.js ====

// The field „Repo:“ in the top bar of an Issues tab (Board.toolbar), its
// solo repo, and the list a click opens under it: „Alle“ and the repos of
// its solo switch (its shape's soloSwitch), each with how many of its
// issues show (soloCounts), the chosen one marked, as a dialog's choice list
// (ui/choices.js). Opened, the list is the dialog b.modal = { kind: "solo",
// view, field, list }; a pick shows that repo alone, or all for „Alle“
// (Board.setSoloRepo), and the list closes on a pick, Esc or a press beside
// it.

// The field's name among choice fields: no dialog has one so named.
const SOLO_FIELD = "solo";
const SOLO_ANCHOR = "top_left";

// „Repo:“ and a name of about 20 letters (claude-matrix-bridge) at the
// board's 13 px; a longer one is cut, so the filter beside it stays where it
// is while V steps.
export const SOLO_W = 220;

function soloNow(b, view) {
  const st = b.state(view.id);
  return st.data ? b.shape(view).soloSwitch(b, st) : null;
}

function soloEntries(b, view) {
  const solo = soloNow(b, view);
  if (!solo) return [];
  const data = b.state(view.id).data;
  const count = soloCounts(data, (r) => b.visible(r, data));
  return solo.choices.map(({ id, label }) => {
    const { shown, held } = count(id);
    return { id, name: label, aside: [shownOf(shown, held)] };
  });
}

const soloChoices = (b) => ({
  [SOLO_FIELD]: {
    entries: (m) => soloEntries(b, m.view),
    current: (m) => soloNow(b, m.view)?.chosen ?? null,
    take: (b, row, cx) => b.setSoloRepo(b.modal.view, row.id, cx),
    closes: true,
    placeholder: "Filter: Name des Repos",
    none: "Kein Repo passt zum Filter",
    width: 360,
    anchor: SOLO_ANCHOR,
  },
});

export function soloField(b, t, view, solo) {
  const name = solo.choices.find((c) => c.id === solo.chosen).label;
  const field = fieldBox(t, b.modal ?? {}, SOLO_FIELD)
    .id("solo-repo")
    .flex_none()
    .w(SOLO_W)
    .h(32)
    .gap(6)
    .items_center()
    .cursor_pointer()
    .on_click((_e, cx) => {
      if (!b.modal) soloModal.open(b, view, cx);
    })
    .child(div().flex_none().text_color(t.dim).child("Repo:"))
    .child(div().flex_1().min_w(0).truncate().child(name))
    .child(div().flex_none().text_color(t.dim).child("▾"));
  return listPopup(b, t, SOLO_FIELD, SOLO_ANCHOR, field, b.modal?.view?.id === view.id);
}

export const soloModal = {
  open(b, view, cx) {
    b.modal = { kind: "solo", view, field: SOLO_FIELD, list: null };
    openList(b, soloChoices(b), SOLO_FIELD, cx);
  },

  needsData: true,
  hint: LIST_HINT,
  keyboard: listKeyboard,
  key: (b, e, cx) => listKey(b, e, cx),
  render: (b) => listShield(b),
};

// ==== src/ui/modals/status.js ====

// The status menu: the columns a card may go to, or the states an item may
// take, picked with j/k and Enter, a digit, or a click; named after what it
// sets (Board.statusField). A shape with columns or states opens it
// (openStatusMenu) as b.modal = { kind: "status", view, key, targets, at }.

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
      title: `${b.statusField(m.view)} ändern`,
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
// on Esc unless it is busy, or unless its escape(b, cx) took Esc: Esc in the
// start or create dialog's open list closes only the list). A dialog keeps
// its state, and makes the inputs it needs, in b.modal; one that belongs to
// a view keeps it as b.modal.view, and a reload that finishes while it is
// open closes it when the config no longer has that view of that kind. One
// with needsData draws from the view's data as it is now (the solo, repo
// and column menus; the others draw from what they took as they opened), so
// a failed read that leaves the view no data closes it unless it is busy
// (Board.dataGone). A dialog with fields also has tab(b, back, cx), which
// Tab and shift-Tab (`back`) call to move between them (Board.tabKey).
// Optional: keys, the key bindings Board.bindKeys binds for it,
// keyboard(m), the input that takes the keyboard before its fields
// (Board.takeKeyboard), and hint, what the board's hint line says while it
// is open in place of the board's keys. A new dialog is a module here and
// its entry in MODALS.

export const MODALS = { start: startModal, status: statusModal, columns: columnsModal, create: createModal, assign: assignModal, commands: commandsModal, sprints: sprintsModal, sessions: sessionsModal, repos: reposModal, solo: soloModal };

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
// View fields it reads: id, source, layout (as writeAtOnce does), tab
// (the create dialog).

// The backlog shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const backlogState = (b) => b.shapeState.backlog;

const backlogColumns = (b, st) => backlogNav(st.data, b.filterText, b.mine);

// How the backlog finds an item, and where one no longer is: what its
// states and its assignments share.
const BACKLOG_LOOKUP = { find: findRow, where: "im Backlog" };
// How the backlog finds, changes and shows its items' states
// (actions/state.js). A state that landed is the item's own: nothing is
// read again for it.
const BACKLOG_STATES = { ...BACKLOG_LOOKUP, withState: withBacklogState, stateOf: (_data, item) => item.state, again: false };
// How the backlog finds and changes its items' assignees (actions/assign.js).
const BACKLOG_ASSIGN = { ...BACKLOG_LOOKUP, withItem: withRow };

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
    const rows = [["Sprint", item.sprint ?? "—"], ...(item.area ? [["Bereichspfad", item.area]] : []), ...(item.iteration ? [["Iteration", item.iteration]] : [])];
    return workItemDetail(b, t, view, { state: item.state, color: stateColor(st.data, item.state), title: "BACKLOG", rows });
  },
};

function drawBacklog(b, t, mono, view, st) {
  const data = st.data;
  const [col] = backlogColumns(b, st);
  const sessions = b.sessionsNow();
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
    const what = data.rows.length ? NOTHING_SHOWS : "Der Backlog ist leer";
    return v_flex().flex_1().min_h(0).child(head).child(div().p(20).text_color(t.muted).child(what));
  }
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, data.meta.typeColors?.[r.type]);
    return listRow(b, t, view, st, r)
      .py(7)
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

// A card moved to a hidden column leaves the board; the notice says so, and
// the selection, where it was on that card, stays in its column. A loader's
// move may answer { state, sendColumn }; a state written reads the view
// again.
export function moveCardTo(b, view, key, columnId, how, cx) {
  const st = b.state(view.id);
  const found = findCard(st.data, key);
  const to = st.data?.columns.find((c) => c.id === columnId);
  if (!found || !to) return b.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
  if (found.column.id === columnId) return;
  const label = itemLabel(found.card);
  const move = { key, from: found.column.id, to: columnId, at: Date.now(), confirmedAt: null };
  const hiddenNote = () => (st.hidden?.has(to.name) ? " (ausgeblendet)" : "");
  let wrote = null;
  writeAtOnce(b, view, {
    key,
    label,
    refuse: dropRefusal(st.data, found.card, to),
    apply() {
      const before = b.navColumns(view);
      st.moves.push(move);
      st.data = moveCard(st.data, key, columnId);
      if (to.hidden && st.sel?.key === key) reselectIn(b, view, before);
    },
    write: async () => (wrote = await b.loader(view).move(view, st.data, found.card, to)),
    landed: () => (move.confirmedAt = Date.now()),
    failed: () => (st.moves = st.moves.filter((m) => m !== move)),
    undo: () => (st.data = rollback(st.data, move)),
    open: { kind: "move", to: { id: to.id, name: to.name } },
    get again() {
      return Boolean(wrote?.state);
    },
    againOnRefusal: how.againOnRefusal,
    texts: {
      pending: () => `${label} → ${to.name}${hiddenNote()} …`,
      landed: () => (wrote?.state && !wrote.sendColumn ? `${label} hat jetzt den Status „${wrote.state}“` : `${label} steht jetzt in „${to.name}“${hiddenNote()}`),
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

// A list of lines drawn in its band (a table's, an Issues tab's): its state
// on the Board (windowedState), the scroll that shows a line (scrollToLine),
// whether the list left its band (linesLeftBand), and the list itself
// (windowedLines).
export function windowedState() {
  const scroll = ScrollHandle.new();
  return { scroll, band: bandState(), windowed: readsScroll(scroll) };
}

export function scrollToLine(s, heights, at) {
  if (s.windowed) {
    const { starts, content } = spanStarts(heights, 0);
    revealCard(s.band, scrollOf(s.scroll), content, starts[at], heights[at]);
  }
  s.scroll.scroll_to_item(at);
}

export const linesLeftBand = (s) => s.windowed && leftBand(s.band, scrollOf(s.scroll));

// The list `id` of `lines`, `heights` high: each line in its band drawn
// (draw), every other an empty frame of its height; `wheel` takes a wheel
// event over it first. Null for no lines, the band placed all the same.
export function windowedLines(s, id, lines, heights, draw, wheel = null) {
  const at = s.windowed ? scrollOf(s.scroll) : null;
  const layout = at && spanStarts(heights, 0);
  if (at) placeBand(s.band, layout.content, at);
  if (!lines.length) return null;
  const lineEl = (l, i) => (layout && !inBand(s.band, layout.starts[i], heights[i]) ? div().flex_none().h(heights[i]) : draw(l));
  return v_flex().id(id).flex_1().min_h(0).overflow_y_scrollbar().track_scroll(s.scroll)
    .when(s.windowed || Boolean(wheel), (el) => el.on_scroll_wheel((e, cx) => {
      if (wheel) wheel(e, cx);
      // GPUI moved the list before the event reached it.
      if (s.windowed && leftBand(s.band, scrollOf(s.scroll))) cx.notify();
    }))
    .children(lines.map(lineEl));
}

// ==== src/ui/shapes/board.js ====

// The board shape: a view's data as columns of cards, which a card moves
// between (H/L, the status menu, named after the column field, a drag),
// with swimlanes across them where the data has them. A hidden column is
// not drawn: the command menu's "Spalte ausblenden" hides the selected one,
// the line below the columns names the hidden ones and a click on a name
// shows it again; the command menu's "Spalten…" opens the column menu
// (modals/columns.js). The data: { shape: "board", meta, columns: [{ id,
// name, color, hidden, cardsNotRead (its read's query left its cards out),
// count, target, cards }], lanes ([{ id, name, color }], each card's `lane`
// one of them; null without), total, limited, viewer, count, partial
// (while later pages are still to come) }
// (parseGithubBoard). View fields it reads: id, source, layout, name and
// hide (the columns hidden by default).

// How the board finds and changes its cards' assignees (actions/assign.js).
const BOARD_ASSIGN = { find: (data, key) => findCard(data, key)?.card ?? null, withItem: withCard, where: "auf dem Board" };

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js).
const boardState = (b) => b.shapeState.board;
const columnLeft = (kept) => leftBand(kept.band, scrollOf(kept.scroll));

// By id, not place: a column coming in front (the no-value column, „Ohne
// <field>“) must not hand its neighbours their state; a state passed on
// starts anew, scrolled to the top.
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

const notHideable = (name) => `„${name}“ lässt sich nicht ausblenden`;

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
    const st = b.state(view.id);
    if (st.data?.lanes) return scrollToLaneCard(b, view, st, sel);
    const col = b.navColumns(view)[sel.col];
    const kept = columnKept(b, col.id);
    if (boardState(b).windowed) {
      const at = scrollOf(kept.scroll);
      const { heights, starts, content } = columnLayout(b, col, kept, at.width);
      revealCard(kept.band, at, content, starts[row], heights[row]);
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
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child(emptyText(st.data))),
  dirs: ["up", "down", "left", "right"],
  navigate: (b, view, st, dir) => (st.data?.lanes ? laneNavigate : navigate)(b.navColumns(view), st.sel, dir),
  loads: true,
  // H/L: the selected card one column on (`by` 1) or back (-1), hidden
  // columns too.
  move(b, view, st, by, cx) {
    const target = st.sel?.key && stepTarget(st.data, st.sel?.key, by);
    if (target) b.moveTo(view, st.sel?.key, target.id, cx);
  },
  canMove: (st, item, by) => hasStep(st.data, item.key, by),
  canHide: hideable,
  received: (data, st, view, before = st.data) => applyMoves(withOlderCards(withHidden(data, hiddenColumns(view)), before), st.moves),
  warnings: (view, data) => [
    ...unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
    ...view.hide.filter((n) => data.columns.some((c) => c.name === n && !hideable(c))).map(notHideable),
    ...(data.meta.ownColumn === false ? [`Ansicht „${view.name}“ nennt kein Feld für ihre Spalten: das Board nimmt „${data.meta.fieldName}“, wie GitHub`] : []),
    ...unreadableOrder(view, data.meta.unreadable ?? []),
  ],
  settle: (b, view, due, data, cx) =>
    tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, BOARD_ASSIGN)], cx),
  assign: BOARD_ASSIGN,
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, {}, cx),
  toggleColumn: (b, view, col, cx) => toggleBoardColumn(b, view, col, cx),
  openStatusMenu: (b, view) => openBoardStatusMenu(b, view),
  statusField: (b, view) => b.state(view.id).data?.meta?.fieldName ?? null,
  // The detail panel's rows of a card: its column as a pill, and the button
  // of the status menu ("<field> s").
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    const column = st.data ? findCard(st.data, item.key)?.column : null;
    if (!column) return {};
    const openStatus = (cx) => {
      if (!b.modal) b.openStatusMenu(view, cx);
    };
    return {
      chips: [statusPill(t, column.name, column.color, openStatus)],
      buttons: [button(t, "act-status", `${b.statusField(view)} s`, false, openStatus)],
    };
  },
};

const CARD_GAP = 6;
const COLUMN_GAP = 12;

// A card's height as a layout takes it: as measured at its list's card
// width, else guessed for a list `width` wide.
function heightOf(b, kept, card, width) {
  const m = boardState(b).heights.get(card.key);
  return m && (m.width === kept.cardWidth || !kept.cardWidth) ? m.height : cardHeightGuess(card, width);
}

function columnLayout(b, col, kept, listWidth) {
  const heights = col.shown.map((card) => heightOf(b, kept, card, listWidth));
  return { heights, ...spanStarts(heights, CARD_GAP) };
}

const MEASURE_SLACK = 2;

// A drawn card's measure, against the height its layout took for it.
function cardMeasure(b, kept, card, height) {
  return (size, cx) => {
    const measured = unzoomed(size.height);
    const width = unzoomed(size.width);
    boardState(b).heights.set(card.key, { height: measured, width });
    const resized = Boolean(kept.cardWidth) && width !== kept.cardWidth;
    kept.cardWidth = width;
    if (resized || Math.abs(measured - height) > MEASURE_SLACK) cx.notify();
  };
}

// Where a dragged card drops: a column, or above swimlanes its head and its
// cell in each band.
const dropOn = (b, view, ci, col) => (el) => el
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
  });

// What a board without a card says (noItemsText): with the view's filter,
// and with columns hidden the terms that leave them out.
function emptyText(data) {
  const hidden = data.columns.some((c) => c.hidden);
  return noItemsText(hidden ? data.meta?.query : data.meta?.filter, hidden ? " in den gezeigten Spalten" : "");
}

// A waiting column's count: GitHub's h<i> count, read while it was hidden.
function headCount(col) {
  if (waitsForCards(col)) return col.count === null ? "" : String(col.count);
  const filtered = col.cards.length - col.shown.length;
  return filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length);
}

function cardsComing(b, t, st) {
  const line = h_flex().flex_none().gap(8).text_size(12).text_color(t.muted);
  return st.loading ? line.child(spinner()).child("Lädt …") : line.child(`Karten nicht gelesen – ${b.keyShown("reload")} liest neu`);
}

function laneHeadCount(b, st, col) {
  if (!waitsForCards(col)) return headCount(col);
  const line = h_flex().gap(6);
  return st.loading ? line.child(spinner()).child(headCount(col)) : line.child(headCount(col)).child(`nicht gelesen – ${b.keyShown("reload")} liest neu`);
}

function drawBoard(b, t, mono, view, st) {
  const cols = b.navColumns(view);
  const sessions = b.sessionsNow();
  const dragged = b.drag ? findCard(st.data, b.drag.key)?.card : null;
  const { windowed } = boardState(b);
  const states = st.data.lanes ? [] : columnsKept(b, cols.map((c) => c.id));
  const columnEl = (col, ci) => {
    const filtered = col.cards.length - col.shown.length;
    const focusedCol = st.sel?.col === ci;
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    const ground = t.chrome;
    const head = columnHead(t, col, headCount(col), ground);
    const kept = states[ci];
    const at = windowed ? scrollOf(kept.scroll) : null;
    const layout = at && columnLayout(b, col, kept, at.width);
    if (at) placeBand(kept.band, layout.content, at);
    const whole = (card, measure) => drawCard(b, t, mono, view, st, card, col, ci, sessions, measure);
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
      .map(dropOn(b, view, ci, col))
      .child(head)
      .when(waitsForCards(col), (el) => el.child(cardsComing(b, t, st)))
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
            return inBand(kept.band, layout.starts[i], layout.heights[i]) ? whole(card, cardMeasure(b, kept, card, layout.heights[i])) : cardFrame(t, st, card, layout.heights[i]);
          }))
          .when(!col.shown.length && !waitsForCards(col), (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
      );
  };
  const body = () => {
    if (!cols.length) return div().p(20).text_color(t.muted).child(`Alle Spalten sind ausgeblendet: ein Name unten oder „${b.actionName("columns")}“ im Befehlsmenü (${b.keyShown("commands")}) zeigt eine wieder`);
    if (!st.data.partial && !st.data.columns.some((c) => c.cards.length) && !cols.some(waitsForCards)) return div().p(20).text_color(t.muted).child(emptyText(st.data));
    if (st.data.lanes) return drawLanes(b, t, mono, view, st, cols, sessions, dragged);
    return h_flex().id("columns").flex_1().min_h(0).gap(COLUMN_GAP).p(14).items_start().children(cols.map(columnEl));
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(body())
    .when(st.data.columns.some((c) => c.hidden), (el) => el.child(hiddenLine(b, t, view, st)))
    .when(Boolean(st.data.limited) && !st.data.partial, (el) =>
      el.child(div().px(16).pb(8).text_size(12).text_color(toneColor(t, NOTE_TONES.warning))
        .child(`Nur die ersten ${st.data.count} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
    );
}

// A board with swimlanes scrolls as one: the columns' heads above, then per
// swimlane its head and its rows (laneRows), each row as high as its
// highest card. Like a long column, it draws whole only the rows about its
// window (band.js), the others as an empty frame of their height.
const LANES = "lanes";
const LANE_HEAD = 26;
const LANE_GAP = 8;

// `cardHeight`: the height the layout takes for a card, which its measure
// checks.
function laneLayout(b, rows, kept, width, count) {
  const cardWidth = Math.max(60, ((width || LIST_W_GUESS * count) - COLUMN_GAP * (count - 1)) / Math.max(1, count));
  const cardHeight = (card) => heightOf(b, kept, card, cardWidth);
  const heights = rows.map((r) => (r.head ? LANE_HEAD : Math.max(...r.cards.map((c) => (c ? cardHeight(c) : 0)))));
  return { heights, cardHeight, ...spanStarts(heights, LANE_GAP) };
}

function scrollToLaneCard(b, view, st, sel) {
  const rows = laneRows(st.data.lanes, b.navColumns(view));
  const at = rows.findIndex((r) => !r.head && r.cards[sel.col]?.key === sel.key);
  if (at < 0) return;
  const kept = columnKept(b, LANES);
  if (boardState(b).windowed) {
    const where = scrollOf(kept.scroll);
    const layout = laneLayout(b, rows, kept, where.width, b.navColumns(view).length);
    revealCard(kept.band, where, layout.content, layout.starts[at], layout.heights[at]);
  }
  kept.scroll.scroll_to_item(at);
}

function drawLanes(b, t, mono, view, st, cols, sessions, dragged) {
  const [kept] = columnsKept(b, [LANES]);
  const { windowed } = boardState(b);
  const rows = laneRows(st.data.lanes, cols);
  const at = windowed ? scrollOf(kept.scroll) : null;
  const layout = at && laneLayout(b, rows, kept, at.width, cols.length);
  if (at) placeBand(kept.band, layout.content, at);
  const heads = h_flex().id("lane-heads").flex_none().gap(COLUMN_GAP).px(14).pt(14).children(cols.map((col, ci) => {
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    return div().id(`col-${ci}`).flex_1().min_w(0).rounded(10).border_1().border_color(target ? t.accent : t.border).bg(target ? dropBg(t, t.chrome) : t.chrome).p(6)
      .map(dropOn(b, view, ci, col))
      .child(columnHead(t, col, laneHeadCount(b, st, col), t.chrome));
  }));
  const rowEl = (row, i) => {
    if (row.head) {
      return groupHead(t, row.lane, String(row.count)).id(`lane-${row.lane.id}`).h(LANE_HEAD).px(4);
    }
    if (layout && !inBand(kept.band, layout.starts[i], layout.heights[i])) return div().flex_none().h(layout.heights[i]);
    return h_flex().flex_none().gap(COLUMN_GAP).items_start().children(row.cards.map((card, ci) => {
      const cell = div().id(`cell-${i}-${ci}`).flex_1().min_w(0).map(dropOn(b, view, ci, cols[ci]));
      return card ? cell.child(drawCard(b, t, mono, view, st, card, cols[ci], ci, sessions, layout ? cardMeasure(b, kept, card, layout.cardHeight(card)) : null)) : cell;
    }));
  };
  return v_flex().flex_1().min_h(0)
    .child(heads)
    .child(
      v_flex()
        .id(LANES)
        .flex_1()
        .min_h(0)
        .gap(LANE_GAP)
        .p(14)
        .overflow_y_scrollbar()
        .track_scroll(kept.scroll)
        .when(windowed, (el) => el.on_scroll_wheel((_e, cx) => {
          if (columnLeft(kept)) cx.notify();
        }))
        .children(rows.map(rowEl)),
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
  return 2 * (CARD.py + CARD.border) + spanStarts(lines, CARD.lineGap).content;
}

function drawCard(b, t, mono, view, st, card, col, ci, sessions, measure) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
  const type = typeChip(t, card);
  const labels = cardLabels(card);
  const line = typeLine(t, card, null, 6);
  const end = cardEnd(t, card, itemSessions(sessions, card)[0] ?? null, Boolean(st.pending[card.key]));
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
    .opacity(dragging || waitsForCards(col) ? 0.5 : st.pending[card.key] ? 0.7 : 1)
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

function toggleBoardColumn(b, view, col, cx) {
  const st = b.state(view.id);
  if (!st.data) return;
  if (!boardShape.canHide(col)) return b.say(notHideable(col.name), "info", cx);
  const before = { id: view.id, columns: b.navColumns(view) };
  b.changeSetting(hidePath(view), toggledHidden(b.viewById(view.id) ?? view, col), cx, before);
}

function openBoardStatusMenu(b, view) {
  const st = b.state(view.id);
  const card = b.selected(view);
  if (!card) return;
  const targets = targetsFor(st.data, card);
  const at = Math.max(0, targets.findIndex((c) => c.id === findCard(st.data, card.key)?.column.id));
  b.modal = { kind: "status", view, key: card.key, targets, at };
}

// ==== src/ui/shapes/issues.js ====

// The issues shape: an Issues tab's view, the owner's open or closed issues
// as one list walked as one column, grouped by repo under a group row with
// its name and count (kinds/issues.js, issueLines), or one repo's alone
// without one (its solo repo, the field „Repo:“ beside the view switch,
// ui/modals/solo.js). A row has its key, title, type and labels, session,
// milestone, assignees and age, a line across its top in its issue type's
// color, and on a closed issue a stripe at its left by why it was closed
// (closedTone). The repo menu (R) turns a repo off and on: the read leaves
// the repos turned off out, so one turned on waits for the next read, its
// group row with the spinner at the list's end. The list draws whole only
// the lines about where it stands (ui/band.js), as a table does. The data:
// parseGithubIssues's (sources/github.js). View fields it reads: id,
// settingsPath, hideRepos.

const issuesState = (b) => b.shapeState.issues;

const ISSUES_ASSIGN = { find: findRow, withItem: withRow, where: "in der Liste" };

// A row's and a group row's height: each is drawn this high, so the band
// needs no measure.
export const ISSUE_ROW_H = 34;
export const ISSUE_GROUP_H = 28;

const ISSUE_W = { key: 170, milestone: 140, assignees: 150, age: 70 };

const issueVisible = (b, data) => (r) => b.visible(r, data);
const issueLinesOf = (b, st) => issueLines(st.data, issueVisible(b, st.data), st.soloRepo);
const issueLineHeight = (line) => (line.row ? ISSUE_ROW_H : ISSUE_GROUP_H);
const issueNav = (b, st) => [{ id: "issues", shown: issueLinesOf(b, st).flatMap((l) => (l.row ? [l.row] : [])) }];

export const issuesShape = {
  state: windowedState,
  nav: issueNav,
  selected: (b, st) => issueNav(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo(b, view, sel) {
    const lines = issueLinesOf(b, b.state(view.id));
    const at = lines.findIndex((l) => l.row?.key === sel.key);
    if (at >= 0) scrollToLine(issuesState(b), lines.map(issueLineHeight), at);
  },
  bandsLeft: (b) => linesLeftBand(issuesState(b)),
  items: keptIssues,
  count(b, data) {
    const rows = keptIssues(data);
    return { shown: rows.filter(issueVisible(b, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawIssues(b, t, mono, view, st),
  dirs: ["up", "down"],
  loads: true,
  received(data, st, view) {
    const shown = withRepoView(data, view);
    if (!shown.partial && st.soloRepo && !soloRepoOf(shown, st.soloRepo)) {
      st.soloRepo = null;
      store.remove(soloKey(view.id));
    }
    return shown;
  },
  withView: withRepoView,
  readsAgain: (st, view) => readsOtherRepos(st.loading && st.readFor ? st.readFor.hideRepos : st.data.readHidden, view.hideRepos),
  toggleRepo: toggleRepoSetting,
  repoSwitches: (b, data) => issueSwitches(data, issueVisible(b, data)),
  soloSwitch: (b, st) => issueSoloSwitch(st.data, st.soloRepo),
  toSaved: savedIssues,
  fromSaved: issuesFromSaved,
  warnings: () => [],
  settle: (b, view, due, data, cx) => tellOutcomes(b, unclearAssignLines(due.filter((u) => u.kind === "assign"), data, ISSUES_ASSIGN), cx),
  assign: ISSUES_ASSIGN,
};

const issueCell = (t, w, text) => div().w(w).flex_none().truncate().text_size(12).text_color(t.muted).child(text);

function drawIssues(b, t, mono, view, st) {
  const data = st.data;
  const sessions = b.sessionsNow();
  const now = Date.now();
  const lines = issueLinesOf(b, st);
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, null);
    const tone = closedTone(data, r);
    const chips = [typeChip(t, r), ...r.labels.map((l) => labelChip(t, r, l))].filter(Boolean).map((c) => c.flex_none());
    return listRow(b, t, view, st, r, tone ? toneColor(t, tone) : t.background)
      .h(ISSUE_ROW_H)
      .child(div().w(ISSUE_W.key).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center().overflow_hidden()
        .child(div().min_w(0).truncate().child(r.title))
        .children(chips)
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .child(h_flex().w(ISSUE_W.milestone).flex_none().min_w(0).when(Boolean(r.milestone), (el) => el.child(toneChip(t, r.milestone, "muted").min_w(0).truncate())))
      .child(issueCell(t, ISSUE_W.assignees, r.assignees.join(", ")))
      .child(issueCell(t, ISSUE_W.age, ageLabel(r.updatedAt, now)))
      .when(Boolean(line), (el) => el.child(line));
  };
  const groupRow = (l) => {
    const head = groupHead(t, l.group, l.waiting ? "" : shownOf(l.shown, l.held)).id(`group-${l.group.id}`).h(ISSUE_GROUP_H).px(20);
    if (!l.waiting) return head;
    const said = div().text_size(12).text_color(t.muted);
    return st.loading ? head.child(spinner()).child(said.child("Lädt …")) : head.child(said.child(`nicht gelesen – ${b.keyShown("reload")} liest neu`));
  };
  const list = windowedLines(issuesState(b), "issue-rows", lines, lines.map(issueLineHeight), (l) => (l.row ? row(l.row) : groupRow(l)));
  const box = v_flex().id("issues-box").flex_1().min_h(0);
  if (!list) {
    const what = keptIssues(data).length ? NOTHING_SHOWS : data.partial ? null : data.meta.state === "closed" ? "Keine geschlossenen Issues" : "Keine offenen Issues";
    return box.when(Boolean(what), (el) => el.child(div().p(20).text_color(t.muted).child(what)));
  }
  const note = limitNote(t, data, `Nur die ersten ${data.count} von ${data.total} Issues`);
  return box.child(list).when(Boolean(note), (el) => el.child(note));
}

// ==== src/ui/shapes/placeholder.js ====

// The placeholder shape: what a view whose source reads nothing for it yet
// shows, the text of its kind (KINDS), or for a kind not there (a GitHub
// layout the board does not draw) that the board does not know its layout.
// It has no items, so Enter, o and the arrows are left to herdr. View
// fields it reads: source, layout, name.

export const placeholderShape = {
  nav: () => [],
  selected: () => null,
  scrollTo() {},
  count: () => null,
  render: (b, t, mono, view) => div().p(20).text_color(t.muted).child(kindOf(view)?.text?.(view) ?? `Ansicht „${view.name}“: Darstellung „${view.layout}“ kennt das Board nicht`),
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
// with a stripe of it at its left. Within a section the rows stand grouped
// by repo (kinds/list.js, repoGroups says which groups have a repo row),
// and nothing selects a repo row. The repo menu (R, modals/repos.js) turns
// a repo off and on; a repo turned off shows none of its pull requests.
// View fields it reads: id, settingsPath, hideRepos.

// The prs shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const prsState = (b) => b.shapeState.prs;

const sectionGroups = (b, data, s) => repoGroups(data, keptRows(data, s), (r) => b.visible(r, data));

const prsRows = (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => sectionGroups(b, st.data, s).flatMap((g) => g.rows)) }];

const keptAll = (data) => data.sections.flatMap((s) => keptRows(data, s));

export const prsShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
  nav: prsRows,
  selected: (b, st) => prsRows(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo: (b, view, sel) => scrollToRow(b, view, sel.key),
  items: keptAll,
  count(b, data) {
    const rows = keptAll(data);
    return { shown: rows.filter((r) => b.visible(r, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawPrs(b, t, mono, view, st),
  dirs: ["up", "down"],
  loads: true,
  enterHint: "Detail · Review",
  received: (data, _st, view) => withRepoView(data, view),
  withView: withRepoView,
  toggleRepo: toggleRepoSetting,
  repoSwitches: (b, data) => repoSwitches(data, (r) => b.visible(r, data)),
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
    if (item.attention?.length) sections.push(detailSection(t, "DU BIST DRAN", ...item.attention.map((reason) => div().text_color(markColor(t)).child(reason === NOTIFIED ? `${NOTIFIED} (GitHub-Benachrichtigung)` : reason))));
    if (item.checks) sections.push(checksSection(t, item.checks));
    sections.push(...(item.unread ?? []).map((text) => detailNote(t, "unread-note", text, "warning")));
    if (item.threadsPending) sections.push(detailNote(t, "pending-note", "Review-Threads werden noch gelesen …", "info"));
    return sections.length ? { sections } : {};
  },
};

export const NOTIFIED_PENDING = "GitHub-Benachrichtigungen werden noch gelesen …";

// Every row keeps the cell, so the cells after it line up.
export const THREADS_PENDING = "… Threads laden";
function attentionCell(t, r) {
  const cell = div().w(200).flex_none().truncate().text_size(12);
  const unsure = r.unread?.length ? ["?"] : r.threadsPending ? ["…"] : [];
  if (r.attention?.length) return cell.font_semibold().text_color(markColor(t)).child(`● ${[...r.attention, ...unsure].join(" · ")}`);
  return cell.text_color(t.muted).child(r.unread?.length ? "? nicht ganz gelesen" : r.threadsPending ? THREADS_PENDING : r.waiting ? "wartet auf Autor" : "");
}

// A section's count: the rows it holds (each pull request once, in its first
// section; results that are no pull request, those GitHub sent as null for
// an error, and those of repos turned off left out: `held`),
// "<shown>/<held>" while the filter or "nur meine" hides some; a section
// GitHub cut adds how many it sent of how many it found.
export function sectionCount(section, shown, held) {
  const cut = section.limited ? ` · erste ${section.fetched} von ${section.count}` : "";
  return `${shownOf(shown, held)}${cut}`;
}

function drawPrs(b, t, mono, view, st) {
  const now = Date.now();
  const row = (r, tone) =>
    listRow(b, t, view, st, r, toneColor(t, tone))
      .py(8)
      .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .child(attentionCell(t, r))
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.author)))
      // Every row keeps the draft cell, so the columns after it line up.
      .child(div().w(60).flex_none().text_size(12).text_color(t.muted).child(r.draft ? "Entwurf" : ""))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  const children = [];
  for (const [i, s] of st.data.sections.entries()) {
    const kept = keptRows(st.data, s);
    const groups = sectionGroups(b, st.data, s);
    const tone = s.color;
    children.push(
      div().id(`section-${i}`).flex_none().mt(8).px(20).py(3).bg(headBg(t, tone, t.background)).text_size(11).font_semibold().text_color(toneColor(t, tone))
        .child(`${s.name.toUpperCase()} · ${sectionCount(s, groups.reduce((n, g) => n + g.rows.length, 0), kept.length)}`),
    );
    for (const g of groups) {
      if (g.headed) children.push(repoRow(t, mono, `repo-head-${i}-${g.repo}`, g));
      children.push(...g.rows.map((r) => row(r, tone)));
    }
  }
  const list = v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(prsState(b).scroll).children(children);
  if (!st.data.notifiedPending) return list;
  return v_flex().flex_1().min_h(0).child(div().id("notified-pending").px(16).pt(6).text_size(12).text_color(toneColor(t, NOTE_TONES.info)).child(NOTIFIED_PENDING)).child(list);
}

function repoRow(t, mono, id, group) {
  return h_flex().id(id).flex_none().gap(8).px(20).pt(6).pb(2).items_center()
    .child(div().font_family(mono).text_size(11).text_color(t.muted).child(group.name))
    .child(div().text_size(11).text_color(t.dim).child(shownOf(group.rows.length, group.held)))
    .when(group.foreign, (el) => el.child(foreignChip(t)));
}

function scrollToRow(b, view, key) {
  const st = b.state(view.id);
  let child = 0;
  for (const s of st.data.sections) {
    child++; // the section's heading
    for (const g of sectionGroups(b, st.data, s)) {
      if (g.headed) child++;
      for (const r of g.rows) {
        if (r.key === key) return prsState(b).scroll.scroll_to_item(child);
        child++;
      }
    }
  }
}

// ==== src/ui/shapes/sprint.js ====

// The sprint shape: a team's sprint (its current one, or one the sprint picker
// chose) as a taskboard. One row per story (storyCell at the left), its tasks
// as cards in the team's taskboard columns (drawTask); a task's parent
// outside the sprint has a row too, its sprint beside its type, and tasks
// without a parent read stand in the row "Ohne Story". H/L move a task to
// the next column, s changes a story's or a task's state from its type's
// states (the status menu), Enter shows the details; both write at once
// (actions/move.js, actions/write.js). z (while the board has the
// keyboard), or a click on the triangle in a story's row, folds its tasks
// away and back (toggleStoryFold; foldsOf says where that is kept). Keys walk
// the stories, then each column's tasks but the folded ones (sprintNav,
// withoutFolded).
// Another sprint of the team shows through the sprint picker
// (ui/modals/sprints.js says what opens it; pickSprint, showSprint), and says
// so in the head ("nicht aktuell"); with no sprint running and none chosen the
// head says that, and no taskboard shows (sprintIs tells the three apart). The
// data: { shape: "sprint", meta: { iterationId, iteration, finish (all three
// null where no sprint runs and none is chosen), currentId (the team's
// current sprint's, null with none running), gone ({ id, name } of a
// chosen sprint the team no longer has, or null), typeStates, states,
// typeColors, unplaced, unknownColumns }, columns: [{ id, name, color,
// hidden, count, target, types, mappings, cards }], rows: [{ key, story
// (outside and sprint for a parent outside the sprint) }], viewer,
// noViewer, total, limited, limit } (sprintBoard, sources/azure/sprint.js).
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
// The state a move goes by may be out of date.
const SPRINT_MOVES = { againOnRefusal: true };

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
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, SPRINT_MOVES, cx),
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
      ...(item.area ? [["Bereichspfad", item.area]] : []),
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
  const sessions = b.sessionsNow();
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
    const what = sprintItems(data).length ? NOTHING_SHOWS : "Keine Work Items im Sprint";
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
      .children(col.shown.filter((card) => card.row === r.key).map((card) => drawTask(b, t, mono, view, st, card, ci + 1, col, sessions))))));
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
    ...(story.outside ? [toneChip(t, story.sprint ?? "ohne Sprint", NOTE_TONES.warning).flex_none()] : []),
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

function drawTask(b, t, mono, view, st, card, ci, col, sessions) {
  const selected = st.sel?.key === card.key;
  const line = typeLine(t, card, st.data.meta.typeColors?.[card.type], 6);
  const end = cardEnd(t, card, itemSessions(sessions, card)[0] ?? null, Boolean(st.pending[card.key]));
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

// ==== src/kinds/table.js ====

// A GitHub project's table: the rows its list walks, the lines it draws
// (group rows and item rows), a row's value of a field, a row placed anew
// after a change, its warnings and the form its saved state takes.
// parseGithubTable (sources/github.js) builds the data.

// The rows that `visible` lets through, in the table's order, as one list
// (navigate walks a list as one column).
export const tableNav = (data, visible) => [{ id: "table", name: data.meta.title, shown: data.rows.filter(visible) }];

// The lines of a table's list, in its order: without groups its rows that
// `visible` lets through ({ row }); with groups, before each group that
// holds such a row, its group row ({ group, shown, held: how many rows of
// it show and how many it holds }), then those rows.
export function tableLines(data, visible) {
  if (!data.groups) return data.rows.filter(visible).map((row) => ({ row }));
  const lines = [];
  for (const group of data.groups) {
    const held = data.rows.filter((r) => r.group === group.id);
    const shown = held.filter(visible);
    if (!shown.length) continue;
    lines.push({ group, shown: shown.length, held: held.length });
    lines.push(...shown.map((row) => ({ row })));
  }
  return lines;
}

// A row's value of the table's field `fieldAt` (its index in data.fields):
// its cell where the query read the field by name, else its card's as the
// card is now (cardValue); null for none, also for a field the board does
// not read.
export function tableValue(data, row, fieldAt) {
  const field = data.fields[fieldAt];
  if (field.from === "cell") return row.cells[fieldAt];
  return field.from === "card" ? cardValue(field, row) : null;
}

const fromCard = (field) => field?.from === "card";

// The data with the row `key`'s fields set to those of `patch`; where the
// view groups or sorts by a field the card holds, the rows are grouped and
// ordered anew by the cards as they are now.
export function withTableRow(data, key, patch) {
  const next = withRow(data, key, patch);
  const regroup = fromCard(data.groupBy);
  if (!regroup && !data.sortBy.some((s) => fromCard(s.field))) return next;
  const entries = next.rows.map((row) => {
    const value = (field, k) => (fromCard(field) ? cardValue(field, row) : { rank: row.ranks[k] });
    const entry = orderEntry(row.order, regroup ? data.groupBy : null, data.sortBy, value);
    return { row, ...entry, group: regroup ? entry.group : row.group };
  });
  const groups = regroup ? groupsOf(data.groupBy, entries) : data.groups;
  const rows = viewOrder(entries, groups, data.sortBy).map((e) => ({ ...e.row, ranks: e.ranks, ...(groups ? { group: e.group } : {}) }));
  return { ...next, groups, rows };
}

// The warnings of a table: the fields it shows that the board does not
// read, whose cells stay empty (one line), and its sort keys and group
// field of such a kind.
export function tableWarnings(view, data) {
  const blank = data.meta.blank ?? [];
  const named = blank.map((n) => `„${n}“`).join(", ");
  const shown = blank.length === 1
    ? [`Ansicht „${view.name}“ zeigt ${named}, ein Feld, das das Board nicht liest: es bleibt leer`]
    : blank.length ? [`Ansicht „${view.name}“ zeigt ${named}, Felder, die das Board nicht liest: sie bleiben leer`] : [];
  return [...shown, ...unreadableOrder(view, data.meta.unreadable ?? [])];
}

const spread = (prefix, list) => Object.fromEntries(list.map((v, i) => [`${prefix}${i}`, v]));
const gather = (row, prefix, count) => Array.from({ length: count }, (_, i) => row[`${prefix}${i}`] ?? null);

// A table's data as its saved state keeps it: its rows packed (packRows),
// each as keptGithubRow keeps it, each cell and sort key's rank a trait of
// its own, so that a value many rows hold is kept once; and that form read
// back, each row's itemId its key.
export function savedTable(data) {
  const { rows, ...rest } = data;
  const kept = rows.map(({ cells, ranks, ...row }) => ({ ...keptGithubRow(row), ...spread("cell:", cells), ...spread("rank:", ranks) }));
  return { ...rest, packed: packRows(kept) };
}

export function tableFromSaved(data) {
  const { packed, ...rest } = data;
  const rows = unpackRows(packed).map((kept) => {
    const row = Object.fromEntries(Object.entries(kept).filter(([name]) => !name.includes(":")));
    return { ...githubRowBack(row), itemId: row.key, cells: gather(kept, "cell:", data.fields.length), ranks: gather(kept, "rank:", data.sortBy.length) };
  });
  return { ...rest, rows };
}

// ==== src/ui/shapes/table.js ====

// The data: parseGithubTable's (sources/github.js). View fields it reads:
// id and name.

const tableState = (b) => b.shapeState.table;

const TABLE_ASSIGN = { find: findRow, withItem: withTableRow, where: "in der Tabelle" };

// A row's and a group row's height: each is drawn this high, so the band
// needs no measure.
export const TABLE_ROW_H = 32;
export const TABLE_GROUP_H = 28;

// A field's width, its head's and its cells', by the field's kind; the
// title takes the rest, at least TITLE_MIN_W.
export const FIELD_W = {
  SINGLE_SELECT: 120, ITERATION: 120, NUMBER: 70, DATE: 80, TEXT: 160, ASSIGNEES: 150, LABELS: 200, MILESTONE: 120, REPOSITORY: 130,
  PARENT_ISSUE: 180, SUB_ISSUES_PROGRESS: 80, LINKED_PULL_REQUESTS: 70, ISSUE_TYPE: 100,
};
const OTHER_W = 100;
const TITLE_MIN_W = 200;
const fieldWidth = (field) => FIELD_W[field.type] ?? OTHER_W;
const TABLE_PAD = { left: ROW_BORDER + ROW_PAD, right: ROW_PAD };

export function fieldStrip(fields, width) {
  const widths = fields.map(fieldWidth);
  const { starts: lefts, content } = spanStarts(widths, ROW_GAP);
  const start = TABLE_PAD.left + TITLE_MIN_W + ROW_GAP;
  const viewport = width - start - TABLE_PAD.right;
  if (!(viewport > 0) || content <= viewport) return null;
  return { widths, lefts, content, viewport, start };
}

const stripOf = (s, data) => fieldStrip(data.fields.slice(1), s.width);

export function stripRange(strip, offset) {
  const { lefts, widths, viewport } = strip;
  const from = lefts.findIndex((x, i) => x + widths[i] > offset);
  const to = lefts.findIndex((x) => x >= offset + viewport);
  return { from, to: to < 0 ? lefts.length : to };
}

export function stripStep(strip, offset, by) {
  const next = by > 0 ? strip.lefts.find((x) => x > offset) ?? Infinity : strip.lefts.filter((x) => x < offset).at(-1) ?? 0;
  return clampOffset(next, strip.content, strip.viewport);
}

function stripOffset(s, view, strip) {
  const offset = clampOffset(s.stripAt.get(view.id) ?? 0, strip.content, strip.viewport);
  s.stripAt.set(view.id, offset);
  return offset;
}

function stripWheel(s, view, strip) {
  return (e, cx) => {
    const by = sideMove(e);
    if (!by) return;
    // GPUI scrolls a list that scrolls only vertically by a sideways move too.
    cx.stop_propagation();
    const from = stripOffset(s, view, strip);
    const to = clampOffset(from + by, strip.content, strip.viewport);
    if (to === from) return;
    s.stripAt.set(view.id, to);
    cx.notify();
  };
}

const visibleIn = (b, data) => (r) => b.visible(r, data);
const linesOf = (b, data) => tableLines(data, visibleIn(b, data));
const lineHeight = (line) => (line.row ? TABLE_ROW_H : TABLE_GROUP_H);

export const tableShape = {
  state: () => ({ ...windowedState(), width: 0, stripAt: new Map() }),
  nav: (b, st) => tableNav(st.data, visibleIn(b, st.data)),
  selected: (b, st) => tableNav(st.data, visibleIn(b, st.data))[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo(b, view, sel) {
    const lines = linesOf(b, b.state(view.id).data);
    const at = lines.findIndex((l) => l.row?.key === sel.key);
    if (at >= 0) scrollToLine(tableState(b), lines.map(lineHeight), at);
  },
  bandsLeft: (b) => linesLeftBand(tableState(b)),
  items: (data) => data.rows,
  count: (b, data) => ({ shown: data.rows.filter(visibleIn(b, data)).length, total: data.rows.length }),
  render: (b, t, mono, view, st) => drawTable(b, t, mono, view, st),
  dirs: ["up", "down"],
  sideways(b, view, by) {
    const s = tableState(b);
    const strip = stripOf(s, b.state(view.id).data);
    if (strip) s.stripAt.set(view.id, stripStep(strip, stripOffset(s, view, strip), by));
  },
  loads: true,
  received: (data) => data,
  toSaved: savedTable,
  fromSaved: tableFromSaved,
  warnings: tableWarnings,
  settle: (b, view, due, data, cx) => tellOutcomes(b, unclearAssignLines(due.filter((u) => u.kind === "assign"), data, TABLE_ASSIGN), cx),
  assign: TABLE_ASSIGN,
};

const textCell = (t, text) => div().min_w(0).truncate().text_color(t.muted).child(text);

// A cell's look by its field's kind, for a value (tableValue); a kind not
// here shows the value's name.
const CELLS = {
  SINGLE_SELECT: (t, value) => toneChip(t, value.name, value.color ?? "muted").min_w(0).truncate(),
  DATE: (t, value) => textCell(t, dayText(value.name, new Date().getFullYear()) ?? value.name),
  LABELS: (t, _value, row) => h_flex().min_w(0).gap(5).overflow_hidden().children(row.labels.map((l) => labelChip(t, row, l).flex_none())),
  MILESTONE: (t, value) => toneChip(t, value.name, "muted").min_w(0).truncate(),
  ISSUE_TYPE: (t, _value, row) => typeChip(t, row),
};
const nameCell = (t, value) => textCell(t, value.name);

function stripBox(strip, offset, kid) {
  const { from, to } = stripRange(strip, offset);
  const kids = Array.from({ length: to - from }, (_, k) => kid(from + k));
  return h_flex().flex_none().w(strip.viewport).overflow_hidden().items_center()
    .child(h_flex().flex_none().relative().left(strip.lefts[from] - offset).gap(ROW_GAP).items_center().children(kids));
}

function stripBar(t, strip, offset, wheel) {
  const thumb = thumbOf({ offset, content: strip.content, viewport: strip.viewport });
  return div().id("table-strip-bar").flex_none().relative().h(3).w(strip.viewport).ml(strip.start).mt(4).mb(6).on_scroll_wheel(wheel)
    .child(div().id("table-strip-thumb").absolute().top(0).left(thumb.start).w(thumb.length).h(3).map(thumbLook(t)));
}

function drawTable(b, t, mono, view, st) {
  const data = st.data;
  const s = tableState(b);
  const sessions = b.sessionsNow();
  const lines = linesOf(b, data);
  const rest = data.fields.slice(1);
  const strip = stripOf(s, data);
  const offset = strip ? stripOffset(s, view, strip) : 0;
  const wheel = strip && stripWheel(s, view, strip);
  const fieldKids = (kid) => (strip ? [stripBox(strip, offset, kid)] : rest.map((_f, i) => kid(i)));
  const titleBox = (el) => (strip ? el.w(TITLE_MIN_W).flex_none() : el.flex_1().min_w(TITLE_MIN_W));
  const takesSideWheel = (el) => el.when(Boolean(wheel), (e) => e.on_scroll_wheel(wheel));
  const head = h_flex().id("table-head").flex_none().gap(ROW_GAP).pl(TABLE_PAD.left).pr(TABLE_PAD.right).pt(10).pb(6).text_size(11).text_color(t.dim)
    .map(takesSideWheel)
    .child(titleBox(div()).truncate().child(data.fields[0]?.name ?? "Title"))
    .children(fieldKids((i) => div().id(`table-field-${i + 1}`).w(fieldWidth(rest[i])).flex_none().truncate().child(rest[i].name)));
  const cell = (i, r) => {
    const f = rest[i];
    const value = tableValue(data, r, i + 1);
    const content = value ? (CELLS[f.type] ?? nameCell)(t, value, r) : null;
    return h_flex().w(fieldWidth(f)).flex_none().min_w(0).overflow_hidden().items_center().text_size(12).when(Boolean(content), (el) => el.child(content));
  };
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, null);
    return listRow(b, t, view, st, r)
      .h(TABLE_ROW_H)
      .map(takesSideWheel)
      .child(titleBox(h_flex()).gap(6).items_center()
        .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
        .child(div().min_w(0).truncate().child(r.title))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .children(fieldKids((i) => cell(i, r)))
      .when(Boolean(line), (el) => el.child(line));
  };
  const groupRow = (g) => groupHead(t, g.group, shownOf(g.shown, g.held)).id(`group-${g.group.id}`).h(TABLE_GROUP_H).px(TABLE_PAD.left).map(takesSideWheel);
  const list = windowedLines(s, "table-rows", lines, lines.map(lineHeight), (l) => (l.row ? row(l.row) : groupRow(l)), wheel);
  const box = v_flex().id("table-box").flex_1().min_h(0)
    .on_size_change((size, cx) => {
      const width = unzoomed(size.width);
      if (width === s.width) return;
      s.width = width;
      cx.notify();
    })
    .child(head);
  if (!list) {
    const what = data.rows.length ? NOTHING_SHOWS : data.partial ? null : noItemsText(data.meta.filter);
    return box.when(Boolean(what), (el) => el.child(div().p(20).text_color(t.muted).child(what)));
  }
  const note = limitNote(t, data, `Nur die ersten ${data.count} von ${data.total} Einträgen; den Filter enger fassen`);
  return box
    .child(list)
    .when(Boolean(strip), (el) => el.child(stripBar(t, strip, offset, wheel)))
    .when(Boolean(note), (el) => el.child(note));
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
// (data, st, view: the data as kept after a refresh, `view` as the config
// has it now) and warnings; and where it has them,
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
// has none), bandsLeft (b: whether a column or list scrolled past the items
// it drew whole, which the Board asks every BAND_MS), toSaved and fromSaved
// (data: the data as its saved state keeps it, and back), detailParts (its
// rows in the detail panel), settle (b, view, due, data, cx: says how the
// unclear writes of its items ended up), withView (data, view: the data as
// the view's settings show it now, the same data where they change nothing
// for it), toggleRepo (b, view, repo, cx: turns a repo off or on, beside the
// repo menu, ui/modals/repos.js, which lists its repoSwitches (b, data)),
// readsAgain (st, view: whether the view's settings now leave other repos
// out of its query than its data or the read under way did, which reads it
// again), soloSwitch (b, st: { choices ({ id, label }), chosen, after: the
// choice V picks }, the field „Repo:“ beside the view switch and its list,
// ui/modals/solo.js, Board.setSoloRepo), moveTo, toggleColumn,
// openStatusMenu with statusField (b, view: the name of what the status menu
// sets, where it is not the status; null for none), navigate (its own
// keyboard movement in place of navigate's, select.js), sideways (b, view,
// by: h/l and the left and right arrows where its dirs leave them out, its
// view scrolled sideways one step; by = 1 for l/→, -1 for h/←), pickStatus
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

export const SHAPES = { board: boardShape, issues: issuesShape, prs: prsShape, sprint: sprintShape, backlog: backlogShape, table: tableShape, placeholder: placeholderShape };

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
// From the application root (gpui-kit's svg).
export const REFRESH_ICON = "mods/board/refresh.svg";
// on_mouse_down_out fires for each of them.
const OUTSIDE_BUTTONS = ["left", "right", "middle", "back", "forward"];
// How often a copy looks whether it shows (watchShown). herdr draws, and so
// renders, only a copy that shows, again on a change of its live data (spaces
// and tabs, the focus, shared state); a change of the layout alone is not
// documented to render it, while its timers run when it is hidden too. So no
// render sees the copy be hidden, and none may come when it comes to show:
// this timer sees both, and a render that comes first sees the show too.
export const WATCH_MS = 250;
// How often a copy that shows reads the Claude sessions again (readClaude),
// and how long each run of sh for them may take.
export const CLAUDE_MS = 15000;
const CLAUDE_TIMEOUT_MS = 10000;
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
// action of its own. Of the matching bindings, the one in the deepest key
// context wins, so a binding in the key context of the board's root comes
// first (the leader mod binds the same way and says more:
// mods/leader/main.js, KEY_CONTEXT). The root carries that key context
// only while the board takes Tab (takesTab), and a binding matches only in
// a key context on the path to what has the keyboard, so otherwise herdr's
// own Tab runs as before. That matters: herdr's AppWindow runs every
// action the board does not stop as a command of its own, and says
// "unknown command" for one it does not know (herdr's src/window.rs, its
// ShellAction listener and run). Each action runs tabKey, the one place
// that says what Tab does on the board.
export const BOARD_KEY_CONTEXT = "Board";
export const BOARD_KEYS = [
  { keystroke: "tab", action: "board_tab", back: false },
  { keystroke: "shift-tab", action: "board_shift_tab", back: true },
];

// What a key names with the `g` before it (`g`: one came just before): the
// end gg, G, Home and End go to ("top", "bottom"), "pending" for a first g,
// g and a digit as the key "g<digit>" of an action (commands.js), null for
// any other key. g and G are the letter keys keyName (commands.js) names, so
// that Caps Lock changes no key. No key of the board or of keys.json is a
// bare g, G, Home or End.
export function jumpKey(k, ch, mod, g) {
  if (mod.control || mod.alt || mod.platform) return null;
  if (k === "home") return "top";
  const name = keyName(k, ch, mod);
  if (k === "end" || name === "G") return "bottom";
  if (g && /^[1-9]$/.test(name ?? "")) return `g${name}`;
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
    // views.json's text, this machine's settings file as last read, or as
    // the board's latest change makes it ({ text } or { error }), what
    // readConfig applied of it and its move of them, and the view kinds of
    // the last valid config.
    this.configState = { text: null, settingsRead: null, settings: null, origin: () => ORIGIN.builtin, moving: null, kinds: null };
    this.settingsWrites = Promise.resolve();
    this.views = {}; // per view id, see state()
    this.prefetchWaits = false;
    this.prefetchLeft = new Set();
    // What the top bar shows, as last chosen: the context, its tab (a tab
    // id) per context, the view per team tab and per project tab, and "nur
    // meine"; and what the board knows of each GitHub project (learnProject).
    this.contextId = store.get("context");
    this.tabIds = {};
    this.tabViews = {};
    this.projectMetas = new Map();
    this.known = { get: (id) => this.metaOf(id) };
    this.mine = store.get("mine") === true;
    this.filterText = "";
    this.filtering = false;
    this.modal = null; // a dialog: { kind, … }, its kind a key of MODALS
    this.notice = null; // { text, level }
    this.drag = null; // { key, from, at }: `at` where it was pressed
    this.pressedOut = null; // { button, at }: a press outside the layer's board (pressOutside)
    this.over = null; // the column index under a drag
    this.paths = toolPaths(exec);
    this.sources = makeSources(this.paths);
    // Loaders asked to refresh while one of their views (together) read; a per-view `again` would make the views restart one another.
    this.againTogether = new Set();
    // What each shape keeps per Board, by shape name (state(),
    // shapes/index.js).
    this.shapeState = Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [name, shape.state?.() ?? {}]));
    // What the related items' lines keep (ui/related.js), and the details
    // panel's keyboard while it has it (panelOf).
    this.relatedUi = relatedState();
    this.panel = null;
    // Whether the last key was a `g` (jumpKey).
    this.afterG = false;
    this.claude = null;
    this.claudeReading = false;
    this.claudeSeen = null;
    this.drawnSessions = null;
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
          if (command !== "focus") return;
          // board.focus may show again a board that missed the release of an
          // older press.
          this.pressedOut = null;
          if (boardShown(this.isLayer())) this.takeKeyboard();
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
      this.guarded("Sitzungen", () => boardShown(this.isLayer()) && this.followSessions(cx));
    });
    cx.timer.every(CLAUDE_MS, (cx) => this.guarded("Sitzungen", () => boardShown(this.isLayer()) && this.readClaude(cx)));
    this.reload(cx);
    this.readClaude(cx);
  }

  // At init, and again after a load of keys.json dropped the bindings (the
  // message's Enter finds them gone: start.js), as the leader does
  // (mods/leader/main.js, bindKeys: each bind adds entries, and a load of
  // keys.json drops them all). A failure leaves the rest of the board
  // working and says why.
  bindKeys(cx) {
    const keys = [
      ...BOARD_KEYS.map(({ keystroke, action }) => ({ keystroke, action, context: BOARD_KEY_CONTEXT })),
      ...Object.values(MODALS).flatMap((d) => d.keys ?? []),
    ];
    const strokes = keys.map((k) => k.keystroke.replace(/[a-z]+$/, (key) => key[0].toUpperCase() + key.slice(1)));
    const names = `${strokes.slice(0, -1).join(", ")} und ${strokes.at(-1)}`;
    try {
      const count = cx.bind_keys(keys);
      if (count !== keys.length) {
        notify({ title: `Board: ${names} nicht alle gebunden`, body: `${count} von ${keys.length} Bindungen angelegt`, level: "error" });
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
    return !this.filtering && this.panelTakes(this.detailsRoot());
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
  // hidden (the hidden set), sel ({ col, key }, null before the first data),
  // picked (the key of the item the person chose, see clickItem), want (an
  // item to choose once a refresh has it: chooseWanted), related (by item
  // key: readRelated), folds (as the store keeps them: readStoredFolds) and
  // chosenFolds (in the sprints the sprint picker chose, by their id:
  // foldsOf), sprint (the sprint a Sprint view shows in place of the current
  // one, { id, name } as the sprint picker chose it, null for the current
  // one; never stored), saved (the data drawn is the saved state, or what a
  // read drew over it so far), restored (the saved state was looked for),
  // unsaved (why the store did not take its last read: UNSAVED; null where
  // it did), progress ({ page, pages }), unavailable (the last read since
  // views.json was read found its source unavailable), readFor (the view as
  // the read under way, or the last, reads it) and soloRepo (the repo an
  // Issues tab's view shows alone, null for all; soloKey).
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, warnings: [], moves: [], pending: {}, unclear: [],
      hidden: null, sel: null, picked: null, runs: 0, want: null, detail: false,
      related: new Map(), folds: readStoredFolds(store.get(`folded:${id}`)), chosenFolds: new Map(), sprint: null,
      saved: false, restored: false, unsaved: null, progress: null, unavailable: false, readFor: null, soloRepo: storedSolo(store.get(soloKey(id))),
    };
    return this.views[id];
  }

  contexts() {
    return contextsOf(this.config, this.known);
  }

  viewsNow() {
    return viewsOf(this.config ?? {}, this.known);
  }

  // What the board knows of a GitHub project by its tab's id, from its last
  // read, kept in the store ("project:<tab>"); null before any.
  metaOf(id) {
    if (!this.projectMetas.has(id)) this.projectMetas.set(id, readProjectMeta(store.get(projectKey(id))));
    return this.projectMetas.get(id);
  }

  // What a read of a project's view learnt of the project (live.project, or
  // an error's project): kept, and where its views changed, the views that
  // came are read once in the background (the prefetch); a view GitHub
  // dropped that its tab showed is said, and an error of the view that
  // learns the project's views is gone. The view that learns a project's
  // views (projectView without one shown) becomes the view it read, its
  // state with it, where that view reads items and has no data yet; else
  // that read ends, and the view, where it reads items and its tab shows,
  // is read on its own. Where the tab shows another view than the one read
  // (one GitHub dropped, or one the prefetch read), that one is read where
  // it has no data yet and its tab shows. A read of a tab gone ends. → the
  // view to read on (live.project).
  learnProject(view, meta, cx) {
    const tab = view.tab;
    const before = this.tabById(tab.id);
    if (!before) return false;
    const shownBefore = this.tabViewOf(before);
    const first = this.views[firstViewId(tab)];
    if (first) first.error = null;
    if (JSON.stringify(this.metaOf(tab.id)) !== JSON.stringify(meta)) {
      this.projectMetas.set(tab.id, meta);
      store.set(projectKey(tab.id), meta);
      const kinds = this.takeKinds();
      for (const id of this.configState.kinds.keys()) if (!kinds.has(id)) this.prefetchLeft.add(id);
      this.schedulePrefetch(cx);
    }
    const now = this.viewFor(this.tabById(tab.id));
    const number = view.address.view;
    const read = number ?? view.wanted;
    if (read !== null && read === shownBefore && !meta.views.some((v) => v.number === read) && now.id !== view.id) {
      this.say(`Ansicht ${read} gibt es in „${meta.title}“ nicht mehr; gezeigt wird „${now.name}“`, "warning", cx);
    }
    if (now.id === view.id) return null;
    cx.notify();
    if (number !== null) {
      const st = this.state(now.id);
      if (this.tab()?.id === tab.id && this.loader(now) && !st.loading && !st.data) this.refresh(now, cx);
      return null;
    }
    const st = this.views[now.id];
    const moves = Boolean(this.loader(now)) && !st?.data && !st?.loading;
    if (moves) {
      this.views[now.id] = this.state(view.id);
      this.prefetchLeft.delete(now.id);
    }
    delete this.views[view.id];
    if (moves) return now;
    if (this.loader(now) && this.tab()?.id === tab.id) this.refresh(now, cx);
    return false;
  }

  tabById(id) {
    return this.contexts().flatMap((c) => c.tabs).find((t) => t.id === id) ?? null;
  }

  // The context the top bar shows (null without a valid views.json), its
  // tabs and the shown one.
  context() {
    return pick(this.contexts(), this.contextId);
  }

  tabs() {
    return this.context()?.tabs ?? [];
  }

  tab() {
    const context = this.context();
    if (!context) return null;
    this.tabIds[context.id] ??= store.get(`tab:${context.id}`);
    return pick(context.tabs, this.tabIds[context.id]);
  }

  // The view a tab with views shows, by its id (one of TEAM_VIEWS or
  // ISSUE_VIEWS; a project's view by its number): the one chosen last on
  // this machine where the tab has it, else its first; for a project the
  // board knows none of the views of, the one chosen last.
  tabViewOf(tab) {
    this.tabViews[tab.id] ??= store.get(tabViewKey(tab));
    return tab.views.length ? tabView(tab, this.tabViews[tab.id]) : this.tabViews[tab.id];
  }

  // The view a tab shows (one with views, hasViews: the view it shows).
  viewFor(tab) {
    return viewOf(tab, hasViews(tab) ? this.tabViewOf(tab) : null);
  }

  // The view the shown tab holds, or null.
  view() {
    const tab = this.tab();
    return tab ? this.viewFor(tab) : null;
  }

  // A view as the config has it now, by id; null when it is gone.
  viewById(id) {
    return this.viewsNow().find((v) => v.id === id) ?? null;
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
    st.hidden = hiddenColumns(view);
    return st.hidden;
  }

  settingsFile() {
    return settingsFileIn(appHome());
  }

  settingsName() {
    const file = this.settingsFile();
    const own = home();
    return own && file.startsWith(`${own}/`) ? `~${file.slice(own.length)}` : file;
  }

  // True when the config has views.
  takeConfig() {
    const c = this.configState;
    const read = c.settingsRead && { name: this.settingsName(), ...c.settingsRead };
    ({ config: this.config, errors: this.configErrors, settings: c.settings, origin: c.origin, moving: c.moving = null } = readConfig(c.text, read));
    if (!this.config) return false;
    this.takeKinds();
    this.moveShownSource();
    return true;
  }

  // The view kinds as the config and what the board knows of its projects
  // give them now: a view whose kind changed drops its open outcomes, and a
  // dialog of a view that has another kind now closes. → the kinds before
  // (none before the first valid config: no view has a state to compare).
  takeKinds() {
    const c = this.configState;
    const kinds = new Map(this.viewsNow().map((v) => [v.id, viewKind(v)]));
    const before = c.kinds ?? kinds;
    for (const [id, st] of Object.entries(this.views)) if (kinds.get(id) !== before.get(id)) st.unclear = [];
    c.kinds = kinds;
    const m = this.modal;
    if (m?.view && kinds.get(m.view.id) !== viewKind(m.view)) this.modal = null;
    return before;
  }

  // A view whose data is gone (`st` its state): no selection, and its
  // dialog that draws from that data closes, unless it is busy.
  dataGone(view, st) {
    Object.assign(st, { sel: null, picked: null, detail: false });
    const m = this.modal;
    if (m?.view?.id !== view.id || !MODALS[m.kind].needsData || m.busy) return;
    this.modal = null;
    this.takeKeyboard();
  }

  moveShownSource() {
    const contexts = this.contexts();
    const { set, remove } = shownContextMoves(contexts, (key) => store.get(key), !this.configErrors.length);
    for (const [key, value] of set) store.set(key, value);
    for (const key of remove) store.remove(key);
    this.contextId = store.get("context") ?? firstContextOf(contexts, store.get("source"))?.id ?? null;
  }

  // `built`: the file's text the move was made over. A file that holds
  // nothing of the form before the contexts any more was moved meanwhile.
  moveSettings(move, built, cx) {
    const name = this.settingsName();
    const moved = move.moved.length ? move.moved.map(([from, to]) => `${pathText(from)} → ${pathText(to)}`).join(", ") : `das leere ${pathText(["sources", "github", "views"])} entfernt`;
    const step = (fresh) => {
      if (fresh === built) return { text: settingsText(move.settings) };
      const { settings } = readSettings(fresh, name);
      return settings && !settingsBeforeContexts(settings) ? { text: fresh } : { why: CHANGED_SINCE };
    };
    const words = { refused: (why) => `${name} nicht auf die Kontexte umgestellt: ${why}; ${MOVE_AGAIN}`, stale: CHANGED_SINCE, done: `${name} auf die Kontexte umgestellt: ${moved}` };
    return this.queueSettingsWrite((cx) => this.writeSettingsFile(step, words, cx), cx);
  }

  async readSettingsFile() {
    this.configState.settingsRead = await readTextFile(this.settingsFile()).then(
      (text) => ({ text }),
      (e) => ({ error: firstLine(e?.message ?? e) }),
    );
  }

  origin(path) {
    return this.configState.origin(path);
  }

  // `before`: { id, columns }, the shown columns of a view whose selection
  // follows (reselectIn). Resolves to whether the file has the changes.
  changeSettings(changes, cx, before = null) {
    const name = this.settingsName();
    const c = this.configState;
    const read = c.settingsRead;
    const after = read && !("error" in read) ? settingsAfter(read.text, changes, name, nameKeyAt) : null;
    const why = !read
      ? `${name} ist noch nicht gelesen`
      : "error" in read
        ? `${name} ließ sich nicht lesen: ${read.error}`
        : after.error ?? (c.settings ? null : settingsAlone(name));
    if (why) {
      this.say(`Nicht geändert: ${why}`, "error", cx);
      return Promise.resolve(false);
    }
    const built = read.text;
    c.settingsRead = { text: after.text };
    this.takeConfig();
    this.followSettings(cx, before);
    cx.notify();
    const words = { refused: (why) => `${name} nicht gespeichert: ${why}`, stale: CHANGED_MEANWHILE };
    return this.queueSettingsWrite((cx) => this.writeSettingsFile(this.changeStep(changes, built), words, cx), cx);
  }

  changeSetting(path, value, cx, before = null) {
    return this.changeSettings([[path, value]], cx, before);
  }

  // `built`: the file's text the changes were made over.
  changeStep(changes, built) {
    const name = this.settingsName();
    return (fresh) => {
      const after = settingsAfter(fresh, changes, name, nameKeyAt);
      if (after.error) return { why: after.error };
      if (!readConfig(this.configState.text, { name, text: fresh }).settings) return { why: settingsAlone("die Datei") };
      if (!sameAtPaths(built, fresh, changes, name, nameKeyAt)) return { why: CHANGED_MEANWHILE };
      return { text: after.text };
    };
  }

  queueSettingsWrite(write, cx) {
    const queued = this.settingsWrites;
    const done = new Promise((resolve) => {
      cx.spawn(async (cx) => {
        await queued;
        try {
          resolve(await write(cx));
        } catch (e) {
          resolve(false);
          this.say(report(e), "error", cx);
        }
      });
    });
    this.settingsWrites = done;
    return done;
  }

  // The one writer of this machine's settings file; step(fresh) gives { text } or { why }.
  async writeSettingsFile(step, words, cx) {
    const file = this.settingsFile();
    const refused = async (why) => {
      this.say(words.refused(why), "error", cx);
      await this.readSettingsFile();
      this.takeConfig();
      this.followSettings(cx);
      cx.notify();
      return false;
    };
    let fresh;
    try {
      fresh = await readTextFile(file);
    } catch (e) {
      return refused(`ließ sich nicht lesen: ${firstLine(e?.message ?? e)}`);
    }
    const next = step(fresh);
    if (next.why) return refused(next.why);
    const writes = next.text !== fresh;
    if (writes) {
      try {
        await writeTextFile(file, next.text, fresh);
      } catch (e) {
        return refused(staleRefusal(e) ? words.stale : firstLine(e?.message ?? e));
      }
    }
    this.configState.settingsRead = { text: next.text };
    this.takeConfig();
    this.followSettings(cx);
    if (writes && words.done) this.say(words.done, "info", cx);
    cx.notify();
    return true;
  }

  // After a settings change by the board: what of a view's settings its
  // shape draws from without a read (withView) shows at once; a view whose
  // hide changed shows it so and is read again, as is one whose query now
  // leaves other repos out (readsAgain); `before` as in changeSettings.
  followSettings(cx, before = null) {
    for (const view of this.viewsNow()) {
      const st = this.views[view.id];
      const settled = st?.data && SHAPES[st.data.shape].withView?.(st.data, view);
      if (settled && settled !== st.data) {
        st.data = settled;
        this.keepSelection(view);
      }
      if (st?.data && SHAPES[st.data.shape].readsAgain?.(st, view)) this.refresh(view, cx);
      if (!st?.hidden || !st.data) continue;
      const hidden = hiddenColumns(view);
      if (sameNames(hidden, st.hidden)) continue;
      st.hidden = hidden;
      st.data = withHidden(st.data, hidden);
      if (before?.id === view.id) reselectIn(this, view, before.columns);
      // What a column holds comes from the query, which leaves hidden ones out.
      this.refresh(view, cx);
    }
  }

  // Settings that do not apply keep the stored entries for a later read.
  moveStoredHidden(cx) {
    if (!this.configState.settings) return;
    const entryOf = (view) => (store.text(hiddenKey(view.id)) === null ? undefined : store.get(hiddenKey(view.id)));
    const { moves, drop } = storedHiddenMoves(this.viewsNow().filter((v) => v.source === "github"), entryOf, (path) => this.origin(path));
    for (const view of drop) store.remove(hiddenKey(view.id));
    if (!moves.length) return;
    this.changeSettings(moves.map((m) => [hidePath(m.view), m.list]), cx).then((done) => {
      if (done) for (const m of moves) store.remove(hiddenKey(m.view.id));
    });
  }

  // Reads views.json and this machine's settings again and refreshes the
  // shown view; see Calls in the header.
  reload(cx) {
    cx.spawn(async (cx) => {
      const [text] = await Promise.all([
        readTextFile(`${appHome()}/mods/${MOD}/${CONFIG_NAME}.json`).catch((e) => {
          this.configErrors = [`${CONFIG_NAME}.json ließ sich nicht lesen: ${firstLine(e?.message ?? e)}`];
          return undefined;
        }),
        this.readSettingsFile(),
      ]);
      if (text !== undefined) this.configState.text = text;
      let valid = text === undefined ? Boolean(this.config) : this.takeConfig();
      const { moving, settingsRead } = this.configState;
      if (text !== undefined && moving) {
        await this.moveSettings(moving, settingsRead.text, cx);
        valid = Boolean(this.config);
      }
      this.paths.reset();
      for (const st of Object.values(this.views)) st.unavailable = false;
      cx.notify();
      if (!valid) return;
      const kinds = this.configState.kinds;
      // A problem in views.json or in this machine's settings leaves views out.
      if (!this.configErrors.length) {
        const tabs = new Set(this.contexts().flatMap((c) => c.tabs).map((t) => t.id));
        for (const k of [...goneSaved(store.keys(), new Set(kinds.keys())), ...goneProjects(store.keys(), tabs)]) store.remove(k);
      }
      this.moveStoredHidden(cx);
      this.prefetchLeft = new Set(kinds.keys());
      const shown = this.view();
      if (shown) this.restore(shown);
      cx.timer.after(0, () => this.guarded("Gespeicherter Stand", () => this.viewsNow().forEach((v) => this.restore(v))));
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
    const together = loader?.together?.(this.viewsNow());
    if (!together) return this.refreshView(view, cx);
    if (together.some((v) => this.state(v.id).loading)) return void this.againTogether.add(loader);
    for (const v of [view, ...together.filter((v) => v.id !== view.id)]) this.refreshView(v, cx);
  }

  followTogether(cx) {
    for (const loader of [...this.againTogether]) {
      this.againTogether.delete(loader);
      const [first] = loader.together(this.viewsNow());
      if (first) this.refresh(first, cx);
    }
  }

  refreshView(view, cx) {
    const loader = this.loader(view);
    if (!loader) return;
    const st = this.state(view.id);
    // A refresh asked for while one runs (a column shown or hidden) follows it.
    if (st.loading) return void (st.again = true);
    st.loading = true;
    st.readFor = view;
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
          st.data = SHAPES[data.shape].received(data, st, this.viewById(view.id) ?? view);
          st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
          this.keepSelection(view);
          cx.notify();
        },
        page: (page, pages) => {
          if (ended) return;
          st.progress = { page, pages };
          cx.notify();
        },
        project: (meta) => {
          if (ended) return null;
          const now = this.learnProject(view, meta, cx);
          if (now) view = now;
          return now;
        },
      };
      try {
        const { data, warnings, notice } = await loader.load(view, { hiddenFor: (v) => this.hiddenFor(v), chosen, live, last: before.data });
        // What the load has to say beside its data (a chosen sprint gone).
        if (notice) this.say(notice, "warning", cx);
        st.moves = pendingMoves(st.moves, started);
        // A selection in data of another shape (a view GitHub gave another layout) starts anew.
        if (st.data && st.data.shape !== data.shape) st.sel = null;
        st.data = SHAPES[data.shape].received(data, st, this.viewById(view.id) ?? view);
        st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
        st.error = null;
        st.at = Date.now();
        st.saved = false;
        st.unavailable = false;
        // A sprint the picker chose is the view's only while the board runs.
        // The view that learnt a project's views and handed them on is gone (learnProject).
        if (this.views[view.id] === st) {
          if (!chosen && SHAPES[data.shape].loads) this.save(view, st.hidden ?? hidden, { data, warnings }, st.at, cx);
          this.keepSelection(view);
          this.chooseWanted(view, run, cx);
          this.settleUnclear(view, started, data, cx);
        }
      } catch (e) {
        if (e?.project) this.learnProject(view, e.project, cx);
        st.error = report(e);
        st.unavailable = Boolean(e?.unavailable);
        // A failed read keeps what showed before it, not what it drew on its
        // way.
        if (drew) {
          st.data = before.data && SHAPES[before.data.shape].received(before.data, st, this.viewById(view.id) ?? view, before.data);
          st.warnings = before.warnings;
          if (st.data) this.keepSelection(view);
          else this.dataGone(view, st);
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
        else this.followTogether(cx);
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
      const kept = shape.fromSaved ? shape.fromSaved(saved.data) : saved.data;
      const data = shape.received(kept, st, view);
      const warnings = [...saved.warnings, ...shape.warnings(view, kept)];
      Object.assign(st, { data, warnings, at: saved.at, saved: true });
      this.keepSelection(view);
    } catch (e) {
      // An entry from code that drew it otherwise: the read draws instead.
      Object.assign(st, before);
      store.remove(key);
      boardLog.write(`board: ${key} dropped: ${firstLine(e?.message ?? e)}`);
    }
  }

  // After the draw the data came with, in the form its shape stores. Where
  // the store does not take the read, the entry before goes too: a restart
  // would draw it as the last; the view says so beside its age (unsaved).
  save(view, hidden, read, at, cx) {
    cx.timer.after(0, (cx) => this.guarded("Speichern", () => {
      const key = savedKey(view.id);
      const shape = SHAPES[read.data.shape];
      const text = savedText(view, hidden, { ...read, data: shape.toSaved ? shape.toSaved(read.data) : read.data }, at);
      const refused = text === null ? `more than ${SAVED_MAX} bytes` : store.setText(key, text);
      const st = this.state(view.id);
      const unsaved = refused === null ? null : text === null ? UNSAVED.big : UNSAVED.refused;
      if (st.unsaved !== unsaved) cx.notify();
      st.unsaved = unsaved;
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
    const [next, ...rest] = prefetchOrder(this.viewsNow().filter((v) => this.prefetchLeft.has(v.id)), {
      shown: this.view(), contextViewIds: new Set(this.context() ? contextViews(this.context()).map((v) => v.id) : []), source: this.context()?.source, now: Date.now(), every: this.config.refreshMinutes * 60000,
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

  panelTakes(item) {
    return this.readsRelated(item) || (Boolean(item) && itemSessions(this.sessionsNow(), item).length > 0);
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
  // key (the item's), line (the line selected, by what it is: lineId; null
  // for none), levels (the levels it went down to: drillLine) }. Once it is
  // not theirs (another view or item, one without related items or
  // sessions, or the details closed) it is dropped, so that it does not
  // come back with them, nor do its levels.
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
    return p && p.view === view.id && st.detail && st.sel?.key === p.key && this.panelTakes(this.selected(view)) ? p : null;
  }

  // Tab, where the board takes it for the panel (takesTab: the details of
  // an item with related items to read or with sessions show): the
  // keyboard into the details panel, no line selected, or back to the board
  // where the panel has it, which closes the levels it went down to: the
  // board's keys act on its selected item, whose details then show again.
  togglePanel(view) {
    const item = this.detailsRoot();
    this.panel = this.panelOf(view) ? null : { view: view.id, key: item.key, line: null, levels: [] };
  }

  // The lines of the level the panel shows (a pull request's has no related
  // items).
  linesOf(view) {
    const item = this.levelItem(view);
    return {
      related: relatedLines(this.readsRelated(item) ? this.relatedOf(view, item)?.data : null),
      sessions: itemSessions(this.sessionsNow(), item),
    };
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
    if (dir) {
      const lines = this.linesOf(view);
      const at = lineIndex(lines, panel.line);
      const item = this.levelItem(view);
      const entry = this.relatedOf(view, item);
      const ui = this.relatedUi;
      // A session's line stands below the block, always in view.
      if (at === null && (dir < 0 || !lineCount(lines) || (lines.related.length && !lineShows(ui, item, entry, 0)))) scrollBy(ui, dir * LINE_PX);
      else {
        const next = stepLine(at, dir, lineCount(lines));
        panel.line = next === null ? null : lineId(lineAt(lines, next));
        if (next !== null) revealLine(ui, item, entry, next);
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
    if (entry?.data) panel.line = relatedLines(entry.data).some((l) => sameItem(l, from)) ? lineId({ related: from }) : null;
    else panel.line = back.line;
    const at = lineIndex(this.linesOf(view), panel.line);
    if (at !== null) revealLine(ui, item, entry, at);
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
    this.panel = this.panelTakes(this.selected(view)) ? { view: view.id, key: place.key, line: null, levels: [] } : null;
  }

  // A click on line `at` of the related items: the keyboard into the panel
  // on that line (at the level it shows), and Enter on it.
  pickLine(view, at, cx) {
    const item = this.detailsRootOf(view);
    const line = this.linesOf(view).related[at];
    if (!item || !line) return;
    this.panel = this.panelOf(view) ?? { view: view.id, key: item.key, line: null, levels: [] };
    this.panel.line = lineId({ related: line });
    this.handle.focus();
    this.drillLine(view, line, cx);
    cx.notify();
  }

  // gg/G and Home/End (jumpKey) while the details panel has the keyboard:
  // its top, with no line selected, or its bottom, on its last line where it
  // has lines.
  panelEdge(view, panel, end) {
    const lines = this.linesOf(view);
    const count = lineCount(lines);
    panel.line = end === "bottom" && count ? lineId(lineAt(lines, count - 1)) : null;
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

  // The details panel's selected line as it stands now: it follows its
  // session, or goes with it (lineNow). A draw takes it before its hint
  // line reads the line, as each action's key does (keptSituation).
  keepLine(view) {
    const panel = this.panelOf(view);
    if (panel) panel.line = lineNow(this.linesOf(view), panel.line);
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

  // Shows the tab at `index` of the shown context; none there does nothing.
  switchTab(index, cx) {
    const context = this.context();
    const tab = this.tabs()[index];
    if (!tab) return;
    this.tabIds[context.id] = tab.id;
    store.set(`tab:${context.id}`, tab.id);
    this.showTab(cx);
  }

  // ] and [: the shown context's next or previous tab (`by` 1 or -1), past
  // the last the first and back.
  stepTab(by, cx) {
    const tabs = this.tabs();
    if (tabs.length) this.switchTab(stepIndex(tabs.length, shownIndex(tabs, this.tab()), by), cx);
  }

  switchContext(index, cx) {
    const context = this.contexts()[index];
    if (!context) return;
    this.contextId = context.id;
    store.set("context", context.id);
    this.showTab(cx);
  }

  stepContext(by, cx) {
    const contexts = this.contexts();
    if (contexts.length) this.switchContext(stepIndex(contexts.length, shownIndex(contexts, this.context()), by), cx);
  }

  // After another tab came up: the notice goes, and its view loads as the
  // header says (Calls).
  showTab(cx) {
    this.notice = null;
    const v = this.view();
    const st = v && this.state(v.id);
    if (v) this.restore(v);
    if (v && !st.loading && (!st.data || refreshDue(st, Date.now(), this.config.refreshMinutes * 60000))) this.refresh(v, cx);
    if (v && !this.loader(v)) this.schedulePrefetch(cx);
    cx.notify();
  }

  // Shows a view of the shown team's or project's tab, by its id; one it
  // does not have does nothing.
  setTabView(id, cx) {
    const tab = this.tab();
    if (!hasViews(tab) || !tab.views.includes(id)) return;
    this.tabViews[tab.id] = id;
    store.set(tabViewKey(tab), id);
    this.showTab(cx);
  }

  // v: the shown tab's next view.
  nextTabView(cx) {
    const tab = this.tab();
    if (!hasViewSwitch(tab)) return;
    this.setTabView(tabViewAfter(tab, this.tabViewOf(tab)), cx);
  }

  setSoloRepo(view, repo, cx) {
    const st = this.state(view.id);
    st.soloRepo = repo;
    if (repo === null) store.remove(soloKey(view.id));
    else store.set(soloKey(view.id), repo);
    this.keepSelection(view);
    cx.notify();
  }

  nextSoloRepo(cx) {
    const view = this.view();
    const st = view && this.state(view.id);
    const solo = st?.data && this.shape(view).soloSwitch?.(this, st);
    if (solo) this.setSoloRepo(view, solo.after, cx);
  }

  // m: "nur meine" on or off, over whatever shows; nothing is read again.
  toggleMine(cx) {
    if (!this.context()) return;
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

  toggleRepo(view, repo, cx) {
    this.shape(view).toggleRepo(this, view, repo, cx);
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

  // Enter: details first, then the item's session (startSession).
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

  // `item`: the selected one, or the one the details panel went down to.
  startSession(view, item, cx) {
    if (!itemKey(item)) return this.say("Entwurf ohne Repo: erst in ein Issue umwandeln", "info", cx);
    const enter = secondEnter(this.sessionsNow(), item);
    if (enter.go) return this.goToSession(enter.go, cx);
    if (enter.ask) return MODALS.sessions.open(this, view, item, enter.ask, cx);
    MODALS.start.open(this, view, item, cx);
  }

  goToSession(session, cx) {
    if (!placed(session)) return this.say(`${session.label}: kein Terminal gefunden`, "info", cx);
    const { space: id, tab: tabId, pane } = session.place;
    // The session may be the tab behind the board layer, which selecting
    // it does not show; leaving the layer first keeps its pane.focus from
    // undoing the selection. (A copy in a tab gets keys only while the
    // layer does not cover it, so there this does nothing.)
    layers.leaveLayer();
    try {
      run("space.select", { id });
      if (tabId) run("tab.select", { id: tabId });
      if (pane) run("pane.focus", { pane });
    } catch (e) {
      const space = spaces().find((s) => s.id === id);
      const tab = space?.tabs.find((t) => t.id === tabId);
      const named = `Space „${space?.name ?? id}“, Tab „${tab?.name ?? tabId ?? "–"}“`;
      notify({ title: `Sitzung nicht gezeigt: ${named}`, body: errorText(e), level: "error" });
    }
  }

  sessionsNow() {
    return this.drawnSessions ?? sessionIndex({ spaces: spaces(), panes: panes(), terminals: terminals(), claude: this.claude });
  }

  sessionsSeen() {
    const f = focused();
    return JSON.stringify([f?.space ?? null, f?.tab ?? null, f?.pane ?? null, spaces().map((s) => s.tabs?.length ?? 0)]);
  }

  followSessions(cx) {
    if (!this.claudeReading && this.sessionsSeen() !== this.claudeSeen) this.readClaude(cx);
  }

  readClaude(cx) {
    if (this.claudeReading || checking()) return;
    this.claudeReading = true;
    this.claudeSeen = this.sessionsSeen();
    const runSh = (args, kind) => call("sh", args, null, CLAUDE_TIMEOUT_MS, what(null, kind));
    cx.spawn(async (cx) => {
      try {
        this.claude = await readClaudeSessions(runSh);
      } finally {
        this.claudeReading = false;
        cx.notify();
      }
    });
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
  // where the open dialog wants it (its keyboard(m): the filter of a
  // choice's open list), else the dialog's text field when the dialog is on
  // one (m.inputs), else the filter while one is typed, else the board
  // itself, which hands its keys to a dialog without a text field (the
  // status menu) or on another field.
  takeKeyboard() {
    const m = this.modal;
    const input = (m && MODALS[m.kind].keyboard?.(m)) ?? m?.inputs?.[m.field];
    if (input) input.focus();
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

  // A click outside the layer's shown board leaves it (README, "herdr
  // app"): herdr tells a mod of no click on a tab, and on_window_mouse_up
  // sees a release wherever herdr handles it.
  pressOutside(e) {
    if (this.shownAsLayer()) this.pressedOut = { button: e.button, at: e.position };
  }

  releaseOutside(e, cx) {
    const pressed = this.pressedOut;
    this.pressedOut = null;
    if (pressed?.button === e.button && inPlace(pressed.at, e.position)) this.leaveAfter(cx);
  }

  leaveOnPress(cx) {
    if (this.shownAsLayer()) this.leaveAfter(cx);
  }

  // After the event, which may have taken the keyboard.
  leaveAfter(cx) {
    cx.timer.after(0, () => this.guarded("Klick", () => layers.leaveLayer({ keyboard: this.boardHasKeyboard() })));
  }

  // At every look (a render or the WATCH_MS timer, see there): a copy that
  // was not shown and now shows takes the keyboard once, whoever showed it,
  // after the look and only where it still shows, and reads the Claude
  // sessions after the look (never in a render); it starts its BAND_MS
  // timer and the prefetch at once. While hidden, the timer stops and the
  // layer's board forgets the focus it compared with (followFocus), so it
  // starts anew when it shows.
  watchShown(cx) {
    const shown = boardShown(this.isLayer());
    const was = this.wasShown;
    this.wasShown = shown;
    if (!shown) {
      this.seen = null;
      this.pressedOut = null;
      this.followBandsWhile(false, cx);
      return;
    }
    if (was !== false) return;
    this.followBandsWhile(true, cx);
    this.schedulePrefetch(cx);
    cx.timer.after(0, (cx) => this.guarded("Sitzungen", () => this.readClaude(cx)));
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

  // The situation an action runs in, `c` as the action table takes it
  // (commands.js says its fields).
  situation() {
    const view = this.view();
    const st = view ? this.state(view.id) : null;
    const panel = view ? this.panelOf(view) : null;
    const details = view ? this.levelItem(view) : null;
    const levels = panel?.levels ?? [];
    const lines = panel ? this.linesOf(view) : null;
    return {
      b: this, view, st, shape: view ? this.shape(view) : null, item: view ? this.selected(view) : null, details,
      related: this.readsRelated(details), sessions: details ? itemSessions(this.sessionsNow(), details).length : 0,
      panel, lines, line: panel?.line ?? null, picked: panel ? pickedLine(lines, panel.line) : null,
      drilled: levels.length > 0, trail: details ? [this.detailsRootOf(view).key, ...levels.map((l) => l.item.key)] : null,
    };
  }

  // The situation an action runs in as its key runs it, the step the keys
  // (key), the menu's opening (openCommands) and its actions (runAction)
  // share: the board keeps its selection first (keepSelection), and the
  // panel its line (keepLine).
  keptSituation() {
    const view = this.view();
    if (view && this.state(view.id).data) this.keepSelection(view);
    if (view) this.keepLine(view);
    return this.situation();
  }

  // An entry the menu picked (ui/modals/commands.js, menuActions): its
  // action, run as its key runs it, only on what it aimed at when the menu
  // opened and where it can still run. Where what it aimed at is gone (a
  // refresh dropped the item or took it out of sight, another column is
  // selected for "Spalte ausblenden", another view shows), or the action
  // cannot run on it any more (a refresh moved the card into the last
  // column), the menu says so and runs nothing.
  runAction(entry, cx) {
    const c = entry.action.bar ? this.situation() : this.keptSituation();
    if (aimOf(entry.action, c, entry.line) !== entry.aim) this.say(groupAimOf(entry.action, c) === entry.groupAim ? entry.gone : entry.groupGone, "info", cx);
    else if (!entry.action.when(c)) this.say(`„${entry.name}“ geht hier nicht mehr`, "info", cx);
    else entry.action.run(this, c, cx);
    cx.notify();
  }

  // The key of the action `id` where it runs it now, and its name now
  // (commands.js), for a text that names it.
  keyShown(id) {
    return keyShown(id, this.situation());
  }

  actionName(id) {
    return actionName(id, this.situation());
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
    const jump = view ? jumpKey(k, ch, mod, g) : null;
    if (jump === "pending") return (this.afterG = true), done();
    if (jump === "top" || jump === "bottom") return this.toEdge(view, jump, cx), done();
    const panel = view && bare ? this.panelOf(view) : null;
    if (panel && this.panelKey(view, panel, k)) return done();
    // A key of an action of the top bar runs it at once; then the board
    // keeps its selection (keptSituation), and Esc, the arrows and the keys
    // of the other actions follow (commands.js, actionFor).
    const name = jump ?? keyName(k, ch, mod);
    const atOnce = name ? this.situation() : null;
    const first = name ? actionFor(name, atOnce) : null;
    if (first?.bar) return first.run(this, atOnce, cx), done();
    if (mod.control || mod.alt || mod.platform) return;
    const c = this.keptSituation();
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
      else if (shape.sideways && (dir === "left" || dir === "right")) shape.sideways(this, view, dir === "right" ? 1 : -1);
      return done();
    }
    // With nothing selected (loading, failed, empty, a placeholder) Enter
    // and o stay herdr's (their actions do not take them).
    const action = name ? actionFor(name, c) : null;
    if (action) return action.run(this, c, cx), done();
  }

  // What the status menu sets on a view: its shape's field (a GitHub
  // board's column field), else the status.
  statusField(view) {
    return this.shape(view).statusField?.(this, view) ?? "Status";
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

  openRepos(view, cx) {
    MODALS.repos.open(this, view, cx);
  }

  // The command menu (ui/modals/commands.js): the actions that can run now,
  // on the selection the board keeps, as an action's key finds it.
  openCommands(cx) {
    MODALS.commands.open(this, this.keptSituation(), cx);
  }

  // a: the assignee picker, where the shape's items can be assigned.
  openAssign(view, cx) {
    if (!this.shape(view).assign) return this.say("Hier gibt es keine Zuweisung zu ändern", "info", cx);
    MODALS.assign.open(this, view, cx);
    cx.notify();
  }

  modalKey(e, cx) {
    if (e.key === "escape") {
      cx.stop_propagation();
      if (MODALS[this.modal.kind].escape?.(this, cx)) return;
      return this.closeModal(cx);
    }
    MODALS[this.modal.kind].key(this, e, cx);
  }

  // ---- drawing ----

  render(cx) {
    this.drawnSessions = null;
    this.drawnSessions = this.sessionsNow();
    try {
      return this.drawAll(cx);
    } finally {
      this.drawnSessions = null;
    }
  }

  drawAll(cx) {
    this.watchShown(cx);
    this.followFocus(cx);
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const view = this.view();
    if (view) this.keepLine(view);
    const st = view ? this.state(view.id) : null;
    const item = st?.detail && view ? this.selected(view) : null;
    let out = v_flex().id("board").track_focus(this.handle);
    const releases = observesReleases(out);
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
      .on_mouse_down_out(releases ? (e) => this.pressOutside(e) : (_e, cx) => this.leaveOnPress(cx))
      .on_mouse_down("left", () => {
        if (!this.filtering && !this.modal) this.handle.focus();
      })
      .on_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .on_hover((hovered, cx) => {
        if (!hovered) this.endDrag(cx);
      })
      .child(this.toolbar(t, view, st));
    if (releases) for (const button of OUTSIDE_BUTTONS) out = out.on_window_mouse_up(button, (e, cx) => this.releaseOutside(e, cx));
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
  // give way on a small screen: the context switch and the shown context's
  // tabs; then a tab's view switch (where it has more than one), an Issues
  // tab's field „Repo:“, "nur meine", the filter, the read under way, the age
  // of the data drawn and refresh. Without a valid views.json the first row
  // holds only the board's name.
  toolbar(t, view, st) {
    const { reading, age, unsaved } = readLabels(st, Date.now());
    const context = this.context();
    const tab = this.tab();
    const solo = view && st?.data ? this.shape(view).soloSwitch?.(this, st) : null;
    const row = () => h_flex().gap(12).px(16).items_center();
    let nav = row().pt(8).pb(4);
    if (!context) nav = nav.child(div().flex_none().text_size(15).font_semibold().child("Board"));
    else nav = nav.child(this.contextSwitch(t, context)).child(this.tabRow(t, tab));
    const tools = row()
      .pt(4)
      .pb(8)
      .when(hasViewSwitch(tab), (el) => {
        const views = tab.views.map((v) => ({ id: v, label: tabViewName(tab, v) }));
        return el.child(this.segments(t, "tab-view", views, this.tabViewOf(tab), (id, cx) => this.setTabView(id, cx)));
      })
      .when(Boolean(solo), (el) => el.child(soloField(this, t, view, solo)))
      .when(Boolean(context), (el) => el.child(this.mineToggle(t)))
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
      .when(Boolean(unsaved), (el) => el.child(div().id("unsaved").flex_none().text_size(12).text_color(t.dim).child(unsaved)))
      .child(button(t, "refresh", svg(REFRESH_ICON).size(14).when(Boolean(st?.loading), (el) => el.spin(1000)), false, (cx) => this.reload(cx)));
    return v_flex().id("top-bar").flex_none().border_b(1).border_color(t.border).child(nav).child(tools);
  }

  // A row of choices, the chosen one marked; a click picks one (`pick(id,
  // cx)`). Each choice has the id `<id>-<choice id>`.
  segments(t, id, choices, chosen, pick) {
    return this.segmentBox(t, id).children(choices.map((c) => this.segment(t, id, c, chosen, pick)));
  }

  segmentBox(t, id) {
    return h_flex().id(id).flex_none().p(2).gap(2).rounded(7).border_1().border_color(t.border).bg(t.chrome);
  }

  segment(t, id, c, chosen, pick) {
    return div()
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
      .child(c.label);
  }

  contextSwitch(t, shown) {
    const pick = (id, cx) => this.switchContext(shownIndex(this.contexts(), { id }), cx);
    const parts = [];
    let source = null;
    for (const context of this.contexts()) {
      if (context.source !== source) {
        if (source) parts.push(div().id(`context-rule-${context.source}`).flex_none().self_stretch().w(1).my(4).mx(4).bg(t.border));
        source = context.source;
        const name = SOURCES.find((s) => s.id === source).name;
        parts.push(div().id(`context-source-${source}`).flex_none().pl(8).pr(4).text_size(11).text_color(t.dim).child(name));
      }
      parts.push(this.segment(t, "context", { id: context.id, label: context.name }, shown.id, pick));
    }
    return this.segmentBox(t, "context").children(parts);
  }

  tabRow(t, shown) {
    const count = (c) => {
      const st = this.state(this.viewFor(c).id);
      const n = st.data ? SHAPES[st.data.shape].count(this, st.data) : null;
      const countText = n ? shownOf(n.shown, n.total) : "";
      const slot = div().flex_none().text_size(12).text_color(t.muted);
      if (!this.tabLoading(c)) return slot.child(countText);
      if (!n) return slot.child(spinner());
      // The unseen count under the spinner keeps the tab's width.
      return slot
        .relative()
        .child(div().opacity(0).child(countText))
        .child(div().absolute().inset_0().flex().items_center().justify_center().child(spinner()));
    };
    // Too narrow for all, the names give way first (cut with …).
    return h_flex()
      .id("tabs")
      .min_w(0)
      .overflow_x_hidden()
      .gap(2)
      .children(
        this.tabs().map((c, i) =>
          h_flex()
            .id(`tab-${c.id}`)
            .min_w(0)
            .px(10)
            .py(5)
            .gap(6)
            .items_center()
            .rounded(6)
            .cursor_pointer()
            .text_color(c.id === shown?.id ? t.foreground : t.muted)
            .when(c.id === shown?.id, (el) => el.bg(t.selected).font_semibold())
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => {
              if (!this.modal) this.switchTab(i, cx);
            })
            .child(div().flex_none().text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
            .child(div().min_w(0).truncate().child(c.name))
            .child(count(c)),
        ),
      );
  }

  tabLoading(tab) {
    return viewsOfTab(tab).some((v) => this.views[v.id]?.loading);
  }

  mineToggle(t) {
    return toggleSwitch(this, t, "mine", this.mine, (cx) => this.toggleMine(cx)).child("nur meine");
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
    const loading = () => box.child(h_flex().id("loading").p(20).gap(8).text_color(t.muted).child(spinner()).child("Lädt …"));
    if (!this.config) return this.configErrors.length ? message(`Keine gültige Ansicht in ${CONFIG_NAME}.json`) : loading();
    if (!view) return message("Keine Ansicht verfügbar");
    const shape = this.shape(view);
    const errorLine = (text) => div().px(16).pt(14).text_color(toneColor(t, NOTE_TONES.error)).child(text);
    if (shape.loads === false) return box.child(shape.render(this, t, mono, view, st));
    if (!st.data && !st.error) return st.loading ? loading() : message("Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(errorLine(st.error));
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
    const sessions = this.sessionsNow();
    const enter = secondEnter(sessions, item);
    const parts = (levels.length ? levelParts(this, t, view, item, this.relatedOf(view, item)) : this.shape(view).detailParts?.(this, t, view, item)) ?? {};
    const settings = startSettings(this.config, view, item.repo);
    const firstMessage = renderTemplate(item.kind === "pr" ? settings.review : settings.message, templateVars(item));
    const startLabel = `${startName(enter, item)} ↵`;
    const lines = panel ? this.linesOf(view) : null;
    const picked = panel ? pickedLine(lines, panel.line) : null;
    const listed = itemSessions(sessions, item);
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
      .when(this.readsRelated(item), (el) => el.child(relatedSections(this, t, mono, view, item, this.relatedOf(view, item), picked?.related ? lineIndex(lines, panel.line) : null)))
      .child(this.sessionSection(t, mono, listed, picked?.session ? placeKey(picked.session) : null, enter, firstMessage, sessions.notes))
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
          .when(Boolean(picked?.related), (el) => el.child(button(t, "act-line-board", "Zeile auf dem Board", false, (cx) => {
            if (!this.modal) this.enterLine(view, picked.related, cx);
          })))
          .child(button(t, "act-open", `${this.sources[item.source].site} o`, false, (cx) => {
            if (!this.modal) this.open(item, cx);
          })),
      );
  }

  sessionSection(t, mono, listed, markedKey, enter, firstMessage, notes) {
    const row = (s, i) => h_flex()
      .id(`session-${i}`)
      .gap(8)
      .items_center()
      .px(10)
      .py(8)
      .rounded(8)
      .border_1()
      .map(selectedLook(t, placeKey(s) === markedKey, t.border, t.background))
      .cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => {
        if (!this.modal) this.goToSession(s, cx);
      })
      .child(s.sure ? div().size(8).flex_none().rounded(4).bg(t[s.status] ?? t.idle) : div().size(8).flex_none().rounded(4).border_1().border_color(t.muted))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().font_family(mono).text_size(12).child(s.label))
        .child(div().truncate().text_size(11).text_color(t.muted).child(sessionReasons(s))))
      .child(div().flex_none().text_size(12).text_color(t.muted).child(s.sure ? AGENT_STATUS[s.status] ?? "" : CANDIDATE));
    const withMessage = firstMessage ? ` mit „${firstMessage}“` : "";
    const start = !enter.ask
      ? `Noch keine Sitzung. Enter startet eine${withMessage}.`
      : enter.ask.some(placed)
        ? `Enter fragt: zu einer davon springen oder eine neue Sitzung starten${withMessage}.`
        : `Keine davon in einem Terminal. Enter fragt, bevor es eine neue Sitzung${withMessage} startet.`;
    const note = (text, i) => div().id(`session-note-${i}`).text_size(11).text_color(toneColor(t, NOTE_TONES.warning)).child(text);
    const more = notes.length > 3 ? [`… und ${notes.length - 3} weitere`] : [];
    return detailSection(
      t,
      "SITZUNG",
      ...listed.map(row),
      ...(enter.go ? [] : [div().text_size(12).text_color(t.muted).line_height("18px").child(start)]),
      ...[...notes.slice(0, 3), ...more].map(note),
    );
  }

  // The hint line: the keys of what shows now, as the action table says
  // them (hintsOf), or the open dialog's hint where it has one.
  hints(t) {
    const said = this.modal ? MODALS[this.modal.kind].hint : null;
    const keys = said ? [] : hintsOf(this.situation());
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
      .children(keys.map(([k, what]) => h_flex().gap(5).child(div().font_semibold().text_color(t.foreground).child(k)).child(div().child(what))))
      .when(Boolean(said), (el) => el.child(div().child(said)));
  }

}
