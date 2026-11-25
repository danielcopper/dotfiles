// What the second Enter asks before the start dialog where the item has
// sessions but none sure in a terminal (Board.startSession, secondEnter's
// ask): it names them, and offers to go to each one in a terminal, to
// start a new session anyway (the start dialog) or to cancel (Esc too);
// one in no terminal has no row to go to. Opened as b.modal = { kind:
// "sessions", view, item, sessions, at }; j/k and Enter, a digit or a click
// pick a row.

import { div } from "gpui-kit";
import { CANDIDATE_CHIP, menu, menuKey, menuNote, sessionReasons } from "../helpers.js";
import { placed } from "../../sessions.js";
import { itemLabel } from "../../shared.js";
import { startModal } from "./start.js";

const goText = (s, depth) =>
  [s.label, ...(depth > 0 ? [sessionReasons(s)] : []), ...(depth > 1 && s.paneNumber ? [`Pane ${s.paneNumber}`] : [])].filter(Boolean).join(" · ");

function goDetail(s, all) {
  let depth = 0;
  while (depth < 2 && all.some((o) => o !== s && goText(o, depth) === goText(s, depth))) depth++;
  return goText(s, depth);
}

function choicesOf(m) {
  const there = m.sessions.filter(placed);
  return [
    ...there.map((session) => ({ go: session, name: "Zur Sitzung springen", detail: goDetail(session, there) })),
    { start: true, name: "Trotzdem neue Sitzung starten", detail: "" },
    { name: "Abbrechen", detail: "" },
  ];
}

function pickChoice(b, m, i, cx) {
  const choice = choicesOf(m)[i];
  if (!choice) return;
  b.closeModal(cx);
  if (choice.go) b.goToSession(choice.go, cx);
  else if (choice.start) startModal.open(b, m.view, m.item, cx);
}

const foundLine = (s) => [`${s.sure ? "●" : `${CANDIDATE_CHIP}:`} ${s.label}`, sessionReasons(s)].filter(Boolean).join(" · ");

export const sessionsModal = {
  open(b, view, item, sessions, cx) {
    b.modal = { kind: "sessions", view, item, sessions, at: 0 };
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "sessions",
      rowId: "sessions",
      width: 460,
      title: `Sitzung zu ${itemLabel(m.item)}`,
      head: [
        menuNote(t, "Keine Sitzung, die sicher daran arbeitet, in einem Terminal. Gefunden:", t.muted),
        ...m.sessions.map((s, i) => div().id(`sessions-found-${i}`).px(8).truncate().text_size(12).text_color(t.foreground).child(foundLine(s))),
      ],
      at: m.at,
      pick: (i, cx) => pickChoice(b, m, i, cx),
      rows: choicesOf(m).map((c) => [
        div().flex_none().child(c.name),
        div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(c.detail),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, choicesOf(b.modal).length, (i, cx) => pickChoice(b, b.modal, i, cx)),
};
