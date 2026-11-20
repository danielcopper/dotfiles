// The status menu: the columns a card may go to, picked with j/k and Enter,
// a digit, or a click. A shape with columns opens it (openStatusMenu) as
// b.modal = { kind: "status", view, key, targets, at }.

import { div } from "gpui-kit";
import { menu, menuKey } from "../helpers.js";

// Moves the card to the target at `i`.
function pickTarget(b, m, i, cx) {
  b.closeModal(cx);
  b.moveTo(m.view, m.key, m.targets[i].id, cx);
}

export const statusModal = {
  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "status",
      rowId: "status",
      width: 280,
      title: "Status ändern · j/k Enter · Esc",
      at: m.at,
      pick: (i, cx) => pickTarget(b, m, i, cx),
      rows: m.targets.map((c) => [
        div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted),
        div().flex_1().child(c.name),
        ...(c.hidden ? [div().text_size(11).text_color(t.dim).child("ausgeblendet")] : []),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, b.modal.targets.length, (i, cx) => pickTarget(b, b.modal, i, cx)),
};
