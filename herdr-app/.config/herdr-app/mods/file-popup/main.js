// A popup listing files of the focused pane's place, opened by the leader
// with openOverlay and props { mode }: "files" lists the repo's files, or the
// folder's outside a repo; "changes" lists the repo's changed files, each
// marked staged, unstaged (both when it has both), untracked or conflict,
// with git's letter (M modified, A added, D deleted, T type changed). Typing
// filters (case-insensitive substring, as the picker does), up/down or
// ctrl-j/ctrl-k move, Enter or a click opens the file in nvim in a new pane
// right of the focused one, on the same machine, and Esc closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, run, notify, theme, props, closeOverlay, checking } from "herdr";

// One file on purpose: README, "herdr app", says why a mod here is one main.js.

// The two lists, both run on the space's machine (`on`, null: this
// computer) as in the shipped files and changes mods, and cut after `limit`
// files. Each returns { root, repo, files: [{ path, kinds }], limited, note }:
// `root` is null outside a git repo for "changes", `path` is relative to
// `root`, `kinds` marks a change, `limited` says the list was cut, `note` is
// the first line of what a lister printed to stderr when it failed after
// listing some files.

const BYTES = 4 * 1024 * 1024;
// Reads write nothing under .git (no index refresh or lock, no fsmonitor
// cookie), as in the shipped changes mod.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false"];
// Runs the command after the byte count and cuts its output there. sh has no
// pipefail, so the command's own status comes back through fd 3; 141 is the
// SIGPIPE head gives it when it cuts the output, which is no failure.
const BOUNDED = 'n=$1; shift; exec 4>&1; s=$( { { "$@"; echo $? >&3; } | head -c "$n" >&4; } 3>&1 ); [ "$s" = 0 ] || [ "$s" = 141 ] || exit "$s"';
const FIND = ["find", ".", "-mindepth", "1", "(", "-type", "d", "(", "-name", ".*", "-o", "-name", "node_modules", ")", "-prune", ")",
  "-o", "(", "-type", "f", "-o", "-type", "l", ")", "-print0"];

const firstLine = (text) => text.trim().split("\n")[0];
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// The repo's top folder, or null outside a repo. git's messages follow the
// locale, so it runs under LC_ALL=C to tell "not a git repository" from a
// real failure, which throws with git's own message. Without git (env's 127)
// it throws too, unless `noGit` says what to return instead.
async function repoRoot(cwd, on, noGit) {
  const r = await exec("env", ["LC_ALL=C", "git", "rev-parse", "--show-toplevel"], { cwd, on });
  if (r.code === 0) return r.stdout.trim();
  if (r.code === 128 && r.stderr.includes("not a git repository")) return null;
  if (r.code === 127 && noGit !== undefined) return noGit;
  throw new Error(firstLine(r.stderr) || `git rev-parse failed with ${r.code}`);
}

// NUL-separated paths from a BOUNDED command: a last entry without its NUL
// was cut off by head.
async function bounded(argv, cwd, on, limit, strip = "") {
  const r = await exec("sh", ["-c", BOUNDED, "file-popup", String(BYTES), ...argv], { cwd, on, timeout: 15000 });
  const parts = r.stdout.split("\0");
  const cut = parts.pop() !== "";
  if (r.code !== 0 && !parts.length) throw new Error(firstLine(r.stderr) || `${argv[0]} failed with ${r.code}`);
  const paths = [...new Set(parts.filter(Boolean).map((p) => (p.startsWith(strip) ? p.slice(strip.length) : p)))];
  const files = paths.map((path) => ({ path, kinds: [] })).sort(byPath);
  return { files: files.slice(0, limit), limited: cut || files.length > limit, note: r.code !== 0 ? firstLine(r.stderr) : null };
}

// In a git repo the whole repo, tracked and untracked files without the
// ignored ones, from its top folder; elsewhere the folder and its subfolders
// without hidden folders and node_modules.
async function listFiles(cwd, on, limit) {
  const root = await repoRoot(cwd, on, null);
  if (root) return { root, repo: true, ...(await bounded(["git", ...READ, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], root, on, limit)) };
  return { root: cwd, repo: false, ...(await bounded(FIND, cwd, on, limit, "./")) };
}

// One `git status --porcelain=v1` entry's XY as the kinds the list shows.
function kinds(xy) {
  if (xy === "??") return [{ kind: "untracked" }];
  if (xy.includes("U") || xy === "AA" || xy === "DD") return [{ kind: "conflict" }];
  const out = [];
  if (xy[0] !== " ") out.push({ kind: "staged", code: xy[0] });
  if (xy[1] !== " ") out.push({ kind: "unstaged", code: xy[1] });
  return out;
}

// The repo's staged, unstaged and untracked files, in git's order.
async function listChanges(cwd, on, limit) {
  const root = await repoRoot(cwd, on);
  if (!root) return { root: null, repo: false, files: [], limited: false, note: null };
  const r = await exec("git", [...READ, "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd: root, on });
  if (r.code !== 0) throw new Error(firstLine(r.stderr) || `git status failed with ${r.code}`);
  const entries = r.stdout.split("\0").filter(Boolean);
  const files = entries.slice(0, limit).map((entry) => ({ path: entry.slice(3), kinds: kinds(entry.slice(0, 2)) }));
  return { root, repo: true, files, limited: entries.length > limit, note: null };
}

const ROW = 28;
const VISIBLE = 12;
// Everything that differs between the two modes; props().mode picks one.
const MODES = {
  files: {
    title: "Find file", placeholder: "Find a file…", loading: "Loading files…", empty: "No files",
    noun: "files", repoMark: " · git", limit: 20000, list: listFiles,
  },
  changes: {
    title: "Changed files", placeholder: "Filter changed files…", loading: "Loading changes…", empty: "No changes",
    noun: "changed files", repoMark: "", limit: 1000, list: listChanges,
  },
};

// Where the focused pane is, taken as the shipped files and changes mods take
// it: its live folder and its space's machine (null: this computer).
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, pane: f?.pane ?? null };
}

