// Creating a work item on a backlog: written by the view's loader (its
// create, then its addParent for a child), as writeAtOnce writes, with no
// row before Azure names the new id; and after a refresh, how unclear
// creates and parent links ended up. The backlog shape creates so.

import { errorText, itemKey, itemLabel } from "../shared.js";
import { findBacklogItem } from "../kinds/backlog.js";
import { writeAtOnce } from "./write.js";

// The key a create is written under: one create at a time per view (an
// unclear one's outcome is kept under a key of its own, createOpenKey).
export const CREATE_KEY = "create";

// The key of the Azure work item `id` (itemKey).
const workItemKey = (id) => itemKey({ source: "azure", kind: "workitem", number: id });

// The key the open outcome of one create is kept under, each its own, so
// that a later create replaces none.
let creates = 0;
const createOpenKey = () => `${CREATE_KEY}:${++creates}`;

// Creates a work item of `type` with `title`; a child type (type.child)
// goes under `parent`. Nothing shows before Azure names the id; then the
// backlog is read again and the new item, where the level holds its type,
// is chosen once that refresh has it (Board.chooseWanted). A child, which
// is no item of the level, is linked to its parent next (linkParent). A
// refusal reads the backlog again too, with settings read afresh (the
// source drops them): what the create met may have been out of date.
export function createItem(b, view, { type, title, parent }, cx) {
  const st = b.state(view.id);
  const label = `„${title}“`;
  const under = type.child && parent ? parent : null;
  const where = under ? ` unter ${itemLabel(under)}` : "";
  let id = null;
  writeAtOnce(b, view, {
    key: CREATE_KEY,
    label,
    apply() {},
    write: async () => (id = await b.loader(view).create(view, st.data, { type: type.name, title })),
    // The write's own cx (writeAtOnce): the one this was called with has
    // gone stale by now.
    landed(cx) {
      if (!under) st.want = { key: workItemKey(id), after: st.runs };
      else linkParent(b, view, id, under, cx);
    },
    undo() {},
    open: {
      kind: "create", key: createOpenKey(), title, type: type.name, child: Boolean(under),
      parent: under?.number ?? null, parentLabel: under ? itemLabel(under) : null,
    },
    again: true,
    againOnRefusal: true,
    texts: {
      pending: () => `${type.name} ${label}${where} wird angelegt …`,
      landed: () => (under ? `${workItemKey(id)} ${label} angelegt; wird unter ${itemLabel(under)} gehängt …` : `${workItemKey(id)} ${label} angelegt`),
      // A child is no item of the backlog, so no refresh shows it; the
      // refresh's check (unclearCreateLines) says whether it is there.
      unclear: under
        ? `${type.name} ${label} unter ${itemLabel(under)} anlegen (der Backlog zeigt keine ${type.name}s: vor einem neuen Versuch in Azure nachsehen; mit ${itemLabel(under)} ist es noch nicht verknüpft)`
        : `${type.name} ${label} anlegen`,
      refused: (why) => `${type.name} ${label} nicht angelegt: ${why}`,
      landedBut: (why) => `${workItemKey(id)} ${label} angelegt, aber nicht unter ${itemLabel(under)} gehängt: ${why}`,
      toasts: { unclear: `Anlegen von ${label}`, refused: `${label} nicht angelegt` },
    },
  }, cx);
}

// Makes the new work item `id` a child of `parent`, as a write of its own:
// the item is there either way, so a refusal says only that the link is
// missing.
function linkParent(b, view, id, parent, cx) {
  const label = workItemKey(id);
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
      toasts: { unclear: `${label} unter ${to}`, refused: `${label} hängt nicht unter ${to}` },
    },
  }, cx);
}

// How the settled unclear creates `due` (of kind "create") ended up, one
// line each, by asking Azure for the work items of each one's project,
// type and title that I created today (the loader's findCreated); for a
// child, only those that hang under no parent yet count, since its link
// was never made. Exactly one is taken for the create (info; a child's
// line adds that it hangs under nothing yet, a warning), none means it did
// not land, several are said as they are, a failed question says that it
// could not be checked (warnings). Nothing is guessed from the rows:
// another item of the same title may be there.
export async function unclearCreateLines(b, view, due) {
  const loader = b.loader(view);
  return Promise.all(due.map(async (u) => {
    const head = `${u.type} ${u.label}`;
    let ids;
    try {
      const found = await loader.findCreated(view, { type: u.type, title: u.title, child: u.child });
      ids = found.filter((i) => !u.child || i.parent === null).map((i) => i.number);
    } catch (e) {
      return { text: `${head}: ob es angelegt ist, ließ sich nicht prüfen (${errorText(e)}); vor einem neuen Versuch in Azure nachsehen`, warn: true };
    }
    if (ids.length === 1) {
      const key = workItemKey(ids[0]);
      if (u.child) return { text: `${head} ist angelegt (${key}), hängt aber nicht unter ${u.parentLabel}`, warn: true };
      return { text: `${head} ist angelegt (${key})`, warn: false };
    }
    if (!ids.length) return { text: `${head} ist nicht angelegt: Azure kennt kein Work Item dieses Titels, das ich heute angelegt habe`, warn: true };
    return { text: `${head}: Azure kennt ${ids.length} Work Items dieses Titels, die ich heute angelegt habe (${ids.map(workItemKey).join(", ")}); welches es ist, sagt das Board nicht`, warn: true };
  }));
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
