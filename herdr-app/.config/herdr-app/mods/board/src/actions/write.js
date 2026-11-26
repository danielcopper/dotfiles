// Writing a change of an item at once: it shows before it is written, one
// write per item at a time; a refusal undoes it and says why, and a write
// whose outcome is unclear keeps the change, refreshes the view and leaves
// the outcome for the next refresh to settle (Board.settleUnclear, the
// shape's settle, which says the outcomes with tellOutcomes). A card's
// move, a work item's state change, a create, a parent link and an
// assignment are written so.

import { notify } from "herdr";
import { BoardError, report } from "../shared.js";
import { viewKind } from "../kinds/index.js";

// Whether a write's view still stands, the one rule for following a write
// up: the config, as its last valid form says (an invalid one in between
// keeps it), still has that view, of the same kind (followed); and the
// view as the config has it now (current, null while it is not there).
export function viewStands(b, view) {
  return { followed: b.configState.kinds?.get(view.id) === viewKind(view), current: b.viewById(view.id) };
}

// Writes the change `w` of the item w.key (labelled w.label) at once:
// - w.refuse: a text to say instead of writing (checked after a write of
//   the item under way);
// - w.apply() shows the change; w.write() writes it (a BoardError marked
//   unclear leaves the outcome open);
// - w.landed(cx) when it landed, with the cx that may still be used then
//   (the write's own: a cx a call handed over goes stale when that call
//   returns, herdr's scope.rs); a throw there does not undo the write, it
//   is said as w.texts.landedBut(why). w.failed() when it did not land,
//   either way; w.undo() when it was refused;
// - w.open: what an open outcome records beside key, label and time, for
//   the shape's settle: its kind ("move" with the target `to`, "state"
//   with the `state`, "create" with the title and type, "parent" with the
//   parent, "assign" with the logins and whom), and its key where that
//   is not w.key (a create's, whose w.key only keeps one create at a
//   time). A write replaces or drops only the
//   item's open outcome of its own kind, so a move's report waits through
//   a state change and the other way round;
// - w.texts: pending() and landed() say how it goes, unclear leads the
//   warning, refused(why, earlier) the error (earlier: an outcome of the
//   item's write of this kind is still open), landedBut(why) a landed write
//   whose follow-up failed; toasts: the toasts' titles, { unclear (also a
//   landed write whose follow-up failed), refused } ("Status von AB#3",
//   "Status von AB#3 nicht geändert" by default);
// - w.again: refresh after a write that landed too (looked up after the
//   write, so a getter may go by its answer); w.againOnRefusal: after one
//   that was refused too (what it met may have been out of date).
// A write that landed or was refused refreshes the view too while an open
// outcome of the item, of any kind, remains: the refresh tells it, so
// it does not wait for the timer. A refresh follows only while the view
// stands (viewStands).
export function writeAtOnce(b, view, w, cx) {
  const st = b.state(view.id);
  const { key, label } = w;
  const openKey = w.open.key ?? key;
  const same = (u) => u.key === openKey && u.kind === w.open.kind;
  const toasts = w.texts.toasts ?? { unclear: `Status von ${label}`, refused: `Status von ${label} nicht geändert` };
  if (st.pending[key]) return b.say(`${label} wird noch gespeichert`, "info", cx);
  if (st.saved) return refuseOnSaved(b, view, cx);
  if (w.refuse) return b.say(w.refuse, "warning", cx);
  w.apply();
  st.pending[key] = true;
  b.say(w.texts.pending(), "info", cx);
  cx.spawn(async (cx) => {
    try {
      let landed = false;
      try {
        await w.write();
        landed = true;
      } catch (e) {
        failed(e, cx);
      }
      if (landed) settled(cx);
    } finally {
      delete st.pending[key];
      cx.notify();
    }
  });

  function settled(cx) {
    // A write that landed replaces the open outcome of an earlier one.
    st.unclear = st.unclear.filter((u) => !same(u));
    let said = w.texts.landed();
    let level = "success";
    try {
      w.landed?.(cx);
    } catch (e) {
      said = w.texts.landedBut?.(report(e)) ?? `${said}; danach: ${report(e)}`;
      level = "warning";
      notify({ title: toasts.unclear, body: said, level });
    }
    b.say(said, level, cx);
    const { followed, current } = viewStands(b, view);
    if ((w.again || openOf(st, key)) && followed && current) b.refresh(current, cx);
  }

  function failed(e, cx) {
    w.failed?.();
    const why = report(e);
    const { followed, current } = viewStands(b, view);
    if (e instanceof BoardError && e.unclear) {
      if (followed) st.unclear = [...st.unclear.filter((u) => !same(u)), { label, ...w.open, key: openKey, at: Date.now() }];
      const next = !followed ? "" : current ? "; lädt neu" : "; wird nach dem nächsten Neuladen gemeldet";
      b.say(`${w.texts.unclear}: ${why}${next}`, "warning", cx);
      notify({ title: toasts.unclear, body: why, level: "warning" });
      if (followed && current) b.refresh(current, cx);
    } else {
      w.undo();
      const earlier = st.unclear.some(same);
      b.say(w.texts.refused(why, earlier), "error", cx);
      notify({ title: toasts.refused, body: why, level: "error" });
      if (followed && current && (w.againOnRefusal || openOf(st, key))) b.refresh(current, cx);
    }
  }
}

// The saved state may be long out of date: no write goes against it, and
// the person makes it again once a read replaced it. That read runs from
// the moment the saved state shows; one that failed starts again here.
export const SAVED_WRITE = "Gezeigt ist der gespeicherte Stand: erst nach dem Neuladen noch einmal";
function refuseOnSaved(b, view, cx) {
  b.say(SAVED_WRITE, "info", cx);
  restartRead(b, view, cx);
}

export function restartRead(b, view, cx) {
  const { current } = viewStands(b, view);
  if (current && !b.state(view.id).loading) b.refresh(current, cx);
}

// Whether an outcome of the item `key`, of any kind, is still open.
const openOf = (st, key) => st.unclear.some((u) => u.key === key);

// Says the lines of settled outcomes ({ text, warn }) in one notice; one
// that warns makes it a warning, which a toast repeats.
export function tellOutcomes(b, lines, cx) {
  if (!lines.length) return;
  const level = lines.some((l) => l.warn) ? "warning" : "info";
  const text = lines.map((l) => l.text).join("; ");
  b.say(text, level, cx);
  if (level === "warning") notify({ title: "Status nach dem Neuladen", body: text, level: "warning" });
}
