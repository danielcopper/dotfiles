// The settings page's topic of an Azure context: its teams and its PR tab.

import { isObject } from "../../shared.js";
import { TEAM_VIEWS, azureContextWhere, teamsProblems } from "../../config.js";
import { ORIGIN } from "../../settings.js";
import { LATER, block, knobRow, mergedAt, movedIn, muted, replacedAt, switchKnob, title, withoutAt, writeWholeList } from "./knobs.js";

// An organisation's name, the last part of its address (orgUrl).
export const orgName = (url) => String(url ?? "").split("/").pop();

export function azureRows(b, topic) {
  const context = topic.context;
  const project = context.name;
  const org = orgName(b.config.azure.org);
  const at = b.contexts().findIndex((c) => c.id === context.id) + 1;
  const path = ["sources", "azure", "contexts", project, "teams"];
  const listed = mergedAt(b, path);
  const where = azureContextWhere(b.configState.merged?.sources?.azure, project);
  const change = (b, id, edit, cx) => writeWholeList(b, id, path, (teams) => teamsProblems(teams, where), edit, cx);
  const placeIn = (list, team) => list.findIndex((r) => isObject(r) && r.team === team);
  const teams = context.tabs.filter((t) => t.kind === "team");
  const knobs = teams.map((tab, i) => {
    const place = Array.isArray(listed) ? placeIn(listed, tab.team) : -1;
    const knob = { id: `team-${tab.id}`, name: tab.team, d: i + 1, key: "views", path, top: true };
    const items = TEAM_VIEWS.map((v) => ({ name: v.name, on: tab.views.includes(v.id), id: v.id }));
    switchKnob(knob, items, { hint: "Ansicht", name: "Ansicht ein/aus" }, (b, s, cx) => change(b, knob.id, (list) => {
      const p = placeIn(list, tab.team);
      const views = TEAM_VIEWS.map((v) => v.id).filter((id) => (id === s.id ? !s.on : tab.views.includes(id)));
      return p < 0 ? null : replacedAt(list, p, { ...list[p], views });
    }, cx));
    knob.was = `Leertaste schaltet die Ansicht unter ← → · dieser Rechner setzt die Teams nur als ganze Liste: eine Änderung schreibt alle Teams von ${project}`;
    knob.remove = { name: "Team entfernen", run: (b, cx) => change(b, knob.id, (list) => (placeIn(list, tab.team) < 0 ? null : withoutAt(list, placeIn(list, tab.team))), cx) };
    knob.move = {
      can: (by) => place >= 0 && Boolean(movedIn(listed, place, by)),
      run: (b, by, cx) => change(b, knob.id, (list) => movedIn(list, placeIn(list, tab.team), by), cx),
    };
    return knobRow(knob);
  });
  const prs = context.tabs.find((t) => t.kind === "prs");
  return [
    { row: "head", path: `Azure · ${org} › ${project}`, title: project, small: `Azure-Projekt in ${org} · Kontext ${at} der Kopfzeile · Tabs: ${context.tabs.map((t) => t.name).join(", ")}` },
    ...block(title(`TEAMS · ${teams.length}, je ein Tab, in dieser Reihenfolge`, path.join(".")), knobs, { id: "add-team", text: `Team hinzufügen … (liest die Teams von ${project} aus Azure)`, run: null, later: LATER }),
    ...block(title("PR-TAB · der letzte Tab, kommt mit dem Projekt"), [
      knobRow({ id: "azure-prs-name", name: "Name", nav: false, origin: ORIGIN.builtin, value: () => prs?.name ?? "" }),
      knobRow({ id: "azure-prs-view", name: "Was er zeigt", nav: false, origin: "", value: (t) => muted(t, "PR-Ansicht folgt"), was: "Azures PR-Tabs lesen noch nichts; Abschnitte und Repos kommen hierher, sobald sie es tun" }),
    ]),
  ];
}
