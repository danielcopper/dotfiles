// A tmux-style prefix key. keys.json binds ctrl-space to "mod.open:leader"
// (in the personal layout through focus-history, see init); the next key
// runs one action. At first only a small badge shows that the
// prefix is active; the full list of keys appears after HINT_MS, like
// which-key in nvim, so a known key never shows it. Movement keys repeat like
// tmux's `bind -r`: the overlay stays open for the same kind of key until
// another key, Esc or a short pause ends it. A key that ends the repeat is
// dropped, not passed to the terminal. A key can open a second level of keys,
// like a which-key group in nvim; it closes the same way, and shows its list
// at once when the first level's list is already up. A second ctrl-space
// waits for one more key and gives it to the tmux in the focused terminal as
// if typed after tmux's own prefix (see init).

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, exec, hc, props, closeOverlay, openOverlay, nextCommand, checking, theme, shared, setShared, panes, focused, notify, layout } from "herdr";

const HINT_MS = 500;
const REPEAT_MS = 700;
// The personal layout's right panel, the stack of its Files and Changes, and
// its normal width, which must match the panel's px in layouts/personal.json.
const PANEL = "panel";
const PANEL_BODY = "panel-body";
const PANEL_PX = 368;

// Focuses the pane focus-history saw before the current one; pane.focus also
// shows its space and tab, so focus changes once. Pressed again (ctrl-space
// Tab), it jumps back. With no previous pane, or one that is gone, it shows
// "No previous pane".
function focusPrevious() {
  const pane = shared("focus.history")?.previous;
  if (pane && panes().some((p) => p.pane === pane)) run("pane.focus", { pane });
  else notify({ title: "No previous pane", level: "info" });
}

// Finds a tmux client among the tmux servers in the user's socket folder
// ($TMUX_TMPDIR as the shell running this sees it, or /tmp) and prints its
// server's socket, its tty, the prefix of its session, tmux's repeat-time and
// initial-repeat-time (empty before tmux 3.5), and the keys bound with -r in
// the prefix table. "pid <pid>": the client on that process's tty. "ssh
// <address> <port>": the client whose ssh session came from that local
// connection: its SSH_CONNECTION has that port, and as address either that
// one or, through a NAT that keeps the source port, the one the host sees for this very ssh call
// (${SSH_CONNECTION%% *}, same route). No other client counts, so keys reach
// no tmux whose connection differs in port or address. When the terminal's
// ssh is the master of the user's own ControlMaster, the sessions
// multiplexed over it share its SSH_CONNECTION: their clients all match
// (exit 5), or the wrong one is used when only another of them runs tmux.
// Exit 3: no tty under /proc; 4: no such client, with any version mismatch
// tmux reported on stderr; 5: more than one client matches this connection.
const FIND_TMUX = [
  'mode=$1; want=; addr=; port=',
  'if [ "$mode" = pid ]; then want=$(readlink "/proc/$2/fd/0") || exit 3; else addr=$2; port=$3; fi',
  'why=; pick_s=; pick_t=; found=0; self=${SSH_CONNECTION%% *}',
  'for s in "${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)"/*; do',
  '  [ -S "$s" ] || continue',
  '  clients=$(tmux -S "$s" list-clients -F "#{client_tty} #{client_pid}" 2>&1) || { case $clients in *version*) why=$clients;; esac; continue; }',
  '  while read -r tty pid; do',
  '    [ -n "$tty" ] || continue',
  '    if [ -n "$want" ]; then [ "$tty" = "$want" ] && { pick_s=$s; pick_t=$tty; }; continue; fi',
  '    conn=$(tr "\\0" "\\n" < "/proc/$pid/environ" 2>/dev/null | sed -n "s/^SSH_CONNECTION=//p")',
  '    from=${conn%% *}; rest=${conn#* }; from_port=${rest%% *}',
  '    [ -n "$conn" ] && [ "$from_port" = "$port" ] || continue',
  '    [ "$from" = "$addr" ] || { [ -n "$self" ] && [ "$from" = "$self" ]; } || continue',
  '    found=$((found + 1)); pick_s=$s; pick_t=$tty',
  '  done <<EOF',
  '$clients',
  'EOF',
  '  [ -n "$want" ] && [ -n "$pick_t" ] && break',
  'done',
  '[ "$found" -gt 1 ] && exit 5',
  'if [ -z "$pick_t" ]; then [ -n "$why" ] && echo "$why" >&2; exit 4; fi',
  'echo "$pick_s"; echo "$pick_t"',
  'session=$(tmux -S "$pick_s" display -p -c "$pick_t" "#{session_id}")',
  'tmux -S "$pick_s" show -Av -t "$session" prefix 2>/dev/null || tmux -S "$pick_s" show -gv prefix',
  'tmux -S "$pick_s" show -gv repeat-time; tmux -S "$pick_s" show -gv initial-repeat-time 2>/dev/null || echo',
  'tmux -S "$pick_s" list-keys -T prefix | awk \'{ r = 0; for (i = 2; i <= NF; i++) { if ($i == "-r") r = 1; if ($i == "-T") { if (r) printf "%s ", $(i + 2); break } } }\'',
  "echo",
].join("\n");

