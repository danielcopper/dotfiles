// Tests for the herdr leader mod (herdr-app/.config/herdr-app/mods/leader/main.js):
// how Tab, shift-Tab and Esc reach it, and what focus-history records for the
// leader's Tab, driven through the Leader and FocusHistory classes with a fake
// herdr. Run with `mise run herdr-leader-test` (README, "herdr app"), or from
// the repo root with `node --test tests/herdr-app/leader.test.mjs`.
//
// The mods import "gpui-kit", "gpui-base" and "herdr", which only herdr
// provides. A resolve/load hook hands node a stand-in for each that exports
// every name the importing mod asks for: View as an empty class, everything else as a
// function that calls the fake host a test puts in globalThis.__leaderHost,
// and throws when there is none. Elements (div, h_flex, v_flex) record the
// builder calls made on them, so a test can find the handlers render
// registered. LEADER_MAIN points the tests at another copy of main.js (to see
// a test fail against a broken one), FOCUS_HISTORY_MAIN at another copy of
// mods/focus-history/main.js, whose record of the focus the leader's Tab
// reads and whose render the tests here drive too.
//
// These tests check what the leader binds and what its handlers and its
// on_key_down then do, and what focus-history records for the leader's Tab.
// That the leader's bindings come before herdr's own
// bindings of those keys is the app's behaviour, which no test here covers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modDir = resolve(here, "../../herdr-app/.config/herdr-app/mods/leader");
const mainPath = process.env.LEADER_MAIN ? resolve(process.env.LEADER_MAIN) : join(modDir, "main.js");
const historyPath = process.env.FOCUS_HISTORY_MAIN
  ? resolve(process.env.FOCUS_HISTORY_MAIN)
  : resolve(here, "../../herdr-app/.config/herdr-app/mods/focus-history/main.js");
const keysPath = resolve(here, "../../herdr-app/.config/herdr-app/keys.json");
const personalPath = resolve(here, "../../herdr-app/.config/herdr-app/layouts/personal.json");
const STUBBED = new Set(["gpui-kit", "gpui-base", "herdr"]);

