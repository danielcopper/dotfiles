// Assigning an item to one person, or to no one: the change shown at once
// and written by its source (its assign.write), as writeAtOnce writes, and
// after a refresh whom the items of unclear assignments have. A source that
// assigns has `assign`: { refuse(item) (why the item cannot be assigned
// there, or null), people(item, view) (whom the picker offers: { me,
// people, note }, persons { login, name, id?, me? }; kept per repo or team
// by the source), fallbackMe() (the "Ich" it can write without that list,
// or null), write(view, item, person) (makes `person` the only assignee,
// null no one; → { names, logins } as the answer names them) }. How a
// shape finds and changes its items' assignees (`how`): its assign, which
// ui/shapes/index.js describes. The picker is ui/modals/assign.js.

import { itemLabel } from "../shared.js";
import { writeAtOnce } from "./write.js";

// Who is assigned, as a notice says it.
export const assignedText = (names) => (names.length ? `${names.join(", ")} zugewiesen` : "niemandem zugewiesen");
// A person as the board names one before an answer named them.
const personText = (person) => (person ? person.name ?? person.login ?? "ich" : "niemand");
const same = (a, b) => (a ?? []).join("\n") === (b ?? []).join("\n");

// Makes `person` the only assignee of the item `key` (null: no one) at
// once and writes it; an item that has exactly them already sends
// nothing. Where the write landed, the item shows whom the answer names;
// a refusal sets the assignees back, unless a refresh has read others
// since.
export function assignAtOnce(b, view, key, person, cx) {
  const st = b.state(view.id);
  const how = b.shape(view).assign;
  const item = how.find(st.data, key);
  if (!item) return b.say("Den Eintrag gibt es nicht mehr", "warning", cx);
  const label = itemLabel(item);
  const before = { assignees: item.assignees ?? [], assigneeLogins: item.assigneeLogins ?? [] };
  const logins = person ? (person.login ? [person.login] : null) : [];
  if (logins && same(logins, before.assigneeLogins)) return;
  const after = { assignees: person ? [personText(person)] : [], assigneeLogins: logins ?? [] };
  const who = personText(person);
  let answer = null;
  writeAtOnce(b, view, {
    key,
    label,
    apply: () => (st.data = how.withItem(st.data, key, after)),
    write: async () => (answer = await b.sources[item.source].assign.write(view, item, person)),
    landed: () => (st.data = how.withItem(st.data, key, { assignees: answer.names, assigneeLogins: answer.logins })),
    undo() {
      const now = how.find(st.data, key);
      if (now && same(now.assignees, after.assignees) && same(now.assigneeLogins, after.assigneeLogins)) st.data = how.withItem(st.data, key, before);
    },
    open: { kind: "assign", logins, who },
    texts: {
      pending: () => `${label} → ${who} …`,
      landed: () => `${label} ist jetzt ${assignedText(answer.names)}`,
      unclear: `${label} → ${who}`,
      refused: (why, earlier) =>
        (earlier ? `${label} → ${who} nicht gespeichert: ${why}` : `${label} bleibt ${before.assignees.length ? assignedText(before.assignees) : "ohne Zuweisung"}: ${why}`),
      toasts: { unclear: `Zuweisung von ${label}`, refused: `Zuweisung von ${label} nicht geändert` },
    },
  }, cx);
}

// Whom the items of settled unclear assignments (`due`, of kind "assign")
// have in the new data (`how`, the shape's assign), one line each: the one
// they were set to (info), others (warning), or not in the view any more
// (warning). An assignment to az's "me" whose login was unknown says
// whom the item has.
export function unclearAssignLines(due, data, how) {
  return due.map((u) => {
    const now = how.find(data, u.key);
    if (!now) return { text: `${u.label} ist nach dem Neuladen nicht ${how.where}`, warn: true };
    const has = `${u.label} ist nach dem Neuladen ${assignedText(now.assignees ?? [])}`;
    if (!u.logins || same(now.assigneeLogins, u.logins)) return { text: has, warn: false };
    return { text: `${has}, nicht ${u.logins.length ? u.who : "niemandem"}`, warn: true };
  });
}
