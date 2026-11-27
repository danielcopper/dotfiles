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

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { cardLabel, cardType, epicLabel, noItemsText, partOfText, unreadableOrder } from "../../shared.js";
import {
  applyMoves, canDrop, findCard, hasStep, hiddenColumns, hideable, laneNavigate, laneRows, shownColumns, stepTarget, targetsFor, toggledHidden, unknownHidden, waitsForCards, withCard, withHidden, withOlderCards,
} from "../../kinds/board.js";
import { hidePath } from "../../config.js";
import { itemSessions } from "../../sessions.js";
import { moveCardTo, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import {
  CARD_EDGE, button, cardEdge, cardEnd, cardFoot, cardHead, cardMeta, chip, columnHead, footLines, groupHead, inPlace, labelChip, selectedLook, showsMeta, shownOf, spinner, statusPill, typeChip,
  typeLine, unzoomed,
} from "../helpers.js";
import { NOTE_TONES, dropBg, toneColor } from "../tones.js";
import { rowTops } from "../../scroll.js";
import { bandState, inBand, leftBand, placeBand, readsScroll, revealCard, revealTop, scrollOf } from "../band.js";
import { navigate } from "../../select.js";

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
  return { heights, ...rowTops(heights, CARD_GAP) };
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
            return inBand(kept.band, layout.tops[i], layout.heights[i]) ? whole(card, cardMeasure(b, kept, card, layout.heights[i])) : cardFrame(t, st, card, layout.heights[i]);
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
  return { heights, cardHeight, ...rowTops(heights, LANE_GAP) };
}

function scrollToLaneCard(b, view, st, sel) {
  const rows = laneRows(st.data.lanes, b.navColumns(view));
  const at = rows.findIndex((r) => !r.head && r.cards[sel.col]?.key === sel.key);
  if (at < 0) return;
  const kept = columnKept(b, LANES);
  if (boardState(b).windowed) {
    const where = scrollOf(kept.scroll);
    const layout = laneLayout(b, rows, kept, where.width, b.navColumns(view).length);
    revealCard(kept.band, where, layout.content, layout.tops[at], layout.heights[at]);
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
    if (layout && !inBand(kept.band, layout.tops[i], layout.heights[i])) return div().flex_none().h(layout.heights[i]);
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
  return 2 * (CARD.py + CARD.border) + rowTops(lines, CARD.lineGap).content;
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