// hc reports a failure as JSON on stderr; this is its message.
function hcError(stderr) {
  try {
    return JSON.parse(stderr).error?.message ?? stderr.trim();
  } catch {
    return stderr.trim();
  }
}

const number = (text, fallback) => (text?.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : fallback);

// One argument for sh, single-quoted.
const shQuote = (text) => `'${String(text).replace(/'/g, "'\\''")}'`;

// Base64 of a string's UTF-8 bytes (the mod runtime has no btoa or Buffer
// to rely on).
function base64(text) {
  const bytes = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += abc[n >> 18] + abc[(n >> 12) & 63] + (i + 1 < bytes.length ? abc[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? abc[n & 63] : "=");
  }
  return out;
}

// ssh's options that take a value, those left out of the leader's own ssh
// calls (agent and X11 forwards, which as flags would beat the leading -o
// settings; port and tunnel forwards, which ClearAllForwardings and Tunnel=no
// stop anyway; tty, background, master), and those that make ssh do
// something other than a shell login, where there is no tmux to reach.
const SSH_VALUE = "BbcDEeFIiJLlmOoPpQRSWw";
const SSH_DROP = "LRDwAXYtTfMn";
const SSH_NOT_LOGIN = "WOGVQNs";

// The login options and destination of an ssh command line. OpenSSH takes
// options after the destination too; what follows them is a remote command
// (`ssh -t host tmux new -A`), which the leader's own ssh calls leave out.
function sshTarget(argv) {
  const options = [];
  let destination = null;
  let i = 1;
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      if (!destination) destination = argv[++i];
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      if (destination) break;
      destination = arg;
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const c = arg[j];
      if (SSH_NOT_LOGIN.includes(c)) return { error: `ssh -${c} is no shell login` };
      if (SSH_VALUE.includes(c)) {
        const value = j + 1 < arg.length ? arg.slice(j + 1) : argv[++i];
        if (value === undefined) return { error: `ssh -${c} has no value` };
        if (!SSH_DROP.includes(c)) options.push(`-${c}`, value);
        break;
      }
      if (!SSH_DROP.includes(c)) options.push(`-${c}`);
    }
  }
  if (!destination) return { error: "ssh has no destination" };
  return { options, destination };
}

// The leader's own ssh to that host, running a sh script there. Its -o
// settings come first, since ssh keeps the first value it gets: never ask
// (BatchMode); no remote command or tty; no port forwards, agent, X11 or
// tunnel forwarding; and a ControlMaster connection kept for a minute for
// the sends that follow, unless the user's command line sets ControlPath
// (-S) or ControlMaster. ssh
// hands the remote login shell one string; the script travels
// base64-encoded, so no quoting of that shell (bash, zsh, fish) is involved.
function sshArgv(target, script) {
  const opts = target.options;
  const ownControl = opts.some((o, k) => o === "-S" || (o === "-o" && /^control(path|master)\b/i.test(opts[k + 1] ?? "")));
  const control = ownControl ? [] : ["-o", "ControlMaster=auto", "-o", "ControlPersist=60", "-o", "ControlPath=~/.ssh/herdr-leader-%C"];
  return [
    "-o", "BatchMode=yes", "-o", "RemoteCommand=none", "-o", "RequestTTY=no", "-o", "ClearAllForwardings=yes",
    "-o", "ForwardAgent=no", "-o", "ForwardX11=no", "-o", "Tunnel=no", ...control,
    ...opts, "--", target.destination, `echo ${base64(script)} | base64 -d | sh`,
  ];
}

