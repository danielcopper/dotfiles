// The sprint shape: a team's sprint (its current one, or one the sprint picker
// chose) as a taskboard. One row per story (storyCell at the left), its tasks
// as cards in the team's taskboard columns (drawTask); a task's parent
// outside the sprint has a row too, its sprint beside its type, and tasks
// without a parent read stand in the row "Ohne Story". H/L move a task to
// the next column (through the taskboard's own column, not the state: two
// columns may map to one state), s changes a story's or a task's state from
// its type's states (the status menu), Enter shows the details; both write
// at once (actions/move.js, actions/write.js). z (while the board has the
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

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { cardLabel, itemLabel, partOfText } from "../../shared.js";
import { applyMoves, findCard, hasStep, stepTarget } from "../../kinds/board.js";
import {
  NO_STORY, dayText, findSprintItem, foldedStories, foldsOf, isTask, rowCounts, rowOf, rowTasks, shownRows, shownState, sprintIs, sprintItems, sprintNav, sprintNavigate, sprintStories,
  sprintWarnings, storyProgress, toggledFolds, withItemState, withSprintItem, withoutFolded,
} from "../../kinds/sprint.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { openStateMenu, setStateAtOnce, unclearStateLines } from "../../actions/state.js";
import { stateColor } from "../../kinds/states.js";
import {
  cardEdge, cardEnd, cardFoot, cardHead, cardMeta, columnHead, selectedLook, shownOf, stateChip, store, toneChip, typeLine, workItemDetail,
} from "../helpers.js";
import { NOTE_TONES } from "../tones.js";
import { MODALS } from "../modals/index.js";

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
