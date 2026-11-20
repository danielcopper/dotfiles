// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns that keyboard
// movement and selection walk, a list as one), selected (the selected
// item), scrollTo, items (every item the shape draws, whatever the filter:
// on a board, the cards of its shown columns; a shape without items, the
// placeholder, leaves Enter, o and the arrows to herdr), count ({ shown,
// total } items, or null), render, hints (the hint line's entries), dirs
// (the arrow directions that move), loads (false for the placeholder, which
// draws without data), keys (handles the shape's own keys; true when it
// took one), received (the data as kept after a refresh) and warnings; and
// where it has them, detailParts (its rows in the detail panel), settle
// (says where the cards of unclear writes ended up), moveTo, toggleColumn,
// openStatusMenu, navigate (its own keyboard movement in place of
// navigate's, select.js) and pickStatus (what a pick in the status menu
// does in place of a move to that column). A shape keeps its own state per Board in
// b.shapeState[name], which its state() makes once, when the Board starts:
// herdr refuses a ScrollHandle made while a view draws ("cannot run during
// render"). A new way to draw is a module here and its entry in SHAPES.

import { boardShape } from "./board.js";
import { placeholderShape } from "./placeholder.js";
import { prsShape } from "./prs.js";
import { sprintShape } from "./sprint.js";

export const SHAPES = { board: boardShape, prs: prsShape, sprint: sprintShape, placeholder: placeholderShape };
