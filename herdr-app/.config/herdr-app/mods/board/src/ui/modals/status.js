// The status menu: the columns a card may go to, picked with j/k and Enter,
// a digit, or a click. A shape with columns opens it (openStatusMenu) as
// b.modal = { kind: "status", view, key, targets, at }.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { layer } from "../helpers.js";

export const statusModal = {
  render(b, t) {
    const m = b.modal;
    return layer(
      t,
      "status-layer",
      v_flex()
        .id("status-menu")
        .w(280)
        .p(8)
        .gap(2)
        .rounded(10)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(div().px(8).py(6).text_size(12).text_color(t.muted).child("Status ändern · j/k Enter · Esc"))
        .children(
          m.targets.map((c, i) =>
            h_flex()
              .id(`status-${i}`)
              .px(8)
              .py(6)
              .gap(8)
              .items_center()
              .rounded(6)
              .cursor_pointer()
              .when(i === m.at, (el) => el.bg(t.selected))
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => {
                b.closeModal(cx);
                b.moveTo(m.view, m.key, c.id, cx);
              })
              .child(div().w(14).text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
              .child(div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted))
              .child(div().flex_1().child(c.name))
              .when(Boolean(c.hidden), (el) => el.child(div().text_size(11).text_color(t.dim).child("ausgeblendet"))),
          ),
        ),
    );
  },

  // Every key but Esc (the Board's): j/k or the arrows move, Enter or a
  // digit picks; all are taken.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    const ch = e.key_char ?? "";
    cx.stop_propagation();
    let commit = k === "enter";
    if (k === "j" || k === "down") m.at = Math.min(m.at + 1, m.targets.length - 1);
    else if (k === "k" || k === "up") m.at = Math.max(m.at - 1, 0);
    else if (/^[1-9]$/.test(ch)) {
      // A digit beyond the rows does nothing.
      if (!m.targets[Number(ch) - 1]) return cx.notify();
      m.at = Number(ch) - 1;
      commit = true;
    }
    if (!commit) return cx.notify();
    b.closeModal(cx);
    b.moveTo(m.view, m.key, m.targets[m.at].id, cx);
  },
};
