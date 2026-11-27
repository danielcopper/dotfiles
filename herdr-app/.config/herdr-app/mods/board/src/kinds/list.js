// A GitHub PR or Issues tab's repos: whose they are (repoOwnership), the
// ones this machine turns off (hideRepos, whose rows do not show), rows
// grouped by repo, and the switches of the repo menu.

import { foldedName } from "../shared.js";
import { sameNames } from "./board.js";

// Whose the repo `repo` ("owner/repo") is, for a tab of the context whose
// owner is owners.tabOwner: "own"; "other" where its owner is another
// context the board reads with a PR tab (owners.otherOwners), whose PR tab
// its pull requests show in; else "foreign". The owners come folded
// (readGithub).
export function repoOwnership(repo, owners) {
  const owner = foldedName(repo.split("/")[0]);
  if (owner === owners.tabOwner) return "own";
  return owners.otherOwners.includes(owner) ? "other" : "foreign";
}

export const hidesRepo = (data, repo) => (data.hideRepos ?? []).some((r) => foldedName(r) === foldedName(repo));

export const keptRows = (data, section) => section.rows.filter((r) => !hidesRepo(data, r.repo));

// The data as the view's repos turned off show it now; the same data where
// they are those it has.
export const withRepoView = (data, view) => (sameNames(data.hideRepos ?? [], view.hideRepos) ? data : { ...data, hideRepos: [...view.hideRepos] });

export const toggledRepos = (list, repo) =>
  (list.some((r) => foldedName(r) === foldedName(repo)) ? list.filter((r) => foldedName(r) !== foldedName(repo)) : [...list, repo]);

export function repoLook(data, repo) {
  const ownership = repoOwnership(repo, data.owners);
  return { repo, name: ownership === "own" ? repo.split("/").pop() : repo, foreign: ownership === "foreign" };
}

// A section's rows `rows` (those of repos turned on) that `visible` lets
// through, grouped by repo, each group where its first such row stands: {
// repo, name, foreign, rows, held (its rows among `rows`), headed }. A
// group has its repo row (headed) where the section shows more than one
// group, and a foreign one always.
export function repoGroups(data, rows, visible) {
  const groups = new Map();
  const held = new Map();
  for (const r of rows) {
    const key = foldedName(r.repo);
    held.set(key, (held.get(key) ?? 0) + 1);
    if (!visible(r)) continue;
    if (!groups.has(key)) groups.set(key, { ...repoLook(data, r.repo), rows: [] });
    groups.get(key).rows.push(r);
  }
  const all = [...groups.entries()];
  return all.map(([key, g]) => ({ ...g, held: held.get(key), headed: all.length > 1 || g.foreign }));
}

// The switches of the repos of `rows` by folded name, each where its first
// row stands, with how many of them it holds (held) and `visible` lets
// through (shown); `add` adds a repo's switch after them where it has none,
// `fields` over its counts.
export function countedSwitches(data, rows, visible) {
  const switches = new Map();
  const add = (repo, fields = {}) => {
    const key = foldedName(repo);
    if (!switches.has(key)) switches.set(key, { ...repoLook(data, repo), hidden: hidesRepo(data, repo), held: 0, shown: 0, ...fields });
    return switches.get(key);
  };
  for (const r of rows) {
    const entry = add(r.repo);
    entry.held++;
    if (visible(r)) entry.shown++;
  }
  return { switches, add };
}

// The repos of the tab's switches: those with pull requests in it, the tab
// owner's before foreign ones, each in the order their first row stands,
// then those turned off that hold none, in their order: { repo, name,
// foreign, hidden, held (its pull requests), shown (those `visible` lets
// through) }.
export function repoSwitches(data, visible) {
  const { switches, add } = countedSwitches(data, data.sections.flatMap((s) => s.rows), visible);
  const found = [...switches.values()];
  for (const repo of data.hideRepos ?? []) add(repo);
  return [...found.filter((e) => !e.foreign), ...found.filter((e) => e.foreign), ...[...switches.values()].slice(found.length)];
}
