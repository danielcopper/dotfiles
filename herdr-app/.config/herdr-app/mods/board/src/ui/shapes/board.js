// The board shape: a view's data as columns of cards, which a card moves
// between (H/L, the status menu, a drag). A hidden column is not drawn: x
// hides one, the line above the columns names the hidden ones and a click
// on a name shows it again; X opens the column menu (modals/columns.js).
// The data: { shape: "board", meta, columns: [{ id, name, color, hidden,
// count, target, cards }], total, limited, viewer, limit }
// (parseGithubBoard). View fields it reads: id, source, layout, hide (the
// columns hidden by default) and, where the data does not name its own,
// limit.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces } from "herdr";
import { epicLabel, itemLabel } from "../../shared.js";
import { applyMoves, canDrop, findCard, hiddenColumns, shownColumns, stepTarget, targetsFor, toggleHidden, unknownHidden, withCard, withHidden } from "../../kinds/board.js";
import { linkedSession } from "../../actions/start.js";
import { moveCardTo, reselectIn, unclearMoveLines } from "../../actions/move.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { button, cardEdge, chip, columnHead, labelChip, selectedLook, sessionChip, shownOf, statusPill, store, typeChip, typeLine } from "../helpers.js";

const findItem = (data, key) => findCard(data, key)?.card ?? null;

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js): one
// scroll handle per column (SCROLLS, reused beyond).
const boardState = (b) => b.shapeState.board;

