// The settings page's topic "Repos auf diesem Rechner": the repo folders,
// the exceptions, and the repos the folders hold, as the start dialog finds
// them.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { andJoined, foldedName, isText, repoShortName, report } from "../../shared.js";
import { repoExceptions, repoFoldersProblems, trimFolder } from "../../config.js";
import { ORIGIN } from "../../settings.js";
import { SOURCES, sourceName } from "../../contexts.js";
import { parseRepos, reposScan, sameKeyGroups, withExceptions } from "../../actions/start.js";
import { LOADING, chip, gitMissingNote, missingNote, remotesNote, reposUnreadable, sameKeyNote, unreadableNote } from "../helpers.js";
import {
  WHOLE, baseAt, block, dropGoneDialog, goneFromList, knobRow, line, wholeListChange, mono12, movedIn, muted, openChoice, openEdit, originOf, refuse, replacedAt, settingsOf,
  textEdit, title, withoutAt, write, writeWholeList,
} from "./knobs.js";

const FOLDERS = ["repoFolders"];

const NO_TAB = "der Startdialog bietet sie an, kein Tab zeigt ihre Issues oder PRs";

const repoCount = (n) => `${n} ${n === 1 ? "Repo" : "Repos"}`;

export function reposNote(b) {
  const folders = b.config.repoFolders;
  if (!folders.length) return "kein Ordner";
  const scan = settingsOf(b)?.scan;
  if (scan?.state === "error") return `${folders.length} Ordner · nicht lesbar`;
  const missing = scan?.state === "ready" ? scan.found.missing.length : 0;
  return `${folders.length} Ordner${missing ? ` · ${missing} ${missing === 1 ? "fehlt" : "fehlen"} hier` : ""}`;
}

export function scanFolders(b, cx) {
  const folders = [...b.config.repoFolders];
  const scan = { state: "loading", folders, found: null, error: null };
  settingsOf(b).scan = scan;
  if (!folders.length) return void Object.assign(scan, { state: "ready", found: parseRepos("", []) });
  cx.spawn(async (cx) => {
    try {
      Object.assign(scan, { state: "ready", found: await reposScan(folders, null, null) });
    } catch (e) {
      Object.assign(scan, { state: "error", error: reposUnreadable(report(e), null) });
    }
    dropGoneDialog(b, cx);
    cx.notify();
  });
}

const rescan = (b, cx) => settingsOf(b) && scanFolders(b, cx);

// The folder a repo found by a scan (parseRepos) lies in, as views.json
// writes it.
const folderHolding = (written) => written.slice(0, written.lastIndexOf("/"));

// How many repo folders a scan found under each of `folders`.
export function foundIn(repos, folders) {
  const written = new Set(repos.filter((r) => r.folder !== null).map((r) => r.written));
  return new Map(folders.map((f) => [f, [...written].filter((w) => folderHolding(w) === f).length]));
}

// The repos a scan found (and the exceptions: withExceptions), by what they
// belong to: a context of `contexts` (a GitHub one by its owner, an Azure
// one by its project, of the repo's source where its remote names one), then
// those of no context with an owner or a project, by source (`other`: [{
// source, repos }], GitHub's, Azure's, then those of none known), those of
// another host by host (`hosts`: [{ host, repos }], each key without its
// host), and those without a remote, by their folder's name (`bare`).
export function foundByContext(repos, contexts) {
  const own = contexts.map((c) => ({ context: c, repos: [] }));
  const other = new Map();
  const hosts = new Map();
  const bare = [];
  const add = (map, key, r) => map.set(key, [...(map.get(key) ?? []), r]);
  for (const r of repos) {
    const [first, ...rest] = r.key.split("/");
    const mine = own.find((o) => (!r.source || o.context.source === r.source) && foldedName(o.context.name) === foldedName(first));
    if (!rest.length) bare.push(r);
    else if (mine) mine.repos.push(r);
    else if (!r.source && first.includes(".")) add(hosts, first, { ...r, key: rest.join("/") });
    else add(other, r.source ?? null, r);
  }
  const sources = [...SOURCES.map((s) => s.id), null].filter((s) => other.has(s));
  return { own, other: sources.map((source) => ({ source, repos: other.get(source) })), hosts: [...hosts].map(([host, list]) => ({ host, repos: list })), bare };
}

// What the folders of `repos` hold besides them among `list`, per folder.
export function alsoCarried(list, repos) {
  const folders = new Map();
  for (const o of list) {
    if (o.folder === null || repos.includes(o) || !repos.some((r) => r.folder === o.folder)) continue;
    folders.set(o.written, [...(folders.get(o.written) ?? []), o.key]);
  }
  return [...folders].map(([written, keys]) => `${written} trägt auch ${andJoined(keys)}`);
}