// The local address and port of the user's ssh connection to the host: among
// that ssh process's established sockets (ss), the one to the host's ssh
// port as `ssh -G` resolves it (-p, -o Port, the user's ssh config). Sockets
// to a loopback address are forwards and don't count, unless the host itself
// is a loopback address. Through a jump host ssh has no such socket of its
// own (a second ssh carries it), so there is none: null.
async function sshConnection(target, pid, on) {
  const config = await exec("ssh", ["-G", ...target.options, "--", target.destination], { on }).catch(() => null);
  const port = config?.stdout.match(/^port (\d+)$/m)?.[1] ?? "22";
  const hostname = config?.stdout.match(/^hostname (\S+)$/m)?.[1] ?? target.destination;
  const r = await exec("ss", ["-Htnp"], { on }).catch(() => null);
  if (r?.code !== 0) return null;
  // ss writes IPv6 as [addr]; SSH_CONNECTION, as the host sees it, without.
  const split = (address) => [address.slice(0, address.lastIndexOf(":")).replace(/^\[(.*)\]$/, "$1"), address.slice(address.lastIndexOf(":") + 1)];
  const sockets = r.stdout
    .split("\n")
    .filter((l) => l.includes(`pid=${pid},`))
    .map((l) => l.trim().split(/\s+/))
    .map(([, , , local, peer]) => ({ local: split(local ?? ""), peer: split(peer ?? "") }))
    .filter((x) => x.peer[1] === port);
  const loopback = (host) => /^(::1$|127\.|::ffff:127\.|localhost$)/.test(host);
  const found = sockets.find((x) => loopback(hostname) || !loopback(x.peer[0]));
  return found ? { address: found.local[0].replace(/^::ffff:/, ""), port: found.local[1] } : null;
}

async function findTmux(terminal) {
  const on = terminal.includes("/") ? terminal.slice(0, terminal.lastIndexOf("/")) : null;
  const info = await hc(["get", terminal, "--json"]);
  if (info.code !== 0) throw new Error(hcError(info.stderr));
  const facts = JSON.parse(info.stdout);
  const argv = facts.foreground?.argv ?? [];
  const program = (argv[0] ?? "").split("/").pop();
  if (/^mosh/.test(program)) throw new Error("tmux behind mosh can't be reached");
  let r, ssh = null;
  if (program === "ssh") {
    ssh = sshTarget(argv);
    if (ssh.error) throw new Error(ssh.error);
    const local = await sshConnection(ssh, facts.foreground.pid, on);
    if (!local) throw new Error(`Can't find this terminal's ssh connection to ${ssh.destination}`);
    r = await exec("ssh", sshArgv(ssh, `set -- ssh ${shQuote(local.address)} ${shQuote(local.port)}\n${FIND_TMUX}`), { on, timeout: 15000 });
    if (r.code === 255) throw new Error(`ssh to ${ssh.destination} failed: ${r.stderr.trim()}`);
  } else {
    r = await exec("sh", ["-c", FIND_TMUX, "leader", "pid", String(facts.pid)], { on });
  }
  const why = (text) => [text, r.stderr.trim()].filter(Boolean).join(": ");
  if (r.code === 3) throw new Error("Can't read the terminal's tty (needs Linux /proc)");
  if (r.code === 4 && ssh) throw new Error(why(`No tmux on ${ssh.destination} has a client from this ssh connection`));
  if (r.code === 5) throw new Error(`More than one tmux client on ${ssh?.destination} matches this ssh connection`);
  if (r.code === 4) throw new Error(why("No tmux in the user's socket folder has this terminal as a client"));
  if (r.code !== 0) throw new Error(r.stderr.trim() || `Looking for tmux failed with ${r.code}`);
  const [socket, tty, prefix, repeatTime, initialRepeatTime, repeatable = ""] = r.stdout.split("\n");
  const repeatMs = number(repeatTime, 500);
  // initial-repeat-time 0 (or before tmux 3.5, none) means repeat-time.
  const initialMs = number(initialRepeatTime, 0) || repeatMs;
  return { on, ssh, socket, tty, prefix, repeatMs, initialMs, repeatable: new Set(repeatable.split(" ").filter(Boolean)) };
}

