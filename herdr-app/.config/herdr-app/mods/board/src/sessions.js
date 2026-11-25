// Nothing here reads a file in a draw: Claude Code's files are read off it
// (readClaudeSessions), and a draw builds one index (sessionIndex) that
// each card looks itself up in.

import { firstLine, isObject, itemKey, jsonOrNull } from "./shared.js";

export const AGENT_STATUS = { working: "arbeitet", blocked: "wartet auf dich", done: "fertig", idle: "bereit" };
const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const urgencyOf = (status) => URGENCY[status] ?? 4;

const isDigit = (c) => c >= 48 && c <= 57;
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
// What GitHub allows in a repo's name.
const isNameChar = (c) => isDigit(c) || isLetter(c) || c === 45 || c === 46 || c === 95;

// No RegExp: this runs for each name at every draw.
export function references(text) {
  const s = String(text ?? "");
  const keys = [];
  const bare = [];
  for (let at = s.indexOf("#"), bang = s.indexOf("!"); at >= 0 || bang >= 0; ) {
    const i = at < 0 ? bang : bang < 0 ? at : Math.min(at, bang);
    let end = i + 1;
    while (end < s.length && isDigit(s.charCodeAt(end))) end++;
    const next = end < s.length ? s.charCodeAt(end) : 0;
    let start = i;
    while (start > 0 && isNameChar(s.charCodeAt(start - 1))) start--;
    if (end > i + 1 && !isLetter(next) && !isDigit(next) && next !== 95) {
      const number = s.slice(i + 1, end);
      if (s[i] === "!") {
        if (start === i) keys.push(`!${number}`);
      } else if (start === i) bare.push(number);
      else keys.push(`${s.slice(start, i).toLowerCase()}#${number}`);
    }
    if (i === at) at = s.indexOf("#", i + 1);
    else bang = s.indexOf("!", i + 1);
  }
  return { keys, bare };
}

export function branchNumbers(branch) {
  const parts = String(branch ?? "").split("/");
  const numbers = [];
  parts.forEach((part, i) => {
    let end = 0;
    while (end < part.length && isDigit(part.charCodeAt(end))) end++;
    if (end > 0 && (part[end] === "-" || (end === part.length && i === parts.length - 1))) numbers.push(part.slice(0, end));
  });
  return numbers;
}

// The worktree a folder is in, below `<repo>.worktrees/`: its first two
// parts there (`feat/3000-x`, the way the worktrees are laid out), or null.
export function worktreeOf(folder) {
  const parts = String(folder ?? "").split("/");
  const at = parts.findIndex((p) => p.endsWith(".worktrees") && p.length > ".worktrees".length);
  if (at < 0 || at === parts.length - 1) return null;
  return parts.slice(at + 1, at + 3).filter(Boolean).join("/") || null;
}

export function inRepo(folder, repo) {
  const name = String(repo ?? "").toLowerCase();
  if (!name || !folder) return false;
  return String(folder).toLowerCase().split("/").some((p) => p === name || p === `${name}.worktrees`);
}

// ---- Claude Code's sessions on this machine ----

// A record's mark in the scripts' output: no JSON text holds it unescaped.
const RS = "\x1e";