export default class FilePopup extends View {
  init(_props, cx) {
    const asked = props()?.mode;
    this.mode = Object.hasOwn(MODES, asked ?? "") ? asked : "files";
    const mode = MODES[this.mode];
    this.handle = cx.focus_handle();
    this.files = [];
    this.shown = [];
    this.filter = "";
    this.at = 0;
    this.top = 0;
    this.wheel = 0;
    this.loading = true;
    this.error = null;
    this.target = location();
    this.input = InputState.new({ placeholder: mode.placeholder });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.apply();
      cx.notify();
    });
    this.input.on("submit", () => this.open(this.shown[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    if (checking()) return;
    const { cwd, on } = this.target;
    if (!cwd) {
      this.loading = false;
      this.error = "No folder";
      return;
    }
    cx.spawn(async (cx) => {
      try {
        Object.assign(this, await mode.list(cwd, on, mode.limit));
        this.apply();
      } catch (e) {
        this.error = String(e?.message ?? e);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  apply() {
    const f = this.filter.toLowerCase();
    this.shown = f ? this.files.filter((file) => file.path.toLowerCase().includes(f)) : this.files;
    this.at = 0;
    this.top = 0;
  }

  move(by) {
    if (!this.shown.length) return;
    this.at = (this.at + by + this.shown.length) % this.shown.length;
  }

  open(file) {
    if (!file) return;
    this.close();
    const { pane } = this.target;
    if (!pane || !panes().some((p) => p.pane === pane)) {
      notify({ title: "No pane to open the file beside", level: "warning" });
      return;
    }
    run("pane.split", { direction: "right", pane, argv: ["nvim", `${this.root}/${file.path}`] });
  }

  footer() {
    if (this.loading || this.error || !this.root) return "";
    const { noun, repoMark } = MODES[this.mode];
    return `${this.shown.length} of ${this.files.length} ${noun}${this.repo ? repoMark : ""}`;
  }

  render() {
    const t = theme();
    const mode = MODES[this.mode];
    const count = this.shown.length;
    if (this.at < this.top) this.top = this.at;
    if (this.at >= this.top + VISIBLE) this.top = this.at - VISIBLE + 1;
    this.top = Math.max(0, Math.min(this.top, count - VISIBLE));
    const where = [this.target.on, this.root?.split("/").pop()].filter(Boolean).join(": ");
    const message =
      this.error ||
      (this.loading ? mode.loading : !this.root ? "Not a git repository" : !this.files.length ? mode.empty : !count ? "No file matches" : null);
    const color = { staged: t.ansi2, unstaged: t.ansi3, untracked: t.ansi4, conflict: t.ansi1 };

    const row = (file, i) => {
      const slash = file.path.lastIndexOf("/");
      return h_flex()
        .id(`fp-${file.path}`)
        .h(ROW)
        .flex_none()
        .px(10)
        .gap(8)
        .items_center()
        .rounded(7)
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click(() => this.open(file))
        .child(
          h_flex()
            .flex_1()
            .min_w(0)
            .child(div().min_w(0).truncate().text_color(t.dim).child(slash >= 0 ? file.path.slice(0, slash + 1) : ""))
            .child(div().flex_none().text_color(t.foreground).child(file.path.slice(slash + 1))),
        )
        .children(
          file.kinds.map(({ kind, code }) =>
            div().flex_none().text_size(11).text_color(color[kind]).child(code ? `${kind} ${code}` : kind),
          ),
        );
    };

    return v_flex()
      .id("file-popup")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key, ctrl = e.modifiers?.control;
        if (k === "escape") return this.close();
        if (k === "down" || (ctrl && k === "j")) this.move(1);
        else if (k === "up" || (ctrl && k === "k")) this.move(-1);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .items_center()
          .gap(8)
          .child(div().text_size(15).font_semibold().text_color(t.foreground).child(mode.title))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(where))
          .child(div().id("fp-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")),
      )
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("fp-list")
          .h(ROW * VISIBLE)
          .flex_none()
          .overflow_hidden()
          .on_scroll_wheel((e, cx) => {
            this.wheel -= e.delta.y;
            const steps = Math.trunc(this.wheel / ROW);
            if (!steps) return;
            this.wheel -= steps * ROW;
            this.top = Math.max(0, Math.min(this.top + steps, count - VISIBLE));
            // The selection follows the wheel, so the next frame doesn't scroll back to it.
            this.at = Math.max(this.top, Math.min(this.at, this.top + VISIBLE - 1, count - 1));
            cx.notify();
          })
          .when(Boolean(message), (el) => el.child(div().p(10).text_color(this.error ? t.ansi1 : t.dim).child(message)))
          .children(this.shown.slice(this.top, this.top + VISIBLE).map((f, i) => row(f, this.top + i))),
      )
      .child(
        h_flex()
          .gap(8)
          .text_size(11)
          .text_color(t.dim)
          .child(div().child(this.footer()))
          .when(Boolean(this.limited), (el) => el.child(div().child(`· list stops at ${mode.limit.toLocaleString("en")} files`)))
          .when(Boolean(this.note), (el) => el.child(div().min_w(0).truncate().text_color(t.ansi3).child(`· ${this.note}`))),
      );
  }
}