// Gives keys to that tmux client as if typed there (send-keys -K), so tmux
// runs its own bindings for them; they never pass through the terminal, so
// nothing the terminal receives meanwhile (the focus-in when the leader
// closes, or keys typed fast) can come between the prefix and the key. Behind
// ssh the same command runs on the far host.
async function sendToTmux(tmux, keys) {
  const args = ["-S", tmux.socket, "send-keys", "-K", "-c", tmux.tty, ...keys];
  const call = tmux.ssh
    ? exec("ssh", sshArgv(tmux.ssh, `exec tmux ${args.map(shQuote).join(" ")}`), { on: tmux.on, timeout: 15000 })
    : exec("tmux", args, { on: tmux.on });
  const r = await call.catch((e) => ({ code: 1, stderr: String(e?.message ?? e) }));
  if (r.code !== 0) notify({ title: "tmux did not take the key", body: r.stderr.trim(), level: "error" });
}

// tmux's names for keys GPUI names differently.
const TMUX_NAMED = {
  enter: "Enter", tab: "Tab", escape: "Escape", space: "Space", backspace: "BSpace", delete: "DC", insert: "IC",
  up: "Up", down: "Down", left: "Left", right: "Right", home: "Home", end: "End", pageup: "PPage", pagedown: "NPage",
};

// The tmux name of a key event (`|`, `H`, `$`, `Escape`, `C-a`, `M-x`, `S-Up`),
// or null for one tmux has no name for. A printable key is what it types, so
// a shifted `|` or `$` is itself.
function tmuxKey(e) {
  const m = e.modifiers ?? {};
  if (m.platform || m.function) return null;
  if (e.key === "tab" && m.shift && !m.control && !m.alt) return "BTab";
  let base = TMUX_NAMED[e.key] ?? (/^f([1-9]|1[0-2])$/.test(e.key) ? e.key.toUpperCase() : null);
  let typed = false;
  if (!base) {
    const ch = m.control || m.alt ? e.key : (e.key_char ?? e.key);
    if (typeof ch !== "string" || [...ch].length !== 1 || ch < " ") return null;
    base = (m.control || m.alt) && m.shift && /^[a-z]$/.test(ch) ? ch.toUpperCase() : ch;
    typed = true;
  }
  const key = (m.control ? "C-" : "") + (m.alt ? "M-" : "") + (m.shift && !typed ? "S-" : "") + base;
  // tmux reads an argument that ends in ; as the end of its command and drops
  // that ;, so a key ending in ; goes with a second one.
  return key.endsWith(";") ? `${key};` : key;
}

// Opens the file popup at the top, where herdr's terminals-bar opens the
// picker; mode is "files" or "changes".
function openFilePopup(mode) {
  openOverlay({ mod: "file-popup", kind: "popup", at: "top", offset: 40, width: 720, height: 0.8, props: { mode } });
}

// Shows the board's tab ("Arbeit", the board mod as its only pane) wherever
// it is, or opens one in the shown space. pane.focus also shows its space
// and tab; a pane zoomed in that tab is unzoomed first, so the board shows.
function openBoard() {
  const board = panes().find((p) => p.mod === "board");
  if (!board) {
    run("tab.new", { name: "Arbeit", mod: "board" });
    return;
  }
  const zoomed = panes().find((p) => p.tab === board.tab && p.zoomed);
  if (zoomed && zoomed.pane !== board.pane) run("pane.zoom", { pane: zoomed.pane });
  run("pane.focus", { pane: board.pane });
}

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Shows the right panel on one of its tabs ("files" or "changes"), or hides
// it when it already shows that tab, as the tab bar's Files and Changes
// buttons do; the shown tab is the stack's `active` in the layout. A tab the
// person turned off (shared "workspace.panels", which the tab bar honours
// too) is left alone.
function togglePanelTab(child, label) {
  const root = layout(), panel = findNode(root, PANEL), body = findNode(root, PANEL_BODY);
  if (!panel || !body) {
    notify({ title: "This layout has no panel", level: "info" });
    return;
  }
  if (!(shared("workspace.panels") ?? ["files", "changes"]).includes(child)) {
    notify({ title: `The ${label} panel is turned off`, level: "info" });
    return;
  }
  if (!panel.hidden && body.active === child) run("layout.hide", { id: PANEL });
  else {
    run("layout.select", { stack: PANEL_BODY, child });
    run("layout.show", { id: PANEL });
  }
}