// Never reads the `.key` files beside the sessions' `<pid>.json`. Where
// ps runs, a file whose pid now runs another program than Claude Code is
// one of a session that ended, named by `RS O`. Claude Code's comm:
// `claude`, npm's `bin/claude.exe` (its copy of the native binary)
// started by that path, its version (the native install's `versions/<v>`,
// likewise), or node's (`node`, or `MainThread` as node 24.16 calls its
// main thread) with Claude Code in its arguments: an npm install from
// before the native binary, which names itself `claude` unless
// CLAUDE_CODE_DISABLE_TERMINAL_TITLE is set. herdr cuts a program's
// output at 8 MiB without a sign: only the end record `RS Z` tells the
// output came whole.
export const CLAUDE_SESSIONS_SCRIPT = [
  'dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sessions"',
  "end() { printf '\\036Z\\n'; exit 0; }",
  "other() { printf '\\036O\\t%s\\t%s\\n' \"$pid\" \"$(printf %s \"$comm\" | tr -d '\\036\\t\\n')\"; }",
  '[ -d "$dir" ] || end',
  "if list=$(ps -A -o pid= -o ppid= 2>/dev/null); then ps=1; else ps=; fi",
  "if [ -r \"$dir\" ] && [ -x \"$dir\" ]; then",
  '  for f in "$dir"/*.json; do',
  '    [ -e "$f" ] || continue',
  '    pid=${f##*/}; pid=${pid%.json}',
  '    case $pid in ""|*[!0-9]*) printf \'\\036N\\t%s\\n\' "$pid"; continue ;; esac',
  '    kill -0 "$pid" 2>/dev/null || continue',
  '    if [ -n "$ps" ]; then',
  '      comm=$(ps -o comm= -p "$pid" 2>/dev/null) || continue',
  '      comm=${comm##*/}',
  '      case $comm in',
  '        claude|claude.exe|[0-9]*.[0-9]*.[0-9]*) ;;',
  '        node|MainThread) case $(ps -o args= -p "$pid" 2>/dev/null) in',
  '            */claude|*/claude\\ *|*@anthropic-ai/claude-code*) ;;',
  '            *) other; continue ;;',
  '          esac ;;',
  '        *) other; continue ;;',
  '      esac',
  '    fi',
  '    if text=$(cat "$f" 2>/dev/null); then printf \'\\036S\\t%s\\n%s\\n\' "$pid" "$text"; else printf \'\\036U\\t%s\\n\' "$pid"; fi',
  "  done",
  "else printf '\\036D\\n'; fi",
  "if [ -n \"$ps\" ]; then printf '\\036P\\n%s\\n' \"$list\"; else printf '\\036X\\n'; fi",
  "end",
].join("\n");

export const claudeSessionsArgs = () => ["-c", CLAUDE_SESSIONS_SCRIPT, "board-claude"];

export const CLAUDE_TASKS_SCRIPT = [
  'base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/tasks"',
  'for id in "$@"; do',
  '  dir="$base/session-$id"',
  '  [ -d "$dir" ] || continue',
  '  if [ ! -r "$dir" ] || [ ! -x "$dir" ]; then printf \'\\036E\\t%s\\n\' "$id"; continue; fi',
  '  for f in "$dir"/*.json; do',
  '    [ -e "$f" ] || continue',
  '    n=${f##*/}; n=${n%.json}',
  '    if text=$(cat "$f" 2>/dev/null); then printf \'\\036T\\t%s\\t%s\\n%s\\n\' "$id" "$n" "$text"; else printf \'\\036V\\t%s\\t%s\\n\' "$id" "$n"; fi',
  "  done",
  "done",
  "printf '\\036Z\\n'",
].join("\n");

export const claudeTasksArgs = (lists) => ["-c", CLAUDE_TASKS_SCRIPT, "board-claude-tasks", ...lists];

// An output without its end record was cut: its last record may be cut
// too, so it goes with the rest, and `cut` says so in `notes`.
function records(stdout, notes, cut) {
  const all = String(stdout ?? "")
    .split(RS)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      const [kind, ...fields] = (nl < 0 ? chunk : chunk.slice(0, nl)).split("\t");
      return { kind, fields, text: nl < 0 ? "" : chunk.slice(nl + 1) };
    });
  if (all.at(-1)?.kind === "Z") return all.slice(0, -1);
  notes.push(cut);
  return all.slice(0, -1);
}

const optionalText = (v) => v === undefined || v === null || typeof v === "string";

// A task list's folder: `session-` and the first eight characters of the
// session's id.
export const taskList = (sessionId) => sessionId.slice(0, 8);

// The states Claude Code writes into a session's file (its own reader of
// them takes these four, 2.1.332), as herdr's agent status: `shell` is a
// turn that ended with a shell still running in the background, `waiting`
// a question to the person (a permission, a dialog).
const CLAUDE_STATUS = { busy: "working", shell: "working", waiting: "blocked", idle: "idle" };

