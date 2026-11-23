// What shows and what is selected, whatever a view's shape: the text filter,
// "nur meine", and keyboard movement over columns (a list is one column).

import { itemKey } from "./shared.js";

// Whether `texts` (falsy ones left out) hold every word of `filter`
// between them, case-insensitive; an empty filter matches anything.
export function wordsMatch(texts, filter) {
  const words = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hay = texts.filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// Cards whose text holds every word of the filter (wordsMatch); their
// assignees count by name and by login.
export function matches(card, text) {
  return wordsMatch([card.title, card.number !== null ? `#${card.number}` : "", itemKey(card), card.repo, card.type, card.author, card.branch,
    ...(card.labels ?? []), ...(card.assignees ?? []), ...(card.assigneeLogins ?? [])], text);
}

// Whether an item is one's own, for "nur meine": it came from a search of
// one's own (ownByQuery), or `me` (the login the data was read as; null
// when the source did not say) is the login of one of its assignees
// (assigneeLogins; `assignees` are their names), its author, or a reviewer
// asked for.
export const isMine = (item, me) =>
  item.ownByQuery === true ||
  (Boolean(me) && ((item.assigneeLogins ?? []).includes(me) || item.author === me || (item.reviewers ?? []).includes(me)));

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

// gg/G (Home/End): the first (`end` "top") or last ("bottom") card of the
// selected column; null where that column shows none.
export function edgeOf(columns, sel, end) {
  const cards = columns[sel?.col]?.shown ?? [];
  if (!cards.length) return null;
  return { col: sel.col, key: (end === "top" ? cards[0] : cards.at(-1)).key };
}

// The index of the column whose shown cards hold `key`; -1 for none.
export const columnOf = (columns, key) => columns.findIndex((c) => c.shown.some((card) => card.key === key));

// Where `item` (any item that names its source, kind, repo and number, such
// as a related item's line) stands among the shown cards of `columns`, as
// a selection { col, key }; null where none of them is that item.
export function placeOf(columns, item) {
  for (const [col, c] of columns.entries()) {
    const card = c.shown.find((i) => i.source === item.source && i.kind === item.kind && i.repo === item.repo && i.number === item.number);
    if (card) return { col, key: card.key };
  }
  return null;
}

// The selection after new data or a filter: its card's column again, else the
// first card; a selected empty column stays selected.
export function selectionAfter(columns, sel) {
  const at = columnOf(columns, sel?.key);
  if (at >= 0) return { col: at, key: sel.key };
  if (!sel?.key && columns[sel?.col]) return sel;
  const first = columns.findIndex((c) => c.shown.length);
  return first >= 0 ? { col: first, key: columns[first].shown[0].key } : { col: 0, key: null };
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
