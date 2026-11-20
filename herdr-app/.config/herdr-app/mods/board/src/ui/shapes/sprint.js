// The sprint shape: a team's current sprint as a taskboard. One row per
// story (its id, title and own state at the left), its tasks as cards in
// the team's taskboard columns, each with its own state, assignee and id
// and the chip of its session where it has one; tasks whose story is not in
// the sprint stand in the row "Ohne Story". H/L move a task to the next
// column (through the taskboard's own column, not the state: two columns
// may map to one state), s changes a story's or a task's state from its
// type's states (the status menu), Enter shows the details; both write at
// once (actions/move.js, actions/write.js). Keys walk the stories, then
// each column (sprintNav). The data: { shape: "sprint", meta: {
// iterationId, iteration, finish, typeStates, states, unplaced,
// unknownColumns }, columns: [{ id, name, color, hidden, count, target,
// types, mappings, cards }], rows: [{ key, story }], viewer, noViewer,
// total, limited } (sprintBoard, sources/azure.js). View fields it reads:
// id, source, layout (as writeAtOnce does).

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { itemLabel } from "../../shared.js";
import { applyMoves, findCard, stepTarget } from "../../kinds/board.js";
import { findSprintItem, isTask, rowOf, shownRows, shownState, sprintItems, sprintNav, sprintNavigate, sprintStories, withItemState } from "../../kinds/sprint.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, tellOutcomes, unclearMoveLines } from "../../actions/move.js";
import { writeAtOnce } from "../../actions/write.js";
import { button, columnHead, detailSection, sessionChip, shownOf, statusPill } from "../helpers.js";

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
  warnings: () => [],
  // The settled outcomes: a move's (it has a target column) where its card
  // stands, a state change's which state its item has.
  settle: (b, due, data, cx) => tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.to), data), ...unclearStateLines(due.filter((u) => u.state !== undefined), data)], cx),
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, cx),
  openStatusMenu: (b, view, cx) => openStateMenu(b, view, cx),
  pickStatus: (b, view, key, target, cx) => setItemState(b, view, key, target.name, cx),
  // The detail panel's rows of a story or task: its state as a pill (a click
  // opens the status menu), a task's column, its area and iteration, and
  // Status s.
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    if (!st.data) return {};
    const column = isTask(item) ? findCard(st.data, item.key)?.column : null;
    const state = shownState(item, column);
    const openStatus = (cx) => {
      if (!b.modal) b.openStatusMenu(view, cx);
    };
    const line = (label, value) => div().text_size(12).text_color(t.muted).child(`${label}: ${value}`);
    const rows = [
      ...(column ? [line("Spalte", column.name)] : []),
      ...(item.area ? [line("Bereich", item.area)] : []),
      ...(item.iteration ? [line("Iteration", item.iteration)] : []),
    ];
    return {
      chips: [statusPill(t, state ?? "ohne Status", stateColor(st.data, state), openStatus)],
      sections: rows.length ? [detailSection(t, isTask(item) ? "TASK" : "STORY", ...rows)] : [],
      buttons: [button(t, "act-status", "Status s", false, openStatus)],
    };
  },
};

// The theme color of a state, by its category (parseAzureTypes).
const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";

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

const stateChip = (t, data, state) =>
  div().flex_none().px(7).rounded(9).text_size(11).text_color(t.background).bg(t[stateColor(data, state)] ?? t.muted).child(state ?? "ohne Status");

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

// The status menu for the selected story or task: the states of its type.
function openStateMenu(b, view, cx) {
  const st = b.state(view.id);
  const item = b.selected(view);
  if (!item) return;
  const states = st.data.meta.typeStates?.[item.type];
  if (!states?.length) return b.say(`Für ${item.type ?? "diesen Typ"} kennt das Board keine Status`, "info", cx);
  const targets = states.map((name) => ({ id: name, name, color: stateColor(st.data, name), hidden: false }));
  b.modal = { kind: "status", view, key: item.key, targets, at: Math.max(0, states.indexOf(stateNow(st.data, item))) };
}

// Sets an item's state at once and writes it (writeAtOnce); the state it
// has already sends nothing. A refusal sets the state back, unless a
// refresh has read another since. A write that landed refreshes the view
// too: which column a task's new state puts it in is Azure's to say.
function setItemState(b, view, key, state, cx) {
  const st = b.state(view.id);
  const item = findSprintItem(st.data, key);
  if (!item) return b.say("Den Eintrag gibt es nicht mehr", "warning", cx);
  const label = itemLabel(item);
  const before = stateNow(st.data, item);
  if (before === state) return;
  writeAtOnce(b, view, {
    key,
    label,
    apply: () => (st.data = withItemState(st.data, key, state)),
    write: () => b.loader(view).setState(view, item, state),
    undo() {
      if (findSprintItem(st.data, key)?.state === state) st.data = withItemState(st.data, key, before);
    },
    open: { state },
    again: true,
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
// (warning), or not in the sprint any more (warning).
function unclearStateLines(due, data) {
  return due.map((u) => {
    const now = findSprintItem(data, u.key);
    if (!now) return { text: `${u.label} ist nach dem Neuladen nicht im Sprint`, warn: true };
    const state = stateNow(data, now);
    if (state === u.state) return { text: `${u.label} hat nach dem Neuladen den Status „${u.state}“`, warn: false };
    return { text: `${u.label} hat nach dem Neuladen den Status „${state}“, nicht „${u.state}“`, warn: true };
  });
}
