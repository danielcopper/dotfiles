// The column menu: every column of a board view, shown or hidden, walked
// with j/k; Enter, a digit or a click hides or shows one, and the menu stays
// open until Esc. The board shape opens it (X) as b.modal = { kind:
// "columns", view, at }; it reads the columns from the view's data as they
// are now, so a toggle shows at once.

import { div } from "gpui-kit";
import { menu, menuKey } from "../helpers.js";

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
    return menu(t, {
      id: "columns",
      rowId: "column",
      width: 320,
      title: "Spalten zeigen · j/k Enter · Esc",
      at: m.at,
      pick: (i, cx) => toggleAt(b, m, i, cx),
      rows: columnsOf(b, m).map((c) => [
        div().w(14).text_color(t.foreground).child(c.hidden ? "" : "✓"),
        div().size(9).flex_none().rounded(5).bg(t[c.color] ?? t.muted),
        div().flex_1().min_w(0).truncate().text_color(c.hidden ? t.muted : t.foreground).child(c.name),
        div().flex_none().text_size(11).text_color(t.dim).child(c.count === null ? "" : String(c.count)),
        div().w(80).flex_none().text_size(11).text_color(t.dim).child(!c.target ? "immer gezeigt" : c.hidden ? "ausgeblendet" : "gezeigt"),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, columnsOf(b, b.modal).length, (i, cx) => toggleAt(b, b.modal, i, cx)),
};
