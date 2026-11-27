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
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, checking, exec, focused, home, layout, nextCommand, notify, panes, props, readTextFile, run, settings, spaces, terminals, theme, writeTextFile } from "herdr";
import { MOD, CONFIG_NAME, boardLog, cardType, errorText, firstLine, itemKey, itemLabel, lineKey, parentLabel, report, sameItem } from "./shared.js";
import { MOVE_AGAIN, hidePath, nameKeyAt, readConfig, settingsAlone, settingsBeforeContexts, startSettings } from "./config.js";
import { CHANGED_MEANWHILE, CHANGED_SINCE, ORIGIN, pathText, readSettings, sameAtPaths, settingsAfter, settingsFileIn, settingsText, staleRefusal } from "./settings.js";
import { hiddenColumns, hiddenKey, isDue, pendingMoves, sameNames, storedHiddenMoves, withHidden } from "./kinds/board.js";
import { readStoredFolds } from "./kinds/sprint.js";
import { kindOf, viewKind } from "./kinds/index.js";
import { matches, shows, navigate, columnOf, edgeOf, placeOf, selectionAfter } from "./select.js";
import {
  SOURCES, contextViews, contextsOf, firstContextOf, firstViewId, goneProjects, hasViews, tabViewName, pick, projectKey, tabView, viewOf, viewsOf, hasViewSwitch, shownContextMoves, shownIndex, stepIndex, tabViewAfter, tabViewKey, viewsOfTab,
} from "./contexts.js";
import { call, toolPaths, what } from "./tools.js";
import { SAVED_MAX, UNSAVED, goneSaved, prefetchOrder, readLabels, readSaved, refreshDue, savedKey, savedText } from "./loading.js";
import { renderTemplate, templateVars } from "./actions/start.js";
import { AGENT_STATUS, itemSessions, placeKey, placed, readClaudeSessions, secondEnter, sessionIndex } from "./sessions.js";
import { makeSources } from "./sources/index.js";
import { readProjectMeta } from "./sources/github.js";
import { keptRelated, lineAt, lineCount, lineId, lineIndex, lineNow, pathLabel, pickedLine, relatedLines, sectionOf, stepLine, wholeSection } from "./related.js";
import { store, boardShown, inPlace, observesReleases, shownOf, button, detailSection, detailWidth, selectedLook, sessionReasons, spinner, toggleSwitch, CANDIDATE, DETAIL_MIN_W, DETAIL_MAX_W } from "./ui/helpers.js";
import { layers } from "./ui/layer.js";
import { NOTE_TONES, toneColor } from "./ui/tones.js";
import { SHAPES } from "./ui/shapes/index.js";
import { MODALS } from "./ui/modals/index.js";
import { soloField } from "./ui/modals/solo.js";
import { soloKey, storedSolo } from "./kinds/issues.js";
import { reselectIn } from "./actions/move.js";
import { descriptionFolds, levelParts, lineShows, relatedSections, relatedState, revealLine } from "./ui/related.js";
import { actionFor, actionName, aimOf, groupAimOf, hintsOf, keyName, keyShown, startName } from "./commands.js";
import { LINE_PX, keptScroll, restoreScroll, scrollBy, scrollPage, scrollToEnd } from "./scroll.js";
import { shownDescription, webUrl } from "./description.js";
export * from "./shared.js";
export * from "./config.js";
export * from "./settings.js";
export * from "./contexts.js";
export * from "./kinds/board.js";
export * from "./kinds/list.js";
export * from "./kinds/index.js";
export * from "./kinds/sprint.js";
export * from "./kinds/backlog.js";
export * from "./kinds/table.js";
export * from "./kinds/issues.js";
export * from "./kinds/rows.js";
export * from "./kinds/fields.js";
export * from "./kinds/states.js";
export * from "./select.js";
export * from "./commands.js";
export * from "./related.js";
export * from "./description.js";
export * from "./scroll.js";
export * from "./sources/github.js";
export * from "./sources/azure/common.js";
export * from "./sources/azure/sprint.js";
export * from "./sources/azure/backlog.js";
export * from "./sources/azure/related.js";
export * from "./sources/azure/index.js";
export * from "./tools.js";
export * from "./loading.js";
export * from "./actions/start.js";
export * from "./sessions.js";
export * from "./actions/write.js";
export * from "./actions/move.js";
export * from "./actions/state.js";
export * from "./actions/create.js";
export * from "./actions/assign.js";
export * from "./sources/index.js";
export * from "./ui/helpers.js";
export * from "./ui/choices.js";
export * from "./ui/tones.js";
export * from "./ui/layer.js";
export * from "./ui/related.js";
export * from "./ui/band.js";
export * from "./ui/shapes/index.js";
export * from "./ui/shapes/board.js";
export * from "./ui/shapes/prs.js";
export * from "./ui/shapes/sprint.js";
export * from "./ui/shapes/backlog.js";
export * from "./ui/shapes/table.js";
export * from "./ui/shapes/issues.js";
export * from "./ui/shapes/placeholder.js";
export * from "./ui/modals/index.js";
export * from "./ui/modals/columns.js";
export * from "./ui/modals/repos.js";
export * from "./ui/modals/create.js";
export * from "./ui/modals/assign.js";
export * from "./ui/modals/commands.js";
export * from "./ui/modals/sprints.js";
export * from "./ui/modals/start.js";
export * from "./ui/modals/sessions.js";
export * from "./ui/modals/status.js";
export * from "./ui/modals/solo.js";

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