registerHooks({
  resolve(specifier, context, next) {
    if (!STUBBED.has(specifier)) return next(specifier, context);
    const parent = context.parentURL ? readFileSync(fileURLToPath(context.parentURL), "utf8") : "";
    const clause = parent.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${specifier}["']`))?.[1] ?? "";
    const names = clause.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    return { url: `stub:${specifier}?${names.join(",")}`, shortCircuit: true };
  },
  load(url, context, next) {
    if (!url.startsWith("stub:")) return next(url, context);
    const [specifier, list] = url.slice(5).split("?");
    const source = [
      `const call = (name) => (...a) => {
        const h = globalThis.__leaderHost?.[name];
        if (!h) throw new Error(\`${specifier} \${name} is not available under node\`);
        return h(...a);
      };`,
      ...list
        .split(",")
        .filter(Boolean)
        .map((n) => (n === "View" ? "export class View {}" : `export const ${n} = call("${n}");`)),
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  },
});

const leaderModule = await import(pathToFileURL(mainPath).href);
const historyModule = await import(pathToFileURL(historyPath).href);

// mise run herdr-leader-test sets LEADER_TEST_PERMISSION; then node must run
// under its permission model, and this test fails rather than skips.
const underTask = Boolean(process.env.LEADER_TEST_PERMISSION);
test("under mise run herdr-leader-test reads stay in the repo and nothing is written", { skip: !underTask && !process.permission && "node runs without --permission" }, () => {
  assert.ok(process.permission, "LEADER_TEST_PERMISSION is set but node runs without --permission");
  assert.equal(process.permission.has("fs.read", join(process.env.HOME, ".bashrc")), false);
  assert.equal(process.permission.has("fs.write", process.env.HOME), false);
  assert.equal(process.permission.has("fs.write", modDir), false);
  assert.equal(process.permission.has("fs.read", mainPath), true);
});

// An element that records every builder call and returns itself.
function element() {
  const calls = [];
  const el = new Proxy({}, {
    get: (_t, name) => (name === "calls" ? calls : (...args) => (calls.push([name, ...args]), el)),
  });
  return el;
}
const callsOf = (el, name) => el.calls.filter((c) => c[0] === name).map((c) => c.slice(1));

const SOCKET = "/tmp/tmux-1000/default";
const TTY = "/dev/pts/7";

// A layout with the shown tab, a status bar mod and, unless `history` is
// false, the empty block that keeps focus-history running, as
// layouts/personal.json has them.
function historyLayout(history = true) {
  const children = [
    { id: "tab", type: "block", content: { tab: "active" } },
    { id: "status", type: "block", content: { mod: "workspace-status" }, size: { px: 28 } },
  ];
  if (history) children.push({ id: "focus-history", type: "block", content: { mod: "focus-history" }, size: { px: 0 } });
  return { id: "root", type: "row", children };
}
const HISTORY_LAYOUT = historyLayout();
const NOT_RECORDING = "Focus history is not recording here";

// The fake herdr: two panes, p1 focused after p2; a tmux with prefix C-Space
// on terminal t1, none of whose keys repeat. `history` is what
// focus-history recorded, `focusedPane` the pane focused() names (null: a
// layout terminal block has the focus), `layout` what layout() returns (by
// default one with a focus-history block). `leaderState` is what
// focus-history left in shared("leader.state") before the leader started;
// host.command(name) hands the leader a key command (leader.<name>).
// `failRun`: a command run throws for, as a broken app command would.
function fakeHost({ history = { current: "p1", previous: "p2" }, focusedPane = "p1", layout = HISTORY_LAYOUT, leaderState = null, failRun = null } = {}) {
  const shared = new Map([["focus.history", history], ["leader.state", leaderState]]);
  const waiting = [];
  const host = {
    runs: [],
    notes: [],
    closed: [],
    sent: [],
    shared: (key) => shared.get(key) ?? null,
    setShared: (key, value) => shared.set(key, value),
    run: (name, args) => {
      if (name === failRun) throw new Error(`${name} broke`);
      host.runs.push([name, args]);
    },
    notify: (n) => host.notes.push(n),
    props: () => ({ overlay: "mod-leader" }),
    closeOverlay: (id) => host.closed.push(id),
    checking: () => false,
    nextCommand: () => new Promise((resolve) => waiting.push(resolve)),
    command: async (name) => {
      await settle();
      assert.ok(waiting.length, `nobody waits for ${name}`);
      waiting.shift()(name);
      await settle();
    },
    panes: () => [{ pane: "p1" }, { pane: "p2" }],
    focused: () => ({ pane: focusedPane, terminal: "t1", shown: null }),
    theme: () => ({}),
    layout: () => layout,
    hc: async () => ({ code: 0, stdout: JSON.stringify({ pid: 4242, foreground: { argv: ["bash"], pid: 4242 } }), stderr: "" }),
    exec: async (tool, args) => {
      if (tool === "sh") return { code: 0, stdout: `${SOCKET}\n${TTY}\nC-Space\n500\n0\n\n`, stderr: "" };
      if (tool === "tmux") host.sent.push(args.slice(args.indexOf(TTY) + 1));
      return { code: 0, stdout: "", stderr: "" };
    },
    div: element,
    h_flex: element,
    v_flex: element,
  };
  return host;
}

// bind_keys: what the fake keymap does with the bindings; by default it
// takes them all.
function fakeCx(bindKeys = (bindings) => bindings.length) {
  const cx = {
    bound: [],
    stopped: 0,
    focus_handle: () => ({ focus() {} }),
    bind_keys: (bindings) => (cx.bound.push(...bindings), bindKeys(bindings)),
    spawn: (fn) => Promise.resolve().then(() => fn(cx)),
    timer: { after() {}, every() {} },
    notify() {},
    stop_propagation: () => cx.stopped++,
  };
  return cx;
}

async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
}

// `host`: a fake herdr made beforehand, in place of fakeHost(options).
async function openLeader({ bindKeys, host = null, ...options } = {}) {
  host ??= fakeHost(options);
  globalThis.__leaderHost = host;
  const leader = new leaderModule.default();
  const cx = fakeCx(bindKeys);
  leader.init({}, cx);
  await settle();
  return { leader, cx, host };
}

const PLAIN = { shift: false, control: false, alt: false, platform: false, function: false };
// Each key the leader binds, as GPUI hands it to on_key_down.
const KEY = {
  tab: { key: "tab", keystroke: "tab", modifiers: PLAIN },
  "shift-tab": { key: "tab", keystroke: "shift-tab", modifiers: { ...PLAIN, shift: true } },
  escape: { key: "escape", keystroke: "escape", modifiers: PLAIN },
};
const X = { key: "x", keystroke: "x", key_char: "x", modifiers: PLAIN };

// A key as GPUI hands it to the root's on_key_down.
async function pressRaw(leader, cx, event) {
  const [handler] = callsOf(leader.render(cx), "on_key_down").map(([h]) => h);
  assert.ok(handler, "the root has no on_key_down");
  handler(event, cx);
  await settle();
}

// The root's handler for the action bound to `keystroke`, as GPUI runs it
// when that binding matches. GPUI dispatches a matching binding's action
// first and gives the key to on_key_down only when no action stopped it
// (window.rs, dispatch_key_event); there an action stops by default in the
// bubble phase. This stand-in is stricter: an action that doesn't call
// stop_propagation goes on to on_key_down as the same key, so a key handled
// twice shows in the results.
async function pressBound(leader, cx, keystroke) {
  const binding = cx.bound.find((b) => b.keystroke === keystroke);
  assert.ok(binding, `no binding for ${keystroke}`);
  const handler = callsOf(leader.render(cx), "on_action").find(([action]) => action === binding.action)?.[1];
  assert.ok(handler, `the root has no handler for ${binding.action}`);
  const stopped = cx.stopped;
  handler({ action: binding.action }, cx);
  await settle();
  if (cx.stopped === stopped) await pressRaw(leader, cx, KEY[keystroke]);
}

const BOUND = ["tab", "shift-tab", "escape"];

test("the leader binds tab, shift-tab and escape in the key context its root declares, and handles each action", async () => {
  const { leader, cx } = await openLeader();
  assert.deepEqual(cx.bound.map((b) => b.keystroke), BOUND);
  const root = leader.render(cx);
  const contexts = callsOf(root, "key_context").map(([c]) => c);
  assert.equal(contexts.length, 1);
  for (const b of cx.bound) assert.equal(b.context, contexts[0], b.keystroke);
  const handled = callsOf(root, "on_action").map(([action]) => action);
  for (const b of cx.bound) assert.ok(handled.includes(b.action), `no handler for ${b.action}`);
});

test("every leader that opens binds its keys again", async () => {
  const first = await openLeader();
  const second = await openLeader();
  assert.deepEqual(first.cx.bound.map((b) => b.keystroke), BOUND);
  assert.deepEqual(second.cx.bound, first.cx.bound);
});

for (const [name, bindKeys, title, reason] of [
  ["throws", () => { throw new Error("bad keystroke"); }, "Leader: Tab, shift-Tab and Esc not bound", "bad keystroke"],
  ["adds fewer than asked", () => 2, "Leader: Tab, shift-Tab and Esc not all bound", "2 of 3 bindings added"],
]) {
  test(`a bind_keys that ${name} is said in a toast; Esc and a second ctrl-space still work`, async () => {
    const { host } = await openLeader({ bindKeys });
    assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [[title, reason, "error"]]);
    await host.command("escape");
    assert.deepEqual(host.closed, ["mod-leader"]);

    const again = await openLeader({ bindKeys });
    await again.host.command("send_prefix");
    await pressRaw(again.leader, again.cx, X);
    assert.deepEqual(again.host.sent, [["C-Space", "x"]]);
  });
}

