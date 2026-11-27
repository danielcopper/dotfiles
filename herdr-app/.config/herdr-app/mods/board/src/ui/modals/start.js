// The start dialog: opens an item's session in the folder of the repo
// chosen under "Repo" (the item's own preselected), on a machine and with an
// agent chosen here, as a new tab in a space of that machine or in a new
// space ("Öffnen in"), with a first message to edit.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, Textarea, TextareaState } from "gpui-base";
import { knownAgents, machines, notify, run, spaces } from "herdr";
import { BoardError, CONFIG_NAME, andJoined, boardLog, firstLine, itemLabel, lastLine, repoShortName, report } from "../../shared.js";
import { repoExceptions, startSettings } from "../../config.js";
import { pathText } from "../../settings.js";
import { call, what } from "../../tools.js";
import {
  NO_FOLDER, azureRepoKey, checkoutArgs, parseRepos, preselectedSpace, renderTemplate, reposArgs, reposOfKey, sameKeyGroups, sessionName, spacesOn, startCommand,
  templateVars, withExceptions,
} from "../../actions/start.js";
import { backdrop, button, cycleField, fieldBox, fieldFrame, fieldLabel, machineName, onMachine, store, wireTextField } from "../helpers.js";
import { LIST_HINT, choiceBox, choiceHint, choiceKey, escapeList, listKey, listKeyboard, listShield } from "../choices.js";
import { NOTE_TONES, toneColor } from "../tones.js";

const SH_TIMEOUT = 30000;
// How long watchSession waits before each check for a session it opened, in
// ms (1, 3 and 6 s after the start).
const SESSION_CHECKS = [1000, 2000, 3000];
const FIELDS = ["message", "repo", "agent", "machine", "open"];
const fieldsOf = (m) => (whereToOpen(m).newSpace ? [...FIELDS, "name"] : FIELDS);
const stillOpen = (b, m) => b.modal === m;
const MESSAGE_ROWS = 6;

// Not a text: a space's id, herdr's text, can never equal it.
export const NEW_SPACE = Symbol("new space");
export const NEW_SPACE_LABEL = "Neuer Space …";

// herdr's own Enter in the message is a line break; the later binding wins.
export const MESSAGE_KEY_CONTEXT = "BoardMessage";
export const START_ACTION = "board_start";
export const MESSAGE_KEYS = [{ keystroke: "enter", action: START_ACTION, context: `${MESSAGE_KEY_CONTEXT} > Input` }];

export const START_HINTS = {
  message: "↵ startet · ⇧↵ neue Zeile · PageUp/PageDown blättert · Tab wechselt das Feld",
  name: "↵ startet · Tab wechselt das Feld",
  choice: choiceHint("startet"),
  list: LIST_HINT,
};

const agentsPending = (m) => m.agentsError ?? "lädt …";

export const repoStoreKey = (view) => `repo:${view.id}`;
const reposLoading = (on, folders, list) => ({ state: "loading", on, folders, list, missing: [], unreadable: [], remotesUnread: [], gitMissing: false, lost: null, sameKey: null, error: null });
const repoId = (r) => `${r.key}\n${r.written}`;
const chosenRepo = (m) => m.repos.list.find((r) => repoId(r) === m.repoId) ?? null;

function reposPending(m) {
  const { state, error, list } = m.repos;
  if (state === "loading") return "lädt …";
  if (state === "error") return error;
  return list.length ? "Repo wählen" : "Kein Repo gefunden";
}
const openedIn = (where) => where.space ?? where.gone ?? where.unread;

