// The sprint shape: a team's current sprint as a taskboard. One row per story
// (its id, title and own state at the left), its tasks as cards in the team's
// taskboard columns, each with its own state, assignee and id and the chip of
// its session where it has one; tasks whose story is not in the sprint stand in
// the row "Ohne Story". H/L move a task to the next column (through the
// taskboard's own column, not the state: two columns may map to one state), s
// changes a story's or a task's state from its type's states (the status menu),
// Enter shows the details; both write at once (actions/move.js,
// actions/write.js). z (while the board has the keyboard), or a click on the
// triangle in a story's row, folds its tasks away and back (toggleStoryFold;
// kept per sprint in the store). Keys walk the stories, then each column's
// tasks but the folded ones (sprintNav, withoutFolded). The sprint picker
// (ui/modals/sprints.js) shows another sprint of the team: the command
// menu's "Sprint wählen…" and a click on the sprint's name in the head
// open it (pickSprint), "Aktueller Sprint" goes back (showSprint); a sprint
// that is not the current one says so in the head ("nicht aktuell"). The
// data: { shape: "sprint", meta: { iterationId, iteration, finish, current,
// gone, typeStates, states, typeColors, unplaced, unknownColumns },
// columns: [{ id, name, color, hidden,
// count, target, types, mappings, cards }], rows: [{ key, story }], viewer,
// noViewer, total, limited, limit } (sprintBoard, sources/azure/sprint.js).
// View fields it reads: id, source, layout (as writeAtOnce does).

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { cardLabel, itemLabel } from "../../shared.js";
import { applyMoves, findCard, hasStep, stepTarget } from "../../kinds/board.js";
import {
  NO_STORY, findSprintItem, foldedStories, isTask, rowCounts, rowOf, rowTasks, shownRows, shownState, sprintItems, sprintNav, sprintNavigate, sprintStories,
  sprintWarnings, toggledFolds, withItemState, withSprintItem, withoutFolded,
} from "../../kinds/sprint.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { openStateMenu, setStateAtOnce, unclearStateLines } from "../../actions/state.js";
import { stateColor } from "../../kinds/states.js";
import { assigneeText, cardEdge, columnHead, selectedLook, sessionChip, shownOf, stateChip, store, toneChip, typeLine, workItemDetail } from "../helpers.js";
import { NOTE_TONES } from "../tones.js";
import { MODALS } from "../modals/index.js";
import { showSprint } from "../modals/sprints.js";

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
const sprintColumns = (b, st) => withoutFolded(openColumns(b, st), foldedStories(st.folds, st.data));

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
  received: (data, st) => applyMoves(data, st.moves),
  // sprintWarnings.
  warnings: (view, data) => sprintWarnings(data),
  // The sprint picker, and the sprint `sprint` shown (null: the current
  // one).
  pickSprint: (b, view, cx) => MODALS.sprints.open(b, view, cx),
  showSprint: (b, view, sprint, cx) => showSprint(b, view, sprint, cx),
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

// "bis 27.11." for the sprint's last day (UTC, as Azure gives it), or null.
function sprintEnd(finish) {
  const at = new Date(finish ?? "");
  return Number.isNaN(at.getTime()) ? null : `bis ${at.getUTCDate()}.${at.getUTCMonth() + 1}.`;
}

// The head's start, over the stories: the sprint's name, which a click
// opens the sprint picker on; "nicht aktuell" where it is not the team's
// current sprint; its last day and how many stories show.
function sprintTitle(b, t, view, data, nav, stories) {
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
    }).child(data.meta.iteration))
    .when(data.meta.current === false, (el) => el.child(toneChip(t, "nicht aktuell", NOTE_TONES.warning).flex_none()))
    .child(div().flex_none().child(`· ${[sprintEnd(data.meta.finish), `${shownOf(nav[0].shown.length, stories.length)} Stories`].filter(Boolean).join(" · ")}`));
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
// and keeps that in the store per view and sprint (toggledFolds). A
// selected task that is folded away hands the selection to its story where
// that shows (no choice: reselect), else as after new data.
function toggleStoryFold(b, view, key, cx) {
  const st = b.state(view.id);
  st.folds = toggledFolds(st.folds, st.data, key);
  store.set(`folded:${view.id}`, st.folds);
  const item = b.selected(view);
  const nav = sprintColumns(b, st);
  if (item && isTask(item) && item.row === key && nav[0].shown.some((s) => s.key === key)) b.reselect(view, { col: 0, key });
  else b.keepSelection(view);
  cx.notify();
}

function drawSprint(b, t, mono, view, st) {
  const data = st.data;
  const open = openColumns(b, st);
  const folded = foldedStories(st.folds, data);
  const nav = withoutFolded(open, folded);
  const [, ...cols] = nav;
  const rows = shownRows(data, open);
  const counts = rowCounts(data, open);
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
    .child(sprintTitle(b, t, view, data, nav, stories))
    .children(open.slice(1).map((col) => columnHead(t, col, shownOf(col.shown.length, col.cards.length), t.background).flex_1().min_w(0)));
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

// A row's story at the left: its triangle where its row holds tasks (▾, ▸
// folded; a click folds or unfolds them and chooses nothing), its key and
// type, title, state and assignee, and a line across its top in its type's
// color (typeLine); one the filter or "nur meine" hides (it shows for its
// tasks) is dimmed and takes no click but on its triangle. The row "Ohne
// Story" names itself.
function storyCell(b, t, mono, view, st, r, nav, folded, counts) {
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
      .when(Boolean(counts.get(story.key)?.total), (el) => el.child(div().id(`fold-${story.key}`).flex_none().w(12).text_size(11).text_color(t.muted).cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (!b.modal) toggleStoryFold(b, view, story.key, cx);
        })
        .child(folded.has(story.key) ? "▸" : "▾")))
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(story)))
      .when(Boolean(story.type), (el) => el.child(div().text_size(11).text_color(t.dim).child(story.type)))
      .when(Boolean(st.pending[story.key]), (el) => el.child(div().text_size(11).text_color(t.dim).child("speichert …"))))
    .child(div().text_size(12.5).line_height("17px").child(story.title))
    .child(h_flex().gap(5).flex_wrap().items_center()
      .child(stateChip(t, st.data, story.state).flex_none())
      .when(story.assignees.length > 0, (el) => el.child(assigneeText(t, story))))
    .when(Boolean(line), (el) => el.child(line));
}

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
        .child(stateChip(t, st.data, shownState(card, col)).flex_none())
        .when(card.assignees.length > 0, (el) => el.child(assigneeText(t, card)))
        .when(Boolean(session), (el) => el.child(sessionChip(t, session)))))
    .when(Boolean(line), (el) => el.child(line));
}
