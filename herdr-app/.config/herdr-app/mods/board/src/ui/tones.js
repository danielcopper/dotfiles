// The tone (a theme name such as "ansi4" or "muted") a label's chip takes,
// by its GitHub color's hue, and an issue type's, by its named color, with
// the color an Epic by its title takes (which items are one: cardType and
// epicLabel in shared.js); a tone's color for text and lines; the
// background of a chip, of a column head and of a selected card or row;
// how strong the chip, head and selected tints are; and tint, which the
// rest of the board tints with too. Which theme name a status or a state
// has, its source says (GITHUB_COLORS, CATEGORY_COLORS); the selected look,
// border and background, is selectedLook in helpers.js.
//
// Two paths, chosen once per theme (copperSteps), never per color: a theme
// that carries copper's palette steps for mods (themes/copper-*.json, from
// copper-design) gives chips and heads copper's tinted steps and a selected
// card its own `selected`; any other theme gives them tints of its colors
// (CHIP_ALPHA, HEAD_ALPHA, SELECTED_ALPHA). Text and lines take the theme's
// color of the tone on both paths. Everything is a theme name, a theme
// color or a tint of one, so a theme with other colors, or with surfaces of
// its own, changes the board with it.

import { cardType, epicLabel } from "../shared.js";

// How strong a tint is (the alpha byte after #rrggbb), on a theme without
// copper's steps: a chip's background (CHIP_ALPHA, under text in the chip's
// own tone), a column head's (HEAD_ALPHA, under its name and its muted
// count) and a selected card's or row's (SELECTED_ALPHA, under its text and
// chips). Measured against the copper themes' colors with their steps left
// out, and against catppuccin-mocha as herdr resolves it: that text stays at
// 4.5:1 or more on every ground the shapes draw it on (board.test.mjs), but
// for two of catppuccin's grounds, which the test names. HEAD_ALPHA is bound
// by the muted count on copper-light's chrome: at "11" the weakest head,
// yellow, gives 4.54:1.
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

// copper's palette steps for mods that the board takes (copper-design's
// herdr port carries steps 3, 4, 6 and 7 of each base color as
// copper-<color>-<step>): the tinted backgrounds, step 3 at rest and step 4
// beside it, of the neutral and of the hues the theme's ansi1..ansi6 are.
// copper's port lays its ANSI colors out as red, green, yellow, blue, violet
// and teal, so a tone's copper color is its ANSI slot's (a bright variant
// as its plain one, chipTone); any other tone (muted, dim) is the neutral.
// Orange has no ANSI slot: a label's orange takes red or yellow by hue, as
// on any theme.
const COPPER_COLORS = { ansi1: "red", ansi2: "green", ansi3: "yellow", ansi4: "blue", ansi5: "violet", ansi6: "teal" };
const COPPER_STEPS = [3, 4];
const copperColor = (tone) => COPPER_COLORS[chipTone(tone)] ?? "neutral";
const copperStep = (color, step) => `copper-${color}-${step}`;

// Whether the theme `t` carries every copper step the board takes, each an
// opaque #rrggbb. One answer for the whole theme: a theme that misses one
// takes the tints of its colors throughout.
export const copperSteps = (t) =>
  [...Object.values(COPPER_COLORS), "neutral"].every((color) => COPPER_STEPS.every((step) => OPAQUE.test(t[copperStep(color, step)] ?? "")));

// How far apart a tint has to stand from the ground beside it, as OKLab
// distance times 100: copper-design's bar for a tint drawn edge to edge
// with a panel level (its tests/test_herdr.py), about one neutral step.
const TINT_APART = 3;

// The tone's copper tint for a background drawn on each of `grounds`
// (opaque colors): step 3, copper's component background at rest, where it
// stands TINT_APART from every one of them, else step 4, also where that one
// does not either (a muted head on copper-light's chrome, which is its
// neutral step 3).
function copperTint(t, tone, grounds) {
  const color = copperColor(tone);
  const rest = t[copperStep(color, 3)];
  return grounds.every((g) => !OPAQUE.test(g ?? "") || apart(rest, g) >= TINT_APART) ? rest : t[copperStep(color, 4)];
}

// The color of text and lines in a `tone`: the theme's color of that name,
// on both paths. In a copper theme that is copper's own pick per mode for
// its ANSI colors (a text step, 11 or yellow's 12, in light mode; step 9 in
// dark), since the steps it carries for mods hold none for text; the one
// place to change once they do.
export const toneColor = (t, tone) => t[tone];

// A selected card's or row's background, in every shape alike, opaque, so
// its chips read the same on a column's chrome as on the board; the accent
// border marks it too (selectedLook, helpers.js). In a copper theme the
// theme's `selected`, copper's own blue step for a selected row. Elsewhere
// the accent tinted over the theme's background; without an accent or a
// background to lay it on, the theme's `selected`. That one would not do as
// the rule there: herdr derives it translucent for a theme that sets none,
// so a card would change with the ground under it, and over a dark
// background it comes out about as `raised`, where a plain chip (chip,
// helpers.js) vanishes.
export const selectedBg = (t) => (copperSteps(t) ? t.selected : layered(t.accent, SELECTED_ALPHA, t.background, t.selected));

// A chip's background in a `tone`. In a copper theme the tone's copper tint
// apart from what a chip stands on: a card (the theme's background) and a
// selected one (selectedBg). Elsewhere a tint of its color; for a tone the
// theme has no color for, or none it can tint, `raised`.
export const chipBg = (t, tone) => (copperSteps(t) ? copperTint(t, tone, [t.background, selectedBg(t)]) : tint(t[tone], CHIP_ALPHA, t.raised));

// A column head's background in its status `tone` (a tone the theme has no
// color for as "muted"). In a copper theme the tone's copper tint apart
// from both grounds a head stands on, a column's chrome and the Sprint's
// background, so a head looks the same on either. Elsewhere its color
// tinted over the `ground` it stands on, opaque, so a column that changes
// its own ground (a drop target) leaves the head as it is; without an
// opaque ground, the translucent tint; without a color, `raised`.
export function headBg(t, tone, ground) {
  if (copperSteps(t)) return copperTint(t, tone, [t.chrome, t.background]);
  const color = t[tone] ?? t.muted;
  return layered(color, HEAD_ALPHA, ground, tint(color, HEAD_ALPHA, t.raised));
}

// The tones a label or type can take: the theme's red, green, yellow, blue,
// violet and teal. Not their bright variants (ansi9 to ansi14): in
// copper-light each reads below 4.5:1 as chip text on a selected card
// (ansi14 2.97, ansi11 3.12).
export const HUE_TONES = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];
// Below this OKLCH chroma a color counts as grey: it takes "muted".
export const GREY_CHROMA = 0.03;

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const seen = new Map();

// A color's OKLab lightness and axes [L, a, b], from its first six digits;
// null for no #rrggbb[aa].
function oklab(hex) {
  if (!HEX.test(hex ?? "")) return null;
  const key = hex.slice(0, 7).toLowerCase();
  if (seen.has(key)) return seen.get(key);
  const [r, g, b] = channels(hex).map((c) => linear(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const found = [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
  seen.set(key, found);
  return found;
}

// A color's OKLCH chroma and hue (degrees), from its first six digits; null
// for no #rrggbb[aa].
export function oklch(hex) {
  const lab = oklab(hex);
  if (!lab) return null;
  const [, a, b] = lab;
  return { c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

// How far apart two colors stand: their OKLab distance times 100.
function apart(one, other) {
  const [x, y] = [oklab(one), oklab(other)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
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
