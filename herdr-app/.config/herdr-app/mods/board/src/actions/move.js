// Moving a card between a view's columns: at once, written by the view's
// loader (its move), as writeAtOnce writes; the selection the board sets
// when the shown columns change; and, after a refresh, where the cards of
// unclear moves ended up. The board and the sprint shape move their cards
// so.

import { itemLabel } from "../shared.js";
import { canDrop, findCard, moveCard, rollback } from "../kinds/board.js";
import { selectionInColumns } from "../select.js";
import { writeAtOnce } from "./write.js";

// Moves a card to a column at once and writes it. A refusal moves it back
// with the error shown; a write whose outcome is unclear leaves it and
// refreshes. A card moved to a hidden column leaves the board; the notice
// says so, and the selection, where it was on that card, stays in its
// column.
export function moveCardTo(b, view, key, columnId, cx) {
  const st = b.state(view.id);
  const found = findCard(st.data, key);
  const to = st.data?.columns.find((c) => c.id === columnId);
  if (!found || !to) return b.say("Die Karte oder Spalte gibt es nicht mehr", "warning", cx);
  if (found.column.id === columnId) return;
  const label = itemLabel(found.card);
  const move = { key, from: found.column.id, to: columnId, at: Date.now(), confirmedAt: null };
  const hiddenNote = () => (st.hidden?.has(to.name) ? " (ausgeblendet)" : "");
  writeAtOnce(b, view, {
    key,
    label,
    refuse: canDrop(st.data, found.card, to) ? null : `${label} kann nicht nach „${to.name}“`,
    apply() {
      const before = b.navColumns(view);
      st.moves.push(move);
      st.data = moveCard(st.data, key, columnId);
      if (to.hidden && st.sel?.key === key) reselectIn(b, view, before);
    },
    write: () => b.loader(view).move(view, st.data, found.card, to),
    landed: () => (move.confirmedAt = Date.now()),
    failed: () => (st.moves = st.moves.filter((m) => m !== move)),
    undo: () => (st.data = rollback(st.data, move)),
    open: { kind: "move", to: { id: to.id, name: to.name } },
    texts: {
      pending: () => `${label} → ${to.name}${hiddenNote()} …`,
      landed: () => `${label} steht jetzt in „${to.name}“${hiddenNote()}`,
      unclear: `${label} → ${to.name}`,
      // With an earlier outcome of the card open, where it is now is for
      // the refresh to say.
      refused: (why, earlier) => (earlier ? `${label} → ${to.name} nicht gespeichert: ${why}` : `${label} bleibt in „${found.column.name}“: ${why}`),
    },
  }, cx);
}

// After the shown columns changed from `before`: the selection the board
// sets (selectionInColumns, reselect).
export function reselectIn(b, view, before) {
  b.reselect(view, selectionInColumns(before, b.navColumns(view), b.state(view.id).sel));
}

// Where the cards of settled unclear moves (`due`, of kind "move") are in
// the new data, one line each: the target column, the write
// landed (info); another column, a warning; not there while the target is
// hidden, not shown (info); not there while other columns are hidden, not
// shown, it may be in any of them (warning); else not on the board
// (warning).
export function unclearMoveLines(due, data) {
  return due.map((u) => {
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
}
