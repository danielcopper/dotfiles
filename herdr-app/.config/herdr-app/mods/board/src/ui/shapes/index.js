// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns that keyboard
// movement and selection walk, a list as one), selected (the selected
// item), scrollTo, items (every item of the data, whatever the filter; a
// shape without items, the placeholder, leaves Enter, o and the arrows to
// herdr), count ({ shown, total } items, or null), render, hints (the hint
// line's entries), dirs (the arrow directions that move), loads (false for
// the placeholder, which draws without data), keys (handles the shape's own
// keys; true when it took one), received (the data as kept after a
// refresh), warnings and column (an item's column, for its detail); and
// where it has them, detailParts (its rows in the detail panel), settle
// (says where the cards of unclear writes ended up), moveTo, toggleColumn
// and openStatusMenu. A shape keeps its own state per Board in
// b.shapeState[name], which its state() makes when the Board starts (herdr
// refuses a ScrollHandle made while drawing). A new way to draw is a module
// here and its entry in SHAPES.

import { boardShape } from "./board.js";
import { placeholderShape } from "./placeholder.js";
import { prsShape } from "./prs.js";

export const SHAPES = { board: boardShape, prs: prsShape, placeholder: placeholderShape };
