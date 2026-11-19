// UI helpers: lasting settings, colors and machine names, whether the board
// shows, and an error's text for the UI.

import { panes, spaces } from "herdr";
import { MOD, BoardError, errorText } from "../shared.js";
import { githubContextId } from "../contexts.js";

// Settings that last across reloads: the shown source ("source"), each
// source's tab ("tab:<source>"), each team's view ("teamView:<context>"),
// "nur meine" ("mine") and each view's hidden columns ("hidden:<view>"). A
// full or missing localStorage keeps them for this session only.
export const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Kept in memory only; see above.
    }
  },
};

// The shown view a board before the top bar kept ("view": a GitHub view's
// id) becomes the GitHub source and that tab, once; what is set already
// stays.
export function migrateShownView() {
  const view = store.get("view");
  if (typeof view !== "string") return;
  if (store.get("source") === null) store.set("source", "github");
  if (store.get("tab:github") === null) store.set("tab:github", githubContextId(view));
  store.set("view", null);
}

export const tint = (hex, alpha) => (/^#[0-9a-f]{6}$/i.test(hex ?? "") ? `${hex}${alpha}` : hex);
export const machineName = (name) => name ?? "Dieser Rechner";
// "auf <machine>", or "auf diesem Rechner" for this one.
export const onMachine = (name) => (name ? `auf ${name}` : "auf diesem Rechner");

// Whether a board pane is in the shown tab of the shown space.
export function boardShown() {
  const shownTabs = new Set(spaces().filter((s) => s.active).flatMap((s) => s.tabs.filter((t) => t.active).map((t) => t.id)));
  return panes().some((p) => p.mod === MOD && shownTabs.has(p.tab));
}

// An error's message for the UI; an unexpected one is logged with its stack.
export function report(e) {
  if (!(e instanceof BoardError)) console.log(e?.stack ?? String(e));
  return errorText(e);
}

// "<shown> von <total>" where the filter or "nur meine" hides some, else the
// total.
export const shownOf = (shown, total) => (shown < total ? `${shown} von ${total}` : String(total));
