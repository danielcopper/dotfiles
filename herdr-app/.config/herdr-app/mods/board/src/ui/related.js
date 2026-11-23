// The detail panel's sections of an item's related items (related.js): its
// description ("BESCHREIBUNG", drawn formatted by herdr's TextView, as
// Markdown or HTML as its source writes it, its images as links:
// shownDescription; "keine Beschreibung" where it has none), its
// sub-issues (an Azure work item's children), then, where it has any or the source
// could not send them, the pull requests linked to it; one line each with
// its key, title and state (a done one dimmed, a draft marked), and below
// a section how many it sent that cannot be read. While they load the
// description's and the sub-issues' sections say "lädt …", after a
// failure the reason; a section the source could not send says why in its
// place; what the source said besides follows at the end. The line the
// panel has selected while it has the keyboard is marked; a click on a
// line is Enter on it (the Board's pickLine). A link in the description
// opens through the Board's openLink (http and https only).
//
// A description taller than about 12 lines shows folded to that height,
// with "… mehr (e)" below; `e` or a click on it unfolds it ("weniger (e)"
// folds it again). TextView tells no count of its lines, so the fold goes
// by height: FOLDED_H, 12 lines of the details' 18 pixels; how tall the
// description is, its block measures (on_size_change), and it folds only
// once that is known to be more.

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle, TextView } from "gpui-base";
import { itemLabel } from "../shared.js";
import { prsHead, relatedLines, shownDescription, subIssuesHead } from "../related.js";
import { chip, sectionFrame, sectionTitle, selectedLook } from "./helpers.js";

export const FOLDED_H = 12 * 18;

// What the related items keep per Board, made when it starts (why then:
// ui/shapes/index.js): the lines' scroll handle, the measured height of
// each description by its item's key, and the key of the item whose
// description is unfolded (null: none; another item's shows folded).
export const relatedState = () => ({ scroll: ScrollHandle.new(), heights: new Map(), unfolded: null });

// Whether the description of `item` is taller than FOLDED_H, as measured.
export const descriptionFolds = (ui, item) => (ui.heights.get(item.key) ?? 0) > FOLDED_H;

// The rows of the related items of `item` as drawn, in order, from `entry`
// (the Board's kept read: { data, error }, both null while it loads; null
// before a read starts): { kind: "head" | "note" | "text" | "line", text,
// tone ("muted", "error", "warning") or, for a line, `line` and its index
// `n` among relatedLines (the one order of the lines); a "text" is the
// description, one row: `text` as drawn (shownDescription) and its
// `format`.
export function relatedRows(item, entry) {
  const data = entry?.data;
  const description = { kind: "head", text: "BESCHREIBUNG" };
  if (!data) {
    const why = entry?.error ? { kind: "note", text: entry.error, tone: "error" } : { kind: "note", text: "lädt …", tone: "muted" };
    return [description, why, { kind: "head", text: subIssuesHead(item, { cut: false }) }, why];
  }
  const lines = relatedLines(data);
  const rows = [description];
  const format = data.format === "html" ? "html" : "markdown";
  const text = shownDescription(data.description, format);
  if (text !== null) rows.push({ kind: "text", text, format });
  else rows.push({ kind: "note", text: "keine Beschreibung", tone: "muted" });
  const body = (section, none) => {
    if (section.error) rows.push({ kind: "note", text: section.error, tone: "error" });
    for (const line of section.lines) rows.push({ kind: "line", line, n: lines.indexOf(line) });
    if (none && !section.error && !section.lines.length && !section.hidden) rows.push({ kind: "note", text: "keine", tone: "muted" });
    if (section.hidden) rows.push({ kind: "note", text: `${section.hidden} ohne Zugriff`, tone: "muted" });
  };
  rows.push({ kind: "head", text: subIssuesHead(item, data.subIssues) });
  body(data.subIssues, true);
  const prs = data.prs;
  if (prs.lines.length || prs.error || prs.hidden) {
    rows.push({ kind: "head", text: prsHead(prs) });
    body(prs, false);
  }
  for (const text of data.warnings ?? []) rows.push({ kind: "note", text, tone: "warning" });
  return rows;
}

// The child of the scrolled block that holds line `n`.
export const lineChild = (item, entry, n) => relatedRows(item, entry).findIndex((r) => r.kind === "line" && r.n === n);

// The description row `r` of `item`: the TextView in a block that measures
// it, folded to FOLDED_H where it is taller and not unfolded, and below it
// the fold's switch.
function description(b, t, item, r) {
  const ui = b.relatedUi;
  const folds = descriptionFolds(ui, item);
  const open = ui.unfolded === item.key;
  const id = `description-${item.key}`;
  const view = (r.format === "html" ? TextView.html(id, r.text) : TextView.markdown(id, r.text))
    .text_size(12)
    .on_link_click((url, cx) => b.openLink(url, cx));
  const measured = div()
    .id(`description-size-${item.key}`)
    .flex_none()
    .on_size_change((size, cx) => {
      if (ui.heights.get(item.key) === size.height) return;
      ui.heights.set(item.key, size.height);
      cx.notify();
    })
    .child(view);
  const box = div().id("description").overflow_hidden().when(folds && !open, (el) => el.max_h(FOLDED_H)).child(measured);
  return v_flex()
    .gap(4)
    .child(box)
    .when(folds, (el) => el.child(
      div()
        .id("description-fold")
        .text_size(12)
        .text_color(t.accent)
        .cursor_pointer()
        .on_click((_e, cx) => {
          if (!b.modal) b.toggleFold(cx);
        })
        .child(open ? "weniger (e)" : "… mehr (e)"),
    ));
}

// The block of the related items of `item` (relatedRows), the line `at`
// marked (null: none).
export function relatedSections(b, t, mono, view, item, entry, at) {
  const tones = { muted: t.muted, error: t.ansi1, warning: t.ansi3 };
  const row = (r) => {
    if (r.kind === "head") return sectionTitle(t, r.text).pt(4);
    if (r.kind === "note") return div().text_size(12).text_color(tones[r.tone]).child(r.text);
    if (r.kind === "text") return description(b, t, item, r);
    const { line, n } = r;
    const marked = n === at;
    return h_flex()
      .id(`related-line-${n}`)
      .flex_none()
      .gap(8)
      .px(8)
      .py(4)
      .items_center()
      .rounded(6)
      .border_1()
      .map(selectedLook(t, marked, t.chrome))
      .cursor_pointer()
      .opacity(line.done ? 0.55 : 1)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (!b.modal) b.pickLine(view, n, cx);
      })
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(line)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(line.title))
      .when(line.draft, (el) => el.child(chip(t, "Entwurf")))
      .child(chip(t, line.state, t.background, t[line.color] ?? t.muted));
  };
  return sectionFrame(t)
    .id("related-lines")
    .min_h(0)
    .overflow_y_scrollbar()
    .track_scroll(b.relatedUi.scroll)
    .children(relatedRows(item, entry).map(row));
}