for (const [how, press] of [
  ["through its binding", (leader, cx, keystroke) => pressBound(leader, cx, keystroke)],
  ["as a key", (leader, cx, keystroke) => pressRaw(leader, cx, KEY[keystroke])],
]) {
  test(`Tab ${how} focuses the previous pane and closes the leader`, async () => {
    const { leader, cx, host } = await openLeader();
    await press(leader, cx, "tab");
    assert.deepEqual(host.runs, [["pane.focus", { pane: "p2" }]]);
    assert.deepEqual(host.notes, []);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`Tab ${how} with the previous pane gone says so and closes the leader`, async () => {
    const { leader, cx, host } = await openLeader({ history: { current: "p1", previous: "p9" } });
    await press(leader, cx, "tab");
    assert.deepEqual(host.runs, []);
    assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`Tab ${how} with no previous pane says so and closes the leader`, async () => {
    const { leader, cx, host } = await openLeader({ history: { current: "p1", previous: null } });
    await press(leader, cx, "tab");
    assert.deepEqual(host.runs, []);
    assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  for (const [what, history] of [
    ["a history whose current pane is not the focused one", { current: "p2", previous: "p1" }],
    ["no focus history at all", null],
  ]) {
    test(`Tab ${how} with ${what} says it has not recorded the focused pane and focuses nothing`, async () => {
      const { leader, cx, host } = await openLeader({ history });
      await press(leader, cx, "tab");
      assert.deepEqual(host.runs, []);
      assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [[NOT_RECORDING, "It has not recorded the focused pane", "info"]]);
      assert.deepEqual(host.closed, ["mod-leader"]);
    });
  }

  for (const [what, focusedPane] of [["a pane", "p1"], ["a layout terminal block", null]]) {
    test(`Tab ${how} with ${what} focused in a layout without a focus-history block says so and focuses nothing`, async () => {
      const { leader, cx, host } = await openLeader({ layout: historyLayout(false), focusedPane });
      await press(leader, cx, "tab");
      assert.deepEqual(host.runs, []);
      assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [[NOT_RECORDING, "This layout has no focus-history block; the personal layout has one", "info"]]);
      assert.deepEqual(host.closed, ["mod-leader"]);
    });
  }

  test(`Tab ${how} from a layout terminal block focuses the pane just left`, async () => {
    const { leader, cx, host } = await openLeader({ focusedPane: null });
    await press(leader, cx, "tab");
    assert.deepEqual(host.runs, [["pane.focus", { pane: "p1" }]]);
    assert.deepEqual(host.notes, []);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`Tab ${how} from a layout terminal block with the pane just left gone says so`, async () => {
    const { leader, cx, host } = await openLeader({ focusedPane: null, history: { current: "p9", previous: "p2" } });
    await press(leader, cx, "tab");
    assert.deepEqual(host.runs, []);
    assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`shift-Tab ${how} is no leader key: it closes the leader and runs nothing`, async () => {
    const { leader, cx, host } = await openLeader();
    await press(leader, cx, "shift-tab");
    assert.deepEqual(host.runs, []);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`Esc ${how} closes the leader and runs nothing`, async () => {
    const { leader, cx, host } = await openLeader();
    await press(leader, cx, "escape");
    assert.deepEqual(host.runs, []);
    assert.deepEqual(host.notes, []);
    assert.deepEqual(host.closed, ["mod-leader"]);
  });

  test(`after ctrl-space ctrl-space, Tab, shift-Tab and Esc go to tmux after its prefix as Tab, BTab and Escape (${how})`, async () => {
    for (const [keystroke, key] of [["tab", "Tab"], ["shift-tab", "BTab"], ["escape", "Escape"]]) {
      // The second ctrl-space came before the leader had the keyboard.
      const { leader, cx, host } = await openLeader({ leaderState: { at: Date.now(), ready: false, pending: 1 } });
      await press(leader, cx, keystroke);
      assert.deepEqual(host.sent, [["C-Space", key]], keystroke);
      assert.deepEqual(host.runs, [], keystroke);
      assert.deepEqual(host.closed, ["mod-leader"], keystroke);
    }
  });
}

test("a bound key whose handling throws says so in a toast and goes no further", async () => {
  const { leader, cx, host } = await openLeader({ failRun: "pane.focus" });
  await pressBound(leader, cx, "tab");
  assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [["Leader: Tab failed", "pane.focus broke", "error"]]);
  assert.deepEqual(host.closed, ["mod-leader"]);
});

test("a bound key whose handling throws outside its key's command says so in one toast too", async () => {
  const { leader, cx, host } = await openLeader();
  host.closeOverlay = () => {
    throw new Error("closeOverlay broke");
  };
  await pressBound(leader, cx, "escape");
  assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [["Leader: Esc failed", "closeOverlay broke", "error"]]);
});

// A layout with a board layer showing `active` ("tab" or "b"), the
// stack and its children named as no layout here names them.
const layerLayout = (active) => ({ id: "root", type: "row", children: [{ id: "work", type: "column", children: [
  { id: "layer", type: "stack", active, children: [{ id: "tab", type: "block", content: { tab: "active" } }, { id: "b", type: "block", content: { mod: "board", props: { layer: true } } }] },
] }] });
const B = { key: "b", keystroke: "b", key_char: "b", modifiers: PLAIN };

test("b shows the board layer's board, or the tab's content with the keyboard back, else the board's tab, and closes the leader", async () => {
  for (const [what, layout, runs] of [
    ["the layer showing the tab", layerLayout("tab"), [["layout.select", { stack: "layer", child: "b" }], ["board.focus", undefined]]],
    ["the layer showing the board", layerLayout("b"), [["layout.select", { stack: "layer", child: "tab" }], ["pane.focus", { pane: "p1" }]]],
    ["no layer", null, [["tab.new", { name: "Board", mod: "board" }]]],
  ]) {
    const { leader, cx, host } = await openLeader();
    host.layout = () => layout;
    await pressRaw(leader, cx, B);
    assert.deepEqual(host.runs, runs, what);
    assert.deepEqual(host.closed, ["mod-leader"], what);
  }
});

test("b in the personal layout without a board layer says so and opens no Board tab", async () => {
  const { leader, cx, host } = await openLeader();
  host.setShared("layout", "personal");
  await pressRaw(leader, cx, B);
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.notes.map((n) => [n.title, n.level]), [["The personal layout has no board layer", "error"]]);
});

test("a raw key whose command fails says so in a toast; a failed switch of the board layer names its stack and child", async () => {
  const opened = await openLeader({ failRun: "tab.new" });
  await pressRaw(opened.leader, opened.cx, B);
  assert.deepEqual(opened.host.notes.map((n) => [n.title, n.body, n.level]), [["Leader: b failed", "tab.new broke", "error"]]);
  assert.deepEqual(opened.host.closed, ["mod-leader"]);
  const layered = await openLeader({ failRun: "layout.select" });
  layered.host.layout = () => layerLayout("tab");
  await pressRaw(layered.leader, layered.cx, B);
  assert.deepEqual(layered.host.notes.map((n) => [n.title, n.body]), [['Could not show "b" in "layer"', "layout.select broke"]]);
});

// A layout with the right panel: hidden or not, its width, and the tab its
// stack shows.
const panelLayout = (hidden, size, active) => ({ id: "root", type: "row", children: [
  { id: "panel", type: "column", hidden, size, children: [{ id: "panel-body", type: "stack", active, children: [{ id: "files" }, { id: "changes" }] }] },
] });
const key = (k) => ({ key: k, keystroke: k, key_char: k, modifiers: PLAIN });

test("f e shows the right panel on Files, or hides it when it shows Files", async () => {
  for (const [what, layout, runs] of [
    ["hidden", panelLayout(true, { px: 368 }, "files"), [["layout.select", { stack: "panel-body", child: "files" }], ["layout.show", { id: "panel" }]]],
    ["on Changes", panelLayout(false, { px: 368 }, "changes"), [["layout.select", { stack: "panel-body", child: "files" }], ["layout.show", { id: "panel" }]]],
    ["on Files", panelLayout(false, { px: 368 }, "files"), [["layout.hide", { id: "panel" }]]],
  ]) {
    const { leader, cx, host } = await openLeader();
    host.layout = () => layout;
    await pressRaw(leader, cx, key("f"));
    await pressRaw(leader, cx, key("e"));
    assert.deepEqual(host.runs, runs, what);
  }
});

test("Z switches the right panel between its normal width and wide, and shows a hidden one wide", async () => {
  for (const [what, layout, runs] of [
    ["normal", panelLayout(false, { px: 368 }, "files"), [["layout.resize", { id: "panel", weight: 2 }]]],
    ["wide", panelLayout(false, { weight: 2 }, "files"), [["layout.resize", { id: "panel", px: 368 }]]],
    ["hidden", panelLayout(true, { px: 368 }, "files"), [["layout.resize", { id: "panel", weight: 2 }], ["layout.show", { id: "panel" }]]],
  ]) {
    const { leader, cx, host } = await openLeader();
    host.layout = () => layout;
    await pressRaw(leader, cx, { ...key("Z"), key: "z", modifiers: { ...PLAIN, shift: true } });
    assert.deepEqual(host.runs, runs, what);
  }
});

test("a digit or a repeating key whose command fails says so in one toast naming the key", async () => {
  for (const [k, failing] of [["1", "tab.select"], ["h", "pane.go"]]) {
    const { leader, cx, host } = await openLeader({ failRun: failing });
    await pressRaw(leader, cx, key(k));
    assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [[`Leader: ${k} failed`, `${failing} broke`, "error"]], k);
  }
});

test("keys.json still hands the leader a second ctrl-space and Esc", () => {
  const section = JSON.parse(readFileSync(keysPath, "utf8"))["mod:leader"];
  assert.equal(section?.["ctrl-space"], "leader.send_prefix");
  assert.equal(section?.escape, "leader.escape");
});

// ---- The board as a place in the focus history ----

// layouts/personal.json, its work-stack showing `active`: "main" (the shown
// tab's content) or "board". `board` renames the stack's board child to that
// id (`active` names it by the new id then).
function personal(active, board = "board") {
  const tree = JSON.parse(readFileSync(personalPath, "utf8"));
  const find = (n) => (n.id === "work-stack" ? n : (n.children ?? []).map(find).find(Boolean));
  const stack = find(tree);
  stack.children.find((c) => c.id === "board").id = board;
  stack.active = active;
  return tree;
}
const SHOW_BOARD = [["layout.select", { stack: "work-stack", child: "board" }], ["board.focus", undefined]];
const SHOW_MAIN = ["layout.select", { stack: "work-stack", child: "main" }];

test("Tab from the board layer's board shows the tab's content again and focuses the place before the board, the pane under it too", async () => {
  for (const previous of ["p1", "p2"]) {
    const { cx, leader, host } = await openLeader({ layout: personal("board"), history: { current: "board", previous } });
    await pressBound(leader, cx, "tab");
    assert.deepEqual(host.runs, [SHOW_MAIN, ["pane.focus", { pane: previous }]], previous);
    assert.deepEqual(host.notes, [], previous);
    assert.deepEqual(host.closed, ["mod-leader"], previous);
  }
});

test("Tab to the board shows the board layer's board and gives it the keyboard as b does, from a pane or a layout terminal block", async () => {
  for (const [what, focusedPane, history] of [
    ["a pane", "p1", { current: "p1", previous: "board" }],
    ["a layout terminal block", null, { current: "board", previous: "p1" }],
  ]) {
    const { cx, leader, host } = await openLeader({ layout: personal("main"), focusedPane, history });
    await pressBound(leader, cx, "tab");
    assert.deepEqual(host.runs, SHOW_BOARD, what);
    assert.deepEqual(host.notes, [], what);
  }
});

test("Tab with a history that has not recorded the board's place, shown or gone, says so and goes nowhere", async () => {
  for (const [active, history, body, board] of [
    ["board", { current: "p1", previous: "p2" }, "It has not recorded the board"],
    ["layer-b", { current: "p1", previous: "p2" }, "It has not recorded the board", "layer-b"],
    ["main", { current: "board", previous: "p1" }, "It has not recorded the focused pane"],
  ]) {
    const { cx, leader, host } = await openLeader({ layout: personal(active, board), history });
    await pressBound(leader, cx, "tab");
    assert.deepEqual(host.runs, [], active);
    assert.deepEqual(host.notes.map((n) => [n.title, n.body, n.level]), [[NOT_RECORDING, body, "info"]], active);
  }
});

test("Tab from a layout terminal block with no focus history at all in a layout without a board layer says there is no previous pane", async () => {
  const { cx, leader, host } = await openLeader({ focusedPane: null, history: null });
  await pressBound(leader, cx, "tab");
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
});

// Every string an element and the elements under it were given.
const textsOf = (el) =>
  el.calls.flatMap((c) => c.slice(1)).flatMap((a) => (Array.isArray(a) ? a : [a])).flatMap((a) => (typeof a === "string" ? [a] : Array.isArray(a?.calls) ? textsOf(a) : []));

test("the key list names Tab's action last place, since it goes to the board too", async () => {
  const { leader, cx } = await openLeader();
  leader.expanded = true;
  const texts = textsOf(leader.render(cx));
  assert.ok(texts.includes("last place"), texts.join(" | "));
  assert.ok(!texts.includes("last pane"));
});

test("Tab to the board in a layout without a board layer says there is no previous pane", async () => {
  const { cx, leader, host } = await openLeader({ history: { current: "p1", previous: "board" } });
  await pressBound(leader, cx, "tab");
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
});

// A fake herdr in the personal layout whose pane.focus and layout.select
// change what focused() and layout() say. focus-history renders once after
// each change and after each Tab, not after each command a handler runs, as
// herdr refreshes at the next draw. `world` holds the focused pane and what
// the work-stack shows; change(fn) changes it as the person or another mod
// would.
function personalWorld(board = "board") {
  const world = { pane: "p1", active: "main" };
  const host = fakeHost({ history: null });
  host.focused = () => ({ pane: world.pane, terminal: "t1", shown: null });
  host.layout = () => personal(world.active, board);
  globalThis.__leaderHost = host;
  const history = new historyModule.default();
  const record = host.run;
  host.run = (name, args) => {
    record(name, args);
    if (name === "pane.focus") world.pane = args.pane;
    if (name === "layout.select" && args.stack === "work-stack") world.active = args.child;
  };
  const change = (fn) => {
    fn(world);
    history.render();
  };
  const tab = async () => {
    const { leader, cx } = await openLeader({ host });
    await pressBound(leader, cx, "tab");
    history.render();
    assert.deepEqual(host.notes, []);
  };
  history.render();
  return { world, host, change, tab, recorded: () => host.shared("focus.history") };
}

test("focus-history records the board as a place while it shows: the pane under it before it, and the board before the pane shown again", () => {
  const { change, recorded } = personalWorld();
  assert.deepEqual(recorded(), { current: "p1", previous: null });
  change((w) => (w.pane = "p2"));
  assert.deepEqual(recorded(), { current: "p2", previous: "p1" });
  change((w) => (w.active = "board"));
  assert.deepEqual(recorded(), { current: "board", previous: "p2" });
  change((w) => (w.active = "main"));
  assert.deepEqual(recorded(), { current: "p2", previous: "board" });
  // A focus change that brings the tab's content back to another pane.
  change((w) => (w.active = "board"));
  change((w) => ((w.active = "main"), (w.pane = "p1")));
  assert.deepEqual(recorded(), { current: "p1", previous: "board" });
});

test("focus-history in a layout without a board layer records the focused pane alone", () => {
  const host = fakeHost({ history: null, layout: historyLayout() });
  let pane = "p1";
  host.focused = () => ({ pane, terminal: "t1", shown: null });
  globalThis.__leaderHost = host;
  const history = new historyModule.default();
  history.render();
  pane = "p2";
  history.render();
  assert.deepEqual(host.shared("focus.history"), { current: "p2", previous: "p1" });
  pane = null;
  history.render();
  assert.deepEqual(host.shared("focus.history"), { current: "p2", previous: "p1" }, "a layout terminal block is not recorded");
});

test("pane A, pane B, the board: Tab goes to B with the board hidden, Tab again to the board, and back and forth, whatever the board child's id", async () => {
  for (const board of ["board", "layer-b"]) {
    const { world, host, change, tab, recorded } = personalWorld(board);
    change((w) => (w.pane = "p2"));
    change((w) => (w.active = board));
    await tab();
    assert.deepEqual([world.active, world.pane], ["main", "p2"], board);
    assert.deepEqual(recorded(), { current: "p2", previous: board }, board);
    await tab();
    assert.deepEqual([world.active, world.pane], [board, "p2"], board);
    assert.deepEqual(host.runs.slice(-2), [["layout.select", { stack: "work-stack", child: board }], ["board.focus", undefined]], board);
    await tab();
    assert.deepEqual([world.active, world.pane], ["main", "p2"], board);
  }
});

test("the board, then a press in pane A that brings the tab's content back: Tab goes to the board, Tab again to A", async () => {
  const { world, change, tab } = personalWorld();
  change((w) => (w.pane = "p2"));
  change((w) => (w.active = "board"));
  change((w) => ((w.active = "main"), (w.pane = "p1")));
  await tab();
  assert.deepEqual([world.active, world.pane], ["board", "p1"]);
  await tab();
  assert.deepEqual([world.active, world.pane], ["main", "p1"]);
});
