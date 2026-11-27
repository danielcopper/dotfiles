// The field „Repo:“ in the top bar of an Issues tab (Board.toolbar), its
// solo repo, and the list a click opens under it: „Alle“ and the repos of
// its solo switch (its shape's soloSwitch), each with how many of its
// issues show (soloCounts), the chosen one marked, as a dialog's choice list
// (ui/choices.js). Opened, the list is the dialog b.modal = { kind: "solo",
// view, field, list }; a pick shows that repo alone, or all for „Alle“
// (Board.setSoloRepo), and the list closes on a pick, Esc or a press beside
// it.

import { div } from "gpui-kit";
import { LIST_HINT, listKey, listKeyboard, listPopup, listShield, openList } from "../choices.js";
import { fieldBox, shownOf } from "../helpers.js";
import { soloCounts } from "../../kinds/issues.js";

// The field's name among choice fields: no dialog has one so named.
const SOLO_FIELD = "solo";
const SOLO_ANCHOR = "top_left";

// „Repo:“ and a name of about 20 letters (claude-matrix-bridge) at the
// board's 13 px; a longer one is cut, so the filter beside it stays where it
// is while V steps.
export const SOLO_W = 220;

function soloNow(b, view) {
  const st = b.state(view.id);
  return st.data ? b.shape(view).soloSwitch(b, st) : null;
}

function soloEntries(b, view) {
  const solo = soloNow(b, view);
  if (!solo) return [];
  const data = b.state(view.id).data;
  const count = soloCounts(data, (r) => b.visible(r, data));
  return solo.choices.map(({ id, label }) => {
    const { shown, held } = count(id);
    return { id, name: label, aside: [shownOf(shown, held)] };
  });
}

const soloChoices = (b) => ({
  [SOLO_FIELD]: {
    entries: (m) => soloEntries(b, m.view),
    current: (m) => soloNow(b, m.view)?.chosen ?? null,
    take: (b, row, cx) => b.setSoloRepo(b.modal.view, row.id, cx),
    closes: true,
    placeholder: "Filter: Name des Repos",
    none: "Kein Repo passt zum Filter",
    width: 360,
    anchor: SOLO_ANCHOR,
  },
});

export function soloField(b, t, view, solo) {
  const name = solo.choices.find((c) => c.id === solo.chosen).label;
  const field = fieldBox(t, b.modal ?? {}, SOLO_FIELD)
    .id("solo-repo")
    .flex_none()
    .w(SOLO_W)
    .h(32)
    .gap(6)
    .items_center()
    .cursor_pointer()
    .on_click((_e, cx) => {
      if (!b.modal) soloModal.open(b, view, cx);
    })
    .child(div().flex_none().text_color(t.dim).child("Repo:"))
    .child(div().flex_1().min_w(0).truncate().child(name))
    .child(div().flex_none().text_color(t.dim).child("▾"));
  return listPopup(b, t, SOLO_FIELD, SOLO_ANCHOR, field, b.modal?.view?.id === view.id);
}

export const soloModal = {
  open(b, view, cx) {
    b.modal = { kind: "solo", view, field: SOLO_FIELD, list: null };
    openList(b, soloChoices(b), SOLO_FIELD, cx);
  },

  needsData: true,
  hint: LIST_HINT,
  keyboard: listKeyboard,
  key: (b, e, cx) => listKey(b, e, cx),
  render: (b) => listShield(b),
};