export function parseClaudeSessions(stdout) {
  const sessions = [];
  const notes = [];
  let parents = null;
  for (const r of records(stdout, notes, "Claude: Ausgabe abgeschnitten, Rest übersprungen")) {
    const file = `sessions/${r.fields[0]}.json`;
    if (r.kind === "D") notes.push("Claude: Ordner sessions nicht lesbar, Sitzungen übersprungen");
    else if (r.kind === "U") notes.push(`Claude: ${file} nicht lesbar, übersprungen`);
    else if (r.kind === "N") notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
    else if (r.kind === "X") notes.push("Claude: Prozessliste (ps) nicht gelesen, Sitzungen ohne Prüfung ihres Programms übernommen und nur über ihren eigenen Prozess oder den Ordner zugeordnet");
    else if (r.kind === "O") notes.push(`Claude: ${file} gehört zu Prozess „${String(r.fields[1] ?? "").slice(0, 40)}“, übersprungen`);
    else if (r.kind === "P") {
      parents = new Map();
      for (const line of r.text.split("\n")) {
        const [pid, ppid] = line.trim().split(/\s+/).map(Number);
        if (Number.isInteger(pid) && Number.isInteger(ppid)) parents.set(pid, ppid);
      }
    } else if (r.kind === "S") {
      const s = jsonOrNull(r.text);
      const shaped = isObject(s) && s.pid === Number(r.fields[0]) && typeof s.sessionId === "string" && s.sessionId.length >= 8
        && typeof s.cwd === "string" && optionalText(s.name) && optionalText(s.status);
      if (!shaped) {
        notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
        continue;
      }
      const known = s.status === undefined || s.status === null || Object.hasOwn(CLAUDE_STATUS, s.status);
      if (!known) notes.push(`Claude: ${file} mit unbekanntem Status „${s.status.slice(0, 40)}“, Status übergangen`);
      sessions.push({ pid: s.pid, sessionId: s.sessionId, cwd: s.cwd, name: s.name ?? null, status: known ? s.status ?? null : null });
    }
  }
  return { sessions, parents, notes };
}

const TASK_STATES = ["pending", "in_progress", "completed"];

// Claude Code sets a task's id, subject and status; its description may be
// missing.
export function parseClaudeTasks(stdout) {
  const tasks = new Map();
  const notes = [];
  for (const r of records(stdout, notes, "Claude: Ausgabe der Aufgaben abgeschnitten, Rest übersprungen")) {
    const [list, n] = r.fields;
    const file = `tasks/session-${list}/${n}.json`;
    if (r.kind === "E") notes.push(`Claude: Ordner tasks/session-${list} nicht lesbar, Aufgaben übersprungen`);
    else if (r.kind === "V") notes.push(`Claude: ${file} nicht lesbar, übersprungen`);
    else if (r.kind === "T") {
      const t = jsonOrNull(r.text);
      const shaped = isObject(t) && typeof t.id === "string" && typeof t.subject === "string" && TASK_STATES.includes(t.status) && optionalText(t.description);
      if (!shaped) notes.push(`Claude: ${file} in unerwarteter Form, übersprungen`);
      else {
        if (!tasks.has(list)) tasks.set(list, []);
        tasks.get(list).push({ id: t.id, subject: t.subject, description: t.description ?? "", status: t.status });
      }
    }
  }
  return { tasks, notes };
}

export function claudeSnapshot(read, tasks) {
  const sessions = read.sessions.map((s) => {
    const chain = [s.pid];
    for (let p = read.parents?.get(s.pid); p > 1 && chain.length < 64 && !chain.includes(p); p = read.parents.get(p)) chain.push(p);
    const open = (tasks?.tasks.get(taskList(s.sessionId)) ?? []).filter((t) => t.status !== "completed");
    return {
      pid: s.pid, cwd: s.cwd, name: s.name, agentStatus: CLAUDE_STATUS[s.status] ?? null, chain,
      refs: references(s.name), tasks: open.map((t) => ({ subject: t.subject, refs: references(`${t.subject}\n${t.description}`) })),
    };
  });
  return { sessions, notes: [...read.notes, ...(tasks?.notes ?? [])] };
}

// `run(args, kind)` runs sh with `args` and resolves to its result (the
// Board's: tools.js call, which logs it and words a failure to start).
export async function readClaudeSessions(run) {
  const failed = (r) => (r.code === 0 ? null : `sh endete mit ${r.code}${r.stderr ? `: ${firstLine(r.stderr)}` : ""}`);
  try {
    const listed = await run(claudeSessionsArgs(), "claude-sessions");
    if (failed(listed)) throw new Error(failed(listed));
    const read = parseClaudeSessions(listed.stdout);
    let tasks = null;
    if (read.sessions.length) {
      try {
        const r = await run(claudeTasksArgs(read.sessions.map((s) => taskList(s.sessionId))), "claude-tasks");
        if (failed(r)) throw new Error(failed(r));
        tasks = parseClaudeTasks(r.stdout);
      } catch (e) {
        tasks = { tasks: new Map(), notes: [`Claude-Aufgaben nicht gelesen: ${firstLine(e?.message ?? e)}`] };
      }
    }
    return claudeSnapshot(read, tasks);
  } catch (e) {
    return { sessions: [], notes: [`Claude-Sitzungen nicht gelesen: ${firstLine(e?.message ?? e)}`] };
  }
}