const START_CHOICES = {
  repo: {
    entries: (m) => m.repos.list.map((r) => ({ id: repoId(r), name: r.key, aside: [r.written] })),
    current: (m) => m.repoId,
    value: (m) => chosenRepo(m)?.key ?? reposPending(m),
    valueAside: (m) => chosenRepo(m)?.written ?? null,
    take: (b, row) => {
      const m = b.modal;
      m.error = null;
      Object.assign(m.repos, { lost: null, sameKey: null });
      chooseRepo(m, m.repos.list.find((r) => repoId(r) === row.id));
    },
    notes: (m) => reposNotes(m),
    placeholder: "Filter: Name des Repos",
    none: "Kein Repo passt zum Filter",
    empty: reposPending,
    width: 360,
    anchor: "top_left",
  },
  agent: {
    entries: (m) => m.agents.map((a, i) => ({ id: i, name: a.name })),
    current: (m) => m.agent,
    value: (m) => m.agents[m.agent]?.name ?? agentsPending(m),
    take: (b, row) => (b.modal.agent = row.id),
    placeholder: "Filter: Name des Agents",
    none: "Kein Agent passt zum Filter",
    empty: agentsPending,
    width: 240,
    anchor: "top_left",
  },
  machine: {
    entries: (m) => m.machines.map((on, i) => ({ id: i, name: machineName(on) })),
    current: (m) => m.machine,
    value: (m) => machineName(m.machines[m.machine]),
    take: (b, row, cx) => chooseMachine(b, row.id, cx),
    placeholder: "Filter: Name des Rechners",
    none: "Kein Rechner passt zum Filter",
    width: 240,
    anchor: "top_left",
  },
  open: {
    entries: (m) => spaceRows(m),
    current: (m) => openedIn(whereToOpen(m))?.id ?? NEW_SPACE,
    value: (m) => openedIn(whereToOpen(m))?.name ?? NEW_SPACE_LABEL,
    take: (b, row) => chooseSpace(b.modal, row),
    fieldAfter: (row) => (row.id === NEW_SPACE ? "name" : "open"),
    notes: (m) => {
      const where = whereToOpen(m);
      return where.readable ? [] : [spacesNote(where)];
    },
    placeholder: "Filter: Name des Space",
    none: "Kein Space passt zum Filter",
    width: 360,
    anchor: "top_right",
  },
};

export function spacesNote({ on, layout }) {
  const why = layout === "loading" ? "noch nicht gelesen" : "nicht lesbar";
  return `Die Spaces ${onMachine(on)} sind ${why}; „${NEW_SPACE_LABEL}“ geht trotzdem`;
}

function reposNotes(m) {
  const { state, on, folders, list, missing, unreadable, remotesUnread, gitMissing, lost, sameKey } = m.repos;
  if (state !== "ready") return [];
  const notes = [
    ...missing.map((f) => `Den Repo-Ordner ${f} gibt es ${onMachine(on)} nicht`),
    ...unreadable.map((f) => `Der Repo-Ordner ${f} ist ${onMachine(on)} nicht lesbar`),
  ];
  if (gitMissing) notes.push(`git ist ${onMachine(on)} nicht installiert`);
  else if (remotesUnread.length) notes.push(`Die Remotes von ${andJoined(remotesUnread.map((u) => u.written))} sind ${onMachine(on)} nicht lesbar`);
  if (!folders.length) {
    notes.push(`Kein Repo-Ordner gesetzt: in ${CONFIG_NAME}.json oben „repoFolders“ eintragen, für alle Quellen, etwa "repoFolders": ["~/Repos"]`);
  } else if (!list.length) {
    notes.push(`In ${folders.join(", ")} liegt ${onMachine(on)} kein Git-Repo; die Ordner stehen unter „repoFolders“ in ${CONFIG_NAME}.json oder in den Einstellungen dieses Rechners`);
  }
  if (sameKey) notes.push(`„${sameKey[0].key}“ liegt ${onMachine(on)} in ${andJoined(sameKey.map((r) => r.written))}; bitte eines davon wählen`);
  if (lost) notes.push(`„${lost}“ liegt ${onMachine(on)} in keinem Repo-Ordner; bitte ein Repo wählen`);
  return notes;
}

