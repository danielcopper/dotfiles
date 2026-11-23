// How the details block scrolls: the one home of its offset. herdr gives a
// script no scroll offset of a scroll area (a ScrollHandle only reveals a
// child, with the smallest scroll needed), so the board scrolls the block
// itself: it keeps the offset in the related items' state (`ui`:
// ui/related.js, relatedState) with the heights of the window and the
// content as measured (`viewport`, `content`), shifts the content up by it,
// and draws the position as a thumb. All lengths are the script's pixels
// (measured ones divided by herdr's zoom: ui/related.js). A move by a page
// or end key glides (`glide` in the state, GLIDE): herdr animates the
// content's and the thumb's top natively; every other move, and another
// item's details, jump.

// One line of the details, the step of j/k.
export const LINE_PX = 18;

// How a page or end key's move glides: herdr's transition of `top`.
export const GLIDE = { duration: 120, easing: "ease-out" };

// The offset `offset` kept within the content: from 0 to where its end
// meets the window's; 0 where the content fits.
export const clampOffset = (offset, content, viewport) => Math.max(0, Math.min(offset, content - viewport));

// The offset after a move by `by` pixels (down for more than 0).
export const offsetBy = (s, by) => clampOffset(s.offset + by, s.content, s.viewport);

// The offset at which the span [top, top + height] of the content shows,
// moved as little as needed: one above the window to its top, one below to
// its bottom (one taller than the window to its top).
export function revealOffset(s, top, height) {
  let at = s.offset;
  if (top + height > at + s.viewport) at = top + height - s.viewport;
  if (top < at) at = top;
  return clampOffset(at, s.content, s.viewport);
}

// Whether the span shows whole; true while the window is not measured yet.
export const spanShows = (s, top, height) => !s.viewport || (top >= s.offset && top + height <= s.offset + s.viewport);

// The thumb that shows the position: { top, height } within the window, at
// least `min` high; null where the content fits or the window is not
// measured.
export function thumbOf(s, min = 16) {
  if (!(s.content > s.viewport) || s.viewport <= 0) return null;
  const height = Math.max(min, Math.round((s.viewport * s.viewport) / s.content));
  const top = Math.round(((s.viewport - height) * clampOffset(s.offset, s.content, s.viewport)) / (s.content - s.viewport));
  return { top, height };
}

// Where row `i` of a column of rows stands: the heights of the rows before
// it (`heights`, one per row), `gap` between rows, after `pad` above the
// first → { top, height }.
export function rowSpan(heights, i, gap, pad) {
  let top = pad;
  for (let j = 0; j < i; j++) top += heights[j] + gap;
  return { top, height: heights[i] ?? 0 };
}

// The block's offset when it draws the details of the item `key`: 0 for
// another item than the last (ui.at), kept within the content, which a
// resize or a refresh may have changed.
export function offsetOf(ui, key) {
  if (ui.at !== key) {
    ui.at = key;
    ui.offset = 0;
    ui.glide = false;
  }
  ui.offset = clampOffset(ui.offset, ui.content, ui.viewport);
  return ui.offset;
}

// The block moved by `by` pixels: j/k by LINE_PX, the wheel by its move,
// at once; ctrl-d/ctrl-u by halfWindow (scrollPage), gliding.
export function scrollBy(ui, by, glide = false) {
  ui.glide = glide;
  ui.offset = offsetBy(ui, by);
}
export const halfWindow = (ui) => Math.max(LINE_PX, Math.floor(ui.viewport / 2));
export const scrollPage = (ui, dir) => scrollBy(ui, dir * halfWindow(ui), true);
// The block at its top or bottom (gg/G, Home/End), gliding.
export function scrollToEnd(ui, end) {
  ui.glide = true;
  ui.offset = end === "top" ? 0 : clampOffset(Infinity, ui.content, ui.viewport);
}
// The block moved so that `span` ({ top, height }) shows, at once.
export function revealSpan(ui, span) {
  ui.glide = false;
  ui.offset = revealOffset(ui, span.top, span.height);
}
