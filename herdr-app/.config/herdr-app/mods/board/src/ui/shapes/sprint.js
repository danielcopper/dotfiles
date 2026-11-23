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
// states, typeColors, unplaced, unknownColumns }, columns: [{ id, name, color,
// hidden, count, target, types, mappings, cards }], rows: [{ key, story }],
// viewer, noViewer, total, limited, limit } (sprintBoard,
// sources/azure/sprint.js). View fields it reads: id, source, layout (as
// writeAtOnce does).

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { cardLabel, itemLabel } from "../../shared.js";
import { applyMoves, findCard, stepTarget } from "../../kinds/board.js";
import { findSprintItem, isTask, rowOf, shownRows, shownState, sprintItems, sprintNav, sprintNavigate, sprintStories, sprintWarnings, withItemState } from "../../kinds/sprint.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { openStateMenu, setStateAtOnce, unclearStateLines } from "../../actions/state.js";
import { stateColor } from "../../kinds/states.js";
import { cardEdge, chip, columnHead, selectedLook, sessionChip, shownOf, typeLine, workItemDetail } from "../helpers.js";

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
  // The taskboard's columns, without the stories' (STORY_WIDTH wide).
  columnCount: (b, st) => sprintColumns(b, st).length - 1,
  selected: (b, st) => findSprintItem(st.data, st.sel?.key),
  // The row of the selected item, among the rows that show.
  scrollTo(b, view) {
    const st = b.state(view.id);
    const item = findSprintItem(st.data, st.sel?.key);
    const at = item ? shownRows(st.data, sprintColumns(b, st)).findIndex((r) => r.key === rowOf(item)) : -1;
    if (at >= 0) sprintState(b).scroll.scroll_to_item(at);
  },
  navigate: (b, view, st, dir) => sprintNavigate(sprintColumns(b, st), st.sel, dir),
  items: (data) => sprintItems(data),
  count(b, data) {
    const items = sprintItems(data);
    return { shown: items.filter((i) => b.visible(i, data)).length, total: items.length };
  },
  render: (b, t, mono, view, st) => drawSprint(b, t, mono, view, st),
  hints: [["h/l j/k", "bewegen"], ["gg/G", "erste/letzte"], ["H/L", "Task verschieben"], ["s", "Status"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
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
  settle: (b, view, due, data, cx) =>
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
    .children(cols.map((col) => columnHead(t, col, shownOf(col.shown.length, col.cards.length), t.background).flex_1().min_w(0)));
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

// A row's story at the left: its key and type, title and state, and a line
// across its top in its type's color (typeLine); one the filter or "nur
// meine" hides (it shows for its tasks) is dimmed and takes no click. The
// row "Ohne Story" names itself.
function storyCell(b, t, mono, view, st, r, nav) {
  const cell = v_flex().w(STORY_WIDTH).flex_none().gap(4);
  if (!r.story) return cell.child(div().text_size(12.5).font_semibold().text_color(t.muted).child("Ohne Story"));
  const story = r.story;
  const shown = nav[0].shown.includes(story);
  const selected = st.sel?.key === story.key;
  const line = typeLine(t, story, st.data.meta.typeColors?.[story.type], 6);
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
    .child(h_flex().gap(6).items_center()
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(story)))
      .when(Boolean(story.type), (el) => el.child(div().text_size(11).text_color(t.dim).child(story.type)))
      .when(Boolean(st.pending[story.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))))
    .child(div().text_size(12.5).line_height("17px").child(story.title))
    .child(stateChip(t, st.data, story.state))
    .when(Boolean(line), (el) => el.child(line));
}

const stateChip = (t, data, state) => chip(t, state ?? "ohne Status", t.background, t[stateColor(data, state)] ?? t.muted).flex_none();

// A task's card: its left edge in its column's color, its key, title, own
// state, assignee and session, and a line across its top in its type's
// color (typeLine); a click selects it (clickItem).
function drawTask(b, t, mono, view, st, card, ci, col, allSpaces) {
  const selected = st.sel?.key === card.key;
  const session = linkedSession(card, allSpaces);
  const line = typeLine(t, card, st.data.meta.typeColors?.[card.type], 6);
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
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(card)))
        .when(Boolean(st.pending[card.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))))
      .child(div().text_size(12.5).line_height("17px").child(card.title))
      .child(h_flex().gap(5).flex_wrap().items_center()
        .child(stateChip(t, st.data, shownState(card, col)))
        .when(card.assignees.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(card.assignees.join(", "))))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session)))))
    .when(Boolean(line), (el) => el.child(line));
}

// How the sprint finds, changes and shows its items' states (actions/state.js).
// A write that landed refreshes the view too: which column a task's new
// state puts it in is Azure's to say.
const SPRINT_STATES = {
  find: findSprintItem, withState: withItemState, stateOf: stateNow, where: "im Sprint", again: true,
};
