// The tone (a theme name such as "ansi4" or "muted") a label's chip takes,
// by its GitHub color's hue, and an issue type's, by its named color, with
// the color an Epic by its title takes (which items are one: cardType and
// epicLabel in shared.js); the board's colors in a theme, its palette
// (paletteOf); how strong the tints are on a theme without copper's colors;
// and tint, which the rest of the board tints with too.
// Which theme name a status or a state has, its source says (GITHUB_COLORS,
// CATEGORY_COLORS), and a PR list section's, views.json (SECTION_TONES in
// shared.js); the selected look, border and background, is selectedLook in
// helpers.js.
//
// Two paths, chosen once per theme (copperColors), never per color: a theme
// that carries copper's colors for mods (themes/copper-*.json, from
// copper-design) draws in copper's text colors and tinted steps, with orange
// as a hue of its own; any other theme draws in its own colors and tints of
// them (CHIP_ALPHA, HEAD_ALPHA, SELECTED_ALPHA). Everything is a theme name,
// a theme color or a tint of one, so a theme with other colors, or with
// surfaces of its own, changes the board with it.

import { COPPER_HUES, cardType, epicLabel } from "../shared.js";

// How strong a tint is (the alpha byte after #rrggbb), on a theme without
// copper's colors: a chip's background (CHIP_ALPHA, under text in the
// chip's own tone), a column head's and a PR list section head's
// (HEAD_ALPHA, under its name and its muted count, or a section's name
// and count in its tone) and a selected card's or row's (SELECTED_ALPHA,
// under its text and chips). Measured against the copper themes' colors with copper's
// own left out, and against catppuccin-mocha as herdr resolves it: that text
// stays at 4.5:1 or more on every ground the shapes draw it on
// (board.test.mjs), but for a muted chip and dim text on a selected card in
// catppuccin, which the test names. HEAD_ALPHA is bound by the muted count
// on copper-light's chrome: at "11" the weakest head, yellow, gives 4.54:1.
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

// copper's colors for mods that the board takes (copper-design's herdr port
// carries them as copper-<color>-<key> since v0.4.0): of each base color,
// its tinted backgrounds, step 3 at rest and step 4 beside it, and its text
// color (copper-<color>-text), which reads at 4.5:1 or more on both and on
// the theme's background.
//
// A tone's copper color is its ANSI slot's: copper's port lays ansi1 to
// ansi6 out as red, green, yellow, blue, violet and teal, and a bright
// variant counts as its plain one (chipTone), but for ansi11, which stands
// for orange: GitHub's ORANGE takes it (GITHUB_COLORS), a label takes it
// for copper's orange (hueTone), and the mark on a pull request the viewer
// has to act on is drawn in it (markColor). Any other tone (muted, dim) is
// the neutral. COPPER_HUES (shared.js) holds the slots by copper's names.
const ANSI_COPPER = Object.fromEntries(Object.entries(COPPER_HUES).map(([color, tone]) => [tone, color]));
const COPPER_COLORS = [...Object.values(ANSI_COPPER), "neutral"];
const COPPER_KEYS = [3, 4, "text"];
const copperKey = (color, key) => `copper-${color}-${key}`;
const copperColor = (tone) => ANSI_COPPER[tone] ?? ANSI_COPPER[chipTone(tone)] ?? "neutral";

// Whether the theme `t` carries every copper color the board takes, each an
// opaque #rrggbb. One answer for the whole theme: a theme that misses one (a
// copper theme before v0.4.0, without text colors) draws in its own colors
// and their tints throughout.
export const copperColors = (t) => COPPER_COLORS.every((color) => COPPER_KEYS.every((key) => OPAQUE.test(t[copperKey(color, key)] ?? "")));

// Where a label's color turns from copper's red to its orange, as an OKLCH
// hue in degrees: further toward orange than halfway between their text
// colors (about 4 and 50), so GitHub's dark reds (b60205 at 29, d93f0b at
// 36) stay red.
const RED_ORANGE = 40;

// How far apart a tint has to stand from the ground beside it, as OKLab
// distance times 100: the board's own bar for every pair, adopted from
// copper-design's bar for a tint drawn edge to edge with a panel level (its
// tests/test_herdr.py), about one neutral step. copper holds a pair of two
// neutral steps to 1.12:1 in luminance instead, which a neutral head on
// neutral step 3 misses (board.test.mjs names it).
const TINT_APART = 3;

