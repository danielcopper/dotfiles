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
//
// The block scrolls by an offset the board keeps (scroll.js says why):
// its window measures its height, the content its own and each row its
// own (on_size_change), the content stands shifted up by the offset, the
// mouse wheel moves it, and a thin thumb at the right shows where it is
// (no scrollbar to drag). A resize or a refresh that changes a height
// keeps the offset within the content; another item's details start at
// the top.

import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { settings } from "herdr";
import { itemLabel } from "../shared.js";
import { prsHead, relatedLines, shownDescription, subIssuesHead } from "../related.js";
import { clampOffset, offsetBy, revealOffset, rowSpan, spanShows, thumbOf } from "../scroll.js";
import { chip, sectionTitle, selectedLook } from "./helpers.js";

export const LINE_PX = 18;
export const FOLDED_H = 12 * LINE_PX;
// The content's padding above its first row and the gap between rows.
const PAD_Y = 12;
const GAP = 6;

// What the related items keep per Board, made when it starts (why then:
// ui/shapes/index.js): the measured height of each description by its
// item's key, the key of the item whose description is unfolded (null:
// none; another item's shows folded), and the block's scroll: its offset,
// the item it is of (`at`), the heights of its window and its content, and
// of each row by its id.
export const relatedState = () => ({ heights: new Map(), unfolded: null, offset: 0, at: null, viewport: 0, content: 0, sizes: new Map() });

// Whether the description of `item` is taller than FOLDED_H, as measured.
export const descriptionFolds = (ui, item) => (ui.heights.get(item.key) ?? 0) > FOLDED_H;

// A measured length in the script's pixels: herdr reports a size and a
// wheel's move in the window's pixels, and scales a script's lengths by
// its zoom (gpui-kit's crates/shell/src/value.rs, scaled_px).
const unzoomed = (px) => px / (Number(settings()?.zoom) || 1);

// The block's offset for `item`: 0 for another item than the last, kept
// within the content.
function offsetFor(ui, item) {
  if (ui.at !== item.key) {
    ui.at = item.key;
    ui.offset = 0;
  }
  ui.offset = clampOffset(ui.offset, ui.content, ui.viewport);
  return ui.offset;
}

// The block's scroll as scroll.js takes it.
const scrollOf = (ui) => ({ offset: ui.offset, content: ui.content, viewport: ui.viewport });

// Moves the block by `by` pixels; ctrl-d/ctrl-u by half its window
// (halfWindow), j/k by LINE_PX, the wheel by its move.
export const scrollBlock = (ui, by) => (ui.offset = offsetBy(scrollOf(ui), by));
export const halfWindow = (ui) => Math.max(LINE_PX, Math.floor(ui.viewport / 2));
// The block's top or bottom (gg/G, Home/End).
export const scrollToEnd = (ui, end) => (ui.offset = end === "top" ? 0 : clampOffset(Infinity, ui.content, ui.viewport));

// The id each row of relatedRows draws with.
const rowId = (r, i) => (r.kind === "line" ? `related-line-${r.n}` : `related-row-${i}`);

// Where row `i` of the rows of `item` stands in the content, from the
// measured heights (LINE_PX for one not measured yet).
function spanOf(ui, rows, i) {
  return rowSpan(rows.map((r, j) => ui.sizes.get(rowId(r, j)) ?? LINE_PX), i, GAP, PAD_Y);
}

// Scrolls line `n` of the related items into view.
export function revealLine(ui, item, entry, n) {
  const rows = relatedRows(item, entry);
  const i = rows.findIndex((r) => r.kind === "line" && r.n === n);
  if (i < 0) return;
  const { top, height } = spanOf(ui, rows, i);
  ui.offset = revealOffset(scrollOf(ui), top, height);
}

// Whether line `n` shows whole in the block (true while it is not
// measured yet).
export function lineShows(ui, item, entry, n) {
  const rows = relatedRows(item, entry);
  const i = rows.findIndex((r) => r.kind === "line" && r.n === n);
  if (i < 0) return false;
  const { top, height } = spanOf(ui, rows, i);
  return spanShows(scrollOf(ui), top, height);
}

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
      ui.heights.set(item.key, unzoomed(size.height));
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
  const ui = b.relatedUi;
  const tones = { muted: t.muted, error: t.ansi1, warning: t.ansi3 };
  // Each row measures its height, under its id.
  const measure = (el, id) => el.id(id).on_size_change((size, cx) => {
    ui.sizes.set(id, unzoomed(size.height));
    cx.notify();
  });
  const row = (r, i) => measure(rowOf(r), rowId(r, i));
  const rowOf = (r) => {
    if (r.kind === "head") return sectionTitle(t, r.text).pt(4);
    if (r.kind === "note") return div().text_size(12).text_color(tones[r.tone]).child(r.text);
    if (r.kind === "text") return description(b, t, item, r);
    const { line, n } = r;
    const marked = n === at;
    return h_flex()
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
  const offset = offsetFor(ui, item);
  const content = v_flex()
    .id("related-lines")
    .flex_none()
    .px(18)
    .py(PAD_Y)
    .gap(GAP)
    .mt(offset ? -offset : 0)
    .on_size_change((size, cx) => {
      ui.content = unzoomed(size.height);
      cx.notify();
    })
    .children(relatedRows(item, entry).map(row));
  const windowEl = v_flex()
    .id("related-window")
    .min_h(0)
    .overflow_hidden()
    .on_size_change((size, cx) => {
      ui.viewport = unzoomed(size.height);
      cx.notify();
    })
    .on_scroll_wheel((e, cx) => {
      scrollBlock(ui, -unzoomed(e.delta?.y ?? 0));
      cx.notify();
    })
    .child(content);
  const thumb = thumbOf(scrollOf(ui));
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
