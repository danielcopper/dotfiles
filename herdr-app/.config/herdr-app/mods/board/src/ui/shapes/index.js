// The shapes a view's data is drawn and worked in, by name: data carries
// the shape it was read in (data.shape); before any, the view's kind names
// it (KINDS), and a view its source reads nothing for has the placeholder.
// Each shape, taking the Board as `b`: nav (the columns that keyboard
// movement and selection walk, a list as one), selected (the selected
// item), scrollTo, items (every item the shape draws, whatever the filter:
// on a board, the cards of its shown columns; a shape without items, the
// placeholder, leaves Enter, o and the arrows to herdr), count ({ shown,
// total } items, or null), render, dirs (the arrow directions that move),
// loads (false for the placeholder, which draws without data), received
// (data, st, view: the data as kept after a refresh, `view` as the config
// has it now) and warnings; and where it has them,
// the actions it lends the action table (commands.js, which says their
// keys and hints): move (b, view, st, by, cx: H/L) with canMove (st, item,
// by: whether the item has a column that way) and moveHint, canHide (col:
// whether a column can be hidden, beside toggleColumn), fold (b, view, st,
// cx: z), create (b, view, cx: n), pickSprint (b, view, cx: the sprint
// picker, ui/modals/sprints.js) with showSprint (b, view, sprint, cx, id:
// the sprint it shows, null for the current one, whose id `id` names
// where it is known) and enterHint (Enter's hint);
// columnCount (how many columns it draws side by side, which the detail
// panel's share of the width is no narrower than one of: detailWidth; a list
// has none), bandsLeft (b: whether a column or list scrolled past the items
// it drew whole, which the Board asks every BAND_MS), toSaved and fromSaved
// (data: the data as its saved state keeps it, and back), detailParts (its
// rows in the detail panel), settle (b, view, due, data, cx: says how the
// unclear writes of its items ended up), withView (data, view: the data as
// the view's settings show it now, the same data where they change nothing
// for it), toggleRepo (b, view, repo, cx: turns a repo off or on, beside the
// repo menu, ui/modals/repos.js), moveTo, toggleColumn, openStatusMenu with
// statusField (b, view: the name of what the status menu sets, where it is
// not the status; null for none), navigate (its own keyboard movement in
// place of navigate's, select.js), pickStatus (what a pick in the status
// menu does in place of a move to that column), and assign (how its items'
// assignees are found and changed: { find(data, key), withItem(data, key,
// patch) (the data with the item's fields set), where (where an item no
// longer is: "im Sprint") }; a shape that has it takes a, the assignee
// picker, ui/modals/assign.js, and its settle says the outcomes of unclear
// assignments, unclearAssignLines).
// A shape keeps its own state per Board in b.shapeState[name], which its
// state() makes once, when the Board starts: herdr refuses a ScrollHandle
// made while a view draws ("cannot run during render"). A new way to draw
// is a module here and its entry in SHAPES.

import { backlogShape } from "./backlog.js";
import { boardShape } from "./board.js";
import { placeholderShape } from "./placeholder.js";
import { prsShape } from "./prs.js";
import { sprintShape } from "./sprint.js";
import { tableShape } from "./table.js";

export const SHAPES = { board: boardShape, prs: prsShape, sprint: sprintShape, backlog: backlogShape, table: tableShape, placeholder: placeholderShape };
