// What shows and what is selected, whatever a view's shape: the text filter,
// "nur meine", and keyboard movement over columns (a list is one column).

import { itemKey, sameItem } from "./shared.js";

// Whether `texts` (falsy ones left out) hold every word of `filter`
// between them, case-insensitive; an empty filter matches anything.
export function wordsMatch(texts, filter) {
  const words = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hay = texts.filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// The command menu's filter: { entry, at } for each entry of `list` whose
// text (`textOf`) holds the letters of `query` in its order, `at` where
// they stand in it (fuzzyMatch), best first. A tie keeps the shorter text
// first, then the list's order. An empty query keeps the list as it is,
// with no letters.
export function fuzzyRank(list, query, textOf) {
  if (!String(query ?? "").trim()) return list.map((entry) => ({ entry, at: [] }));
  const scored = list.map((entry, n) => ({ entry, n, text: textOf(entry), match: fuzzyMatch(textOf(entry), query) }));
  return scored
    .filter((s) => s.match)
    .sort((x, y) => y.match.score - x.match.score || x.text.length - y.text.length || x.n - y.n)
    .map((s) => ({ entry: s.entry, at: s.match.at }));
}

// How the letters of `query` fit `text`, case-insensitive and spaces left
// out ("nlv" fits "nach links verschieben"): { score, at (the index in the
// text of each letter, as the best fit places them) }, or null where they
// do not fit in their order; an empty query fits with no letters. A letter
// scores 1, 8 more where it starts a word (the text's start or after a
// character that is no letter or digit), 4 more where it follows the
// letter before it, and the text's first letter 2 more; of all the ways
// the letters fit, the best counts.
export function fuzzyMatch(text, query) {
  const q = Array.from(String(query ?? "").toLowerCase().replace(/\s+/g, ""));
  const t = Array.from(String(text).toLowerCase());
  if (!q.length) return { score: 0, at: [] };
  const startsWord = (j) => j === 0 || !/[\p{L}\p{N}]/u.test(t[j - 1]);
  const own = (j) => 1 + (startsWord(j) ? 8 : 0) + (j === 0 ? 2 : 0);
  // Per letter, per place in the text: the best score with that letter
  // there, and where the letter before it stands (`from`).
  let best = t.map((c, j) => (c === q[0] ? { score: own(j), from: null } : null));
  const steps = [best];
  for (const letter of q.slice(1)) {
    const next = t.map(() => null);
    let apart = null; // the best of best[0..j-2], by its place
    for (let j = 1; j < t.length; j++) {
      if (j >= 2 && best[j - 2] && (apart === null || best[j - 2].score > best[apart].score)) apart = j - 2;
      if (t[j] !== letter) continue;
      const after = best[j - 1] ? best[j - 1].score + own(j) + 4 : null;
      const away = apart === null ? null : best[apart].score + own(j);
      if (after === null && away === null) continue;
      next[j] = after !== null && (away === null || after >= away) ? { score: after, from: j - 1 } : { score: away, from: apart };
    }
    best = next;
    steps.push(best);
  }
  let end = -1;
  best.forEach((b, j) => {
    if (b && (end < 0 || b.score > best[end].score)) end = j;
  });
  if (end < 0) return null;
  const at = [];
  for (let i = steps.length - 1, j = end; i >= 0; j = steps[i][j].from, i--) at.unshift(j);
  return { score: best[end].score, at };
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
    const card = c.shown.find((i) => sameItem(i, item));
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
