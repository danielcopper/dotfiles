// The settings page's topic "Allgemein": refreshMinutes, the language, and
// the platforms' accounts.

import { isObject } from "../../shared.js";
import { LANGUAGES } from "../../config.js";
import { ORIGIN } from "../../settings.js";
import { baseAt, block, choiceField, choiceParts, knobRow, machineWas, mergedAt, mono12, muted, originOf, textEdit, title, write } from "./knobs.js";

const languageName = (id) => LANGUAGES.find((l) => l.id === id)?.name ?? id;

export const generalNote = (b) => `alle ${b.config.refreshMinutes} min · ${languageName(b.config.language)}`;

export function generalRows(b) {
  const c = b.config;
  const refresh = { id: "refreshMinutes", name: "Neu laden alle", key: "refreshMinutes", path: ["refreshMinutes"], value: () => `${c.refreshMinutes} min` };
  const base = baseAt(b, refresh.path);
  refresh.was = machineWas(b, refresh, base === undefined ? null : `${base} min`, "eine gezeigte Ansicht liest so oft neu, und eine, die man wieder zeigt, wenn ihr letztes Lesen länger her ist");
  refresh.enter = textEdit(refresh, refresh.path, { value: String(c.refreshMinutes), number: true, unit: "Minuten", width: 120 });
  if (originOf(b, refresh) === ORIGIN.machine) refresh.editWas = `gilt: ${c.refreshMinutes} min (${ORIGIN.machine}) · ${refresh.was}`;
  const language = { id: "language", name: "Sprache", key: "language", path: ["language"], was: "die Sprache des Boards: Tabs, Hinweise, Meldungen · Englisch folgt später" };
  Object.assign(language, choiceParts(language, {
    field: "setting-language",
    entries: () => LANGUAGES.map((l) => ({ id: l.id, name: l.name })),
    current: () => c.language,
    take: (b, row, cx) => row.id !== c.language && write(b, language.id, [[language.path, row.id]], cx),
    placeholder: "Filter: Sprache",
  }));
  language.value = (t) => choiceField(b, t, language, languageName(c.language), null, 200);
  const rows = block(title("ALLGEMEIN"), [knobRow(refresh), knobRow(language)]);
  const platforms = [];
  if (c.azure || isObject(b.configState.merged?.sources?.azure)) {
    const path = ["sources", "azure", "org"];
    const org = { id: "org", name: "Azure-Organisation", key: path.join("."), path, mono: true, value: (t, mono) => mono12(mono, String(mergedAt(b, path) ?? ""), t.foreground) };
    org.was = machineWas(b, org, baseAt(b, path) ?? null, "für alle Azure-Kontexte; ihre Projekte liest „Kontext hinzufügen“");
    org.enter = textEdit(org, path, { value: String(mergedAt(b, path) ?? ""), placeholder: "https://dev.azure.com/<Organisation>" });
    platforms.push(knobRow(org));
  }
  if (c.github) {
    const login = Object.values(b.views).map((st) => st.data?.viewer).find(Boolean) ?? null;
    platforms.push(knobRow({ id: "github", name: "GitHub", nav: false, origin: "", value: (t) => muted(t, login ? `das Konto, mit dem gh angemeldet ist: ${login}` : "das Konto, mit dem gh angemeldet ist; das Board hat es noch nicht gelesen") }));
  }
  if (platforms.length) rows.push(...block(title("PLATTFORMEN"), platforms));
  return rows;
}
