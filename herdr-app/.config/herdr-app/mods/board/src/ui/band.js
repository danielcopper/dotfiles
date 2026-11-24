// A board column draws whole only the cards in its band, its window and
// half a window above and below; every other card is a frame of its height.
// herdr gives a mod's draw 50 ms, which a column of a few hundred whole
// cards outgrows.

import { clampOffset, revealOffset } from "../scroll.js";

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

// As herdr's scroll_to_item: the smallest scroll that shows the card.
export function revealCard(s, at, content, top, height) {
  const to = revealOffset({ offset: at.offset, viewport: at.viewport, content }, top, height);
  s.revealed = to === at.offset ? null : { from: at.offset, to };
}
