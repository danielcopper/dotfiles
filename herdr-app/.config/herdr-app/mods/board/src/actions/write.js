// Writing a change of an item at once: it shows before it is written, one
// write per item at a time; a refusal undoes it and says why, and a write
// whose outcome is unclear keeps the change, refreshes the view and leaves
// the outcome for the next refresh to settle (Board.settleUnclear, the
// shape's settle). A card's move and a work item's state change are
// written so.

import { notify } from "herdr";
import { BoardError } from "../shared.js";
import { viewKind } from "../kinds/index.js";
import { report } from "../ui/helpers.js";

// Whether a write's view still stands, the one rule for following a write
// up: views.json, as its last valid form says (an invalid one in between
// keeps it), still has that view, of the same kind (followed); and the
// view as views.json has it now (current, null while it is not there).
export function viewStands(b, view) {
  return { followed: b.kinds?.get(view.id) === viewKind(view), current: b.viewById(view.id) };
}

// Writes the change `w` of the item w.key (labelled w.label) at once:
// - w.refuse: a text to say instead of writing (checked after a write of
//   the item under way);
// - w.apply() shows the change; w.write() writes it (a BoardError marked
//   unclear leaves the outcome open);
// - w.landed() when it landed; w.failed() when it did not, either way;
//   w.undo() when it was refused;
// - w.open: what an open outcome records beside key, label and time (a
//   move's target `to`, a state's `state`), for the shape's settle;
// - w.texts: pending() and landed() say how it goes, unclear leads the
//   warning, refused(why, earlier) the error (earlier: an outcome of the
//   item is still open, which the refresh after the refusal tells);
// - w.again: refresh after a write that landed too.
// A refresh follows only while the view stands (viewStands).
export function writeAtOnce(b, view, w, cx) {
  const st = b.state(view.id);
  const { key, label } = w;
  if (st.pending[key]) return b.say(`${label} wird noch gespeichert`, "info", cx);
  if (w.refuse) return b.say(w.refuse, "warning", cx);
  w.apply();
  st.pending[key] = true;
  b.say(w.texts.pending(), "info", cx);
  cx.spawn(async (cx) => {
    try {
      await w.write();
      w.landed?.();
      // A write that landed replaces the open outcome of an earlier one.
      st.unclear = st.unclear.filter((u) => u.key !== key);
      b.say(w.texts.landed(), "success", cx);
      const { followed, current } = viewStands(b, view);
      if (w.again && followed && current) b.refresh(current, cx);
    } catch (e) {
      w.failed?.();
      const why = report(e);
      const { followed, current } = viewStands(b, view);
      if (e instanceof BoardError && e.unclear) {
        if (followed) st.unclear = [...st.unclear.filter((u) => u.key !== key), { key, label, ...w.open, at: Date.now() }];
        const next = !followed ? "" : current ? "; lädt neu" : "; wird nach dem nächsten Neuladen gemeldet";
        b.say(`${w.texts.unclear}: ${why}${next}`, "warning", cx);
        notify({ title: `Status von ${label}`, body: why, level: "warning" });
        if (followed && current) b.refresh(current, cx);
      } else {
        w.undo();
        const earlier = st.unclear.some((u) => u.key === key);
        b.say(w.texts.refused(why, earlier), "error", cx);
        notify({ title: `Status von ${label} nicht geändert`, body: why, level: "error" });
        // An earlier unclear write of the item waited for this one; the
        // server's answer tells it now.
        if (followed && current && earlier) b.refresh(current, cx);
      }
    } finally {
      delete st.pending[key];
      cx.notify();
    }
  });
}
