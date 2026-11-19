// Tests for the herdr leader mod (herdr-app/.config/herdr-app/mods/leader/main.js):
// how Tab, shift-Tab and Esc reach it, driven through the Leader class with a fake
// herdr. Run with `mise run herdr-leader-test` (README, "herdr app"), or from
// the repo root with `node --test tests/herdr-app/leader.test.mjs`.
//
// The mod imports "gpui-kit", "gpui-base" and "herdr", which only herdr
// provides. A resolve/load hook hands node a stand-in for each that exports
// every name the mod imports: View as an empty class, everything else as a
// function that calls the fake host a test puts in globalThis.__leaderHost,
// and throws when there is none. Elements (div, h_flex, v_flex) record the
// builder calls made on them, so a test can find the handlers render
// registered. LEADER_MAIN points the tests at another copy of main.js (to see
// a test fail against a broken one).
//
// These tests check what the leader binds and what its handlers and its
// on_key_down then do. That the leader's bindings come before herdr's own
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
const keysPath = resolve(here, "../../herdr-app/.config/herdr-app/keys.json");
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

// The fake herdr: two panes, p1 focused after p2; a tmux with prefix C-Space
// on terminal t1, none of whose keys repeat. `leaderState` is what
// focus-history left in shared("leader.state") before the leader started;
// host.command(name) hands the leader a key command (leader.<name>).
// `failRun`: a command run throws for, as a broken app command would.
function fakeHost({ previous = "p2", leaderState = null, failRun = null } = {}) {
  const shared = new Map([["focus.history", { current: "p1", previous }], ["leader.state", leaderState]]);
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
    focused: () => ({ pane: "p1", terminal: "t1", shown: null }),
    theme: () => ({}),
    layout: () => null,
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

async function openLeader({ bindKeys, ...options } = {}) {
  const host = fakeHost(options);
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
    const { leader, cx, host } = await openLeader({ previous: "p9" });
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

test("b shows the board in the work area, or the tab again, where the layout has the board layer, else the board's tab, and closes the leader", async () => {
  const B = { key: "b", keystroke: "b", key_char: "b", modifiers: PLAIN };
  for (const [active, runs] of [
    ["main", [["layout.select", { stack: "work-stack", child: "board" }], ["board.focus", undefined]]],
    ["board", [["layout.select", { stack: "work-stack", child: "main" }]]],
    [null, [["tab.new", { name: "Board", mod: "board" }]]],
  ]) {
    const { leader, cx, host } = await openLeader();
    const stack = { id: "work-stack", type: "stack", active, children: [{ id: "main" }, { id: "board" }] };
    host.layout = () => (active ? { id: "root", type: "row", children: [{ id: "work", type: "column", children: [stack] }] } : null);
    await pressRaw(leader, cx, B);
    assert.deepEqual(host.runs, runs, `the layer showing ${active}`);
    assert.deepEqual(host.closed, ["mod-leader"]);
  }
});

test("keys.json still hands the leader a second ctrl-space and Esc", () => {
  const section = JSON.parse(readFileSync(keysPath, "utf8"))["mod:leader"];
  assert.equal(section?.["ctrl-space"], "leader.send_prefix");
  assert.equal(section?.escape, "leader.escape");
});
