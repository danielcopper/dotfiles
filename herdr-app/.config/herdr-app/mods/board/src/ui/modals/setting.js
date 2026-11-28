// The settings page's dialogs (ui/settings/). "setting": the edit of a
// knob in place, its fields drawn in the knob (openEdit). "settingChoice": a
// choice's list under its field (choices.js), which a pick, Esc or a press
// beside it closes, the dialog with it. "settingRepos": a PR tab's repos as
// the repo menu shows them, all the owner's but the archived ones
// (OWNER_REPOS_QUERY), with a filter as the command menu has one; Enter or a
// click turns the marked one on or off and the list stays until Esc.

import { rankByName } from "../../select.js";
import { LIST_HINT, listKey, listKeyboard, listShield } from "../choices.js";
import { cycleField, filterMenuHead, filterMenuKey, loadingLine, markedName, menu, menuNote, menuWindow, openFilterMenu, repoMenuRow } from "../helpers.js";
import { NOTE_TONES, toneColor } from "../tones.js";

export const settingModal = {
  ofSettingsPage: true,
  hint: (b) => [["Enter", "speichert"], ...(b.modal.fields.length > 1 ? [["Tab", "nächstes Feld"]] : []), ["Esc", "verwirft"]],
  tab(b, back, cx) {
    cycleField(b, b.modal.fields, back, cx);
  },
  key(b, e, cx) {
    if (e.key === "tab") b.tabKey(Boolean(e.modifiers?.shift), cx);
  },
  render: () => null,
};

export const settingChoiceModal = {
  ofSettingsPage: true,
  keyboard: listKeyboard,
  hint: LIST_HINT,
  key: (b, e, cx) => listKey(b, e, cx),
  render: (b) => listShield(b),
};

const shownRepos = (m) => rankByName(m.rows(), m.filter);

function toggleRepoRow(b, m, at, cx) {
  const repo = shownRepos(m)[at];
  if (!repo) return;
  m.at = at;
  m.toggle(b, repo.id, cx);
  cx.notify();
}

// Under the rows: the spinner while the repos are read, why they could not
// be, or that there are none, or none the filter lets through.
function repoListNote(t, m, shown) {
  const read = m.read();
  if (read.state === "loading") return [loadingLine(t).px(8)];
  if (read.state === "error") return [menuNote(t, read.error, toneColor(t, NOTE_TONES.error))];
  if (shown) return [];
  return [menuNote(t, m.filter && m.rows().length ? "Kein Repo passt zum Filter" : m.empty, t.muted)];
}

export const settingReposModal = {
  ofSettingsPage: true,
  // row, name: its knob's; rows(): [{ id (the repo), name, hidden }] as
  // they are now; read(): their read ({ state, error }); empty: what is said
  // without any; toggle(b, repo, cx) turns one.
  open(b, { row, name, rows, read, empty, toggle }, cx) {
    const m = { kind: "settingRepos", row, name, rows, read, empty, toggle };
    openFilterMenu(b, m, {
      placeholder: "Filter: Name des Repos",
      count: (m) => shownRepos(m).length,
      startAt: (m) => (shownRepos(m).length ? 0 : -1),
      pick: (i, cx) => toggleRepoRow(b, m, i, cx),
    }, cx);
  },

  key: (b, e, cx) => filterMenuKey(e, cx, b.modal, shownRepos(b.modal).length),

  render(b, t) {
    const m = b.modal;
    const repos = shownRepos(m);
    const { shown, ...win } = menuWindow(m, repos);
    return menu(t, {
      id: "setting-repos",
      rowId: "setting-repo",
      width: 380,
      title: "Repos zeigen",
      head: filterMenuHead(t, m),
      digits: false,
      rows: shown.map((r) => repoMenuRow(t, r, markedName(t, r.name, r.at))),
      ...win,
      pick: (i, cx) => toggleRepoRow(b, m, i, cx),
      foot: repoListNote(t, m, repos.length > 0),
    });
  },
};
