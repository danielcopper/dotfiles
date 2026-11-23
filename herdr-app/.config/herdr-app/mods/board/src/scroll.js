// How the details block scrolls: the one home of its offset. herdr gives a
// script no scroll offset of a scroll area (a ScrollHandle only reveals a
// child, with the smallest scroll needed), so the board scrolls the block
// itself: it keeps the offset, in `s` = { offset, content, viewport } (the
// content's and the visible window's heights, as measured), shifts the
// content up by it, and draws the position as a thumb. All lengths are the
// script's pixels (measured ones divided by herdr's zoom: ui/related.js).

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
// least `min` high; null where the content fits.
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