// ---- the index ----

// What herdr gives a pane whose agent reports itself as Claude Code.
const CLAUDE_APP = "claude-code";

// An entry's or hit's place: { space, tab, pane } (tab and pane null where
// it names none), or { claude: pid } for a Claude session in no terminal.
// claudePid: the pid of the Claude session an entry holds, wherever that
// is (null for none); a Claude hit carries its own.
export const placed = (s) => s.place.claude === undefined;
export const placeKey = (s) => (placed(s) ? s.place.pane ?? s.place.tab ?? s.place.space : `claude:${s.place.claude}`);

const add = (map, key, hit) => {
  const list = map.get(key);
  if (list) list.push(hit);
  else map.set(key, [hit]);
};

export function sessionIndex({ spaces = [], panes = [], terminals = [], claude = null } = {}) {
  const index = { byKey: new Map(), byBare: new Map(), byNumber: new Map(), byBranch: new Map(), places: new Map(), cache: new Map(), notes: claude?.notes ?? [] };
  const spaceOfTab = new Map();
  const named = (text, hit, folder) => {
    const { keys, bare } = references(text);
    for (const k of keys) add(index.byKey, k, hit);
    for (const n of bare) add(index.byBare, n, { ...hit, folder });
  };
  const branched = (branch, hit, folder) => {
    if (!branch) return;
    add(index.byBranch, branch, { ...hit, folder });
    for (const n of branchNumbers(branch)) add(index.byNumber, n, { ...hit, why: `Branch ${branch}`, folder });
  };
  for (const s of spaces) {
    index.places.set(s.id, { label: s.name, placeStatus: s.status ?? null });
    const place = { space: s.id, tab: null, pane: null };
    named(s.name, { sure: true, why: "Space-Name", place }, s.folder);
    branched(s.branch, { sure: true, why: "", place }, s.folder);
    for (const t of s.tabs ?? []) {
      spaceOfTab.set(t.id, s.id);
      index.places.set(t.id, { label: t.name, placeStatus: t.status ?? null });
      named(t.name, { sure: true, why: "Tab-Name", place: { space: s.id, tab: t.id, pane: null } }, s.folder);
    }
  }
  const paneOfTerminal = new Map();
  const panesIn = new Map();
  for (const p of panes) {
    const space = spaceOfTab.get(p.tab);
    if (!p.terminal || !space) continue;
    paneOfTerminal.set(p.terminal, p);
    const tab = index.places.get(p.tab);
    const label = `${tab.label} · ${p.name ?? p.program?.name ?? p.title}`;
    const nth = (panesIn.get(p.tab) ?? 0) + 1;
    panesIn.set(p.tab, nth);
    index.places.set(p.pane, { label, placeStatus: p.status ?? null, nth });
    const place = { space, tab: p.tab, pane: p.pane };
    named(p.name, { sure: true, why: "Pane-Name", place }, p.cwd);
    branched(p.branch, { sure: true, why: "", place }, p.cwd);
    const worktree = worktreeOf(p.cwd);
    for (const n of branchNumbers(worktree)) add(index.byNumber, n, { sure: true, why: `Worktree ${worktree}`, place, folder: p.cwd });
    named(p.title, { sure: false, why: `Terminal-Titel „${p.title}“`, place }, p.cwd);
  }
  const local = (terminal) => !String(terminal).includes("/");
  const paneOfPid = new Map();
  for (const t of terminals) {
    const pane = paneOfTerminal.get(t.address);
    if (!pane || !local(t.address)) continue;
    for (const pid of [t.pid, t.foreground?.pid]) if (Number.isInteger(pid)) paneOfPid.set(pid, pane);
  }
  const sessions = claude?.sessions ?? [];
  const byProcess = new Map(sessions.map((c) => [c, c.chain.map((pid) => paneOfPid.get(pid)).find(Boolean) ?? null]));
  const claimed = new Set(byProcess.values());
  const claudePanes = panes.filter((p) => paneOfTerminal.get(p.terminal) === p && local(p.terminal) && !claimed.has(p) && p.app === CLAUDE_APP);
  for (const c of sessions) {
    const lost = sessions.filter((o) => o.cwd === c.cwd && !byProcess.get(o));
    const there = claudePanes.filter((p) => p.cwd === c.cwd);
    const pane = byProcess.get(c) ?? (lost.length === 1 && there.length === 1 ? there[0] : null);
    const place = pane ? { space: spaceOfTab.get(pane.tab), tab: pane.tab, pane: pane.pane } : { claude: c.pid };
    const label = `Claude-Sitzung „${c.name ?? c.pid}“`;
    const own = { place, label, agentStatus: c.agentStatus, claudePid: c.pid };
    for (const k of c.refs.keys) add(index.byKey, k, { ...own, sure: true, why: label });
    for (const n of c.refs.bare) add(index.byBare, n, { ...own, sure: true, why: label, folder: c.cwd });
    for (const task of c.tasks) {
      const why = `offene Aufgabe: ${task.subject}`;
      for (const k of task.refs.keys) add(index.byKey, k, { ...own, sure: false, why });
      for (const n of task.refs.bare) add(index.byBare, n, { ...own, sure: false, why, folder: c.cwd });
    }
  }
  return index;
}

