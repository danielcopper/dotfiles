// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns keyboard movement
// and selection walk, a list as one), selected (the selected item),
// scrollTo, count ({ shown, total } items, or null), render, hints (the
// hint line's entries), dirs (the arrow directions that move), items
// (whether it has any; without, Enter, o and the arrows stay herdr's), keys
// (handles the shape's own keys; true when it took one), received (the data
// as kept after a refresh), warnings and column (an item's column, for its
// detail); and where it has them, settle (says where the cards of unclear
// writes ended up), moveTo, toggleColumn and openStatusMenu. A new way to
// draw is a module here and its entry in SHAPES.

import { boardShape } from "./board.js";
import { placeholderShape } from "./placeholder.js";
import { prsShape } from "./prs.js";

export const SHAPES = { board: boardShape, prs: prsShape, placeholder: placeholderShape };
