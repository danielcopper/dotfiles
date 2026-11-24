// How the details block scrolls: the one home of its offset. herdr gives a
// script no scroll offset of a scroll area (a ScrollHandle only reveals a
// child, with the smallest scroll needed), so the board scrolls the block
// itself: it keeps the offset in the related items' state (`ui`:
// ui/related.js, relatedState) with the heights of the window and the
// content as measured (`viewport`, `content`), shifts the content up by it,
// and draws the position as a thumb. All lengths are the script's pixels
// (measured ones divided by herdr's zoom: ui/related.js).
//
// A move by a page or end key glides: the content and the thumb carry herdr's
// transition of `top` at every draw (motionOf), GLIDE while the block stands
// where such a key put it (`glideTo`: the heights it was measured at then;
// every other mover drops it, and only a change of the heights could move the
// offset besides), else a zero duration. gpui-kit keeps a transition's value
// per element and property, adopting the first one it sees, and eases toward
// a changed target with the duration given in that draw; a zero duration
// takes the target at once (gpui-kit's base/src/motion.rs,
// transition_with_status). So a transition set only once the target has
// changed would not ease that change, and j/k, the wheel, a line scrolled
// into view, another item or level and a change of the heights (a fold, a
// read, a resize) move the block at once.

// One line of the details, the step of j/k.
export const LINE_PX = 18;

// How a page or end key's move glides: herdr's transition of `top`.
export const GLIDE = { duration: 120, easing: "ease-out" };

// The transition the block draws its top with now: GLIDE while it stands
// where a page or end key put it, else 0, which moves it at once.
export function motionOf(ui) {
  const to = ui.glideTo;
  return to && to.content === ui.content && to.viewport === ui.viewport ? GLIDE : 0;
}

// The block at `offset`, put there by a page or end key.
function glideTo(ui, offset) {
  ui.offset = offset;
  ui.glideTo = { content: ui.content, viewport: ui.viewport };
}

// The block at `offset`, at once.
function jumpTo(ui, offset) {
  ui.offset = offset;
  ui.glideTo = null;
}

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
// another item than the last (ui.at), at once, kept within the content,
// which a resize or a refresh may have changed.
export function offsetOf(ui, key) {
  if (ui.at !== key) {
    ui.at = key;
    jumpTo(ui, 0);
  }
  ui.offset = clampOffset(ui.offset, ui.content, ui.viewport);
  return ui.offset;
}

// The block moved by `by` pixels at once: j/k by LINE_PX, the wheel by its
// move.
export const scrollBy = (ui, by) => jumpTo(ui, offsetBy(ui, by));
export const halfWindow = (ui) => Math.max(LINE_PX, Math.floor(ui.viewport / 2));
// ctrl-d/ctrl-u: the block half its window down (`dir` 1) or up (-1),
// gliding.
export const scrollPage = (ui, dir) => glideTo(ui, offsetBy(ui, dir * halfWindow(ui)));
// The block at its top or bottom (gg/G, Home/End), gliding.
export const scrollToEnd = (ui, end) => glideTo(ui, end === "top" ? 0 : clampOffset(Infinity, ui.content, ui.viewport));
// The block moved at once so that `span` ({ top, height }) shows.
export const revealSpan = (ui, span) => jumpTo(ui, revealOffset(ui, span.top, span.height));
// The block's scroll as it stands, for restoreScroll: its offset, the
// heights of its window and its content, and its rows' sizes.
export const keptScroll = (ui) => ({ offset: ui.offset, viewport: ui.viewport, content: ui.content, sizes: ui.sizes });
// The block's scroll as keptScroll kept it (`back`), for the details of
// the item `key`, at once: a level's way back up (Board.levelUp).
export function restoreScroll(ui, key, back) {
  Object.assign(ui, { at: key, viewport: back.viewport, content: back.content, sizes: back.sizes });
  jumpTo(ui, back.offset);
}
