// A board's columns and cards: hidden columns, moves and their rollback,
// where a card may go, and the columns as shown.

import { isObject, itemLabel, textList } from "../shared.js";
import { navigate, shows, showsAll } from "../select.js";
import { hidePath } from "../config.js";
import { ORIGIN } from "../settings.js";

// What an older board stored of a view's columns, { hide: [names], show:
// [names] }, or null when what was stored is not that.
export function readStoredHidden(value) {
  return isObject(value) && textList(value.hide) && textList(value.show) ? { hide: [...value.hide], show: [...value.show] } : null;
}

export const hiddenKey = (id) => `hidden:${id}`;

export function storedHiddenList(view, stored) {
  const hidden = new Set(view.hide);
  for (const name of stored.hide) hidden.add(name);
  for (const name of stored.show) hidden.delete(name);
  return [...hidden];
}

// `entryOf(view)`: what the store holds for the view, undefined for nothing.
// → { moves: [{ view, list }], drop: [view] }: an entry is dropped where it
// is no stored hide, its view no board or one without settings of its own
// (settingsPath null), this machine sets the view's hide already, or it
// changes nothing.
export function storedHiddenMoves(views, entryOf, originAt) {
  const moves = [];
  const drop = [];
  for (const view of views) {
    const entry = entryOf(view);
    if (entry === undefined) continue;
    const stored = readStoredHidden(entry);
    const list = stored && view.layout === "board" && view.settingsPath && originAt(hidePath(view)) !== ORIGIN.machine ? storedHiddenList(view, stored) : null;
    if (list && !sameNames(list, view.hide)) moves.push({ view, list });
    else drop.push(view);
  }
  return { moves, drop };
}

export function sameNames(a, b) {
  const one = new Set(a);
  const other = new Set(b);
  return one.size === other.size && [...one].every((n) => other.has(n));
}

export const hiddenColumns = (view) => new Set(view.hide);

// Whether a column can be hidden: one with a target (an option or an
// iteration of the view's column field); the column without a value is
// always shown.
export const hideable = (column) => Boolean(column?.target);

// null for a column that cannot be hidden.
export function toggledHidden(view, column) {
  if (!hideable(column)) return null;
  return view.hide.includes(column.name) ? view.hide.filter((n) => n !== column.name) : [...view.hide, column.name];
}

// Names in a view's hide that match none of `columns`.
export function unknownHidden(view, columns) {
  const names = new Set(columns.map((c) => c.name));
  return view.hide.filter((n) => !names.has(n));
}

const cloneBoard = (board) => ({ ...board, columns: board.columns.map((c) => ({ ...c, cards: [...c.cards] })) });

export function findCard(board, key) {
  for (const col of board?.columns ?? []) {
    const card = col.cards.find((c) => c.key === key);
    if (card) return { card, column: col };
  }
  return null;
}

// The data with the card `key`'s fields set to those of `patch`.
export const withCard = (board, key, patch) => ({
  ...board, columns: board.columns.map((c) => ({ ...c, cards: c.cards.map((card) => (card.key === key ? { ...card, ...patch } : card)) })),
});

// A new board with the card in another column; counts follow (a hidden
// column's count, where it has one, is the server's plus what was moved in).
// Unchanged when the card or column is unknown, or the card is there already.
export function moveCard(board, key, columnId) {
  const found = findCard(board, key);
  if (!found || !board.columns.some((c) => c.id === columnId) || found.column.id === columnId) return board;
  const next = cloneBoard(board);
  const from = next.columns.find((c) => c.id === found.column.id);
  const to = next.columns.find((c) => c.id === columnId);
  from.cards = from.cards.filter((c) => c.key !== key);
  if (from.count !== null) from.count--;
  to.cards.push({ ...found.card, column: columnId });
  if (to.count !== null) to.count++;
  return next;
}

// A failed move undone: the card goes back to move.from, unless it has moved
// on since.
export function rollback(board, move) {
  return findCard(board, move.key)?.column.id === move.to ? moveCard(board, move.key, move.from) : board;
}

// Whether an open outcome is due for a refresh that started at `started`: it
// came before that refresh started, and its card has no write under way
// (that write decides first).
export const isDue = (st, started) => (u) => u.at <= started && !st.pending[u.key];

// Moves laid over every refresh: those still being written, and confirmed
// ones until a refresh that started after the confirmation shows them.
export function pendingMoves(moves, started) {
  return moves.filter((m) => !m.confirmedAt || m.confirmedAt >= started);
}

export function applyMoves(board, moves) {
  return moves.reduce((b, m) => moveCard(b, m.key, m.to), board);
}

