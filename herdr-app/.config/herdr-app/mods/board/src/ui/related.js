// The detail panel's sections of an item's related items (related.js): its
// description ("BESCHREIBUNG", its lines as written, "keine Beschreibung"
// where it has none), its sub-issues, then, where it has any or the source
// could not send them, the pull requests linked to it; one line each with
// its key, title and state (a done one dimmed, a draft marked), and below
// a section how many it sent that cannot be read. While they load the
// description's and the sub-issues' sections say "lädt …", after a
// failure the reason; a section the source could not send says why in its
// place; what the source said besides follows at the end. The line the
// panel has selected while it has the keyboard is marked; a click on a
// line is Enter on it (the Board's pickLine).

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { itemLabel } from "../shared.js";
import { descriptionLines, prsHead, relatedLines, subIssuesHead } from "../related.js";
import { chip, sectionFrame, sectionTitle } from "./helpers.js";

// What the related items keep per Board, made when it starts (why then:
// ui/shapes/index.js): the lines' scroll handle.
export const relatedState = () => ({ scroll: ScrollHandle.new() });

// The rows of the related items of `item` as drawn, in order, from `entry`
// (the Board's kept read: { data, error }, both null while it loads; null
// before a read starts): { kind: "head" | "note" | "text" | "line", text,
// tone ("muted", "error", "warning") or, for a line, `line` and its index
// `n` among relatedLines (the one order of the lines); a "text" is a line
// of the description ("" an empty one).
export function relatedRows(item, entry) {
  const data = entry?.data;
  const description = { kind: "head", text: "BESCHREIBUNG" };
  if (!data) {
    const why = entry?.error ? { kind: "note", text: entry.error, tone: "error" } : { kind: "note", text: "lädt …", tone: "muted" };
    return [description, why, { kind: "head", text: subIssuesHead(item, { cut: false }) }, why];
  }
  const lines = relatedLines(data);
  const rows = [description];
  const text = descriptionLines(data.description);
  if (text.length) rows.push(...text.map((t) => ({ kind: "text", text: t })));
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

// The block of the related items of `item` (relatedRows), the line `at`
// marked (null: none).
export function relatedSections(b, t, mono, view, item, entry, at) {
  const tones = { muted: t.muted, error: t.ansi1, warning: t.ansi3 };
  const row = (r) => {
    if (r.kind === "head") return sectionTitle(t, r.text).pt(4);
    if (r.kind === "note") return div().text_size(12).text_color(tones[r.tone]).child(r.text);
    // A line of the description wraps; an empty one keeps its height.
    if (r.kind === "text") return div().text_size(12).line_height("18px").min_h(18).child(r.text);
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
      .border_color(marked ? t.accent : t.chrome)
      .cursor_pointer()
      .opacity(line.done ? 0.55 : 1)
      .when(marked, (el) => el.bg(t.selected))
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
