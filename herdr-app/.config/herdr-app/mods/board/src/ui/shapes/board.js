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
import { notify, spaces } from "herdr";
import { BoardError, itemLabel } from "../../shared.js";
import { applyMoves, canDrop, findCard, hiddenColumns, moveCard, rollback, shownColumns, stepTarget, targetsFor, toggleHidden, unknownHidden, withHidden } from "../../kinds/board.js";
import { viewKind } from "../../kinds/index.js";
import { selectionInColumns } from "../../select.js";
import { AGENT_STATUS, linkedSession } from "../../actions/start.js";
import { button, report, shownOf, store } from "../helpers.js";

// How many columns keep their own scroll position.
const SCROLLS = 24;

// The board shape's own state on a Board (state(), shapes/index.js): one
// scroll handle per column (SCROLLS, reused beyond).
const boardState = (b) => b.shapeState.board;

export const boardShape = {
  state: () => ({ scrolls: Array.from({ length: SCROLLS }, () => ScrollHandle.new()) }),
  nav: (b, st) => shownColumns(st.data, b.filterText, b.mine),
  selected: (b, st) => findCard(st.data, st.sel?.key)?.card ?? null,
  scrollTo: (b, view, sel, row) => boardState(b).scrolls[sel.col % SCROLLS].scroll_to_item(row),
  // All items, whatever the filter: the cards of the shown columns.
  items: (data) => data.columns.filter((c) => !c.hidden).flatMap((c) => c.cards),
  count(b, data) {
    const cols = shownColumns(data, b.filterText, b.mine);
    return { shown: cols.reduce((n, c) => n + c.shown.length, 0), total: cols.reduce((n, c) => n + c.cards.length, 0) };
  },
  render: (b, t, mono, view, st) => (st.data.columns.length ? drawBoard(b, t, mono, view, st) : div().p(20).text_color(t.muted).child("Keine Einträge")),
  hints: [["h/l j/k", "bewegen"], ["H/L", "verschieben"], ["s", "Status"], ["x", "Spalte ausblenden"], ["X", "Spalten"], ["Enter", "Detail · Agent"], ["o", "öffnen"]],
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
  settle: (b, due, data, cx) => tellUnclear(b, due, data, cx),
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
      chips: [
        div()
          .id("status-pill")
          .px(10)
          .py(2)
          .rounded(12)
          .text_size(12)
          .font_semibold()
          .cursor_pointer()
          .bg(t[column.color] ?? t.muted)
          .text_color(t.background)
          .on_click((_e, cx) => openStatus(cx))
          .child(`${column.name} ▾`),
      ],
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
    const head = h_flex()
      .gap(6)
      .items_center()
      .child(div().size(9).flex_none().rounded(5).bg(t[col.color] ?? t.muted))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(col.name))
      .child(div().flex_none().text_size(12).text_color(t.muted).child(filtered ? shownOf(col.shown.length, col.count ?? col.cards.length) : String(col.count ?? col.shown.length)));
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
      .bg(target ? t.selected : t.chrome)
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
        if (from !== col.id) b.chooseDropped(view, key);
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
          .children(col.shown.map((card) => drawCard(b, t, mono, view, st, card, ci, allSpaces)))
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

