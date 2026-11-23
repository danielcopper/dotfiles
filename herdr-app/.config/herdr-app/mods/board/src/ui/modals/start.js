// The start dialog: opens an item's session in its checkout, on a machine
// and with an agent chosen here, as a new space or tab, with a first message
// to edit. It is b.modal = { kind: "start", view, item, settings, input
// (the message's InputState, made for this dialog), field, textField (the
// field that is the input: "message"), inputFocused,
// agents, agent, agentsError, machines, machine, machineNote, agentNote,
// notes, open, busy, error }.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { knownAgents, machines, notify, run, spaces } from "herdr";
import { BoardError, CONFIG_NAME, firstLine, itemLabel, lastLine, report } from "../../shared.js";
import { startSettings } from "../../config.js";
import { call } from "../../tools.js";
import { checkoutArgs, renderTemplate, sessionName, spaceForTab, startCommand, templateVars } from "../../actions/start.js";
import { backdrop, button, cycleField, fieldFrame, fieldLabel, machineName, onMachine, wireTextField } from "../helpers.js";
import { toneColor } from "../tones.js";

const CHECKOUT_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
// The fields Tab walks, in order.
const FIELDS = ["message", "agent", "machine", "open"];

export const startModal = {
  // Opens the dialog for an item, or says where its checkout is missing. An
  // item without a repo (an Azure work item) takes only views.json's own
  // start: an Azure view has no start of its own.
  open(b, view, item, cx) {
    const settings = startSettings(b.config, view, item.repo);
    if (!settings.checkout) {
      if (!item.repo) return b.say(`Für ${itemLabel(item)} steht kein „checkout“ in ${CONFIG_NAME}.json: „start.checkout“`, "error", cx);
      const where = `„repos“ → „${item.repo}“ oder „start.checkout“ der Ansicht „${view.name}“`;
      return b.say(`Für ${item.repo} steht kein „checkout“ in ${CONFIG_NAME}.json: ${where}`, "error", cx);
    }
    const input = InputState.new({ placeholder: "Erste Nachricht an den Agent" });
    const template = item.kind === "pr" ? settings.review : settings.message;
    input.set_value(renderTemplate(template, templateVars(item)));
    const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name);
    const list = listed.length ? listed : [null];
    let machine = list.indexOf(settings.machine ?? null);
    const machineNote = machine < 0 ? `Rechner „${settings.machine}“ ist nicht verbunden; gewählt: ${machineName(list[0])}` : null;
    if (machine < 0) machine = 0;
    const m = {
      kind: "start", view, item, settings, input, field: "message", agents: [], agent: 0, agentsError: null, machineNote, agentNote: null,
      notes: [machineNote].filter(Boolean), machines: list, machine, open: settings.open === "tab" ? "tab" : "space", busy: null, error: null,
    };
    wireTextField(b, m, input, "message", (cx) => startModal.start(b, cx));
    b.modal = m;
    input.focus();
    loadAgents(b, cx);
    cx.notify();
  },

  // Opens the item's session in its checkout on the chosen machine: finds the
  // checkout's folder there, then runs space.new or tab.new. run() answers
  // nothing, so the board says the session is being opened and watches for a
  // space or tab of its name (watchSession). The dialog stays until the
  // folder is known or the start failed; a failure that comes after the
  // dialog went shows in the banner and as a toast.
  start(b, cx) {
    const m = b.modal;
    if (m?.kind !== "start" || m.busy) return;
    const agent = m.agents[m.agent];
    if (!agent) return void ((m.error = m.agentsError ?? "Kein Agent gewählt"), cx.notify());
    const on = m.machines[m.machine];
    const task = m.input.value().trim();
    const name = sessionName(m.item);
    m.busy = "Sitzung wird geöffnet …";
    m.error = null;
    cx.spawn(async (cx) => {
      try {
        const r = await call("sh", checkoutArgs(m.settings.checkout), on, CHECKOUT_TIMEOUT);
        if (r.code !== 0) throw new BoardError(firstLine(r.stderr) || `sh endete mit ${r.code}`);
        const folder = lastLine(r.stdout);
        if (!folder) throw new BoardError("Checkout-Ordner nicht gelesen");
        let space = null;
        if (m.open === "tab") {
          space = spaceForTab(spaces(), on, folder);
          if (!space) throw new BoardError(`Kein Space ${onMachine(on)} für einen neuen Tab; als neuer Space öffnen`);
        }
        run(...startCommand({ open: m.open, on, folder, argv: agent.run, task, name, space: space?.id }));
        if (b.modal === m) {
          b.modal = null;
          b.handle.focus();
        }
        b.say(`Sitzung wird geöffnet: ${name}${on ? ` auf ${on}` : ""}`, "info", cx);
        watchSession(b, name, cx);
      } catch (e) {
        const why = report(e);
        if (b.modal === m) m.error = why;
        else {
          b.say(`${itemLabel(m.item)}: Sitzung nicht geöffnet: ${why}`, "error", cx);
          notify({ title: `Sitzung für ${itemLabel(m.item)} nicht geöffnet`, body: why, level: "error" });
        }
      } finally {
        m.busy = null;
        cx.notify();
      }
    });
    cx.notify();
  },

  // Tab and shift-Tab (`back`): the next or previous field.
  tab: (b, back, cx) => cycleField(b, FIELDS, back, cx),

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey,
  // where Tab comes here at all rather than as the board's action); h/l or
  // the arrows change a choice, Enter starts. Typing goes to the message.
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.field === "message") return;
    cx.stop_propagation();
    if (k === "enter") return startModal.start(b, cx);
    if (k === "h" || k === "left") return cycle(b, m.field, -1, cx);
    if (k === "l" || k === "right" || k === "space") return cycle(b, m.field, 1, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    const choice = (field, title, value) =>
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(6)
        .child(label(title))
        .child(
          frame(field, h_flex().id(`choice-${field}`).flex_1().min_w(0).gap(6).cursor_pointer()
            .on_click((_e, cx) => {
              m.field = field;
              b.handle.focus();
              cycle(b, field, 1, cx);
            })
            .child(div().flex_1().min_w(0).truncate().child(value))
            .child(div().text_color(t.dim).child("◂ ▸"))),
        );
    const agent = m.agents[m.agent];
    return backdrop(
      t,
      "start-backdrop",
      v_flex()
        .id("start-dialog")
        .w(600)
        .rounded(12)
        .border_1()
        .border_color(t.input)
        .bg(t.popover)
        .shadow_lg()
        .child(
          v_flex()
            .px(20)
            .py(16)
            .gap(4)
            .border_b(1)
            .border_color(t.border)
            .child(div().text_size(15).font_semibold().child(`${m.item.kind === "pr" ? "Review starten" : "Agent starten"} · ${itemLabel(m.item)}`))
            .child(div().text_size(12).text_color(t.muted).truncate().child(m.item.title)),
        )
        .child(
          v_flex()
            .px(20)
            .py(16)
            .gap(14)
            .child(label(`Neue Sitzung im Checkout ${m.settings.checkout}`))
            .child(
              h_flex()
                .gap(12)
                .child(choice("agent", "Agent", agent ? agent.name : m.agentsError ?? "lädt …"))
                .child(choice("machine", "Rechner", machineName(m.machines[m.machine])))
                .child(choice("open", "Öffnen als", m.open === "tab" ? "neuer Tab" : "neuer Space")),
            )
            .child(
              v_flex()
                .gap(6)
                .child(label("Erste Nachricht"))
                .child(frame("message", Input.new(m.input).flex_1().text_size(12).text_color(t.foreground))),
            )
            .children(m.notes.map((n) => div().text_size(12).text_color(toneColor(t, "ansi3")).child(n)))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, "ansi1")).child(m.error ?? ""))),
        )
        .child(
          h_flex()
            .px(20)
            .py(12)
            .gap(8)
            .items_center()
            .border_t(1)
            .border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.busy ?? "Tab wechselt das Feld · ◂ ▸ wählt"))
            .child(button(t, "start-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx), Boolean(m.busy)))
            .child(button(t, "start-go", "Starten ↵", true, (cx) => startModal.start(b, cx), Boolean(m.busy))),
        ),
    );
  },
};

