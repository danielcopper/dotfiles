// The board shape: a view's data as columns of cards, which a card moves
// between (H/L, the status menu, a drag). A hidden column is not drawn: the
// command menu's "Spalte ausblenden" hides the selected one, the line below
// the columns names the hidden ones and a click on a name shows it again;
// the command menu's "Spalten…" opens the column menu (modals/columns.js).
// The data: { shape: "board", meta, columns: [{ id, name, color, hidden,
// count, target, cards }], total, limited, viewer, read, partial (while
// later pages are still to come) } (parseGithubBoard). View fields it
// reads: id, source, layout, hide (the columns hidden by default) and
// project.priorityField.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { cardLabel, cardType, epicLabel, partOfText } from "../../shared.js";
import { applyMoves, canDrop, findCard, hasStep, hideable, hiddenColumns, shownColumns, stepTarget, targetsFor, toggleHidden, unknownHidden, withCard, withHidden } from "../../kinds/board.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, reselectIn, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import {
  CARD_EDGE, button, cardEdge, cardEnd, cardFoot, cardHead, cardMeta, chip, columnHead, footLines, inPlace, labelChip, selectedLook, showsMeta, shownOf, statusPill, store, typeChip, typeLine, unzoomed,
} from "../helpers.js";
import { NOTE_TONES, dropBg, toneColor } from "../tones.js";
import { rowTops } from "../../scroll.js";
import { bandState, inBand, leftBand, placeBand, readsScroll, revealCard, revealTop, scrollOf } from "../band.js";

// How the board finds and changes its cards' assignees (actions/assign.js).
const BOARD_ASSIGN = { find: (data, key) => findCard(data, key)?.card ?? null, withItem: withCard, where: "auf dem Board" };

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js).
const boardState = (b) => b.shapeState.board;
const columnLeft = (kept) => leftBand(kept.band, scrollOf(kept.scroll));

// By id, not place: a column coming in front (Ohne Status) must not hand its
// neighbours their state; a state passed on starts anew, scrolled to the top.
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
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge")),
  dirs: ["up", "down", "left", "right"],
  loads: true,
  // H/L: the selected card one column on (`by` 1) or back (-1), hidden
  // columns too.
  move(b, view, st, by, cx) {
    const target = st.sel?.key && stepTarget(st.data, st.sel?.key, by);
    if (target) b.moveTo(view, st.sel?.key, target.id, cx);
  },
  canMove: (st, item, by) => hasStep(st.data, item.key, by),
  canHide: hideable,
  received: (data, st) => applyMoves(data, st.moves),
  warnings: (view, data) => [
    ...unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
    ...(view.project.priorityGiven && data.meta.lacksPriorityField
      ? [`Projekt „${data.meta.title}“ hat kein Auswahlfeld „${view.project.priorityField}“ (project.priorityField): die Karten zeigen keine Priorität`]
      : []),
  ],
  settle: (b, view, due, data, cx) =>
    tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, BOARD_ASSIGN)], cx),
  assign: BOARD_ASSIGN,
  moveTo: (b, view, key, columnId, cx) => moveCardTo(b, view, key, columnId, cx),
  toggleColumn: (b, view, col, cx) => toggleBoardColumn(b, view, col, cx),
  openStatusMenu: (b, view) => openBoardStatusMenu(b, view),
  // The detail panel's rows of a card: its column as a pill, and Status s.
  detailParts(b, t, view, item) {
    const st = b.state(view.id);
    const column = st.data ? findCard(st.data, item.key)?.column : null;
    if (!column) return {};
    const openStatus = (cx) => {
      if (!b.modal) b.openStatusMenu(view, cx);
    };
    return {
      chips: [statusPill(t, column.name, column.color, openStatus)],
      buttons: [button(t, "act-status", "Status s", false, openStatus)],
    };
  },
};

const CARD_GAP = 6;

