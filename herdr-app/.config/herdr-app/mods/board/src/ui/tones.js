// The tone (a theme name such as "ansi4" or "muted") a label's chip takes,
// by its GitHub color's hue, and an issue type's, by its named color, with
// the color an Epic by its title takes (which items are one: cardType and
// epicLabel in shared.js); the selected background and a column head's;
// how strong the chip, head and selected tints are; and tint, which the
// rest of the board tints with too. Which theme name a status or a state
// has, its source says (GITHUB_COLORS, CATEGORY_COLORS); the selected look,
// border and background, is selectedLook in helpers.js. Everything is a
// theme name or a tint of one, so a theme with other colors, or with
// surfaces of its own, changes the board with it.

import { cardType, epicLabel } from "../shared.js";

// How strong a tint is (the alpha byte after #rrggbb): a chip's background
// (CHIP_ALPHA, under text in the chip's own tone), a column head's
// (HEAD_ALPHA, under its name and its muted count) and a selected card's or
// row's (SELECTED_ALPHA, under its text and chips). Measured against the
// copper themes' own colors (themes/copper-*.json): that text stays at
// 4.5:1 or more on every ground the shapes draw it on, in copper-dark and
// copper-light (board.test.mjs). HEAD_ALPHA is bound by the muted count on
// copper-light's chrome: at "11" the weakest head, yellow, gives 4.54:1.
export const CHIP_ALPHA = "1a";
export const HEAD_ALPHA = "11";
export const SELECTED_ALPHA = "14";

// A theme color: #rrggbb, or #rrggbbaa (herdr's translucent surfaces); OPAQUE
// only the first.
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const OPAQUE = /^#[0-9a-f]{6}$/i;
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// `hex` with `alpha`: its first six digits, so a color with alpha of its own
// takes this one instead; anything else gives `fallback` (by default `hex`
// as it is).
export const tint = (hex, alpha, fallback = hex) => (HEX.test(hex ?? "") ? `${hex.slice(0, 7)}${alpha}` : fallback);

// `top` (its first six digits) at `alpha` laid over the opaque `ground`, as
// an opaque #rrggbb: the same color whatever lies under it. `fallback` where
// `top` is no color or `ground` no opaque one.
export function layered(top, alpha, ground, fallback) {
  if (!HEX.test(top ?? "") || !OPAQUE.test(ground ?? "")) return fallback;
  const a = parseInt(alpha, 16) / 255;
  const under = channels(ground);
  return `#${channels(top).map((c, i) => Math.round(c * a + under[i] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
}

// A selected card's or row's background, in every shape alike: the accent
// tinted over the theme's background, opaque, so its chips read the same on
// a column's chrome as on the board; the accent border marks it too
// (selectedLook, helpers.js). Without an accent or a background to lay it
// on, the theme's `selected`. That one would not do as the rule: herdr
// derives it translucent for a theme that sets none, so a card would change
// with the ground under it, and over a dark background it comes out about
// as `raised`, where a plain chip (chip, helpers.js) vanishes.
export const selectedBg = (t) => layered(t.accent, SELECTED_ALPHA, t.background, t.selected);

// A column head's background: its `color` tinted over the `ground` the
// head stands on (a column's chrome, the Sprint's background), opaque, so a
// column that changes its own ground (a drop target) leaves the head as it
// is. Without an opaque ground, the translucent tint; without a color,
// `raised`.
export const headBg = (t, color, ground) => layered(color, HEAD_ALPHA, ground, tint(color, HEAD_ALPHA, t.raised));

// The tones a label or type can take: the theme's red, green, yellow, blue,
// violet and teal. Not their bright variants (ansi9 to ansi14): in
// copper-light each reads below 4.5:1 as chip text on a selected card
// (ansi14 2.97, ansi11 3.12).
export const HUE_TONES = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];
// Below this OKLCH chroma a color counts as grey: it takes "muted".
export const GREY_CHROMA = 0.03;

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const seen = new Map();

// A color's OKLCH chroma and hue (degrees), from its first six digits; null
// for no #rrggbb[aa].
export function oklch(hex) {
  if (!HEX.test(hex ?? "")) return null;
  const key = hex.toLowerCase();
  if (seen.has(key)) return seen.get(key);
  const [r, g, b] = channels(hex).map((c) => linear(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const found = { c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
  seen.set(key, found);
  return found;
}

// The tone of a color from outside the theme (a GitHub label's): the
// HUE_TONES color of the theme `t` nearest to it by OKLCH hue; a grey one
// (GREY_CHROMA), one that is no color, or a theme without those colors
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

// The tone of an issue type's chip for its named color, the theme name
// GITHUB_COLORS gives it: a bright variant becomes its HUE_TONES color
// (ORANGE's ansi11 → ansi3, PINK's ansi13 → ansi5), the rest stays.
export function chipTone(name) {
  const n = /^ansi(9|1[0-4])$/.exec(name ?? "")?.[1];
  return n ? `ansi${Number(n) - 8}` : name;
}

// The tone of the line across the top of a card or row (typeLine,
// helpers.js) in the theme `t`: an Azure work item type's color (`hex`, from
// the project's type definitions) by hue (hueTone), as a label's; a GitHub
// issue type's by its named color (chipTone), as its chip's. Null where the
// type has no color, and for an item without an issue type (an Epic by its
// title alone too): no line.
export function typeLineTone(t, item, hex) {
  if (hex) return hueTone(t, hex);
  return item.typeColor ? chipTone(item.typeColor) : null;
}

// The tone of an item's type marker in the theme `t`, or null for a type
// without a color (it keeps the plain chip). An issue type's own color
// (typeColor) wins; an Epic by its title alone takes its "epic" label's
// color (epicLabel), the owner's pick on GitHub, by hue (hueTone), and
// "muted" without such a label.
export function typeTone(t, item) {
  if (item.type) return item.typeColor ? chipTone(item.typeColor) : null;
  if (!cardType(item)) return null;
  const label = epicLabel(item);
  return label ? hueTone(t, item.labelColors?.[label]) : "muted";
}
