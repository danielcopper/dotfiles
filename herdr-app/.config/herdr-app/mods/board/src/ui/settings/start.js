// The settings page's topic "Start": what the start dialog proposes.

import { machines } from "herdr";
import { itemLabel } from "../../shared.js";
import { renderTemplate, templateVars } from "../../actions/start.js";
import { agentsUnreadable, installedAgents, machineName } from "../helpers.js";
import { block, choiceField, choiceParts, knobRow, line, mono12, muted, settingsOf, textEdit, title, write } from "./knobs.js";

export const startNote = (b) => [b.config.start.agent ?? "erster Agent", b.config.start.message || "ohne erste Nachricht"].join(" · ");

export function readAgents(b, cx) {
  const agents = { state: "loading", list: [], error: null };
  settingsOf(b).agents = agents;
  cx.spawn(async (cx) => {
    try {
      Object.assign(agents, { state: "ready", list: await installedAgents(null) });
    } catch (e) {
      Object.assign(agents, { state: "error", error: agentsUnreadable(null, e) });
    }
    cx.notify();
  });
}

// The first item of the views read so far that is a pull request (`pr`)
// or not, with a number: the example a start message is rendered for.
function exampleItem(b, pr) {
  for (const view of b.viewsNow()) {
    const st = b.views[view.id];
    if (!st?.data) continue;
    const item = (b.shape(view).items?.(st.data) ?? []).find((i) => (i.kind === "pr") === pr && Number.isInteger(i.number));
    if (item) return item;
  }
  return null;
}

export function startRows(b) {
  const start = b.config.start;
  const agents = settingsOf(b).agents ?? { state: "loading", list: [], error: null };
  const agent = { id: "agent", name: "Agent", key: "agent", path: ["start", "agent"] };
  Object.assign(agent, choiceParts(agent, {
    field: "setting-agent",
    entries: () => agents.list.map((a) => ({ id: a.key, name: a.key, aside: [a.name] })),
    current: () => start.agent ?? null,
    take: (b, row, cx) => row.id !== start.agent && write(b, agent.id, [[agent.path, row.id]], cx),
    placeholder: "Filter: Name des Agents",
    loading: () => agents.state === "loading",
    empty: () => agents.error ?? "Kein Agent installiert",
  }));
  const named = agents.list.find((a) => a.key === start.agent)?.name ?? null;
  agent.value = (t) => choiceField(b, t, agent, start.agent ?? "der erste installierte", named);
  agent.warn = agents.state === "error" ? [agents.error] : start.agent && agents.state === "ready" && !named ? [`Agent „${start.agent}“ ist auf diesem Rechner nicht installiert`] : [];
  agent.loading = agents.state === "loading";
  const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name ?? null);
  const machine = { id: "machine", name: "Rechner", key: "machine", path: ["start", "machine"] };
  Object.assign(machine, choiceParts(machine, {
    field: "setting-machine",
    entries: () => (listed.includes(null) ? listed : [null, ...listed]).map((on) => ({ id: on, name: machineName(on) })),
    current: () => start.machine ?? null,
    take: (b, row, cx) => row.id !== (start.machine ?? null) && write(b, machine.id, [[machine.path, row.id]], cx),
    placeholder: "Filter: Name des Rechners",
  }));
  machine.value = (t) => choiceField(b, t, machine, machineName(start.machine ?? null));
  const message = (id, name, pr, what) => {
    const path = ["start", id];
    const knob = { id, name, key: id, path, mono: true, value: (t, mono) => (start[id] ? mono12(mono, start[id], t.foreground) : muted(t, "keine")) };
    const item = exampleItem(b, pr);
    knob.was = item ? `${what} · ${itemLabel(item)} → ${renderTemplate(start[id], templateVars(item))}` : what;
    knob.enter = textEdit(knob, path, { value: start[id] ?? "" });
    return knobRow(knob);
  };
  const vars = Object.keys(templateVars({ title: "" })).map((v) => `{${v}}`).join(" ");
  return block(title("START", "start"), [
    knobRow(agent), knobRow(machine),
    message("message", "Erste Nachricht", false, "für Issues und Work Items"),
    message("review", "Review-Nachricht", true, "für Pull Requests"),
    line(`Platzhalter: ${vars}`),
  ]);
}
