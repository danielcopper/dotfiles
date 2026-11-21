// Creating a work item on a backlog: written by the view's loader (its
// create, then its addParent for a child), as writeAtOnce writes, with no
// row before Azure names the new id; and after a refresh, how unclear
// creates and parent links ended up. The backlog shape creates so.

import { itemLabel } from "../shared.js";
import { findBacklogItem } from "../kinds/backlog.js";
import { writeAtOnce } from "./write.js";

// The key a create is written under: one create at a time per view.
export const CREATE_KEY = "create";

// Creates a work item of `type` with `title`; a child type (type.child)
// goes under `parent`. Nothing shows before Azure names the id; then the
// backlog is read again and the new item, where the level holds its type,
// is chosen once that refresh has it (Board.chooseWanted). A child, which
// is no item of the level, is linked to its parent next (linkParent).
export function createItem(b, view, { type, title, parent }, cx) {
  const st = b.state(view.id);
  const label = `„${title}“`;
  const under = type.child && parent ? parent : null;
  let id = null;
  writeAtOnce(b, view, {
    key: CREATE_KEY,
    label,
    apply() {},
    write: async () => (id = await b.loader(view).create(view, st.data, { type: type.name, title })),
    landed() {
      if (!under) st.want = { key: itemLabel({ source: "azure", kind: "workitem", number: id }), after: st.runs };
      else linkParent(b, view, id, under, cx);
    },
    undo() {},
    open: { kind: "create", title },
    again: true,
    texts: {
      pending: () => `${type.name} ${label} wird angelegt …`,
      landed: () => (under ? `AB#${id} ${label} angelegt; wird unter ${itemLabel(under)} gehängt …` : `AB#${id} ${label} angelegt`),
      unclear: `${type.name} ${label} anlegen`,
      refused: (why) => `${type.name} ${label} nicht angelegt: ${why}`,
    },
  }, cx);
}

// Makes the new work item `id` a child of `parent`, as a write of its own:
// the item is there either way, so a refusal says only that the link is
// missing.
function linkParent(b, view, id, parent, cx) {
  const label = `AB#${id}`;
  const to = itemLabel(parent);
  writeAtOnce(b, view, {
    key: label,
    label,
    apply() {},
    write: () => b.loader(view).addParent(view, id, parent.number),
    undo() {},
    open: { kind: "parent", parent: parent.number, parentLabel: to },
    texts: {
      pending: () => `${label} wird unter ${to} gehängt …`,
      landed: () => `${label} hängt jetzt unter ${to}`,
      unclear: `${label} unter ${to}`,
      refused: (why) => `${label} ist angelegt, hängt aber nicht unter ${to}: ${why}`,
    },
  }, cx);
}

// Where the work items of settled unclear creates (`due`, of kind
// "create") are in the new data, one line each: an item of that title in
// the backlog (info), else none (warning; a child type is no item of the
// level, so it never shows there).
export function unclearCreateLines(due, data) {
  return due.map((u) => {
    const found = data.rows.filter((r) => r.title === u.title);
    if (found.length) return { text: `${u.label} steht nach dem Neuladen im Backlog (${found.map(itemLabel).join(", ")})`, warn: false };
    return { text: `${u.label} steht nach dem Neuladen nicht im Backlog`, warn: true };
  });
}

// Whether the items of settled unclear parent links (`due`, of kind
// "parent") hang under their parent in the new data, one line each; an
// item the backlog does not hold (a Task) it cannot tell.
export function unclearParentLines(due, data) {
  return due.map((u) => {
    const now = findBacklogItem(data, u.key);
    if (!now) return { text: `Ob ${u.label} unter ${u.parentLabel} hängt, zeigt der Backlog nicht: ${u.label} ist kein Eintrag von ihm`, warn: true };
    if (now.parent === u.parent) return { text: `${u.label} hängt nach dem Neuladen unter ${u.parentLabel}`, warn: false };
    return { text: `${u.label} hängt nach dem Neuladen nicht unter ${u.parentLabel}`, warn: true };
  });
}
