// The detail panel's sections of an item's related items (related.js): its
// description ("BESCHREIBUNG", drawn formatted by herdr's TextView, as
// Markdown or HTML as its source writes it, without anything it could load:
// description.js; "keine Beschreibung" where it has none), its sub-issues
// (an Azure work item's children), then, where it has any or the source
// could not send them, the pull requests linked to it; one line each with
// its key, title and state (a done one dimmed, a draft marked), and below
// a section how many it has that cannot be read. While they load the
// description's and the sub-issues' sections say "lädt …", after a
// failure the reason; a section the source could not send says why in its
// place; what the source said besides follows at the end. The line the
// panel has selected while it has the keyboard is marked; a click on a
// line is Enter on it (the Board's pickLine). A link in the description
// opens through the Board's openLink.
//
// A description taller than about 12 lines shows folded to that height,
// with "… mehr (e)" below; `e` or a click on it unfolds it ("weniger (e)"
// folds it again). TextView tells no count of its lines, so the fold goes
// by height: FOLDED_H, 12 lines of the details' 18 pixels; how tall the
// description is, its block measures (on_size_change), and it folds only
// once that is known to be more.
//
// The block scrolls by an offset the board keeps (scroll.js, its one home,
// says why): its window measures its height, the content its own and each
// row its own (on_size_change), the content stands shifted up by the
// offset, the mouse wheel moves it, and a thin thumb at the right shows
// where it is (no scrollbar to drag). The shift is a relative position,
// which moves the content without changing what it gives the layout: a
// negative top margin would make the window, which takes its height from
// the content, shorter by the offset, so that a content which shrinks
// while scrolled (a refresh, a fold) would leave it short, down to none.

import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { settings } from "herdr";
import { itemLabel } from "../shared.js";
import { prsHead, relatedLines, subIssuesHead } from "../related.js";
import { stateColor, stateDone } from "../kinds/states.js";
import { LINE_PX, offsetOf, revealSpan, rowSpan, scrollBy, spanShows, thumbOf } from "../scroll.js";
import { FRAME, chip, sectionTitle, selectedLook } from "./helpers.js";
import { NOTE_TONES, toneColor } from "./tones.js";

export const FOLDED_H = 12 * LINE_PX;

// What the related items keep per Board, plain values the Board makes once
// when it starts and every draw reads: the measured height of each
// description by its item's key, the key of the item whose description is
// unfolded (null: none; another item's shows folded), and the block's
// scroll (scroll.js): its offset, the item it is of (`at`), the heights of
// its window and its content, and of each row by its id.
export const relatedState = () => ({ heights: new Map(), unfolded: null, offset: 0, at: null, viewport: 0, content: 0, sizes: new Map() });

// Whether the description of `item` is taller than FOLDED_H, as measured.
export const descriptionFolds = (ui, item) => (ui.heights.get(item.key) ?? 0) > FOLDED_H;

// A measured length in the script's pixels: herdr reports a size and a
// wheel's move in the window's pixels, and scales a script's lengths by
// its zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

// `el` measuring its height into `keep(height)` after each layout that
// changes it, under the id `id` (on_size_change needs a lasting one).
const measured = (el, id, keep) => el.id(id).on_size_change((size, cx) => {
  keep(unzoomed(size.height));
  cx.notify();
});

// The id each row of relatedRows draws with.
const rowId = (r, i) => (r.kind === "line" ? `related-line-${r.n}` : `related-row-${i}`);

// Where line `n` of the related items stands in the block's content, from
// the measured heights (LINE_PX for a row not measured yet); null where no
// such line shows.
function lineSpan(ui, item, entry, n) {
  const rows = relatedRows(item, entry);
  const i = rows.findIndex((r) => r.kind === "line" && r.n === n);
  return i < 0 ? null : rowSpan(rows.map((r, j) => ui.sizes.get(rowId(r, j)) ?? LINE_PX), i, FRAME.gap, FRAME.py);
}

// Scrolls line `n` into view.
export function revealLine(ui, item, entry, n) {
  const span = lineSpan(ui, item, entry, n);
  if (span) revealSpan(ui, span);
}

// Whether line `n` shows whole (true while the block is not measured yet).
export function lineShows(ui, item, entry, n) {
  const span = lineSpan(ui, item, entry, n);
  return Boolean(span) && spanShows(ui, span.top, span.height);
}

