// The prs shape: a list of pull requests in sections, walked as one column.
// Its data is parseGithubList's; a row's author, draft mark and checks show
// where it has them, and whether the viewer has to act on it. Each section
// is drawn in its color, a theme name: its head on a band of it, each row
// with a stripe of it at its left. View fields it reads: id.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { NOTIFIED, ageLabel, cardLabel } from "../../shared.js";
import { checkColor, checksSection, detailNote, detailSection, selectedLook, shownOf } from "../helpers.js";
import { NOTE_TONES, headBg, markColor, toneColor } from "../tones.js";

// The prs shape's own state on a Board (state(), shapes/index.js): the
// list's scroll handle.
const prsState = (b) => b.shapeState.prs;

// The rows that show, as one column.
const prsRows = (b, st) => [{ shown: (st.data?.sections ?? []).flatMap((s) => s.rows.filter((r) => b.visible(r, st.data))) }];

export const prsShape = {
  state: () => ({ scroll: ScrollHandle.new() }),
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
  dirs: ["up", "down"],
  loads: true,
  enterHint: "Detail · Review",
  received: (data) => data,
  warnings: (_view, data) =>
    data.sections.flatMap((s) => [
      ...(s.skipped ? [`${s.skipped} Treffer in „${s.name}“ sind keine Pull Requests`] : []),
      ...(s.notRead?.length ? [`${s.notRead.length} Treffer in „${s.name}“ nicht gelesen: ${s.notRead[0]}`] : []),
    ]),
  // The detail panel's rows of a pull request: why the viewer has to act on
  // it, its checks, where it has them, and a note for each part that could
  // not be read or is still to come, as a pull request a level down shows
  // its own (levelParts, ui/related.js).
  detailParts(b, t, view, item) {
    const sections = [];
    if (item.attention?.length) sections.push(detailSection(t, "DU BIST DRAN", ...item.attention.map((reason) => div().text_color(markColor(t)).child(reason === NOTIFIED ? `${NOTIFIED} (GitHub-Benachrichtigung)` : reason))));
    if (item.checks) sections.push(checksSection(t, item.checks));
    sections.push(...(item.unread ?? []).map((text) => detailNote(t, "unread-note", text, "warning")));
    if (item.threadsPending) sections.push(detailNote(t, "pending-note", "Review-Threads werden noch gelesen …", "info"));
    return sections.length ? { sections } : {};
  },
};

export const NOTIFIED_PENDING = "GitHub-Benachrichtigungen werden noch gelesen …";

// Every row keeps the cell, so the cells after it line up.
export const THREADS_PENDING = "… Threads laden";
function attentionCell(t, r) {
  const cell = div().w(200).flex_none().truncate().text_size(12);
  const unsure = r.unread?.length ? ["?"] : r.threadsPending ? ["…"] : [];
  if (r.attention?.length) return cell.font_semibold().text_color(markColor(t)).child(`● ${[...r.attention, ...unsure].join(" · ")}`);
  return cell.text_color(t.muted).child(r.unread?.length ? "? nicht ganz gelesen" : r.threadsPending ? THREADS_PENDING : r.waiting ? "wartet auf Autor" : "");
}

// A section's count: the rows it holds (each pull request once, in its first
// section; results that are no pull request, and those GitHub sent as null
// for an error, left out), "<shown>/<held>"
// while the filter or "nur meine" hides some; a section GitHub cut adds how
// many it sent of how many it found.
export function sectionCount(section, shown) {
  const held = section.rows.length;
  const cut = section.limited ? ` · erste ${section.fetched} von ${section.count}` : "";
  return `${shownOf(shown, held)}${cut}`;
}

function drawPrs(b, t, mono, view, st) {
  const now = Date.now();
  const row = (r, tone) => {
    const selected = st.sel?.key === r.key;
    return h_flex()
      .id(`row-${r.key}`)
      .flex_none()
      .gap(12)
      .px(18)
      .py(8)
      .items_center()
      .border_l(2)
      // Its section's stripe, the accent while it is selected.
      .map(selectedLook(t, selected, toneColor(t, tone)))
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        // A click on a row (clickItem).
        if (!b.modal) b.clickItem(view, { col: 0, key: r.key }, cx);
      })
      .child(div().w(170).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .child(attentionCell(t, r))
      .when(Boolean(r.author), (el) => el.child(div().w(120).flex_none().truncate().text_size(12).text_color(t.muted).child(r.author)))
      // Every row keeps the draft cell, so the columns after it line up.
      .child(div().w(60).flex_none().text_size(12).text_color(t.muted).child(r.draft ? "Entwurf" : ""))
      .when(Boolean(r.checks), (el) => el.child(div().w(70).flex_none().text_size(12).text_color(checkColor(t, r.checks?.state)).child(r.checks?.short ?? "")))
      .child(div().w(70).flex_none().text_size(12).text_color(t.muted).child(ageLabel(r.updatedAt, now)));
  };
  const children = [];
  for (const [i, s] of st.data.sections.entries()) {
    const rows = s.rows.filter((r) => b.visible(r, st.data));
    const tone = s.color;
    children.push(
      div().id(`section-${i}`).flex_none().mt(8).px(20).py(3).bg(headBg(t, tone, t.background)).text_size(11).font_semibold().text_color(toneColor(t, tone))
        .child(`${s.name.toUpperCase()} · ${sectionCount(s, rows.length)}`),
    );
    children.push(...rows.map((r) => row(r, tone)));
  }
  const list = v_flex().id("rows").flex_1().min_h(0).py(4).overflow_y_scrollbar().track_scroll(prsState(b).scroll).children(children);
  if (!st.data.notifiedPending) return list;
  const note = div().id("notified-pending").px(16).pt(6).text_size(12).text_color(toneColor(t, NOTE_TONES.info)).child(NOTIFIED_PENDING);
  return v_flex().flex_1().min_h(0).child(note).child(list);
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