// A found repo's chip: `name`, then its folder where the folder is named
// otherwise, or that its key is a folder's upstream.
function chipText(r, name) {
  const mark = r.upstream ? `upstream von ${r.written}` : r.written.split("/").pop() !== repoShortName(r.key) ? r.written : null;
  return mark ? `${name} · ${mark}` : name;
}

const foundChips = (t, mono, texts) => h_flex().flex_wrap().gap_x(6).gap_y(4).children(texts.map((text) => chip(t, text).font_family(mono)));

function folderKnobs(b) {
  const shown = b.config.repoFolders;
  const scan = settingsOf(b).scan;
  const ready = scan?.state === "ready";
  const count = ready && JSON.stringify(scan.folders) === JSON.stringify(shown) ? foundIn(scan.found.repos, shown) : null;
  const change = (b, id, edit, cx) => writeWholeList(b, id, FOLDERS, repoFoldersProblems, edit, cx, rescan);
  return shown.map((folder, i) => {
    const knob = { id: `folder:${folder}`, name: folder, path: FOLDERS, after: rescan };
    const missing = ready && scan.found.missing.includes(folder);
    const unreadable = ready && scan.found.unreadable.includes(folder);
    knob.warn = missing ? [missingNote(folder, null)] : unreadable ? [unreadableNote(folder, null)] : [];
    knob.loading = scan?.state === "loading";
    const n = count?.get(folder);
    knob.value = (t) => (missing || unreadable || !count ? div() : muted(t, `${n} ${n === 1 ? "Git-Repo" : "Git-Repos"}`));
    knob.was = originOf(b, knob) === ORIGIN.machine ? "x nimmt ihn heraus · u setzt die Liste auf views.json zurück" : `x nimmt ihn für diesen Rechner heraus; ${WHOLE}`;
    knob.wasMarked = true;
    knob.enter = {
      name: "Ändern…",
      hint: "ändern",
      run: (b, cx) => openEdit(b, knob, [{ id: "value", value: folder }], (b, texts) => {
        const proposal = wholeListChange(b, FOLDERS, repoFoldersProblems, (list) => {
          const at = list.findIndex((f) => isText(f) && trimFolder(f) === folder);
          return at < 0 ? null : replacedAt(list, at, texts.value.trim());
        });
        return proposal ? { ...proposal, after: rescan } : { refused: [goneFromList(folder)] };
      }, cx),
    };
    knob.remove = { name: "Ordner entfernen", run: (b, cx) => change(b, knob.id, (list) => withoutAt(list, i), cx) };
    knob.move = { can: (by) => Boolean(movedIn(shown, i, by)), run: (b, by, cx) => change(b, knob.id, (list) => movedIn(list, i, by), cx) };
    return knobRow(knob);
  });
}

function addFolder() {
  const add = { id: "add-folder", text: "Ordner hinzufügen" };
  add.run = (b, cx) => {
    const now = wholeListChange(b, FOLDERS, repoFoldersProblems, (list) => list);
    if (now?.refused) return refuse(b, add.id, now.refused, cx);
    openEdit(b, { id: add.id }, [{ id: "value", placeholder: "Ordner, etwa ~/Repos" }], (b, texts) => ({ ...wholeListChange(b, FOLDERS, repoFoldersProblems, (list) => [...list, texts.value.trim()]), after: rescan }), cx);
  };
  return add;
}

// The repos with a folder of their own, and those this machine takes one
// from (null), which u gives back.
function exceptionRows(b) {
  const own = (key, entry) => isText(entry.checkout) || (entry.checkout === null && b.origin(["repos", key, "checkout"]) === ORIGIN.machine);
  return Object.entries(b.config.repos).filter(([key, entry]) => own(key, entry)).map(([key, entry]) => {
    const path = ["repos", key, "checkout"];
    const knob = { id: `exception-${key}`, name: key, key: "checkout", path, mono: true };
    knob.value = (t, mono) => (entry.checkout === null ? muted(t, "auf diesem Rechner keine") : mono12(mono, entry.checkout, t.foreground));
    knob.enter = textEdit(knob, path, { value: entry.checkout ?? "" });
    knob.remove = { name: "Ausnahme entfernen", run: (b, cx) => write(b, knob.id, [[path, baseAt(b, path) === undefined ? undefined : null]], cx) };
    return knobRow(knob);
  });
}

