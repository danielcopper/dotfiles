// The placeholder shape: what a view whose source reads nothing for it yet
// shows, the text of its kind (KINDS), or for a kind not there (a GitHub
// layout the board does not draw) that the board does not know its layout.
// It has no items, so Enter, o and the arrows are left to herdr. View
// fields it reads: source, layout, name.

import { div } from "gpui-kit";
import { kindOf } from "../../kinds/index.js";

export const placeholderShape = {
  nav: () => [],
  selected: () => null,
  scrollTo() {},
  count: () => null,
  render: (b, t, mono, view) => div().p(20).text_color(t.muted).child(kindOf(view)?.text?.(view) ?? `Ansicht „${view.name}“: Darstellung „${view.layout}“ kennt das Board nicht`),
  items: () => [],
  dirs: [],
  loads: false,
  received: (data) => data,
  warnings: () => [],
};
