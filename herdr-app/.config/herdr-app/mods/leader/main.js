// A tmux-style prefix key. keys.json binds ctrl-space to "mod.open:leader";
// the next key runs one action. At first only a small badge shows that the
// prefix is active; the full list of keys appears after HINT_MS, like
// which-key in nvim, so a known key never shows it. Movement keys repeat like
// tmux's `bind -r`: the overlay stays open for the same kind of key until
// another key, Esc or a short pause ends it. A key that ends the repeat is
// dropped, not passed to the terminal. A key can open a second level of keys,
// like a which-key group in nvim; it closes the same way, and shows its list
// at once when the first level's list is already up.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, shared, panes, notify, layout } from "herdr";

const HINT_MS = 1000;
const REPEAT_MS = 700;
// The personal layout's right panel and the stack of its Files and Changes.
const PANEL = "panel";
const PANEL_BODY = "panel-body";

// Focuses the pane focus-history saw before the current one; pane.focus also
// shows its space and tab, so focus changes once. Pressed again (ctrl-space
// Tab), it jumps back. With no previous pane, or one that is gone, it shows
// "No previous pane".
function focusPrevious() {
  const pane = shared("focus.history")?.previous;
  if (pane && panes().some((p) => p.pane === pane)) run("pane.focus", { pane });
  else notify({ title: "No previous pane", level: "info" });
}

// Opens the file popup at the top, where herdr's terminals-bar opens the
// picker; mode is "files" or "changes".
function openFilePopup(mode) {
  openOverlay({ mod: "file-popup", kind: "popup", at: "top", offset: 40, width: 720, height: 0.8, props: { mode } });
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

  close() {
    closeOverlay(props().overlay);
  }

  press(e, cx) {
    if (e.key === "escape") return this.close();
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
    const title = this.repeating ? `${name} (repeat)` : name;
    const root = h_flex()
      .id("leader")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        this.press(e, cx);
        cx.stop_propagation();
      })
      .w_full()
      .justify_center();
    if (!this.expanded) {
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
        .child(div().w(26).font_semibold().text_color(t.accent).child(key))
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
