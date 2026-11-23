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

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { cardLabel, report } from "../../shared.js";
import { backlogNav, backlogWarnings, findBacklogItem, withBacklogItem, withBacklogState } from "../../kinds/backlog.js";
import { linkedSession } from "../../actions/start.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { openStateMenu, setStateAtOnce, unclearStateLines } from "../../actions/state.js";
import { stateColor } from "../../kinds/states.js";
import { unclearCreateLines, unclearParentLines } from "../../actions/create.js";
import { MODALS } from "../modals/index.js";
import { chip, selectedLook, sessionChip, shownOf, typeLine, workItemDetail } from "../helpers.js";
import { toneColor } from "../tones.js";

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
      .child(div().w(WIDTH.state).flex_none().child(chip(t, r.state ?? "ohne Status", t.background, toneColor(t, stateColor(data, r.state)))))
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