// The tone's copper tint for a background drawn on each of `grounds`
// (opaque colors): step 3, copper's component background at rest, where it
// stands TINT_APART from every one of them, else step 4, also where that one
// does not either (a muted head on copper-light's chrome, which is its
// neutral step 3).
function copperTint(t, tone, grounds) {
  const color = copperColor(tone);
  const rest = t[copperKey(color, 3)];
  return grounds.every((g) => !OPAQUE.test(g ?? "") || apart(rest, g) >= TINT_APART) ? rest : t[copperKey(color, 4)];
}

// The board's colors in the theme `t`, its palette, on the path
// copperColors chooses for it, worked out once per theme object: `hues`, the
// tones a label can take, each with the theme name hueTone measures its hue
// by; `borders`, where between two of them a label's hue turns from the one
// to the other where that is not halfway ([low, high, hue]);
// `named(name)`, the tone of a named color a source gives (an issue type's);
// `text(tone)`, the color of text, lines and state fills in a tone;
// `selected`, a selected card's or row's background; `chip(tone)` and
// `head(tone, ground)`, a chip's and a column head's background;
// `drop(ground)`, a drop target column's background, where `ground` is its
// own; `mark`, the color of the mark on a pull request the viewer has to
// act on, a PR list's, which no section tone and no check state shares.
const palettes = new WeakMap();
function paletteOf(t) {
  if (!palettes.has(t)) palettes.set(t, copperColors(t) ? copperPalette(t) : tintedPalette(t));
  return palettes.get(t);
}

// A copper theme's palette. A label takes one of copper's seven hues, as
// the tone ANSI_COPPER gives it, measured by its text color, red below
// RED_ORANGE; a named color stays as its source names it. Text, lines and
// state fills in a tone take its copper color's text color (copperColor). A
// selected card or row stands on the theme's `selected`, copper's own blue
// step for a selected row. A chip stands on its tone's copper tint for what
// a chip stands on, a card (the theme's background) and a selected one; a
// column head on its tone's copper tint for both grounds a head stands on
// (copperTint), a column's chrome and the Sprint's background, so a head
// looks the same on either. A drop target keeps its ground and the accent
// border marks it: its `selected` would match a selected card. The mark
// takes copper's orange (SECTION_TONES leaves it out).
function copperPalette(t) {
  return {
    hues: Object.entries(ANSI_COPPER).map(([tone, color]) => [tone, copperKey(color, "text")]),
    borders: [["ansi1", "ansi11", RED_ORANGE]],
    named: (name) => name,
    text: (tone) => t[copperKey(copperColor(tone), "text")],
    selected: t.selected,
    chip: (tone) => copperTint(t, tone, [t.background, t.selected]),
    head: (tone) => copperTint(t, tone, [t.chrome, t.background]),
    drop: (ground) => ground,
    mark: t[copperKey("orange", "text")],
  };
}

// Any other theme's palette, its own colors and tints of them. A label
// takes one of HUE_TONES; a named color its plain variant (chipTone). Text,
// lines and state fills in a tone take the theme's color of that name,
// "muted" where it has none. A selected card or row stands on the accent
// tinted over the theme's background, opaque, so its chips read the same on
// a column's chrome as on the board; without an accent or a background to
// lay it on, on the theme's `selected`. That one would not do as the rule:
// herdr derives it translucent for a theme that sets none, so a card would
// change with the ground under it, and over a dark background it comes out
// about as `raised`, where a plain chip (chip, helpers.js) vanishes. A chip
// stands on a tint of its tone's color, or `raised` where that cannot be
// tinted. A column head stands on its tone's color tinted over the `ground`
// it stands on, opaque, so a column that changes its own ground (a drop
// target) leaves the head as it is; without an opaque ground, the
// translucent tint; without a color, `raised`. A drop target takes the
// theme's `selected`. The mark takes the theme's foreground, as no hue is
// left for it: each of the six is a section's tone or a check state's, and
// its bright yellow, orange's slot, is its yellow (catppuccin-mocha), stands
// next to it (copper-dark without copper's colors) or reads below 4.5:1
// (copper-light without them, HUE_TONES); the mark's dot and weight set it
// apart.
function tintedPalette(t) {
  const text = (tone) => t[tone] ?? t.muted;
  return {
    hues: HUE_TONES.map((name) => [name, name]),
    borders: [],
    named: chipTone,
    text,
    selected: layered(t.accent, SELECTED_ALPHA, t.background, t.selected),
    chip: (tone) => tint(text(tone), CHIP_ALPHA, t.raised),
    head: (tone, ground) => layered(text(tone), HEAD_ALPHA, ground, tint(text(tone), HEAD_ALPHA, t.raised)),
    drop: () => t.selected,
    mark: t.foreground,
  };
}

