// The prs shape: a list of pull requests in sections, walked as one column.
// The data: { shape: "prs", sections: [{ name, count, limited, skipped,
// rows }], viewer } (parseGithubList); a row's author, draft and checks
// show where it has them. View fields it reads: id.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ageLabel, itemLabel } from "../../shared.js";
import { shownOf } from "../helpers.js";

// The rows that show, as one column.
const prsRows = (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => s.rows.filter((r) => b.visible(r, st.data))) }];

export const prsShape = {
  nav: prsRows,
  selected: (b, st) => prsRows(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo: (b, view, sel) => scrollToRow(b, view, sel.key),
  count(b, data) {
    const rows = data.sections.flatMap((s) => s.rows);
    return { shown: rows.filter((r) => b.visible(r, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawPrs(b, t, mono, view, st),
  hints: [["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"]],
  dirs: ["up", "down"],
  items: true,
  keys: () => false,
  received: (data) => data,
  warnings: (_view, data) => data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`),
  column: () => null,
};

function drawPrs(b, t, mono, view, st) {
  const now = Date.now();
  const row = (r) => {
    const selected = st.sel?.key === r.key;
    return h_flex()
      .id(`row-${r.key}`)
      .flex_none()
      .gap(12)
      .px(18)
      .py(8)
      .items_center()
      .border_l(2)
      .border_color(selected ? t.accent : t.background)
      .when(selected, (el) => el.bg(t.selected))
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (b.modal) return;
        st.sel = { col: 0, key: r.key };
        st.detail = true;
        b.handle.focus();
        cx.notify();
      })
      .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(r)))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.draft ? `${r.author} · Entwurf` : r.author)))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(b.checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  };
  const children = [];
  for (const s of st.data.sections) {
    const rows = s.rows.filter((r) => b.visible(r, st.data));
    // While the filter or "nur meine" hides rows, the count is of those loaded.
    const count = rows.length < s.rows.length ? shownOf(rows.length, s.rows.length) : `${s.count}${s.limited ? ` (erste ${s.rows.length})` : ""}`;
    children.push(div().flex_none().px(20).pt(12).pb(4).text_size(11).text_color(t.muted).child(`${s.name.toUpperCase()} · ${count}`));
    children.push(...rows.map(row));
  }
  return v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(b.listScroll).children(children);
}

function scrollToRow(b, view, key) {
  const st = b.state(view.id);
  let child = 0;
  for (const s of st.data.sections) {
    child++; // the section's heading
    for (const r of s.rows.filter((row) => b.visible(row, st.data))) {
      if (r.key === key) return b.listScroll.scroll_to_item(child);
      child++;
    }
  }
}
