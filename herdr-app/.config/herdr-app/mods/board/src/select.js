// What shows and what is selected, whatever a view's shape: the text filter,
// "nur meine", and keyboard movement over columns (a list is one column).

import { itemKey } from "./shared.js";

// Cards whose text holds every word of the filter, case-insensitive.
export function matches(card, text) {
  const words = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [card.title, card.number !== null ? `#${card.number}` : "", itemKey(card), card.repo, card.type, card.author, card.branch,
    ...(card.labels ?? []), ...(card.assignees ?? [])].filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// Whether an item is one's own, for "nur meine": it came from a search of
// one's own (ownByQuery), or `me` (the login the data was read as; null
// when the source did not say) is one of its assignees, its author, or a
// reviewer asked for.
export const isMine = (item, me) =>
  item.ownByQuery === true ||
  (Boolean(me) && ((item.assignees ?? []).includes(me) || item.author === me || (item.reviewers ?? []).includes(me)));

// Whether an item shows in data read as `viewer`: it matches the filter and,
// with `mine` on, it is one's own.
export const shows = (item, filter, mine, viewer) => matches(item, filter) && (!mine || isMine(item, viewer));

// Keyboard movement: sel = { col, key } (key null on an empty column) → the
// next sel. "up"/"down" move within the column, "left"/"right" to the next
// column, keeping the row where they can. `columns` are those that show
// (hidden ones left out); a list is one column.
export function navigate(columns, sel, dir) {
  if (!columns.length) return { col: 0, key: null };
  let ci = Math.min(Math.max(sel?.col ?? 0, 0), columns.length - 1);
  const cards = (i) => columns[i].shown;
  let row = Math.max(0, cards(ci).findIndex((c) => c.key === sel?.key));
  if (dir === "up" || dir === "down") {
    const list = cards(ci);
    if (!list.length) return { col: ci, key: null };
    row = Math.min(Math.max(row + (dir === "up" ? -1 : 1), 0), list.length - 1);
    return { col: ci, key: list[row].key };
  }
  if (dir === "left" || dir === "right") ci = Math.min(Math.max(ci + (dir === "left" ? -1 : 1), 0), columns.length - 1);
  const list = cards(ci);
  return { col: ci, key: list.length ? list[Math.min(row, list.length - 1)].key : null };
}

// The selection after new data or a filter: its card's column again, else the
// first card; a selected empty column stays selected.
export function selectionAfter(columns, sel) {
  const at = columns.findIndex((c) => c.shown.some((card) => card.key === sel?.key));
  if (at >= 0) return { col: at, key: sel.key };
  if (!sel?.key && columns[sel?.col]) return sel;
  const first = columns.findIndex((c) => c.shown.length);
  return first >= 0 ? { col: first, key: columns[first].shown[0].key } : { col: 0, key: null };
}

// A selection the board sets by itself (after new data, a filter, a move or
// a column hidden) on a view's state: the item the person chose (st.picked)
// stays chosen only where it stays selected.
export function reselect(st, sel) {
  if (st.picked !== sel.key) st.picked = null;
  st.sel = sel;
}

// The selection after the columns changed (`before` → `after`: a column
// hidden or shown, a card moved out of sight): the selected column, found by
// id, else the column now at its index or the last one; there its card,
// else the card now in the same row (the last, past the end); no column,
// { col: 0, key: null }.
export function selectionInColumns(before, after, sel) {
  const was = before[sel?.col];
  const row = Math.max(0, was?.shown.findIndex((c) => c.key === sel?.key) ?? 0);
  const kept = after.findIndex((c) => c.id === was?.id);
  const col = kept >= 0 ? kept : Math.min(sel?.col ?? 0, after.length - 1);
  if (col < 0) return { col: 0, key: null };
  const cards = after[col].shown;
  if (cards.some((c) => c.key === sel?.key)) return { col, key: sel.key };
  return { col, key: cards.length ? cards[Math.min(row, cards.length - 1)].key : null };
}