// Toggles the right panel between its normal PANEL_PX and wide: weight 2
// against the main block's 1, so about two thirds of the space beside the
// sidebar (herdr tells a mod no window width); personal.json's panel has no
// max, since one would cap it short of that.
// Whether it is wide is read from the shown layout (a weight is wide, a px
// width is not), so the toggle stays right after the panel is hidden and
// shown again or dragged by hand. A hidden panel is shown wide.
function togglePanelWidth() {
  const panel = findNode(layout(), PANEL);
  if (!panel) {
    notify({ title: "This layout has no panel", level: "info" });
    return;
  }
  if (panel.hidden) {
    run("layout.resize", { id: PANEL, weight: 2 });
    run("layout.show", { id: PANEL });
  } else if (panel.size?.weight) run("layout.resize", { id: PANEL, px: PANEL_PX });
  else run("layout.resize", { id: PANEL, weight: 2 });
}

// A level of keys: its title, its rows (below), the keys the list leaves out
// as aliases, and the hint in its corner.
function level(title, actions, aliases = [], hint = "Esc") {
  return {
    title,
    actions,
    aliases: new Set(aliases),
    hint,
    byKey: new Map(actions.map((a) => [a[0], a])),
    groups: [...new Set(actions.map((a) => a[2]))],
  };
}

// [key, label, group, command, args, repeats]; a function as command (only
// for an action that doesn't repeat) runs itself instead of an app command,
// and a level opens that level's keys.
// f: files. f f and f g are nvim's <leader>ff (find files) and <leader>fg
// (changed files); f e shows the Files panel as nvim's <leader>fe opens the
// explorer; f G the Changes panel; nvim's <leader>fG lists the branch's
// changes.
const FILES = level("Leader f", [
  ["f", "find file", "Find", () => openFilePopup("files"), {}],
  ["g", "changed files", "Find", () => openFilePopup("changes"), {}],
  ["e", "files panel", "Panel", () => togglePanelTab("files", "Files"), {}],
  ["G", "changes panel", "Panel", () => togglePanelTab("changes", "Changes"), {}],
]);
const ACTIONS = [
  ["Tab", "last pane", "Panes", focusPrevious, {}],
  ["|", "split right", "Panes", "pane.split", { direction: "right" }],
  ["-", "split down", "Panes", "pane.split", { direction: "down" }],
  ["h", "go left", "Panes", "pane.go", { direction: "left" }, true],
  ["j", "go down", "Panes", "pane.go", { direction: "down" }, true],
  ["k", "go up", "Panes", "pane.go", { direction: "up" }, true],
  ["l", "go right", "Panes", "pane.go", { direction: "right" }, true],
  ["z", "zoom", "Panes", "pane.zoom", {}],
  ["x", "close pane", "Panes", "pane.close", {}],
  // Pressed as ctrl-space; init takes it.
  ["C-Space", "tmux prefix", "Panes", null, {}],
  ["t", "new tab", "Tabs", "tab.new", {}],
  ["c", "new tab", "Tabs", "tab.new", {}],
  ["n", "next tab", "Tabs", "tab.next", {}],
  ["p", "previous tab", "Tabs", "tab.prev", {}],
  [",", "rename tab", "Tabs", "tab.rename", {}],
  ["N", "new space", "Spaces", "space.new", {}],
  ["$", "rename space", "Spaces", "space.rename", {}],
  ["s", "pick", "Spaces", "mod.open", { name: "picker" }],
  ["S", "pick", "Spaces", "mod.open", { name: "picker" }],
  ["a", "sidebar", "View", "layout.toggle", { id: "sidebar" }],
  ["Z", "wide panel", "View", togglePanelWidth, {}],
  ["b", "board", "View", openBoard, {}],
  ["f", "+files", "View", FILES, {}],
];
// S and c are aliases of s and t; the list shows each action once.
const LEADER = level("Leader", ACTIONS, ["S", "c"], "1-9 tab · Esc");