// The theme `t`'s palette (paletteOf) by piece. A selected card's or row's
// background is the same in every shape, and the accent border marks it too
// (selectedLook, helpers.js).
export const toneColor = (t, tone) => paletteOf(t).text(tone);
export const selectedBg = (t) => paletteOf(t).selected;
export const chipBg = (t, tone) => paletteOf(t).chip(tone);
export const headBg = (t, tone, ground) => paletteOf(t).head(tone, ground);
export const dropBg = (t, ground) => paletteOf(t).drop(ground);
export const markColor = (t) => paletteOf(t).mark;

export const namedTone = (t, name) => paletteOf(t).named(name);

// The tone of a note's level, which toneColor draws every note the board
// shows in: an error, a warning, a success, information.
export const NOTE_TONES = { error: "ansi1", warning: "ansi3", success: "ansi2", info: "muted" };

// The tones a label can take on a theme without copper's colors: the
// theme's red, green, yellow, blue, violet and teal. Not their bright
// variants (ansi9 to ansi14): in copper-light without copper's colors each
// reads below 4.5:1 as chip text on a selected card (ansi14 2.97, ansi11
// 3.12).
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

// The tone of a color from outside the theme (a GitHub label's): of the
// hues the theme `t`'s palette offers (paletteOf), the one whose color is
// nearest to it by OKLCH hue, but between two hues with a border of their
// own the one on its side of that border; a grey one (GREY_CHROMA), one
// that is no color, or a theme without those colors gives "muted".
export function hueTone(t, hex) {
  const own = oklch(hex);
  if (!own || own.c < GREY_CHROMA) return "muted";
  const { hues, borders } = paletteOf(t);
  const hueOf = (tone) => oklch(t[hues.find(([name]) => name === tone)?.[1]])?.h;
  // How far round from `from` a hue lies, going up.
  const round = (h, from) => (h - from + 360) % 360;
  for (const [low, high, at] of borders) {
    const [from, to] = [hueOf(low), hueOf(high)];
    if (from === undefined || to === undefined || round(own.h, from) > round(to, from)) continue;
    return round(own.h, from) < round(at, from) ? low : high;
  }
  let best = "muted";
  let distance = Infinity;
  for (const [tone, name] of hues) {
    const theirs = oklch(t[name]);
    if (!theirs) continue;
    const d = Math.min(Math.abs(own.h - theirs.h), 360 - Math.abs(own.h - theirs.h));
    if (d < distance) [best, distance] = [tone, d];
  }
  return best;
}

// A theme name's plain variant: a bright one (ansi9 to ansi14) becomes its
// HUE_TONES color (ORANGE's ansi11 → ansi3, PINK's ansi13 → ansi5), the rest
// stays. On a theme without copper's colors it is an issue type's chip tone
// for the theme name GITHUB_COLORS gives it (tintedPalette); on a copper
// theme it takes a bright tone to its copper color (copperColor).
export function chipTone(name) {
  const n = /^ansi(9|1[0-4])$/.exec(name ?? "")?.[1];
  return n ? `ansi${Number(n) - 8}` : name;
}

// The tone of the line across the top of a card or row (typeLine,
// helpers.js) in the theme `t`: an Azure work item type's color (`hex`, from
// the project's type definitions) by hue (hueTone), as a label's; a GitHub
// issue type's by its named color (the palette's `named`), as its chip's.
// Null where the type has no color, and for an item without an issue type
// (an Epic by its title alone too): no line.
export function typeLineTone(t, item, hex) {
  if (hex) return hueTone(t, hex);
  return item.typeColor ? paletteOf(t).named(item.typeColor) : null;
}

// The tone of an item's type marker in the theme `t`, or null for a type
// without a color (it keeps the plain chip). An issue type's own color
// (typeColor) wins; an Epic by its title alone takes its "epic" label's
// color (epicLabel), the owner's pick on GitHub, by hue (hueTone), and
// "muted" without such a label.
export function typeTone(t, item) {
  if (item.type) return item.typeColor ? paletteOf(t).named(item.typeColor) : null;
  if (!cardType(item)) return null;
  const label = epicLabel(item);
  return label ? hueTone(t, item.labelColors?.[label]) : "muted";
}