export const startModal = {
  open(b, view, item, cx) {
    const settings = startSettings(b.config, view, item.repo);
    const input = TextareaState.new({ placeholder: "Erste Nachricht an den Agent" });
    input.set_auto_grow(1, MESSAGE_ROWS);
    const template = item.kind === "pr" ? settings.review : settings.message;
    input.set_value(renderTemplate(template, templateVars(item)));
    const listed = machines().filter((m) => m.layout !== "unavailable").map((m) => m.name);
    const list = listed.length ? listed : [null];
    let machine = list.indexOf(settings.machine ?? null);
    const machineNote = machine < 0 ? `Rechner „${settings.machine}“ ist nicht verbunden; gewählt: ${machineName(list[0])}` : null;
    if (machine < 0) machine = 0;
    const spaceName = item.repoShort ?? "";
    const nameInput = InputState.new({ placeholder: "Name des neuen Space" });
    nameInput.set_value(spaceName);
    const m = {
      kind: "start", view, item, settings, input, nameInput, field: "message", agents: [], agent: 0, agentsError: null, machineNote, agentNote: null,
      notes: [machineNote].filter(Boolean), machines: list, machine, spaceName, target: null, renamed: false, list: null, busy: null, error: null,
      repos: reposLoading(null, [], []), repo: null, repoId: null,
    };
    wireMessage(b, m, input);
    wireTextField(b, m, nameInput, "name", (_e, cx) => startModal.start(b, cx));
    nameInput.on("change", () => {
      m.target = NEW_SPACE;
      m.renamed = true;
    });
    b.modal = m;
    input.focus();
    loadAgents(b, cx);
    loadRepos(b, cx);
    cx.notify();
  },

  // Opens the item's session on the chosen machine, in the chosen repo's
  // folder there, then runs tab.new in the chosen space, where it is still
  // there, or space.new with the name given. run() answers nothing, so the
  // board says the session is being opened and watches for a new tab of its
  // name (watchSession). The dialog stays until run() opens the session; a
  // failure that comes after the dialog went shows in the banner and as a
  // toast.
  start(b, cx) {
    const m = b.modal;
    if (m?.kind !== "start") return;
    m.error = null;
    if (m.busy) return void cx.notify();
    const repo = chosenRepo(m);
    if (!repo) {
      m.error = m.repos.state === "loading" ? "Die Repos werden noch gelesen" : reposPending(m);
      m.field = "repo";
      b.takeKeyboard();
      return void cx.notify();
    }
    const agent = m.agents[m.agent];
    if (!agent) return void ((m.error = m.agentsError ?? "Kein Agent gewählt"), cx.notify());
    const { on, space, gone, unread, newSpace } = whereToOpen(m);
    if (gone || unread) return void cx.notify();
    const spaceName = m.nameInput.value().trim();
    if (newSpace && !spaceName) return void ((m.error = "Der neue Space braucht einen Namen"), cx.notify());
    const task = m.input.value().trim();
    const name = sessionName(m.item);
    m.busy = "Sitzung wird geöffnet …";
    const before = tabsNamed(name);
    cx.spawn(async (cx) => {
      try {
        const folder = repo.folder ?? (await ownFolder(b, m, repo, on));
        if (space && !spaces().some((s) => s.id === space.id)) {
          // Its dialog says so for a space chosen there (goneNote, unreadNote).
          if (m.target && stillOpen(b, m)) return;
          if (layoutOf(on) !== "ready") throw new BoardError(uncheckedNote(on, space));
          throw new BoardError(`Den Space „${space.name}“ ${onMachine(on)} gibt es nicht mehr`);
        }
        run(...startCommand({ on, folder, argv: agent.run, task, name, space: space?.id, spaceName }));
        if (!m.item.repo && m.item.kind !== "pr") store.set(repoStoreKey(m.view), repo.key);
        if (stillOpen(b, m)) {
          b.modal = null;
          b.handle.focus();
        }
        b.say(`Sitzung wird geöffnet: ${name}${on ? ` auf ${on}` : ""}`, "info", cx);
        watchSession(b, name, before, cx);
      } catch (e) {
        const why = report(e);
        if (stillOpen(b, m)) m.error = why;
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

  keys: MESSAGE_KEYS,
  keyboard: listKeyboard,
  escape: escapeList,

  tab(b, back, cx) {
    b.modal.list = null;
    cycleField(b, fieldsOf(b.modal), back, cx);
  },

  // Every key but Esc (the Board's): Tab walks the fields (Board.tabKey,
  // where Tab comes here at all rather than as the board's action).
  key(b, e, cx) {
    const m = b.modal;
    const k = e.key;
    if (k === "tab") return b.tabKey(Boolean(e.modifiers?.shift), cx);
    if (m.list) return listKey(b, e, cx);
    if (m.inputs[m.field]) return;
    cx.stop_propagation();
    if (k === "enter") return startModal.start(b, cx);
    choiceKey(b, START_CHOICES, k, cx);
  },

  render(b, t) {
    const m = b.modal;
    const label = (text) => fieldLabel(t, text);
    const frame = (field, inner) => fieldFrame(t, m, field, inner);
    const choice = (field, title) => v_flex().flex_1().min_w(0).gap(6).child(label(title)).child(choiceBox(b, t, START_CHOICES, field));
    const where = whereToOpen(m);
    const notes = [...m.notes, ...reposNotes(m), ...(where.readable ? [] : [spacesNote(where)]), ...(where.gone ? [goneNote(where)] : []), ...(where.unread ? [unreadNote(where)] : [])];
    const hint = m.list ? START_HINTS.list : START_HINTS[m.field] ?? START_HINTS.choice;
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
            .child(v_flex().gap(6).child(label("Repo")).child(choiceBox(b, t, START_CHOICES, "repo")))
            .child(
              h_flex()
                .gap(12)
                .child(choice("agent", "Agent"))
                .child(choice("machine", "Rechner"))
                .child(choice("open", "Öffnen in")),
            )
            .when(where.newSpace, (el) => el.child(
              v_flex()
                .gap(6)
                .child(label("Name des neuen Space"))
                .child(frame("name", Input.new(m.nameInput).flex_1().text_size(12).text_color(t.foreground))),
            ))
            .child(
              v_flex()
                .gap(6)
                .child(label("Erste Nachricht"))
                .child(
                  fieldBox(t, m, "message")
                    .id("start-message")
                    .py(8)
                    .items_start()
                    .key_context(MESSAGE_KEY_CONTEXT)
                    .on_action(START_ACTION, (_e, cx) => {
                      cx.stop_propagation();
                      startModal.start(b, cx);
                    })
                    .child(Textarea.new(m.input).flex_1().text_size(12).text_color(t.foreground)),
                ),
            )
            .children(notes.map((n) => div().text_size(12).text_color(toneColor(t, NOTE_TONES.warning)).child(n)))
            .when(Boolean(m.error), (el) => el.child(div().text_size(12).text_color(toneColor(t, NOTE_TONES.error)).child(m.error ?? ""))),
        )
        .child(
          h_flex()
            .px(20)
            .py(12)
            .gap(8)
            .items_center()
            .border_t(1)
            .border_color(t.border)
            .child(div().flex_1().text_size(12).text_color(t.muted).child(m.busy ?? hint))
            .child(button(t, "start-cancel", "Abbrechen Esc", false, (cx) => b.closeModal(cx), Boolean(m.busy)))
            .child(button(t, "start-go", "Starten ↵", true, (cx) => startModal.start(b, cx), Boolean(m.busy))),
        ),
      listShield(b),
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
      if (!stillOpen(b, m) || m.machines[m.machine] !== on) return;
      m.agents = agents;
      const wanted = m.settings.agent;
      m.agent = Math.max(0, agents.findIndex((a) => a.key === wanted));
      if (!agents.length) m.agentsError = "Kein Agent installiert";
      else if (wanted && !agents.some((a) => a.key === wanted)) {
        m.agentNote = `Agent „${wanted}“ ist ${onMachine(on)} nicht installiert; gewählt: ${agents[0].name}`;
      }
    } catch (e) {
      if (!stillOpen(b, m) || m.machines[m.machine] !== on) return;
      m.agentsError = `Agents ${onMachine(on)} nicht lesbar: ${firstLine(e?.message ?? e)}`;
    }
    m.notes = [m.machineNote, m.agentNote].filter(Boolean);
    cx.notify();
  });
}

function chooseMachine(b, machine, cx) {
  const m = b.modal;
  if (machine === m.machine) return;
  m.machine = machine;
  m.machineNote = null;
  m.target = m.target === NEW_SPACE && m.renamed ? NEW_SPACE : null;
  loadAgents(b, cx);
  loadRepos(b, cx);
}

async function shOutput(m, args, on, kind, said = () => null) {
  const r = await call("sh", args, on, SH_TIMEOUT, what(m.view, kind));
  if (r.code !== 0) throw new BoardError(said(r.code) ?? (firstLine(r.stderr) || `sh endete mit ${r.code}`));
  return r.stdout;
}

async function ownFolder(b, m, repo, on) {
  const gone = (code) => {
    if (code !== NO_FOLDER) return null;
    const path = ["repos", repo.key, "checkout"];
    return `Den Ordner ${repo.written} aus ${pathText(path)} (${b.origin(path)}) gibt es ${onMachine(on)} nicht; das Repo dort klonen oder den Ordner ändern`;
  };
  const folder = lastLine(await shOutput(m, checkoutArgs(repo.written), on, "checkout", gone));
  if (!folder) throw new BoardError("Checkout-Ordner nicht gelesen");
  return folder;
}

const NONE_FOUND = { repos: [], missing: [], unreadable: [], remotesUnread: [], gitMissing: false, withLineBreak: [] };

function loadRepos(b, cx) {
  const m = b.modal;
  const on = m.machines[m.machine];
  const folders = b.config.repoFolders;
  const exceptions = repoExceptions(b.config);
  const repos = reposLoading(on, folders, withExceptions([], exceptions));
  m.repos = repos;
  const own = wantedRepos(m, repos.list);
  if (own.length === 1) chooseRepo(m, own[0]);
  const listed = (found) => {
    const list = withExceptions(found.repos, exceptions);
    const onText = on ? ` on ${on}` : "";
    for (const group of sameKeyGroups(list)) boardLog.write(`board: repo ${group[0].key}${onText} in more than one folder: ${group.map((r) => r.written).join(", ")}`);
    if (found.remotesUnread.length) boardLog.write(`board: remotes not read${onText}: ${found.remotesUnread.map((u) => `${u.written} (git ${u.status})`).join(", ")}`);
    if (found.withLineBreak.length) boardLog.write(`board: repos left out${onText} for a line break in their path: ${found.withLineBreak.join(", ")}`);
    const wanted = m.repo ?? wantedRepo(m);
    const matches = wantedRepos(m, list);
    const sure = !found.remotesUnread.length && folders.length && list.length;
    Object.assign(repos, {
      state: "ready", list, missing: found.missing, unreadable: found.unreadable, remotesUnread: found.remotesUnread, gitMissing: found.gitMissing,
      sameKey: matches.length > 1 ? matches : null,
      lost: wanted && !matches.length && sure ? wanted : null,
    });
    if (matches.length === 1) chooseRepo(m, matches[0]);
  };
  if (!folders.length) return listed(NONE_FOUND);
  cx.spawn(async (cx) => {
    let found = null;
    let why = null;
    try {
      found = parseRepos(await shOutput(m, reposArgs(folders), on, "repos"), folders);
    } catch (e) {
      why = `Repos ${onMachine(on)} nicht lesbar: ${report(e)}`;
    }
    if (b.modal?.repos !== repos) return;
    if (found) listed(found);
    else Object.assign(repos, { state: "error", error: why });
    cx.notify();
  });
}

// The item's own repo; for an Azure pull request its repository's, once its
// details are read; else the one its view last started in, unless that
// names a folder (~ or / first), the key an older board kept.
function wantedRepo(m) {
  const { item } = m;
  if (item.repo) return item.repo;
  if (item.kind === "pr") return item.azureProject && item.azureRepo ? azureRepoKey(item.azureProject, item.azureRepo) : null;
  const remembered = store.get(repoStoreKey(m.view));
  return typeof remembered === "string" && !/^[~/]/.test(remembered) ? remembered : null;
}

function wantedRepos(m, list) {
  const matches = reposOfKey(list, m.repo ?? wantedRepo(m));
  const kept = matches.length > 1 ? matches.find((r) => repoId(r) === m.repoId) : null;
  return kept ? [kept] : matches;
}

function chooseRepo(m, repo) {
  m.repo = repo.key;
  m.repoId = repoId(repo);
  m.spaceName = repoShortName(repo.key);
  if (!m.renamed) m.nameInput.set_value(m.spaceName);
}

const layoutOf = (on) => machines().find((x) => (x.name ?? null) === (on ?? null))?.layout ?? (on ? "unavailable" : "ready");

// Without a choice preselectedSpace decides, but not while the dialog is on
// the new space's name: spaces herdr reads meanwhile must not take that
// field away.
function whereToOpen(m) {
  const on = m.machines[m.machine];
  const layout = layoutOf(on);
  const readable = layout === "ready";
  const here = readable ? spacesOn(spaces(), on) : [];
  const offer = { on, layout, readable, here };
  const chosen = m.target ?? (m.field === "name" ? NEW_SPACE : null);
  if (chosen === NEW_SPACE) return { ...offer, space: null, gone: null, unread: null, newSpace: true };
  const space = chosen ? here.find((s) => s.id === chosen.id) ?? null : preselectedSpace(here, m.spaceName);
  const missing = chosen && !space ? chosen : null;
  return { ...offer, space, gone: readable ? missing : null, unread: readable ? null : missing, newSpace: !space && !missing };
}

const goneNote = ({ on, gone }) => `Den Space „${gone.name}“ ${onMachine(on)} gibt es nicht mehr; bitte neu wählen`;
const unreadNote = ({ on, unread }) => `Den Space „${unread.name}“ ${onMachine(on)} kann das Board erst prüfen, wenn es die Spaces dort gelesen hat; warten oder neu wählen`;
const uncheckedNote = (on, space) => `Den Space „${space.name}“ ${onMachine(on)} konnte das Board nicht prüfen; die Spaces dort waren nicht gelesen`;

const spaceRows = (m) => [{ id: NEW_SPACE, name: NEW_SPACE_LABEL, aside: [] }, ...whereToOpen(m).here.map((s) => ({ id: s.id, name: s.name, aside: [s.folder] }))];

function chooseSpace(m, row) {
  m.target = row.id === NEW_SPACE ? NEW_SPACE : { id: row.id, name: row.name };
  m.error = null;
}

// A plain Enter gets to the message's submit only where the board's binding
// (MESSAGE_KEYS) is missing (dropped by a load of keys.json, or never
// bound), after herdr put a line break in place of each selection and told
// "change".
function wireMessage(b, m, input) {
  let before = input.value();
  let now = before;
  input.on("change", () => {
    before = now;
    now = input.value();
  });
  wireTextField(b, m, input, "message", (e, cx) => {
    if (e?.shift || e?.secondary) return;
    now = before;
    b.bindKeys(cx);
    const single = takeBackEnter(input, before);
    if (!single) {
      m.error = "Tasten neu gebunden – bitte Enter noch einmal";
      return cx.notify();
    }
    startModal.start(b, cx);
  });
}

// herdr's Enter leaves the active cursor after its own line break.
function takeBackEnter(input, before) {
  const text = input.value();
  const at = input.selected_range().start - 1;
  const end = before.length - (text.length - at - 1);
  const single = end >= at && text === `${before.slice(0, at)}\n${before.slice(end)}`;
  input.set_value(before);
  input.set_selected_range(single ? { start: at, end } : { start: before.length, end: before.length });
  return single;
}

const tabsNamed = (name) => new Set(spaces().flatMap((s) => s.tabs.filter((t) => t.name === name).map((t) => t.id)));

// `before`: the tabs of that name at Starten; a tab of the item left from
// before is not the session.
function watchSession(b, name, before, cx, at = 0) {
  cx.timer.after(SESSION_CHECKS[at], (cx) => {
    const there = spaces().some((s) => s.tabs.some((t) => t.name === name && !before.has(t.id)));
    if (there) return b.say(`Sitzung geöffnet: ${name}`, "success", cx);
    if (at + 1 < SESSION_CHECKS.length) return watchSession(b, name, before, cx, at + 1);
    b.say(`Kein Tab „${name}“ erschienen; die Sitzung ist wohl nicht gestartet`, "warning", cx);
    notify({ title: "Sitzung nicht erschienen", body: name, level: "warning" });
  });
}