// Whether hit `h` is at entry `e`'s place, or `e` at `h`'s: a tab or pane
// that one names and the other does not is no difference.
export function fits(e, h) {
  if (!placed(e) || !placed(h)) return !placed(e) && !placed(h) && e.place.claude === h.place.claude;
  const same = (a, b) => a === null || b === null || a === b;
  return e.place.space === h.place.space && same(e.place.tab, h.place.tab) && same(e.place.pane, h.place.pane);
}

export function itemSessions(index, item) {
  const key = itemKey(item);
  if (!key) return [];
  const branch = item.kind === "pr" && item.branch ? item.branch : null;
  const cacheKey = `${item.source}\n${key}\n${branch ?? ""}`;
  const kept = index.cache.get(cacheKey);
  if (kept) return kept;
  const hits = [...(index.byKey.get(key.toLowerCase()) ?? [])];
  if (item.source === "github") {
    const number = String(item.number);
    const ours = (h) => inRepo(h.folder, item.repoShort);
    for (const h of index.byBare.get(number) ?? []) if (ours(h)) hits.push(h);
    const byBranch = branch ? (index.byBranch.get(branch) ?? []).map((h) => ({ ...h, why: `Branch ${branch}` })) : index.byNumber.get(number) ?? [];
    for (const h of byBranch) if (ours(h)) hits.push(h);
  }
  const entries = [];
  for (const h of hits) {
    const e = entries.find((x) => fits(x, h));
    if (!e) {
      entries.push({ sure: h.sure, place: { ...h.place }, claudePid: h.claudePid ?? null, label: h.label ?? null, status: h.agentStatus ?? null, paneNumber: null, reasons: [h.why] });
      continue;
    }
    e.sure ||= h.sure;
    e.status ??= h.agentStatus ?? null;
    e.claudePid ??= h.claudePid ?? null;
    if (!e.reasons.includes(h.why)) e.reasons.push(h.why);
    if (placed(e)) e.place = { space: e.place.space, tab: e.place.tab ?? h.place.tab, pane: e.place.pane ?? h.place.pane };
  }
  for (const e of entries) {
    if (!placed(e)) continue;
    const place = index.places.get(placeKey(e));
    e.label = place?.label ?? e.place.space;
    e.status = place?.placeStatus ?? e.status;
    e.paneNumber = place?.nth ?? null;
  }
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.sure - a.e.sure || urgencyOf(a.e.status) - urgencyOf(b.e.status) || a.i - b.i).map(({ e }) => e);
  index.cache.set(cacheKey, sorted);
  return sorted;
}

export const linkedSession = (item, index) => itemSessions(index, item).find((s) => s.sure && placed(s)) ?? null;

// What the second Enter on an item does: go to its linkedSession, else ask
// where it has other sessions (ui/modals/sessions.js), else start one.
export function secondEnter(index, item) {
  const go = linkedSession(item, index);
  if (go) return { go };
  const listed = itemSessions(index, item);
  return listed.length ? { ask: listed } : { start: true };
}