export default class Leader extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.level = LEADER;
    // Set while a repeatable key keeps the overlay open; only keys of that
    // kind (same command) continue the repeat.
    this.repeating = null;
    this.generation = 0;
    this.hints = 0;
    this.hintLater(cx);
    // A second ctrl-space and Esc normally don't reach on_key_down: keys.json's
    // "mod:leader" section binds them to leader.send_prefix and leader.escape,
    // which arrive here (in the personal layout a ctrl-space may come through
    // focus-history instead, the same command).
    //
    // ctrl-space ctrl-space <key> is for a tmux in the focused terminal, whose
    // prefix is ctrl-space too: the leader takes <key> itself once the
    // overlay has the keyboard, and gives tmux its prefix and <key> in one
    // send (sendToTmux). When <key> is bound with -r there, further such keys
    // go on without the prefix until tmux's repeat window (initial-repeat-time,
    // then repeat-time) passes without one. Any other key, and every key after
    // that, goes on bare, as typed into the pane, until the leader has sent
    // all it took and closes. A third ctrl-space before <key> cancels; later
    // it ends the passing, sending nothing. On another machine, or behind
    // ssh, each send takes a round trip, so a long run of repeat keys can
    // reach tmux after its window has closed.
    this.passing = null;
    if (checking()) return;
    // ctrl-space presses that came before the leader had the keyboard are
    // counted in shared("leader.state").pending (focus-history's header has
    // the protocol): the first of them is the second ctrl-space, which starts
    // passing; a second one is the third, which cancels it; more do nothing.
    const pending = shared("leader.state")?.pending ?? 0;
    setShared("leader.state", { at: Date.now(), ready: true });
    for (let i = 0; i < Math.min(pending, 2); i++) this.prefixAgain(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "send_prefix") this.prefixAgain(cx);
        else if (command === "escape") this.escape(cx);
      }
    });
  }

  prefixAgain(cx) {
    const p = this.passing;
    if (p) {
      if (p.phase !== "first") return this.stopPassing(cx);
      p.cancelled = true;
      return this.close();
    }
    if (this.level !== LEADER || this.repeating) return this.close();
    const f = focused();
    const terminal = f?.shown ?? f?.terminal;
    if (!terminal) {
      notify({ title: "No terminal to pass keys to", level: "info" });
      return this.close();
    }
    // phase: "first" (the next key goes with the prefix), "repeat" (-r keys go
    // on bare) or "bare" (keys go on as typed until the leader closes).
    const passing = { tmux: null, queue: [], phase: "first", timer: 0, sent: Promise.resolve(), cancelled: false };
    this.passing = passing;
    cx.spawn(async (cx) => {
      try {
        passing.tmux = await findTmux(terminal);
      } catch (e) {
        if (passing.cancelled) return;
        passing.cancelled = true;
        notify({ title: "Can't pass keys to tmux", body: String(e?.message ?? e), level: "info" });
        return this.close();
      }
      this.flush(cx);
    });
    cx.notify();
  }

  escape(cx) {
    if (this.passing) this.passKey("Escape", cx);
    else this.close();
  }

  passKey(key, cx) {
    if (this.passing.cancelled) return;
    this.passing.queue.push(key);
    this.flush(cx);
  }

  // Sends the keys taken so far, in order, once tmux is found: the first with
  // the prefix, -r keys bare while the repeat lasts, and any other key bare,
  // after which the leader closes once everything has gone out.
  flush(cx) {
    const p = this.passing;
    if (!p?.tmux || p.cancelled) return;
    const { tmux } = p;
    while (p.queue.length) {
      const key = p.queue.shift();
      const first = p.phase === "first";
      p.sent = p.sent.then(() => sendToTmux(tmux, first ? [tmux.prefix, key] : [key]));
      const repeats = tmux.repeatable.has(key) && (first || p.phase === "repeat");
      p.phase = repeats ? "repeat" : "bare";
      if (repeats) this.repeatLater(first ? tmux.initialMs : tmux.repeatMs, cx);
    }
    if (p.phase === "bare") this.closeWhenSent(cx);
    cx.notify();
  }

  // Ends the repeat once its window passes without another -r key; a window of
  // 0 ends it at once.
  repeatLater(ms, cx) {
    const p = this.passing;
    const timer = ++p.timer;
    if (ms <= 0) return this.stopPassing(cx);
    cx.timer.after(ms, (cx) => {
      if (p.timer !== timer || p.phase !== "repeat" || p.cancelled) return;
      this.stopPassing(cx);
    });
  }

  // No more prefix or repeat: what is still to come goes on bare.
  stopPassing(cx) {
    this.passing.phase = "bare";
    this.closeWhenSent(cx);
    cx.notify();
  }

  // Closes once every key taken has gone out and none is waiting (closing
  // would cancel the sends still running), once.
  closeWhenSent(cx) {
    const p = this.passing;
    const sent = p.sent;
    if (p.waiting === sent) return;
    p.waiting = sent;
    cx.spawn(async () => {
      await sent;
      if (p.sent !== sent || p.queue.length || p.cancelled || p.closed) return;
      p.closed = true;
      this.close();
    });
  }

  // The badge first, the level's keys after HINT_MS.
  hintLater(cx) {
    this.expanded = false;
    const hints = ++this.hints;
    cx.timer.after(HINT_MS, (cx) => {
      if (hints !== this.hints) return;
      this.expanded = true;
      cx.notify();
    });
  }

  // Also what herdr calls when the overlay goes, however it was closed.
  close() {
    if (shared("leader.state")) setShared("leader.state", null);
    closeOverlay(props().overlay);
  }

  press(e, cx) {
    const p = this.passing;
    if (p) {
      if (p.cancelled) return;
      const key = tmuxKey(e);
      if (key) return this.passKey(key, cx);
      notify({ title: `Can't pass ${e.key_char ?? e.keystroke} to tmux`, level: "info" });
      if (p.phase !== "first") return this.stopPassing(cx);
      p.cancelled = true;
      return this.close();
    }
    // Esc arrives as leader.escape (init); this is in case herdr hands it to
    // the overlay instead.
    if (e.key === "escape") return this.escape(cx);
    if (e.modifiers?.control || e.modifiers?.alt || e.modifiers?.platform) return this.close();
    const key = e.key === "tab" && !e.modifiers?.shift ? "Tab" : (e.key_char ?? e.key);
    if (/^[1-9]$/.test(key) && !this.repeating && this.level === LEADER) {
      this.close();
      run("tab.select", { index: Number(key) });
      return;
    }
    const action = this.level.byKey.get(key);
    if (!action || (this.repeating && action[3] !== this.repeating)) return this.close();
    const [, , , command, args, repeats] = action;
    if (command?.actions) {
      this.level = command;
      // A list already shown stays shown, as which-key keeps it.
      if (!this.expanded) this.hintLater(cx);
      cx.notify();
      return;
    }
    if (!repeats) {
      this.close();
      if (typeof command === "function") command();
      else run(command, args);
      return;
    }
    run(command, args);
    this.repeating = command;
    const generation = ++this.generation;
    cx.timer.after(REPEAT_MS, () => {
      if (generation === this.generation) this.close();
    });
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const { title: name, actions, aliases, hint, groups } = this.level;
    const phase = this.passing?.phase;
    const title = phase
      ? phase === "first"
        ? "Leader → tmux: next key · C-Space cancels"
        : phase === "repeat"
          ? "Leader → tmux (repeat)"
          : "Leader → tmux"
      : this.repeating
        ? `${name} (repeat)`
        : name;
    const root = h_flex()
      .id("leader")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        this.press(e, cx);
        cx.stop_propagation();
      })
      .w_full()
      .justify_center();
    if (!this.expanded || this.passing) {
      return root.child(
        div()
          .px(12)
          .py(6)
          .rounded(8)
          .border_1()
          .border_color(t.border)
          .bg(t.popover)
          .shadow_md()
          .text_size(12)
          .font_semibold()
          .text_color(t.accent)
          .child(title),
      );
    }
    const row = ([key, label, , command]) =>
      h_flex()
        .gap(8)
        .items_center()
        .text_color(this.repeating && command !== this.repeating ? t.dim : t.foreground)
        .child(div().min_w(26).font_semibold().text_color(t.accent).child(key))
        .child(div().text_color(t.muted).child(label));
    const column = (group) =>
      v_flex()
        .gap(4)
        .min_w(110)
        .child(div().text_size(11).font_semibold().text_color(t.dim).child(group))
        .children(actions.filter((a) => a[2] === group && !aliases.has(a[0])).map(row));
    return root.child(
      v_flex()
        .w_full()
        .p(14)
        .gap(10)
        .rounded(8)
        .border_1()
        .border_color(t.border)
        .bg(t.popover)
        .shadow_md()
        .text_size(12)
        .child(
          h_flex()
            .items_center()
            .justify_between()
            .child(div().text_size(13).font_semibold().text_color(t.foreground).child(title))
            .child(div().text_size(11).text_color(t.dim).child(hint)),
        )
        .child(h_flex().gap(18).items_start().children(groups.map(column))),
    );
  }
}