export const boardShape = {
  state: () => ({ scrolls: Array.from({ length: SCROLLS }, () => ScrollHandle.new()) }),
  nav: (b, st) => shownColumns(st.data, b.filterText, b.mine),
  columnCount: (b, st) => shownColumns(st.data, b.filterText, b.mine).length,
  selected: (b, st) => findCard(st.data, st.sel?.key)?.card ?? null,
  scrollTo: (b, view, sel, row) => boardState(b).scrolls[sel.col % SCROLLS].scroll_to_item(row),
  // All items, whatever the filter: the cards of the shown columns.
  items: (data) => data.columns.filter((c) => !c.hidden).flatMap((c) => c.cards),
  count(b, data) {
    const cols = shownColumns(data, b.filterText, b.mine);
    return { shown: cols.reduce((n, c) => n + c.shown.length, 0), total: cols.reduce((n, c) => n + c.cards.length, 0) };
  },
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge")),
  hints: [["h/l j/k", "bewegen"], ["gg/G", "erste/letzte"], ["H/L", "verschieben"], ["s", "Status"], ["a", "zuweisen"], ["x", "Spalte ausblenden"], ["X", "Spalten"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
  dirs: ["up", "down", "left", "right"],
  loads: true,
  keys(b, view, st, { k, ch, mod }, cx) {
    if (!st.data) return false;
    const upper = mod.shift && (k === "h" || k === "l" || k === "x") ? k.toUpperCase() : ch;
    if (upper === "H" || upper === "L") {
      const target = st.sel?.key && stepTarget(st.data, st.sel?.key, upper === "H" ? -1 : 1);
      if (target) b.moveTo(view, st.sel?.key, target.id, cx);
      return true;
    }
    if (k === "s") return b.openStatusMenu(view, cx), true;
    if (upper === "X") {
      b.modal = { kind: "columns", view, at: 0 };
      return true;
    }
    if (k === "x") {
      const col = b.navColumns(view)[st.sel?.col];
      if (col) b.toggleColumn(view, col, cx);
      return true;
    }
    return false;
  },
  received: (data, st) => applyMoves(data, st.moves),
  warnings: (view, data) => unknownHidden(view, data.columns).map((n) => `„${n}“ aus hide passt zu keiner Spalte`),
  settle: (b, view, due, data, cx) =>
    tellOutcomes(b, [...unclearMoveLines(due.filter((u) => u.kind === "move"), data), ...unclearAssignLines(due.filter((u) => u.kind === "assign"), data, findItem)], cx),
  // A card by its key, and the data with its fields set (actions/assign.js).
  find: (data, key) => findItem(data, key),
  withItem: withCard,
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

function drawBoard(b, t, mono, view, st) {
  const cols = b.navColumns(view);
  const allSpaces = spaces();
  const dragged = b.drag ? findCard(st.data, b.drag.key)?.card : null;
  const columnEl = (col, ci) => {
    // Cards the filter or "nur meine" hides in this column.
    const filtered = col.cards.length - col.shown.length;
    const focusedCol = st.sel?.col === ci;
    const target = Boolean(dragged) && b.over === ci && b.drag.from !== col.id && canDrop(st.data, dragged, col);
    // The column's ground, which its head is laid over too; a drop target
    // takes another.
    const ground = t.chrome;
    const head = columnHead(t, col, filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length), ground);
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
      .bg(target ? t.selected : ground)
      .p(10)
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
          .gap(6)
          .overflow_y_scrollbar()
          .track_scroll(boardState(b).scrolls[ci % SCROLLS])
          .children(col.shown.map((card) => drawCard(b, t, mono, view, st, card, col, ci, allSpaces)))
          .when(!col.shown.length, (el) => el.child(div().text_size(12).text_color(t.muted).child(filtered ? `keine Karten (${filtered} ausgeblendet)` : "keine Karten"))),
      );
  };
  return v_flex()
    .flex_1()
    .min_h(0)
    .when(st.data.columns.some((c) => c.hidden), (el) => el.child(hiddenLine(b, t, view, st)))
    .child(
      cols.length
        ? h_flex().id("columns").flex_1().min_h(0).gap(12).p(14).items_start().children(cols.map(columnEl))
        : div().p(20).text_color(t.muted).child("Alle Spalten sind ausgeblendet: ein Name oben oder X zeigt eine wieder"),
    )
    .when(Boolean(st.data.limited), (el) =>
      el.child(div().px(16).pb(8).text_size(12).text_color(t.ansi3)
        .child(`Nur die ersten ${st.data.limit ?? view.limit} von ${st.data.total} Einträgen; mehr Spalten ausblenden oder den Filter enger fassen`)),
    );
}

// The line above the columns that names the hidden ones; a click on a name
// shows that column again.
function hiddenLine(b, t, view, st) {
  const hidden = st.data.columns.filter((c) => c.hidden);
  return h_flex()
    .id("hidden-columns")
    .flex_none()
    .flex_wrap()
    .gap(6)
    .px(16)
    .pt(10)
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

// A card in its column `col`: its left edge in the column's color, its key,
// its title, and a line of its type and labels as chips (not the label an
// Epic by its title takes its type's color from: epicLabel), its
// sub-issues' count, its assignees and its session's chip; an issue type
// with a color draws a line across its top in that color too (typeLine).
function drawCard(b, t, mono, view, st, card, col, ci, allSpaces) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
  const session = linkedSession(card, allSpaces);
  const type = typeChip(t, card);
  const labels = card.labels.filter((l) => l !== epicLabel(card));
  const line = typeLine(t, card, null, 6);
  return h_flex()
    .id(`card-${card.key}`)
    .relative()
    .flex_none()
    .items_stretch()
    .py(9)
    .pl(5)
    .pr(9)
    .gap(7)
    .rounded(8)
    .border_1()
    .map(selectedLook(t, selected, t.border, t.background))
    .opacity(dragging ? 0.5 : st.pending[card.key] ? 0.7 : 1)
    .cursor_pointer()
    .on_mouse_down("left", (_e, cx) => {
      cx.stop_propagation();
      if (b.modal) return;
      // The press selects nothing: it is no choice (clickItem) until it ends
      // as a click or a drop.
      b.drag = { key: card.key, from: card.column };
      b.over = ci;
      b.handle.focus();
      cx.notify();
    })
    .on_mouse_up("left", (_e, cx) => {
      // Released on the card it started on: a click (clickItem). Released on
      // another card: the column under it takes the drop. A release without
      // a press on the card is no click.
      if (b.modal || b.drag?.key !== card.key) return;
      cx.stop_propagation();
      b.endDrag(cx);
      b.clickItem(view, { col: ci, key: card.key }, cx);
    })
    .child(cardEdge(t, col))
    .child(v_flex().flex_1().min_w(0).gap(6)
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
          .when(Boolean(type), (el) => el.child(type))
          .children(labels.slice(0, 3).map((l) => labelChip(t, card, l)))
          .when(labels.length > 3, (el) => el.child(chip(t, `+${labels.length - 3}`)))
          .when(Boolean(card.sub), (el) => el.child(div().text_size(11).text_color(t.muted).child(`◔ ${card.sub?.done}/${card.sub?.total}`)))
          .when(card.assignees.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(card.assignees.join(", "))))
          .when(Boolean(session), (el) => el.child(sessionChip(t, session))),
      ))
    .when(Boolean(line), (el) => el.child(line));
}

// Hides a shown column or shows a hidden one; the selection follows
// (reselectIn).
function toggleBoardColumn(b, view, col, cx) {
  const st = b.state(view.id);
  if (!st.data) return;
  if (!col.target) return b.say(`„${col.name}“ lässt sich nicht ausblenden`, "info", cx);
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
