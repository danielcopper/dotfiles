// The status menu: the columns a card may go to, or the states an item may
// take, picked with j/k and Enter, a digit, or a click; named after what it
// sets (Board.statusField). A shape with columns or states opens it
// (openStatusMenu) as b.modal = { kind: "status", view, key, targets, at }.

import { div } from "gpui-kit";
import { columnColor, menu, menuKey } from "../helpers.js";

// Moves the card to the target at `i`, or does what the view's shape does
// with a pick (pickStatus).
function pickTarget(b, m, i, cx) {
  b.closeModal(cx);
  const pick = b.shape(m.view).pickStatus;
  if (pick) pick(b, m.view, m.key, m.targets[i], cx);
  else b.moveTo(m.view, m.key, m.targets[i].id, cx);
}

export const statusModal = {
  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "status",
      rowId: "status",
      width: 280,
      title: `${b.statusField(m.view)} ändern`,
      at: m.at,
      pick: (i, cx) => pickTarget(b, m, i, cx),
      rows: m.targets.map((c) => [
        div().size(9).flex_none().rounded(5).bg(columnColor(t, c)),
        div().flex_1().child(c.name),
        ...(c.hidden ? [div().text_size(11).text_color(t.dim).child("ausgeblendet")] : []),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, b.modal.targets.length, (i, cx) => pickTarget(b, b.modal, i, cx)),
};
