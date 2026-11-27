// The repo menu reads the repos from the view's data as they are now
// (its shape's repoSwitches), so a toggle shows at once.

import { div } from "gpui-kit";
import { foreignChip, menu, menuKey, shownOf } from "../helpers.js";

function menuRepos(b, m) {
  const data = b.state(m.view.id).data;
  return data ? b.shape(m.view).repoSwitches?.(b, data) ?? [] : [];
}

function toggleRepoAt(b, m, at, cx) {
  const repo = menuRepos(b, m)[at];
  if (!repo) return;
  m.at = at;
  b.toggleRepo(m.view, repo.repo, cx);
  cx.notify();
}

export const reposModal = {
  needsData: true,

  open(b, view, cx) {
    b.modal = { kind: "repos", view, at: 0 };
    cx.notify();
  },

  render(b, t) {
    const m = b.modal;
    return menu(t, {
      id: "repos",
      rowId: "repo",
      width: 380,
      title: "Repos zeigen",
      at: m.at,
      pick: (i, cx) => toggleRepoAt(b, m, i, cx),
      rows: menuRepos(b, m).map((r) => [
        div().w(14).text_color(t.foreground).child(r.hidden ? "" : "✓"),
        div().flex_1().min_w(0).truncate().text_color(r.hidden ? t.muted : t.foreground).child(r.name),
        ...(r.foreign ? [foreignChip(t)] : []),
        div().flex_none().text_size(11).text_color(t.dim).child(r.held === null ? "" : shownOf(r.shown, r.held)),
        div().w(80).flex_none().text_size(11).text_color(t.dim).child(r.hidden ? "ausgeblendet" : "gezeigt"),
      ]),
    });
  },

  key: (b, e, cx) => menuKey(e, cx, b.modal, menuRepos(b, b.modal).length, (i, cx) => toggleRepoAt(b, b.modal, i, cx)),
};