// The rows of the related items of `item` as drawn, in order, from `entry`
// (the Board's kept read: { data, error, shown }, data and error null
// while it loads, shown the description as drawn (shownDescription, made
// once per read); null before a read starts): { kind: "head" | "note" |
// "text" | "line", text, a note's level ("info", "error", "warning";
// NOTE_TONES) or, for a line, `line` and its index `n` among relatedLines
// (the one order of the lines); a "text" is the description, one row: its
// `text` as drawn and its `format`.
export function relatedRows(item, entry) {
  const data = entry?.data;
  const description = { kind: "head", text: "BESCHREIBUNG" };
  if (!data) {
    const why = entry?.error ? { kind: "note", text: entry.error, level: "error" } : { kind: "note", text: "lädt …", level: "info" };
    return [description, why, { kind: "head", text: subIssuesHead(item, { cut: false }) }, why];
  }
  const lines = relatedLines(data);
  const rows = [description];
  if (typeof entry.shown === "string") rows.push({ kind: "text", text: entry.shown, format: data.format === "html" ? "html" : "markdown" });
  else rows.push({ kind: "note", text: "keine Beschreibung", level: "info" });
  const body = (section, none) => {
    if (section.error) rows.push({ kind: "note", text: section.error, level: "error" });
    for (const line of section.lines) rows.push({ kind: "line", line, n: lines.indexOf(line) });
    if (none && !section.error && !section.lines.length && !section.hidden) rows.push({ kind: "note", text: "keine", level: "info" });
    if (section.hidden) rows.push({ kind: "note", text: `${section.hidden} ${section.hiddenAs ?? "ohne Zugriff"}`, level: "info" });
  };
  rows.push({ kind: "head", text: subIssuesHead(item, data.subIssues) });
  body(data.subIssues, true);
  const prs = data.prs;
  if (prs.lines.length || prs.error || prs.hidden) {
    rows.push({ kind: "head", text: prsHead(prs) });
    body(prs, false);
  }
  for (const text of data.warnings ?? []) rows.push({ kind: "note", text, level: "warning" });
  return rows;
}

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
  const size = measured(div().flex_none(), `description-size-${item.key}`, (h) => ui.heights.set(item.key, h)).child(view);
  const box = div().id("description").overflow_hidden().when(folds && !open, (el) => el.max_h(FOLDED_H)).child(size);
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

// The block of the related items of `item` (relatedRows) in `view`, the
// line `at` marked (null: none). A line's state's color, and whether it is
// done, are its own where its source names them (GitHub), else its state's
// in the view's data (Azure).
export function relatedSections(b, t, mono, view, item, entry, at) {
  const ui = b.relatedUi;
  const data = b.state(view.id).data;
  const rowOf = (r) => {
    if (r.kind === "head") return sectionTitle(t, r.text).pt(4);
    if (r.kind === "note") return div().text_size(12).text_color(toneColor(t, NOTE_TONES[r.level])).child(r.text);
    if (r.kind === "text") return description(b, t, item, r);
    const { line, n } = r;
    const color = line.color ?? stateColor(data, line.state);
    const done = line.done ?? stateDone(data, line.state);
    return h_flex()
      .flex_none()
      .gap(8)
      .px(8)
      .py(4)
      .items_center()
      .rounded(6)
      .border_1()
      .map(selectedLook(t, n === at, t.chrome))
      .cursor_pointer()
      .opacity(done ? 0.55 : 1)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (!b.modal) b.pickLine(view, n, cx);
      })
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(line)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(line.title))
      .when(line.draft, (el) => el.child(chip(t, "Entwurf")))
      .child(chip(t, line.state ?? "ohne Status", t.background, toneColor(t, color)));
  };
  const offset = offsetOf(ui, item.key);
  const content = measured(v_flex(), "related-lines", (h) => (ui.content = h))
    .flex_none()
    .px(FRAME.px)
    .py(FRAME.py)
    .gap(FRAME.gap)
    .relative()
    .top(offset ? -offset : 0)
    .children(relatedRows(item, entry).map((r, i) => measured(rowOf(r), rowId(r, i), (h) => ui.sizes.set(rowId(r, i), h))));
  const windowEl = measured(v_flex(), "related-window", (h) => (ui.viewport = h))
    .min_h(0)
    .overflow_hidden()
    .on_scroll_wheel((e, cx) => {
      scrollBy(ui, -unzoomed(e.delta?.y ?? 0));
      cx.notify();
    })
    .child(content);
  const thumb = thumbOf(ui);
  return v_flex()
    .id("related-scroll")
    .relative()
    .min_h(0)
    .border_b(1)
    .border_color(t.border)
    .child(windowEl)
    .when(Boolean(thumb), (el) => el.child(
      div().id("related-thumb").absolute().right(3).top(thumb?.top ?? 0).w(3).h(thumb?.height ?? 0).rounded(2).bg(t.muted).opacity(0.6),
    ));
}