function columnLayout(b, col, kept, listWidth) {
  const measured = boardState(b).heights;
  const heights = col.shown.map((card) => {
    const m = measured.get(card.key);
    return m && (m.width === kept.cardWidth || !kept.cardWidth) ? m.height : cardHeightGuess(card, listWidth);
  });
  return { heights, ...rowTops(heights, CARD_GAP) };
}

const MEASURE_SLACK = 2;

function cardMeasure(b, kept, layout, card, i) {
  return (size, cx) => {
    const height = unzoomed(size.height);
    const width = unzoomed(size.width);
    boardState(b).heights.set(card.key, { height, width });
    const resized = Boolean(kept.cardWidth) && width !== kept.cardWidth;
    kept.cardWidth = width;
    if (resized || Math.abs(height - layout.heights[i]) > MEASURE_SLACK) cx.notify();
  };
}

function drawBoard(b, t, mono, view, st) {
  const cols = b.navColumns(view);
  const allSpaces = spaces();
  const dragged = b.drag ? findCard(st.data, b.drag.key)?.card : null;
  const { windowed } = boardState(b);
  const states = columnsKept(b, cols.map((c) => c.id));
  const columnEl = (col, ci) => {
    const filtered = col.cards.length - col.shown.length;
    const focusedCol = st.sel?.col === ci;
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    const ground = t.chrome;
    const head = columnHead(t, col, filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length), ground);
    const kept = states[ci];
    const at = windowed ? scrollOf(kept.scroll) : null;
    const layout = at && columnLayout(b, col, kept, at.width);
    if (at) placeBand(kept.band, layout.content, at);
    const whole = (card, measure) => drawCard(b, t, mono, view, st, card, col, ci, allSpaces, measure);
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
      })
      .child(head)
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
            return inBand(kept.band, layout.tops[i], layout.heights[i]) ? whole(card, cardMeasure(b, kept, layout, card, i)) : cardFrame(t, st, card, layout.heights[i]);
          }))
          .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
      );
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .child(
      cols.length
        ? h_flex().id("columns").flex_1().min_h(0).gap(12).p(14).items_start().children(cols.map(columnEl))
        : div().p(20).text_color(t.muted).child(`Alle Spalten sind ausgeblendet: ein Name unten oder „${b.actionName("columns")}“ im Befehlsmenü (${b.keyShown("commands")}) zeigt eine wieder`),
    )
    .when(st.data.columns.some((c) => c.hidden), (el) => el.child(hiddenLine(b, t, view, st)))
    .when(Boolean(st.data.limited) && !st.data.partial, (el) =>
      el.child(div().px(16).pb(8).text_size(12).text_color(toneColor(t, NOTE_TONES.warning))
        .child(`Nur die ersten ${st.data.read} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
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

function drawCard(b, t, mono, view, st, card, col, ci, allSpaces, measure) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
  const type = typeChip(t, card);
  const labels = cardLabels(card);
  const line = typeLine(t, card, null, 6);
  const end = cardEnd(t, card, linkedSession(card, allSpaces), Boolean(st.pending[card.key]));
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
    .opacity(dragging ? 0.5 : st.pending[card.key] ? 0.7 : 1)
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

// Hides a shown column or shows a hidden one; the selection follows
// (reselectIn).
function toggleBoardColumn(b, view, col, cx) {
  const st = b.state(view.id);
  if (!st.data) return;
  if (!boardShape.canHide(col)) return b.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
  const before = b.navColumns(view);
  st.stored = toggleHidden(view, st.stored, col);
  st.hidden = hiddenColumns(view, st.stored);
  store.set(`hidden:${view.id}`, st.stored);
  st.data = withHidden(st.data, st.hidden);
  reselectIn(b, view, before);
  // What a column holds comes from the query, which leaves hidden ones out.
  b.refresh(view, cx);
}

function openBoardStatusMenu(b, view) {
  const st = b.state(view.id);
  const card = b.selected(view);
  if (!card) return;
  const targets = targetsFor(st.data, card);
  const at = Math.max(0, targets.findIndex((c) => c.id === findCard(st.data, card.key)?.column.id));
  b.modal = { kind: "status", view, key: card.key, targets, at };
}
