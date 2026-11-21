// Changing a work item's state: the status menu of its type's states, the
// change shown at once and written by the view's loader (its setState), as
// writeAtOnce writes, and after a refresh which state the items of unclear
// changes have. The sprint and the backlog shape change states so; each
// says how it finds an item, lays a state over its data and reads the
// state an item shows (`how`: { find(data, key), withState(data, key,
// state), stateOf(data, item), where (where an item
// no longer is: "im Sprint"), again (refresh after a change that landed)
// }).

import { itemLabel } from "../shared.js";
import { writeAtOnce } from "./write.js";

// The theme color of a state, by its category (data.meta.states:
// parseAzureTypes, parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";

// Opens the status menu for the selected item: the states of its type
// (data.meta.typeStates), the one it shows marked.
export function openStateMenu(b, view, how, cx) {
  const st = b.state(view.id);
  const item = b.selected(view);
  if (!item) return;
  const states = st.data.meta.typeStates?.[item.type];
  if (!states?.length) return b.say(`Für ${item.type ?? "diesen Typ"} kennt das Board keine Status`, "info", cx);
  const targets = states.map((name) => ({ id: name, name, color: stateColor(st.data, name), hidden: false }));
  b.modal = { kind: "status", view, key: item.key, targets, at: Math.max(0, states.indexOf(how.stateOf(st.data, item))) };
}

// Sets an item's state at once and writes it (writeAtOnce); the state it
// has already sends nothing. A refusal sets the state back, unless a
// refresh has read another since.
export function setStateAtOnce(b, view, key, state, how, cx) {
  const st = b.state(view.id);
  const item = how.find(st.data, key);
  if (!item) return b.say("Den Eintrag gibt es nicht mehr", "warning", cx);
  const label = itemLabel(item);
  const before = how.stateOf(st.data, item);
  if (before === state) return;
  writeAtOnce(b, view, {
    key,
    label,
    apply: () => (st.data = how.withState(st.data, key, state)),
    write: () => b.loader(view).setState(view, item, state),
    undo() {
      if (how.find(st.data, key)?.state === state) st.data = how.withState(st.data, key, before);
    },
    open: { kind: "state", state },
    again: how.again,
    texts: {
      pending: () => `${label} → ${state} …`,
      landed: () => `${label} hat jetzt den Status „${state}“`,
      unclear: `${label} → ${state}`,
      refused: (why, earlier) => (earlier ? `${label} → ${state} nicht gespeichert: ${why}` : `${label} bleibt „${before}“: ${why}`),
    },
  }, cx);
}

// Which state the items of settled unclear state changes (`due`) have in
// the new data, one line each: the state it was set to (info), another
// (warning), or not in the view any more (warning).
export function unclearStateLines(due, data, how) {
  return due.map((u) => {
    const now = how.find(data, u.key);
    if (!now) return { text: `${u.label} ist nach dem Neuladen nicht ${how.where}`, warn: true };
    const state = how.stateOf(data, now);
    if (state === u.state) return { text: `${u.label} hat nach dem Neuladen den Status „${u.state}“`, warn: false };
    return { text: `${u.label} hat nach dem Neuladen den Status „${state}“, nicht „${u.state}“`, warn: true };
  });
}
