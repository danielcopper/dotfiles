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
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { appHome, checking, exec, knownAgents, machines, nextCommand, notify, readTextFile, run, settings, spaces, theme } from "herdr";
import { MOD, CONFIG_NAME, BoardError, firstLine, lastLine, errorText, itemKey, itemLabel, updatedLabel, ageLabel } from "./shared.js";
import { viewKind, readConfig, startSettings, githubViews } from "./config.js";
import { readStoredHidden, hiddenColumns, toggleHidden, unknownHidden, findCard, moveCard, rollback, isDue, pendingMoves, applyMoves, canDrop, targetsFor, stepTarget, withHidden, shows, shownColumns, navigate, selectionAfter } from "./kinds/board.js";
import { TEAM_VIEW_NAMES, contextsOf, sourcesOf, pick, teamView, placeholder } from "./contexts.js";
import { toolPaths } from "./tools.js";
import { sessionName, linkedSession, AGENT_STATUS, renderTemplate, templateVars, checkoutArgs, spaceForTab, startCommand } from "./actions/start.js";
import { call, makeSources } from "./sources/index.js";
import { store, tint, machineName, onMachine, boardShown, report } from "./ui/helpers.js";
export * from "./shared.js";
export * from "./config.js";
export * from "./contexts.js";
export * from "./kinds/board.js";
export * from "./sources/github.js";
export * from "./sources/azure.js";
export * from "./tools.js";
export * from "./actions/start.js";
export * from "./sources/index.js";
export * from "./ui/helpers.js";

const CHECKOUT_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
const TICK_MS = 30000;
const SCROLLS = 24;
// What "nur meine" says over data that does not name the login it was read as.
const NO_VIEWER = "„nur meine“ zeigt nichts: GitHub hat nicht gesagt, als wer gh angemeldet ist";

export default class Board extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.config = null;
    this.configErrors = [];
    this.views = {}; // per GitHub view id, see state()
    // What the top bar shows, as last chosen: the source, its tab (a context
    // id) per source, and the view per team context. "nur meine" starts off.
    this.sourceId = store.get("source");
    this.tabIds = { azure: store.get("tab:azure"), github: store.get("tab:github") };
    this.teamViews = {};
    this.mine = false;
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

  // A GitHub view's state: data and error, loading (again: one more refresh
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

  // The view a team context shows (TEAM_VIEW_NAMES).
  teamViewOf(context) {
    this.teamViews[context.id] ??= store.get(`teamView:${context.id}`);
    return teamView(context, this.teamViews[context.id]);
  }

  // The GitHub view the shown tab holds, or null.
  view() {
    return this.context()?.view ?? null;
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
      const kinds = new Map(githubViews(this.config).map((v) => [v.id, viewKind(v)]));
      // Before the first valid views.json no view has a state to compare.
      const before = this.kinds ?? kinds;
      for (const [id, st] of Object.entries(this.views)) if (kinds.get(id) !== before.get(id)) st.unclear = [];
      this.kinds = kinds;
      const shown = this.view();
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
        const { data, warnings } = await this.sources[view.source].load(view, (v) => this.hiddenFor(v));
        st.moves = pendingMoves(st.moves, started);
        st.data = data.kind === "board" ? applyMoves(data, st.moves) : data;
        st.warnings = [...warnings, ...this.dataWarnings(view, data)];
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
        const fresh = githubViews(this.config).find((v) => v.id === view.id);
        if (st.again && fresh) this.refresh(fresh, cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  dataWarnings(view, data) {
    if (data.kind === "list") {
      return data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`);
    }
    return unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`);
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
    if (data?.kind !== "board") return;
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
        await this.sources[view.source].move(view, st.data, found.card, to);
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
        const current = githubViews(this.config).find((v) => v.id === view.id);
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

  columns(view) {
    const st = this.state(view.id);
    return st.data?.kind === "board" ? shownColumns(st.data, this.filterText, this.mine) : [];
  }

  rows(view) {
    const st = this.state(view.id);
    if (st.data?.kind !== "list") return [];
    return st.data.sections.flatMap((s) => s.rows.filter((r) => this.visible(r, st.data)));
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

  // After another tab came up: the notice goes, and a GitHub view without
  // data, or older than refreshMinutes, loads.
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
    this.mine = !this.mine;
    const view = this.view();
    if (view && this.state(view.id).data) this.keepSelection(view);
    cx.notify();
  }

  toggleColumn(view, col, cx) {
    const st = this.state(view.id);
    if (st.data?.kind !== "board") return;
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
      for (const r of s.rows.filter((row) => this.visible(row, st.data))) {
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
        // h_flex centres its items; the content and the detail span the
        // full height, each starting at the top.
        h_flex()
          .flex_1()
          .min_h(0)
          .items_stretch()
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
          const views = context.views.map((v) => ({ id: v, label: TEAM_VIEW_NAMES[v] }));
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

  // The shown source's tabs: number, name and, for a GitHub view with data,
  // how many items it holds ("…" while it loads).
  tabs(t, context) {
    const count = (c) => {
      if (!c.view) return "";
      const st = this.state(c.view.id);
      if (st.loading) return "…";
      const d = st.data;
      if (!d) return "";
      if (d.kind === "list") return String(d.sections.reduce((n, s) => n + s.rows.length, 0));
      return String(d.columns.filter((col) => !col.hidden).reduce((n, col) => n + col.cards.length, 0));
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
    const context = this.context();
    if (context?.source === "azure") return message(placeholder(context, context.kind === "team" ? this.teamViewOf(context) : null));
    if (!view) return message("Keine Ansicht verfügbar");
    if (!st.data && !st.error) return message(st.loading ? "Lädt …" : "Noch nichts geladen");
    let shown = box;
    if (st.error) shown = shown.child(div().px(16).pt(14).text_color(t.ansi1).child(st.error));
    const warnings = [...st.warnings, ...(this.mine && st.data && !st.data.viewer ? [NO_VIEWER] : [])];
    if (warnings.length) shown = shown.children(warnings.map((w) => div().px(16).pt(6).text_size(12).text_color(t.ansi3).child(w)));
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
      // The row's full height (the row lines its columns up at the top, so
      // a stub keeps its own), in which a long column scrolls its cards.
      return base(v_flex().flex_1().min_w(0).min_h(0).h_full().gap(8))
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
      children.push(...s.rows.filter((r) => this.visible(r, st.data)).map(row));
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

  // The keys of what shows: the top bar's, then those of the shown view.
  hints(t, st) {
    const context = this.context();
    const bar = [...(sourcesOf(this.config).length > 1 ? [["q", "Quelle"]] : []), ["1 2 3 [ ]", "Tab"]];
    const always = [["m", "nur meine"], ["/", "Filter"], ["r", "neu laden"], ["Esc", "schließen"]];
    let own = [];
    if (context?.kind === "team") own = context.views.length > 1 ? [["v", "Sprint/Backlog"]] : [];
    else if (st?.data?.kind === "list") own = [["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"]];
    else if (context?.kind === "view") {
      own = [["h/l j/k", "bewegen"], ["H/L", "verschieben"], ["s", "Status"], ["x", "Spalte"], ["Enter", "Detail · Agent"], ["o", "öffnen"]];
    }
    const keys = [...bar, ...own, ...always];
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
