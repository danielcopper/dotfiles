// The column menu: every column of a board view, shown or hidden, walked
// with j/k; Enter, a digit or a click hides or shows one, and the menu stays
// open until Esc. The board shape opens it (X) as b.modal = { kind:
// "columns", view, at }; it reads the columns from the view's data as they
// are now, so a toggle shows at once.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { backdrop } from "../helpers.js";

// The view's columns, all of them, in the board's order.
const columnsOf = (b, m) => b.state(m.view.id).data?.columns ?? [];

// Hides or shows the column at `at`, on the view as views.json has it now.
function toggleAt(b, m, at, cx) {
  const col = columnsOf(b, m)[at];
  if (!col) return;
  m.at = at;
  b.toggleColumn(b.viewById(m.view.id) ?? m.view, col, cx);
  cx.notify();
}

export const columnsModal = {
  render(b, t) {
    const m = b.modal;
    return backdrop(
      t,
      "columns-backdrop",
      v_flex()
        .id("columns-menu")
        .w(320)
        .p(8)
        .gap(2)
        .rounded(10)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(div().px(8).py(6).text_size(12).text_color(t.muted).child("Spalten zeigen · j/k Enter · Esc"))
        .children(
          columnsOf(b, m).map((c, i) =>
            h_flex()
              .id(`column-${i}`)
              .px(8)
              .py(6)
              .gap(8)
              .items_center()
              .rounded(6)
              .cursor_pointer()
              .when(i === m.at, (el) => el.bg(t.selected))
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => toggleAt(b, m, i, cx))
              .child(div().w(14).text_size(11).text_color(t.dim).child(i < 9 ? String(i + 1) : ""))
              .child(div().w(14).text_color(t.foreground).child(c.hidden ? "" : "✓"))
              .child(div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted))
              .child(div().flex_1().min_w(0).truncate().text_color(c.hidden ? t.muted : t.foreground).child(c.name))
              .child(div().flex_none().text_size(11).text_color(t.dim).child(c.count === null ? "" : String(c.count)))
              .child(div().w(80).flex_none().text_size(11).text_color(t.dim).child(!c.target ? "immer gezeigt" : c.hidden ? "ausgeblendet" : "gezeigt")),
          ),
        ),
    );
  },

  // Every key but Esc (the Board's): j/k or the arrows move, Enter or a digit
  // hides or shows; all are taken.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    const ch = e.key_char ?? "";
    cx.stop_propagation();
    const last = columnsOf(b, m).length - 1;
    if (k === "j" || k === "down") m.at = Math.max(0, Math.min(m.at + 1, last));
    else if (k === "k" || k === "up") m.at = Math.max(m.at - 1, 0);
    else if (k === "enter") return toggleAt(b, m, m.at, cx);
    // A digit beyond the rows does nothing.
    else if (/^[1-9]$/.test(ch)) return toggleAt(b, m, Number(ch) - 1, cx);
    cx.notify();
  },
};
