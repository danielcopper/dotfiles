// An Issues tab's view: its rows of the repos turned on, grouped by repo,
// the repo it shows alone (its solo repo) and the choices of its switch,
// the switches of its repo menu, whether its query left out other repos
// than it hides now, how a closed issue's row is marked, and the form its
// saved state takes.
// parseGithubIssues (sources/github.js) builds the data.

import { COPPER_HUES, foldedName, isText } from "../shared.js";
import { packRows, unpackRows } from "../loading.js";
import { sameNames } from "./board.js";
import { countedSwitches, hidesRepo, repoGroups, repoLook } from "./list.js";
import { githubRowBack, keptGithubRow } from "./rows.js";

const foldedRepos = (repos) => repos.map(foldedName);

export const keptIssues = (data) => data.rows.filter((r) => !hidesRepo(data, r.repo));

// The repos turned off as the read began that are turned on now: their
// issues come with the next read.
export const waitingRepos = (data) => data.readHidden.filter((r) => !hidesRepo(data, r));

// Whether the read that `read` names the hidden repos of (a view's, or its
// data's readHidden) leaves out other repos than `hideRepos`.
export const readsOtherRepos = (read, hideRepos) => !sameNames(foldedRepos(read), foldedRepos(hideRepos));

// The repos the solo switch offers: those turned on with issues in the
// read, in the order their first row stands, each named as that row names
// it.
export function soloRepos(data) {
  const repos = new Map();
  for (const { repo } of keptIssues(data)) if (!repos.has(foldedName(repo))) repos.set(foldedName(repo), repo);
  return [...repos.values()];
}

const soloAmong = (repos, chosen) => (chosen ? repos.find((r) => foldedName(r) === foldedName(chosen)) ?? null : null);

// The solo switch with `chosen` the solo repo: its choices, „Alle“ (id
// null), then the repos soloRepos offers, each { id, label }; the one shown
// (chosen; null: all), and the one after it, past the last all again.
export function issueSoloSwitch(data, chosen) {
  const repos = soloRepos(data);
  const ids = [null, ...repos];
  const shown = soloAmong(repos, chosen);
  return {
    choices: ids.map((id) => ({ id, label: id === null ? "Alle" : id.split("/").pop() })),
    chosen: shown,
    after: ids[(ids.indexOf(shown) + 1) % ids.length],
  };
}

// How many issues a choice of the solo switch holds and `visible` lets
// through, by its id: { held, shown }.
export function soloCounts(data, visible) {
  const rows = keptIssues(data);
  const { switches } = countedSwitches(data, rows, visible);
  const all = { held: rows.length, shown: [...switches.values()].reduce((n, s) => n + s.shown, 0) };
  return (id) => {
    const { held, shown } = id === null ? all : switches.get(foldedName(id));
    return { held, shown };
  };
}

// Where the store keeps a view's solo repo, as long as the view switch's
// choice.
export const soloKey = (id) => `soloRepo:${id}`;

// A solo repo as the store kept it: a repo's name, else none.
export const storedSolo = (kept) => (isText(kept) ? kept : null);

export const soloRepoOf = (data, chosen) => soloAmong(soloRepos(data), chosen);

const groupOf = ({ repo, name }) => ({ id: `repo:${foldedName(repo)}`, name, color: "muted" });

// The lines of the list, in its order: with a solo repo its rows that
// `visible` lets through ({ row }); else per repo with such a row, where its
// first row stands, its group line ({ group, shown, held: how many of its
// rows show and how many it holds }) and those rows, then a group line per
// waiting repo ({ group, waiting: true }).
export function issueLines(data, visible, solo) {
  const rows = keptIssues(data);
  const alone = soloRepoOf(data, solo);
  if (alone) return rows.filter((r) => foldedName(r.repo) === foldedName(alone) && visible(r)).map((row) => ({ row }));
  const lines = [];
  for (const g of repoGroups(data, rows, visible)) {
    lines.push({ group: groupOf(g), shown: g.rows.length, held: g.held });
    lines.push(...g.rows.map((row) => ({ row })));
  }
  for (const repo of waitingRepos(data)) lines.push({ group: groupOf(repoLook(data, repo)), waiting: true });
  return lines;
}

// The switches of the repo menu, whose counts the list of the field
// „Repo:“ shows too: the repos with issues in the read, where their first
// row stands, then the owner's other repos turned on, by name, those
// waiting among them, then those turned off: {
// repo, name, foreign, hidden, held (its issues read; null for a repo
// turned off or waiting), shown (those `visible` lets through) }.
export function issueSwitches(data, visible) {
  const { switches, add } = countedSwitches(data, keptIssues(data), visible);
  const waiting = new Set(foldedRepos(waitingRepos(data)));
  for (const repo of [...data.repos, ...waitingRepos(data)]) if (!hidesRepo(data, repo)) add(repo, { held: waiting.has(foldedName(repo)) ? null : 0 });
  for (const repo of data.hideRepos) add(repo, { held: null });
  return [...switches.values()];
}

// The tone of a row's stripe: a closed issue's by the reason GitHub gives
// (stateReason), violet for completed, grey for any other, as GitHub draws
// them; none for an open one.
export const closedTone = (data, row) => (data.meta.state !== "closed" ? null : row.stateReason === "COMPLETED" ? COPPER_HUES.violet : "muted");

// The data as its saved state keeps it: its rows packed (packRows), each
// as keptGithubRow keeps it, without its contentId, its key; and that form
// read back.
export function savedIssues(data) {
  const { rows, ...rest } = data;
  return { ...rest, packed: packRows(rows.map(({ contentId, ...row }) => keptGithubRow(row))) };
}

export function issuesFromSaved(data) {
  const { packed, ...rest } = data;
  return { ...rest, rows: unpackRows(packed).map((row) => ({ ...githubRowBack(row), contentId: row.key })) };
}
