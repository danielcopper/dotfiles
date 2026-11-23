// The create dialog: a new work item on a team's backlog, its type (the
// level's types, its default first; with an item of the level selected also
// the types of the level below, as that item's children) and its title.
// The backlog shape opens it (n) as b.modal = { kind: "create", view,
// types, at (the chosen type), parent (the selected item, or null), input
// (the title's InputState, made for this dialog), field ("title" or
// "type"), textField ("title"), inputFocused, error }. Enter or Anlegen
// creates (actions/create.js): the dialog closes and the notice says how it
// goes.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { itemLabel } from "../../shared.js";
import { createTypes } from "../../kinds/backlog.js";
import { CREATE_KEY, createItem } from "../../actions/create.js";
import { backdrop, button, cycleField, fieldFrame, fieldLabel, wireTextField } from "../helpers.js";
import { toneColor } from "../tones.js";

// The fields Tab walks, in order.
const CREATE_FIELDS = ["title", "type"];

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
    const m = { kind: "create", view, data, types, at: 0, parent, input, field: "title", error: null };
    wireTextField(b, m, input, "title", (cx) => createModal.create(b, cx));
    b.modal = m;
    input.focus();
    cx.notify();
  },

  // Creates the work item and closes the dialog; without a title, or while
  // another create of the view is under way, it stays and says so.
  create(b, cx) {
    const m = b.modal;
    if (m?.kind !== "create") return;
    const title = m.input.value().trim();
    const busy = b.state(m.view.id).pending[CREATE_KEY];
    if (!title || busy) {
      m.error = busy ? "Ein Work Item wird noch angelegt …" : "Der Titel fehlt";
      return cx.notify();
    }
    b.closeModal(cx);
    createItem(b, m.view, { type: m.types[m.at], title, parent: m.parent }, cx);
  },

  // Tab and shift-Tab (`back`): the next or previous field.
  tab: (b, back, cx) => cycleField(b, CREATE_FIELDS, back, cx),

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey);
  // on the type h/l or the arrows change it, Enter creates. Typing goes to
  // the title.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.field === "title") return;
    cx.stop_propagation();
    if (k === "enter") return createModal.create(b, cx);
    const by = { h: -1, left: -1, k: -1, up: -1, l: 1, right: 1, j: 1, down: 1, space: 1 }[k];
    if (by) cycleType(m, by, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    const type = m.types[m.at];
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
            .child(v_flex().gap(6).child(label("Typ")).child(
              frame("type", h_flex().id("create-type").flex_1().min_w(0).gap(6).cursor_pointer()
                .on_click((_e, cx) => {
                  m.field = "type";
                  b.handle.focus();
                  cycleType(m, 1, cx);
                })
                .child(div().flex_1().min_w(0).truncate().child(type.child ? `${type.name} (unter ${itemLabel(m.parent)})` : type.name))
                .child(div().text_color(t.dim).child("◂ ▸"))),
            ))
            .child(v_flex().gap(6).child(label("Titel")).child(frame("title", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, "ansi1")).child(m.error ?? ""))),
        )
        .child(
          h_flex().px(20).py(12).gap(8).items_center().border_t(1).border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child("Tab wechselt das Feld · ◂ ▸ wählt den Typ"))
            .child(button(t, "create-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx)))
            .child(button(t, "create-go", "Anlegen ↵", true, (cx) => createModal.create(b, cx))),
        ),
    );
  },
};

function cycleType(m, by, cx) {
  m.at = (m.at + by + m.types.length) % m.types.length;
  cx.notify();
}
