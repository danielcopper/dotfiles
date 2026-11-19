// The placeholder shape: what a view whose source reads nothing for it yet
// shows, the text of its kind (KINDS). It has no items, so Enter, o and the
// arrows are left to herdr. View fields it reads: source, layout.

import { div } from "gpui-kit";
import { kindOf } from "../../kinds/index.js";

export const placeholderShape = {
  nav: () => [],
  selected: () => null,
  scrollTo() {},
  count: () => null,
  render: (b, t, mono, view) => div().p(20).text_color(t.muted).child(kindOf(view)?.text ?? "Diese Ansicht gibt es noch nicht"),
  items: () => [],
  hints: [],
  dirs: [],
  loads: false,
  keys: () => false,
  received: (data) => data,
  warnings: () => [],
  column: () => null,
};
