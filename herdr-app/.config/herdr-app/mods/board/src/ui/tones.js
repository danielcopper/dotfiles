// The board's colors, their one home: which theme color (a tone: a theme
// name such as "ansi4" or "muted") a label, an issue type and a status
// take, and the tints the board draws with. Everything is a theme name or
// a tint of one, so a theme with other colors, or with surfaces of its own,
// changes the board with it.

// How strong a tint is (the alpha byte after #rrggbb): a chip's background
// (CHIP_ALPHA, under text in the chip's own tone), a column head's
// (HEAD_ALPHA, under its name and its muted count) and a selected card's or
// row's (SELECTED_ALPHA, under the card's chips). Measured against the
// copper themes: that text stays at 4.5:1 or more, a chip's over a card and
// over a selected one, a head's over the column, in copper-dark and
// copper-light (board.test.mjs).
export const CHIP_ALPHA = "1a";
export const HEAD_ALPHA = "14";
export const SELECTED_ALPHA = "14";

const HEX = /^#[0-9a-f]{6}$/i;

// `hex` with `alpha`, where it is a #rrggbb color; anything else (a theme
// color with alpha of its own, a missing one) gives `fallback`.
export const tintOr = (hex, alpha, fallback) => (HEX.test(hex ?? "") ? `${hex}${alpha}` : fallback);

// A selected card's or row's background, in every shape alike: a tint of
// the accent, whose border marks it too. The theme's `selected` would equal
// `raised` in some themes, and a chip on it would vanish.
export const selectedBg = (t) => tintOr(t.accent, SELECTED_ALPHA, t.selected);

// The tones a label or type can take: the theme's red, green, yellow, blue,
// violet and teal. Their bright variants (ansi9 to ansi14) read too weak as
// text on a light theme's card.
export const HUE_TONES = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];
// Below this OKLCH chroma a color counts as grey: it takes "muted".
export const GREY_CHROMA = 0.03;

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const seen = new Map();

// A #rrggbb color's OKLCH chroma and hue (degrees), or null for anything
// else.
export function oklch(hex) {
  if (!HEX.test(hex ?? "")) return null;
  if (seen.has(hex)) return seen.get(hex);
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const found = { c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
  seen.set(hex, found);
  return found;
}

// The tone of a color from outside the theme (a GitHub label's): the
// HUE_TONES color of the theme `t` nearest to it by OKLCH hue; a grey one
// (GREY_CHROMA), one that is no #rrggbb, or a theme without those colors
// gives "muted".
export function hueTone(t, hex) {
  const own = oklch(hex);
  if (!own || own.c < GREY_CHROMA) return "muted";
  let best = "muted";
  let distance = Infinity;
  for (const name of HUE_TONES) {
    const theirs = oklch(t[name]);
    if (!theirs) continue;
    const d = Math.min(Math.abs(own.h - theirs.h), 360 - Math.abs(own.h - theirs.h));
    if (d < distance) [best, distance] = [name, d];
  }
  return best;
}

// The tone text takes for a source's color name (a column's or a type's,
// from GITHUB_COLORS or Azure's categories): a bright variant becomes its
// HUE_TONES color (ansi11 → ansi3), the rest stays.
export function chipTone(name) {
  const n = /^ansi(9|1[0-4])$/.exec(name ?? "")?.[1];
  return n ? `ansi${Number(n) - 8}` : name;
}

// An item that is an Epic by its title alone: "[Epic] …", the convention of
// a project without issue types.
const EPIC_TITLE = /^\[epic\]/i;

// An item's type as the board marks it: its own (an issue type, a work item
// type), else "Epic" for an Epic by its title; null for none.
export const cardType = (item) => item.type ?? (EPIC_TITLE.test(item.title ?? "") ? "Epic" : null);

// The tone of an item's type marker in the theme `t`, or null for a type
// without a color (it keeps the plain chip). An issue type's own color
// (typeColor) wins; an Epic by its title alone takes its "epic" label's
// color, the owner's pick on GitHub (hueTone), and "muted" without such a
// label.
export function typeTone(t, item) {
  if (item.type) return item.typeColor ? chipTone(item.typeColor) : null;
  if (!cardType(item)) return null;
  const label = (item.labels ?? []).find((l) => l.toLowerCase() === "epic");
  return label ? hueTone(t, item.labelColors?.[label]) : "muted";
}
