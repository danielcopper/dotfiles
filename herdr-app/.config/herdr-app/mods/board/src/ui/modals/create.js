// The create dialog: a new work item on a team's backlog, its type (the
// level's types, its default first; with an item of the level selected also
// the types of the level below, as that item's children) and its title.
// The backlog shape opens it (n). Enter or Anlegen creates
// (actions/create.js): the dialog closes and the notice says how it goes.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { itemLabel } from "../../shared.js";
import { createTypes } from "../../kinds/backlog.js";
import { CREATE_KEY, createItem } from "../../actions/create.js";
import { SAVED_WRITE, restartRead } from "../../actions/write.js";
import { backdrop, button, cycleField, fieldFrame, fieldLabel, wireTextField } from "../helpers.js";
import { LIST_HINT, choiceBox, choiceHint, choiceKey, escapeList, listKey, listKeyboard, listShield } from "../choices.js";
import { NOTE_TONES, toneColor } from "../tones.js";

// The fields Tab walks, in order.
const CREATE_FIELDS = ["title", "type"];

export const CREATE_HINTS = {
  title: "↵ legt an · Tab wechselt das Feld",
  type: choiceHint("legt an"),
  list: LIST_HINT,
};

const typeName = (m, type) => (type.child ? `${type.name} (unter ${itemLabel(m.parent)})` : type.name);

const CREATE_CHOICES = {
  type: {
    entries: (m) => m.types.map((type, i) => ({ id: i, name: typeName(m, type) })),
    current: (m) => m.at,
    value: (m) => typeName(m, m.types[m.at]),
    take: (b, row) => (b.modal.at = row.id),
    placeholder: "Filter: Name des Typs",
    none: "Kein Typ passt zum Filter",
    width: 320,
    anchor: "top_left",
  },
};

// Where a new work item of the chosen type goes, as the dialog says it.
function whereText(m) {
  const meta = m.data.meta;
  const type = m.types[m.at];
  const place = type?.child ? `unter ${itemLabel(m.parent)} „${m.parent.title}“` : `in „${meta.level.name}“`;
  return `Neu ${place}; Bereich ${meta.area ?? "—"}, Iteration ${meta.iteration ?? "—"}, mir zugewiesen`;
}

export const createModal = {
  // Opens the dialog for the view's backlog, or says why a new work item
  // cannot be made there: no type, no default area or iteration.
  open(b, view, cx) {
    const data = b.state(view.id).data;
    if (!data) return;
    const parent = b.selected(view);
    const types = createTypes(data, parent);
    if (!types.length) return b.say(`„${data.meta.level.name}“ nennt keine Work-Item-Typen`, "warning", cx);
    if (!data.meta.area || !data.meta.iteration) {
      const missing = [!data.meta.area && "keinen Standardbereich", !data.meta.iteration && "keine Standard-Iteration"].filter(Boolean).join(" und ");
      return b.say(`Das Team hat ${missing}: in Azure unter Team-Einstellungen setzen`, "warning", cx);
    }
    const input = InputState.new({ placeholder: "Titel des neuen Work Items" });
    const m = { kind: "create", view, data, types, at: 0, parent, input, field: "title", list: null, error: null };
    wireTextField(b, m, input, "title", (_e, cx) => createModal.create(b, cx));
    b.modal = m;
    input.focus();
    cx.notify();
  },

  // Creates the work item and closes the dialog; without a title, while
  // another create of the view is under way, or while the view shows its
  // saved state (SAVED_WRITE), it stays and says so.
  create(b, cx) {
    const m = b.modal;
    if (m?.kind !== "create") return;
    const title = m.input.value().trim();
    const st = b.state(m.view.id);
    const busy = st.pending[CREATE_KEY];
    if (!title || busy || st.saved) {
      m.error = busy ? "Ein Work Item wird noch angelegt …" : st.saved ? SAVED_WRITE : "Der Titel fehlt";
      if (st.saved && !busy) restartRead(b, m.view, cx);
      return cx.notify();
    }
    b.closeModal(cx);
    createItem(b, m.view, { type: m.types[m.at], title, parent: m.parent }, cx);
  },

  keyboard: listKeyboard,
  escape: escapeList,

  // Tab and shift-Tab (`back`): the next or previous field.
  tab(b, back, cx) {
    b.modal.list = null;
    cycleField(b, CREATE_FIELDS, back, cx);
  },

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey).
  // Typing goes to the title.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.list) return listKey(b, e, cx);
    if (m.field === "title") return;
    cx.stop_propagation();
    if (k === "enter") return createModal.create(b, cx);
    choiceKey(b, CREATE_CHOICES, k, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    return backdrop(
      t,
      "create-backdrop",
      v_flex()
        .id("create-dialog")
        .w(560)
        .rounded(12)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(
          v_flex().px(20).py(16).gap(4).border_b(1).border_color(t.border)
            .child(div().text_size(15).font_semibold().child(`Neues Work Item · ${m.view.context.team}`))
            .child(div().text_size(12).text_color(t.muted).child(whereText(m))),
        )
        .child(
          v_flex().px(20).py(16).gap(14)
            .child(v_flex().gap(6).child(label("Typ")).child(choiceBox(b, t, CREATE_CHOICES, "type")))
            .child(v_flex().gap(6).child(label("Titel")).child(frame("title", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(m.error ?? ""))),
        )
        .child(
          h_flex().px(20).py(12).gap(8).items_center().border_t(1).border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.list ? CREATE_HINTS.list : CREATE_HINTS[m.field]))
            .child(button(t, "create-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx)))
            .child(button(t, "create-go", "Anlegen ↵", true, (cx) => createModal.create(b, cx))),
        ),
      listShield(b),
    );
  },
};