function drawCard(b, t, mono, view, st, card, ci, allSpaces) {
  const selected = st.sel?.key === card.key;
  const dragging = b.drag?.key === card.key;
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

// Moves a card to a column at once and writes it (the view's loader's
// move); one write per card at a time; the sprint shape moves its tasks so
// too. A refusal moves it back with the error shown; a write whose outcome
// is unclear leaves it and refreshes.
export function moveCardTo(b, view, key, columnId, cx) {
  const st = b.state(view.id);
  const found = findCard(st.data, key);
  const to = st.data?.columns.find((c) => c.id === columnId);
  if (!found || !to) return b.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
  const label = itemLabel(found.card);
  if (found.column.id === columnId) return;
  if (st.pending[key]) return b.say(`${label} wird noch gespeichert`, "info", cx);
  if (!canDrop(st.data, found.card, to)) return b.say(`${label} kann nicht nach „${to.name}“`, "warning", cx);
  const move = { key, from: found.column.id, to: columnId, at: Date.now(), confirmedAt: null };
  const before = b.navColumns(view);
  st.moves.push(move);
  st.data = moveCard(st.data, key, columnId);
  st.pending[key] = true;
  // A card moved to a hidden column leaves the board; the notice says so. The
  // selection, where it was on that card, stays in its column.
  if (to.hidden && st.sel?.key === key) reselectIn(b, view, before);
  const hiddenNote = () => (st.hidden?.has(to.name) ? " (ausgeblendet)" : "");
  b.say(`${label} → ${to.name}${hiddenNote()} …`, "info", cx);
  cx.spawn(async (cx) => {
    try {
      await b.loader(view).move(view, st.data, found.card, to);
      move.confirmedAt = Date.now();
      // A new move that landed replaces the open outcome of an earlier one.
      st.unclear = st.unclear.filter((u) => u.key !== key);
      b.say(`${label} steht jetzt in „${to.name}“${hiddenNote()}`, "success", cx);
    } catch (e) {
      st.moves = st.moves.filter((m) => m !== move);
      const why = report(e);
      // Followed up only while views.json still has this view, of the same
      // kind (as the last valid views.json says; an invalid one in between
      // keeps it).
      const followed = b.kinds?.get(view.id) === viewKind(view);
      const current = b.viewById(view.id);
      if (e instanceof BoardError && e.unclear) {
        if (followed) st.unclear = [...st.unclear.filter((u) => u.key !== key), { key, label, to: { id: to.id, name: to.name }, at: Date.now() }];
        const next = !followed ? "" : current ? "; lädt neu" : "; wird nach dem nächsten Neuladen gemeldet";
        b.say(`${label} → ${to.name}: ${why}${next}`, "warning", cx);
        notify({ title: `Status von ${label}`, body: why, level: "warning" });
        if (followed && current) b.refresh(current, cx);
      } else {
        st.data = rollback(st.data, move);
        // With an earlier outcome of the card open, where it is now is for
        // the refresh to say.
        const open = st.unclear.some((u) => u.key === key);
        b.say(open ? `${label} → ${to.name} nicht gespeichert: ${why}` : `${label} bleibt in „${found.column.name}“: ${why}`, "error", cx);
        notify({ title: `Status von ${label} nicht geändert`, body: why, level: "error" });
        // An earlier unclear write of the card waited for this one; the
        // server's answer tells it now.
        if (followed && current && open) b.refresh(current, cx);
      }
    } finally {
      delete st.pending[key];
      cx.notify();
    }
  });
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

// After the shown columns changed from `before`: the selection the board
// sets (selectionInColumns, reselect).
function reselectIn(b, view, before) {
  b.reselect(view, selectionInColumns(before, b.navColumns(view), b.state(view.id).sel));
}

function openBoardStatusMenu(b, view) {
  const st = b.state(view.id);
  const card = b.selected(view);
  if (!card) return;
  const targets = targetsFor(st.data, card);
  const at = Math.max(0, targets.findIndex((c) => c.id === findCard(st.data, card.key)?.column.id));
  b.modal = { kind: "status", view, key: card.key, targets, at };
}

// Where the cards of settled unclear writes (`due`) are in the new data:
// the target column, the write landed (info); another column, a warning;
// not there while the target is hidden, not shown (info); not there while
// other columns are hidden, not shown, it may be in any of them (warning);
// else not on the board (warning).
export function tellUnclear(b, due, data, cx) {
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
  b.say(text, level, cx);
  if (level === "warning") notify({ title: "Status nach dem Neuladen", body: text, level: "warning" });
}