function addException() {
  const add = { id: "add-exception", text: "Ausnahme hinzufügen … (Repo, dann sein Ordner)" };
  add.run = (b, cx) => openEdit(b, { id: add.id }, [{ id: "value", placeholder: "Repo mit Besitzer, etwa owner/repo" }], (_b, texts) => {
    const key = texts.value.trim();
    if (!key.includes("/")) return { refused: ["ein Repo mit Besitzer, etwa owner/repo"] };
    const folder = { id: "value", placeholder: `Ordner von ${key}, etwa ~/Repos/${repoShortName(key)}` };
    return { next: (b, cx) => openEdit(b, { id: add.id }, [folder], (_b, more) => ({ changes: [[["repos", key, "checkout"], more.value.trim()]] }), cx) };
  }, cx);
  return add;
}

function foundRows(b) {
  const scan = settingsOf(b).scan;
  if (!scan || scan.state === "loading") return block(title("GEFUNDEN"), [line(LOADING, "muted", true)]);
  if (scan.state === "error") return block(title("GEFUNDEN"), [line(scan.error, "error")]);
  const { found } = scan;
  const list = withExceptions(found.repos, repoExceptions(b.config));
  const contexts = b.contexts();
  const { own, other, hosts, bare } = foundByContext(list, contexts);
  const folders = new Set(found.repos.map((r) => r.written)).size;
  const foundRow = (id, name, d, texts, was) => knobRow({ id, name, d, origin: "", nav: false, top: true, value: (t, mono) => foundChips(t, mono, texts), was });
  const rows = own.map(({ context, repos }) => (repos.length
    ? foundRow(`found-${context.id}`, context.name, sourceName(context.source), repos.map((r) => chipText(r, repoShortName(r.key))),
      [`Kontext ${contexts.indexOf(context) + 1}`, repoCount(repos.length), ...alsoCarried(list, repos)].join(" · "))
    : knobRow({ id: `found-${context.id}`, name: context.name, d: sourceName(context.source), origin: "", nav: false, value: (t) => muted(t, "keins auf diesem Rechner") })));
  for (const { source, repos } of other) {
    rows.push(foundRow(`found-other${source ? `-${source}` : ""}`, "ohne Kontext", sourceName(source), repos.map((r) => chipText(r, r.key)),
      `${repoCount(repos.length)} · ${NO_TAB}`));
  }
  for (const { host, repos } of hosts) rows.push(foundRow(`found-${host}`, "ohne Kontext", host, repos.map((r) => chipText(r, r.key)), `${repoCount(repos.length)} · ${NO_TAB}`));
  if (bare.length) rows.push(foundRow("found-bare", "ohne Remote", undefined, bare.map((r) => chipText(r, r.key)), "nur über die Namen ihrer Ordner"));
  for (const group of sameKeyGroups(list)) {
    const key = group[0].key;
    const knob = {
      id: `same-${key}`, name: "doppelt", origin: "", top: true, field: `setting-same-${key}`,
      value: (t, mono) => foundChips(t, mono, group.map((r) => `${r.key} · ${r.written}`)),
      warn: [sameKeyNote(group, null)], was: "a legt eine Ausnahme an: das Repo bekommt seinen Ordner fest zugewiesen",
    };
    knob.add = {
      id: knob.id,
      text: "Ausnahme anlegen",
      run: (b, cx) => openChoice(b, { id: knob.id, name: key }, knob.field, {
        entries: () => group.map((r) => ({ id: r.written, name: r.written })),
        current: () => group[0].written,
        value: () => "",
        take: (b, row, cx) => write(b, knob.id, [[["repos", key, "checkout"], row.id]], cx),
        placeholder: `Ordner von ${key}`,
      }, cx),
    };
    rows.push(knobRow(knob));
  }
  const notes = found.gitMissing ? [gitMissingNote(null)] : found.remotesUnread.length ? [remotesNote(found.remotesUnread, null)] : [];
  return block(title(`GEFUNDEN · ${folders} Ordner, ${repoCount(list.length)}, nach Kontext`), [...rows, ...notes.map((n) => line(n, "warning"))]);
}

export function reposRows(b) {
  const head = { row: "head", path: "Repos auf diesem Rechner", title: "Repos auf diesem Rechner", small: "für alle Plattformen: wo der Startdialog ein Repo findet · gesucht wird eine Ebene unter jedem Ordner, zugeordnet über origin und upstream" };
  const exceptions = exceptionRows(b);
  return [
    head,
    ...block(title(`ORDNER · ${b.config.repoFolders.length}`, "repoFolders"), folderKnobs(b), addFolder()),
    ...block(title("AUSNAHMEN · ein Repo mit eigenem Ordner", "repos.<Besitzer/Repo>.checkout"), exceptions.length ? exceptions : [line("keine: jedes Repo startet in seinem Ordner unter den Ordnern oben")], addException()),
    ...foundRows(b),
  ];
}
