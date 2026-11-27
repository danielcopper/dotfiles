// A board column draws whole only the cards in its band, its window and
// half a window above and below; every other card is a frame of its height.
// herdr gives a mod's draw 50 ms, which a column of a few hundred whole
// cards outgrows.

import { div } from "gpui-kit";
import { v_flex, ScrollHandle } from "gpui-base";
import { clampOffset, revealOffset, spanStarts } from "../scroll.js";

// The list's height until herdr laid it out (scrollOf).
export const VIEWPORT_GUESS = 1000;

export const bandState = () => ({ lo: 0, hi: 0, content: 0, revealed: null });

// herdr before 0.1.18 reads nothing back from a ScrollHandle.
export const readsScroll = (handle) => typeof handle.offset === "function";

export function scrollOf(handle) {
  const { width, height } = handle.viewport_size();
  return { offset: handle.offset().y, viewport: height || VIEWPORT_GUESS, width };
}

// herdr runs a key's scroll_to_item at its next frame: until the handle
// has moved, the band stands where that scroll goes.
function followed(s, at) {
  if (s.revealed?.from === at.offset) return s.revealed.to;
  s.revealed = null;
  return at.offset;
}

const bandOffset = (s, at, content) => clampOffset(followed(s, at), content, at.viewport);

export function placeBand(s, content, at) {
  const offset = bandOffset(s, at, content);
  const vp = at.viewport;
  Object.assign(s, { content, lo: offset - vp / 2, hi: offset + vp + vp / 2 });
}

export const inBand = (s, top, height) => top < s.hi && top + height > s.lo;

export function leftBand(s, at) {
  const offset = bandOffset(s, at, s.content);
  return offset < s.lo || offset + at.viewport > s.hi;
}

// As herdr's scroll_to_item(0) on a list scrolled to `at`.
export function revealTop(s, at) {
  s.revealed = { from: at.offset, to: 0 };
}

// As herdr's scroll_to_item: the smallest scroll that shows the card.
export function revealCard(s, at, content, top, height) {
  const to = revealOffset({ offset: at.offset, viewport: at.viewport, content }, top, height);
  s.revealed = to === at.offset ? null : { from: at.offset, to };
}

// A list of lines drawn in its band (a table's, an Issues tab's): its state
// on the Board (windowedState), the scroll that shows a line (scrollToLine),
// whether the list left its band (linesLeftBand), and the list itself
// (windowedLines).
export function windowedState() {
  const scroll = ScrollHandle.new();
  return { scroll, band: bandState(), windowed: readsScroll(scroll) };
}

export function scrollToLine(s, heights, at) {
  if (s.windowed) {
    const { starts, content } = spanStarts(heights, 0);
    revealCard(s.band, scrollOf(s.scroll), content, starts[at], heights[at]);
  }
  s.scroll.scroll_to_item(at);
}

export const linesLeftBand = (s) => s.windowed && leftBand(s.band, scrollOf(s.scroll));

// The list `id` of `lines`, `heights` high: each line in its band drawn
// (draw), every other an empty frame of its height; `wheel` takes a wheel
// event over it first. Null for no lines, the band placed all the same.
export function windowedLines(s, id, lines, heights, draw, wheel = null) {
  const at = s.windowed ? scrollOf(s.scroll) : null;
  const layout = at && spanStarts(heights, 0);
  if (at) placeBand(s.band, layout.content, at);
  if (!lines.length) return null;
  const lineEl = (l, i) => (layout && !inBand(s.band, layout.starts[i], heights[i]) ? div().flex_none().h(heights[i]) : draw(l));
  return v_flex().id(id).flex_1().min_h(0).overflow_y_scrollbar().track_scroll(s.scroll)
    .when(s.windowed || Boolean(wheel), (el) => el.on_scroll_wheel((e, cx) => {
      if (wheel) wheel(e, cx);
      // GPUI moved the list before the event reached it.
      if (s.windowed && leftBand(s.band, scrollOf(s.scroll))) cx.notify();
    }))
    .children(lines.map(lineEl));
}
