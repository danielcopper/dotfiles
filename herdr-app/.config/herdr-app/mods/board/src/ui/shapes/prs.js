// The prs shape: a list of pull requests in sections, walked as one column.
// The data: { shape: "prs", sections: [{ name, count, fetched, limited,
// skipped, rows }], viewer } (parseGithubList); a row's author, draft mark
// and checks show where it has them. View fields it reads: id.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { ageLabel, itemLabel } from "../../shared.js";
import { checkColor, detailSection, shownOf } from "../helpers.js";

// The prs shape's own state on a Board, made when first needed: the list's
// scroll handle.
const prsState = (b) => (b.shapeState.prs ??= { scroll: ScrollHandle.new() });

// The rows that show, as one column.
const prsRows = (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => s.rows.filter((r) => b.visible(r, st.data))) }];

export const prsShape = {
  nav: prsRows,
  selected: (b, st) => prsRows(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo: (b, view, sel) => scrollToRow(b, view, sel.key),
  // All items, whatever the filter: every section's rows.
  items: (data) => data.sections.flatMap((s) => s.rows),
  count(b, data) {
    const rows = data.sections.flatMap((s) => s.rows);
    return { shown: rows.filter((r) => b.visible(r, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawPrs(b, t, mono, view, st),
  hints: [["j/k", "bewegen"], ["Enter", "Detail · Review"], ["o", "öffnen"]],
  dirs: ["up", "down"],
  loads: true,
  keys: () => false,
  received: (data) => data,
  warnings: (_view, data) => data.sections.filter((s) => s.skipped).map((s) => `${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`),
  column: () => null,
  // The detail panel's rows of a pull request: its checks, where it has them.
  detailParts: (b, t, view, item) =>
    item.checks ? { sections: [detailSection(t, "CHECKS", div().text_color(checkColor(t, item.checks.state)).child(item.checks.text))] } : {},
};

// A section's count: the rows it holds (each pull request once, in its first
// section; results that are no pull request left out), "<shown>/<held>"
// while the filter or "nur meine" hides some; a section GitHub cut adds how
// many it sent of how many it found.
export function sectionCount(section, shown) {
  const held = section.rows.length;
  const cut = section.limited ? ` · erste ${section.fetched} von ${section.count}` : "";
  return `${shownOf(shown, held)}${cut}`;
}

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
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.author)))
      .when(Boolean(r.draft), (el) => el.child(div().w(60).flex_none().text_size(12).text_color(t.muted).child("Entwurf")))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  };
  const children = [];
  for (const s of st.data.sections) {
    const rows = s.rows.filter((r) => b.visible(r, st.data));
    children.push(div().flex_none().px(20).pt(12).pb(4).text_size(11).text_color(t.muted).child(`${s.name.toUpperCase()} · ${sectionCount(s, rows.length)}`));
    children.push(...rows.map(row));
  }
  return v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(prsState(b).scroll).children(children);
}

function scrollToRow(b, view, key) {
  const st = b.state(view.id);
  let child = 0;
  for (const s of st.data.sections) {
    child++; // the section's heading
    for (const r of s.rows.filter((row) => b.visible(row, st.data))) {
      if (r.key === key) return prsState(b).scroll.scroll_to_item(child);
      child++;
    }
  }
}
