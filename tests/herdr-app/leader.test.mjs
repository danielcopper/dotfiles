// Tests for the herdr leader mod (herdr-app/.config/herdr-app/mods/leader/main.js):
// how Tab and shift-Tab reach it, driven through the Leader class with a fake
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
// That herdr's own Tab binding loses to the leader's is the app's behaviour
// and is checked in the app; these tests check what the leader binds and
// what its handlers do.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modDir = resolve(here, "../../herdr-app/.config/herdr-app/mods/leader");
const mainPath = process.env.LEADER_MAIN ? resolve(process.env.LEADER_MAIN) : join(modDir, "main.js");
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
test("under mise run herdr-leader-test nothing outside the repo can be read or written", { skip: !underTask && !process.permission && "node runs without --permission" }, () => {
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
// on terminal t1, none of whose keys repeat.
function fakeHost({ previous = "p2" } = {}) {
  const shared = new Map([["focus.history", { current: "p1", previous }]]);
  const host = {
    runs: [],
    notes: [],
    closed: [],
    sent: [],
    shared: (key) => shared.get(key) ?? null,
    setShared: (key, value) => shared.set(key, value),
    run: (name, args) => host.runs.push([name, args]),
    notify: (n) => host.notes.push(n),
    props: () => ({ overlay: "mod-leader" }),
    closeOverlay: (id) => host.closed.push(id),
    checking: () => false,
    nextCommand: () => new Promise(() => {}),
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

function fakeCx() {
  const cx = {
    bound: [],
    stopped: 0,
    focus_handle: () => ({ focus() {} }),
    bind_keys: (bindings) => (cx.bound.push(...bindings), bindings.length),
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

// The bindings live in the app's keymap, which a test starts without.
beforeEach(() => {
  delete globalThis.leaderTabKeys;
});

function openLeader(options) {
  const host = fakeHost(options);
  globalThis.__leaderHost = host;
  const leader = new leaderModule.default();
  const cx = fakeCx();
  leader.init({}, cx);
  return { leader, cx, host };
}

// Runs the root's handler for the action bound to `keystroke`, as GPUI does
// when that binding matches.
async function pressBound(leader, cx, keystroke) {
  const binding = cx.bound.find((b) => b.keystroke === keystroke);
  assert.ok(binding, `no binding for ${keystroke}`);
  const handler = callsOf(leader.render(cx), "on_action").find(([action]) => action === binding.action)?.[1];
  assert.ok(handler, `the root has no handler for ${binding.action}`);
  handler({ action: binding.action }, cx);
  await settle();
}

test("the leader binds tab and shift-tab in the key context its root declares, and handles both actions", () => {
  const { leader, cx } = openLeader();
  assert.deepEqual(cx.bound.map((b) => b.keystroke), ["tab", "shift-tab"]);
  const root = leader.render(cx);
  const contexts = callsOf(root, "key_context").map(([c]) => c);
  assert.equal(contexts.length, 1);
  assert.equal(new Set(cx.bound.map((b) => b.context)).size, 1);
  assert.equal(cx.bound[0].context, contexts[0]);
  const handled = callsOf(root, "on_action").map(([action]) => action);
  for (const b of cx.bound) assert.ok(handled.includes(b.action), `no handler for ${b.action}`);
});

test("the bindings are added once, not by every leader that opens", () => {
  const { cx } = openLeader();
  const again = openLeader();
  assert.equal(cx.bound.length, 2);
  assert.equal(again.cx.bound.length, 0);
});

test("Tab through its binding focuses the previous pane and closes the leader", async () => {
  const { leader, cx, host } = openLeader();
  await pressBound(leader, cx, "tab");
  assert.deepEqual(host.runs, [["pane.focus", { pane: "p2" }]]);
  assert.deepEqual(host.closed, ["mod-leader"]);
  assert.ok(cx.stopped > 0, "the action goes no further");
});

test("Tab through its binding with the previous pane gone says so and closes the leader", async () => {
  const { leader, cx, host } = openLeader({ previous: "p9" });
  await pressBound(leader, cx, "tab");
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.notes.map((n) => n.title), ["No previous pane"]);
  assert.deepEqual(host.closed, ["mod-leader"]);
});

test("shift-Tab through its binding is no leader key: it closes the leader and runs nothing", async () => {
  const { leader, cx, host } = openLeader();
  await pressBound(leader, cx, "shift-tab");
  assert.deepEqual(host.runs, []);
  assert.deepEqual(host.closed, ["mod-leader"]);
});

test("ctrl-space ctrl-space Tab gives tmux its prefix and Tab, shift-Tab its prefix and BTab", async () => {
  for (const [keystroke, key] of [["tab", "Tab"], ["shift-tab", "BTab"]]) {
    delete globalThis.leaderTabKeys;
    const { leader, cx, host } = openLeader();
    leader.prefixAgain(cx);
    await settle();
    await pressBound(leader, cx, keystroke);
    assert.deepEqual(host.sent, [["C-Space", key]], keystroke);
    assert.deepEqual(host.runs, [], keystroke);
    assert.deepEqual(host.closed, ["mod-leader"], keystroke);
  }
});