// Why a card may not go to a column, as the board says it, or null where it
// may. A taskboard's column names the types it takes (column.types), since
// its name is no state; no board carries meta.types yet. The sprint names
// its types' states as meta.typeStates instead, for the status menu.
export function dropRefusal(board, card, column) {
  const refused = (why = "") => `${itemLabel(card)} kann nicht nach „${column?.name}“${why}`;
  if (!column?.target) return refused();
  if (column.types && !column.types.includes(card.type)) return refused(`: Die Spalte hat für ${card.type} keinen Status`);
  const states = board.meta?.types?.[card.type];
  return !states || states.includes(column.name) ? null : refused();
}

export const canDrop = (board, card, column) => !dropRefusal(board, card, column);

export const targetsFor = (board, card) => board.columns.filter((c) => canDrop(board, card, c));

// The column H (step -1) or L (+1) moves a card to: the next column, hidden
// ones included, the card may go to; null at the edge.
export function stepTarget(board, key, step) {
  const found = findCard(board, key);
  if (!found) return null;
  const columns = board.columns;
  for (let i = columns.findIndex((c) => c.id === found.column.id) + step; i >= 0 && i < columns.length; i += step) {
    if (canDrop(board, found.card, columns[i])) return columns[i];
  }
  return null;
}

// Whether the card `key` has a column to go to `step` columns on
// (stepTarget): what H/L move it to.
export const hasStep = (board, key, step) => Boolean(stepTarget(board, key, step));

// A view's columns with the person's hidden set applied.
export function withHidden(board, hidden) {
  return { ...board, columns: board.columns.map((c) => ({ ...c, hidden: hideable(c) && hidden.has(c.name) })) };
}

export const waitsForCards = (column) => !column.hidden && Boolean(column.cardsNotRead);

export function withOlderCards(board, before) {
  if (before?.shape !== board.shape || !board.columns.some(waitsForCards)) return board;
  const drawnKeys = new Set(board.columns.filter((c) => !waitsForCards(c)).flatMap((c) => c.cards.map((card) => card.key)));
  const older = new Map(before.columns.map((c) => [c.name, c.cards]));
  return {
    ...board,
    columns: board.columns.map((c) => (waitsForCards(c) && older.has(c.name) ? { ...c, cards: older.get(c.name).filter((card) => !drawnKeys.has(card.key)) } : c)),
  };
}

// The columns as the board shows them: hidden ones left out, the others with
// the cards that show (`mine`: only one's own).
export function shownColumns(board, filter, mine = false) {
  const all = showsAll(filter, mine);
  return (board?.columns ?? []).filter((c) => !c.hidden).map((c) => ({ ...c, shown: all ? c.cards : c.cards.filter((card) => shows(card, filter, mine, board.viewer)) }));
}

// The rows of a board with swimlanes (data.lanes), as it draws them: per
// swimlane that shows a card, its head and then its rows, the n-th of which
// holds the n-th card the swimlane has in each column (null where it has
// fewer). `columns` are the shown ones (shownColumns).
export function laneRows(lanes, columns) {
  const rows = [];
  for (const lane of lanes) {
    const cells = columns.map((c) => c.shown.filter((card) => card.lane === lane.id));
    const count = cells.reduce((n, cards) => n + cards.length, 0);
    if (!count) continue;
    rows.push({ head: true, lane, count });
    const depth = Math.max(...cells.map((cards) => cards.length));
    for (let r = 0; r < depth; r++) rows.push({ head: false, lane, cards: cells.map((cards) => cards[r] ?? null) });
  }
  return rows;
}

// Keyboard movement on a board with swimlanes: up and down within the
// column, through its swimlanes in their order (navigate); left and right
// to the next column's card in the same swimlane and row, else its swimlane's
// last there, else as navigate goes.
export function laneNavigate(columns, sel, dir) {
  if (dir !== "left" && dir !== "right") return navigate(columns, sel, dir);
  const from = columns[sel?.col];
  const card = from?.shown.find((c) => c.key === sel?.key);
  const to = Math.min(Math.max((sel?.col ?? 0) + (dir === "left" ? -1 : 1), 0), columns.length - 1);
  if (!card || !columns[to]) return navigate(columns, sel, dir);
  const row = from.shown.filter((c) => c.lane === card.lane).indexOf(card);
  const there = columns[to].shown.filter((c) => c.lane === card.lane);
  return there.length ? { col: to, key: there[Math.min(row, there.length - 1)].key } : navigate(columns, sel, dir);
}