function loadAgents(b, cx) {
  const m = b.modal;
  const on = m.machines[m.machine];
  m.agents = [];
  m.agentsError = null;
  m.agentNote = null;
  cx.spawn(async (cx) => {
    try {
      const agents = (await knownAgents({ on })).filter((a) => a.installed);
      if (b.modal !== m || m.machines[m.machine] !== on) return;
      m.agents = agents;
      const wanted = m.settings.agent;
      m.agent = Math.max(0, agents.findIndex((a) => a.key === wanted));
      if (!agents.length) m.agentsError = "Kein Agent installiert";
      else if (wanted && !agents.some((a) => a.key === wanted)) {
        m.agentNote = `Agent „${wanted}“ ist ${onMachine(on)} nicht installiert; gewählt: ${agents[0].name}`;
      }
    } catch (e) {
      if (b.modal !== m || m.machines[m.machine] !== on) return;
      m.agentsError = `Agents ${onMachine(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
    }
    m.notes = [m.machineNote, m.agentNote].filter(Boolean);
    cx.notify();
  });
}

function cycle(b, field, by, cx) {
  const m = b.modal;
  if (m.busy) return;
  if (field === "agent" && m.agents.length) m.agent = (m.agent + by + m.agents.length) % m.agents.length;
  if (field === "machine") {
    m.machine = (m.machine + by + m.machines.length) % m.machines.length;
    m.machineNote = null;
    loadAgents(b, cx);
  }
  if (field === "open") m.open = m.open === "space" ? "tab" : "space";
  cx.notify();
}

// Looks for a space or tab named `name` after each wait in SESSION_CHECKS;
// says so when it appears, warns when it has not after the last.
function watchSession(b, name, cx, at = 0) {
  cx.timer.after(SESSION_CHECKS[at], (cx) => {
    const there = spaces().some((s) => s.name === name || s.tabs.some((t) => t.name === name));
    if (there) return b.say(`Sitzung geöffnet: ${name}`, "success", cx);
    if (at + 1 < SESSION_CHECKS.length) return watchSession(b, name, cx, at + 1);
    b.say(`Kein Space und kein Tab „${name}“ erschienen; die Sitzung ist wohl nicht gestartet`, "warning", cx);
    notify({ title: "Sitzung nicht erschienen", body: name, level: "warning" });
  });
}
