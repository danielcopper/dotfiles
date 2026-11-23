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
// Calls: a GitHub view costs one gh call per refresh, and an issue's related
// items (its description, parent, sub-issues and linked pull requests) one
// more when its details open, again on `r` while they are open, and again
// after a refresh where their last read failed (readRelated; what a refresh
// keeps of them keptRelated says); an item the details panel went down to
// (Enter on a line, related.js) costs the same when it shows, a pull request
// one gh or az call for its details (az repos pr show), and on `r` each
// level's again, so that a level whose item is no longer among the lines of
// the one above can go. An Azure work item's related items (its description,
// parent, children and linked pull requests) cost the same, one az call (az
// boards work-item show --expand relations), and one WIQL query more for its
// children's and its parent's titles and states where it has either
// (sources/azure/related.js). An Azure team's Sprint two az calls (the
// taskboard's column of each work item, and one WIQL query for their
// fields; for a sprint the sprint picker chose, by its id and path), its
// Backlog two, one after the other (the level's work items in
// their list by az rest, then one WIQL query for their fields; one for an
// empty backlog), and one more for the project's work item types (their
// colors) while neither view keeps them; either one more while who az is
// stays unknown. What the Sprint and the Backlog read once and keep, and for
// how long, makeAzure says. An assignment costs one gh or az call, and the
// assignee picker one more per repo or team the first time it opens there
// (GitHub's assignable users with who gh is; the team's members, and who az
// is while that is unknown). The sprint picker costs one az call (the
// team's iterations) the first time it opens for a team, one more for the
// team's current sprint where the Sprint keeps none, and a refresh of a
// sprint it chose one where `r` dropped them; with no sprint running, a
// Sprint reads no work items. A state change costs one az call, a
// Backlog's create one and a child's parent link one more; a
// create reads the Backlog again, and one whose answer was unclear asks
// one WIQL query more after that refresh; a create for a team whose
// default iteration follows the current one reads the team's settings
// first, one call more. The PR tabs read nothing yet. Finding gh and az
// costs one sh call now and then (toolPaths says when). A view refreshes
// when its tab first shows, on `r` (which first drops what its source
// keeps of it: its source's forget), after a column is hidden or shown
// (the command menu's "Spalte ausblenden", a name in the hidden line, the
// column menu), when it is shown again older than refreshMinutes, and
// every refreshMinutes while it shows.
//
// The modules in src/, built into main.js by build.mjs (its header says how
// and why): shared.js, config.js (views.json), contexts.js (the top bar's
// sources, contexts and their views), kinds/index.js (view kinds),
// kinds/board.js (a board's columns and cards), kinds/sprint.js (a
// sprint's taskboard), kinds/backlog.js (a team's backlog), kinds/states.js
// (a state's color), select.js (filter, "nur meine", selection, the
// filter of the command menu and the sprint picker), commands.js (the
// action table, which the keys of its actions, the hint line and the
// command menu read), related.js (the
// items related to an item, read when its details open: what is kept,
// their lines), description.js (a description as drawn, without anything
// it could load), scroll.js (how the details scroll),
// sources/ (GitHub; Azure in sources/azure/: common.js, sprint.js,
// backlog.js, related.js, index.js), tools.js (running gh and az),
// actions/ (starting a session, writing a change at once, moving a card,
// changing a state, creating a work item, assigning an item), ui/helpers.js,
// ui/tones.js (the tones of labels and types, the selected background, the
// tints), ui/layer.js (the board layer), ui/related.js (the related items as
// drawn), ui/shapes/ (how a view's data is drawn and worked: board, prs,
// sprint, backlog, placeholder), ui/modals/ (the dialogs: start, status,
// columns, create, assign, commands, sprints) and this one, the Board,
// which looks the shape up.
// Their data logic is plain exported functions, tested with a few UI paths
// by tests/herdr-app/board.test.mjs with node.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, checking, exec, focused, layout, nextCommand, notify, props, readTextFile, run, settings, spaces, theme } from "herdr";
import { MOD, CONFIG_NAME, cardType, errorText, firstLine, itemKey, itemLabel, lineKey, parentLabel, report, sameItem, updatedLabel } from "./shared.js";
import { readConfig, startSettings } from "./config.js";
import { readStoredHidden, hiddenColumns, isDue, pendingMoves } from "./kinds/board.js";
import { readStoredFolds } from "./kinds/sprint.js";
import { kindOf, viewKind } from "./kinds/index.js";
import { matches, shows, navigate, columnOf, edgeOf, placeOf, selectionAfter } from "./select.js";
import { SOURCES, teamViewName, contextsOf, sourcesOf, pick, teamView, viewOf, viewsOf, hasViewSwitch, shownIndex, stepIndex, teamViewAfter } from "./contexts.js";
import { toolPaths } from "./tools.js";
import { linkedSession, AGENT_STATUS, renderTemplate, templateVars } from "./actions/start.js";
import { makeSources } from "./sources/index.js";
import { keptRelated, pathLabel, relatedLines, sectionOf, stepLine, wholeSection } from "./related.js";
import { store, migrateShownView, boardShown, shownOf, button, detailSection, detailWidth, DETAIL_MIN_W, DETAIL_MAX_W } from "./ui/helpers.js";
import { layers } from "./ui/layer.js";
import { NOTE_TONES, toneColor } from "./ui/tones.js";
import { SHAPES } from "./ui/shapes/index.js";
import { MODALS } from "./ui/modals/index.js";
import { descriptionFolds, levelParts, lineShows, relatedSections, relatedState, revealLine } from "./ui/related.js";
import { actionFor, actionName, aimOf, groupAimOf, hintsOf, keyName, keyShown } from "./commands.js";
import { LINE_PX, halfWindow, scrollBy, scrollToEnd } from "./scroll.js";
import { shownDescription, webUrl } from "./description.js";
export * from "./shared.js";
export * from "./config.js";
export * from "./contexts.js";
export * from "./kinds/board.js";
export * from "./kinds/index.js";
export * from "./kinds/sprint.js";
export * from "./kinds/backlog.js";
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
export * from "./actions/start.js";
export * from "./actions/write.js";
export * from "./actions/move.js";
export * from "./actions/state.js";
export * from "./actions/create.js";
export * from "./actions/assign.js";
export * from "./sources/index.js";
export * from "./ui/helpers.js";
export * from "./ui/tones.js";
export * from "./ui/layer.js";
export * from "./ui/related.js";
export * from "./ui/shapes/index.js";
export * from "./ui/shapes/board.js";
export * from "./ui/shapes/prs.js";
export * from "./ui/shapes/sprint.js";
export * from "./ui/shapes/backlog.js";
export * from "./ui/shapes/placeholder.js";
export * from "./ui/modals/index.js";
export * from "./ui/modals/columns.js";
export * from "./ui/modals/create.js";
export * from "./ui/modals/assign.js";
export * from "./ui/modals/commands.js";
export * from "./ui/modals/sprints.js";
export * from "./ui/modals/start.js";
export * from "./ui/modals/status.js";

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

  // A view's state: data and error, loading (again: one more refresh
  // after this one), at (last success) and tried (last start), warnings,
  // moves (laid over refreshes, see pendingMoves), pending (keys of items
  // being written), unclear (open outcomes: key, label, at and
  // writeAtOnce's w.open; see settleUnclear), stored/hidden (the person's
  // toggles and the hidden set), sel ({ col, key }, null before the first
  // data), picked (the key of the item the person chose, see clickItem),
  // runs (how many refreshes have started), want (an item to choose once a
  // refresh has it: chooseWanted) and detail; related (the related items
  // readRelated read, by item key); folds (a Sprint's folded stories, as
  // the store keeps them: readStoredFolds) and chosenFolds (those in the
  // sprints the sprint picker chose, by their id: foldsOf); sprint (the
  // sprint a Sprint view shows in place of the current one, { id, name } as
  // the sprint picker chose it, null for the current one; kept while the
  // board runs, never stored).
  state(id) {
    this.views[id] ??= {
      data: null, error: null, loading: false, again: false, at: 0, tried: 0, warnings: [], moves: [], pending: {}, unclear: [],
      stored: readStoredHidden(store.get(`hidden:${id}`)), hidden: null, sel: null, picked: null, runs: 0, want: null, detail: false,
      related: new Map(), folds: readStoredFolds(store.get(`folded:${id}`)), chosenFolds: new Map(), sprint: null,
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
    const open = st.detail ? this.selected(view) : null;
    st.related = keptRelated(st.related, open ? open.key : null, (this.panelIn(view)?.levels ?? []).map((l) => l.item.key));
    const started = st.tried;
    const run = ++st.runs;
    const chosen = st.sprint;
    cx.spawn(async (cx) => {
      try {
        const { data, warnings, notice } = await loader.load(view, (v) => this.hiddenFor(v), chosen);
        // What the load has to say beside its data (a chosen sprint gone).
        if (notice) this.say(notice, "warning", cx);
        st.moves = pendingMoves(st.moves, started);
        st.data = SHAPES[data.shape].received(data, st);
        st.warnings = [...warnings, ...SHAPES[data.shape].warnings(view, data)];
        st.error = null;
        st.at = Date.now();
        this.keepSelection(view);
        this.chooseWanted(view, run, cx);
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
        // Related items that waited for the refresh, or whose read failed
        // or wants a retry and so was not kept (keptRelated), are read now;
        // after a follow-up refresh, once it ended.
        this.readRelated(cx);
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
  // have passed since it was last tried.
  tick(cx) {
    if (!this.config || !boardShown(this.isLayer())) return;
    const every = this.config.refreshMinutes * 60000;
    const due = (v) => Date.now() - this.state(v.id).tried >= every;
    const shown = this.view();
    if (shown && due(shown)) this.refresh(shown, cx);
    cx.notify();
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
    const back = { line: panel.line, offset: ui.offset, viewport: ui.viewport, content: ui.content, sizes: ui.sizes, unfolded: ui.unfolded };
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
    Object.assign(ui, { at: item.key, offset: back.offset, viewport: back.viewport, content: back.content, sizes: back.sizes, unfolded: back.unfolded });
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
    scrollBy(this.relatedUi, dir * halfWindow(this.relatedUi));
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
  // kept as chosen and scrolled into view; open details follow it, and its
  // related items are read (readRelated).
  choose(view, sel, cx) {
    const st = this.state(view.id);
    st.sel = sel;
    st.picked = sel.key;
    this.scrollToSelection(view);
    this.readRelated(cx);
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
    if (!this.config) return message(this.configErrors.length ? `Keine gültige Ansicht in ${CONFIG_NAME}.json` : "Lädt …");
    if (!view) return message("Keine Ansicht verfügbar");
    const shape = this.shape(view);
    if (shape.loads === false) return box.child(shape.render(this, t, mono, view, st));
    if (!st.data && !st.error) return message(st.loading ? "Lädt …" : "Noch nichts geladen");
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
