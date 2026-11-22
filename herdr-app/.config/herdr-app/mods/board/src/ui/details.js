// The detail panel's sections of an item's read details (details.js): its
// sub-issues ("UNTERAUFGABEN · <completed>/<total>"), then, where it has
// them, the pull requests linked to it ("VERKNÜPFTE PRS"); one line each
// with its key, title and state (a closed or merged one dimmed, a pull
// request's draft mark). While they load the sub-issues' section says "lädt
// …", after a failure the reason; the rest of the details stays as it is.
// The line the panel has selected while it has the keyboard is marked; a
// click on a line is Enter on it (the Board's pickLine).

import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { itemLabel } from "../shared.js";
import { lineState, subIssuesHead } from "../details.js";
import { chip } from "./helpers.js";

// What the details keep per Board, made when it starts (a ScrollHandle may
// not be made while a view draws): the lines' scroll handle.
export const detailsState = () => ({ scroll: ScrollHandle.new() });

// The theme color of a line's state.
const STATE_COLORS = { open: "ansi2", merged: "ansi5", closed: "muted" };

// The child of the scrolled block that holds line `at` (the sub-issues'
// head, their lines or the line that says there are none, the pull
// requests' head, their lines).
export function lineChild(data, at) {
  const subs = data.subIssues.lines.length;
  return at < subs ? 1 + at : 1 + Math.max(subs, 1) + 1 + (at - subs);
}

// The sections of `entry` (the Board's kept details of an item: { data,
// error }, both null while they load; null before a read starts), the line
// `at` marked (null: none).
export function detailsSections(b, t, mono, view, entry, at) {
  const head = (text) => div().pt(4).text_size(11).text_color(t.muted).child(text);
  const note = (text, color = t.muted) => div().text_size(12).text_color(color).child(text);
  const block = v_flex().id("details-lines").min_h(0).px(18).py(12).gap(4).border_b(1).border_color(t.border).overflow_y_scrollbar().track_scroll(b.detailsUi.scroll);
  const data = entry?.data;
  if (!data) {
    return block.child(head("UNTERAUFGABEN")).child(entry?.error ? note(entry.error, t.ansi1) : note("lädt …"));
  }
  let i = 0;
  const line = (l) => {
    const n = i++;
    const marked = n === at;
    const done = l.state !== "open";
    const color = STATE_COLORS[l.state] ?? "muted";
    return h_flex()
      .id(`detail-line-${n}`)
      .flex_none()
      .gap(8)
      .px(8)
      .py(4)
      .items_center()
      .rounded(6)
      .border_1()
      .border_color(marked ? t.accent : t.chrome)
      .cursor_pointer()
      .opacity(done ? 0.55 : 1)
      .when(marked, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (!b.modal) b.pickLine(view, n, cx);
      })
      .child(div().flex_none().font_family(mono).text_size(11.5).text_color(t.muted).child(itemLabel(l)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(l.title))
      .when(l.draft, (el) => el.child(chip(t, "Entwurf")))
      .child(chip(t, lineState(l), t.background, t[color] ?? t.muted));
  };
  const subs = data.subIssues;
  let out = block.child(head(subIssuesHead(subs)));
  out = subs.lines.length ? out.children(subs.lines.map(line)) : out.child(note("keine"));
  const prs = data.prs;
  if (!prs.lines.length) return out;
  const cut = prs.count > prs.lines.length ? ` · erste ${prs.lines.length} von ${prs.count}` : "";
  return out.child(head(`VERKNÜPFTE PRS · ${prs.count}${cut}`)).children(prs.lines.map(line));
}
