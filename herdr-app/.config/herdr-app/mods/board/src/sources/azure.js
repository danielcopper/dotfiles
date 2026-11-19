// Azure DevOps: work item types and their states, what az's failures mean,
// and the source as the board uses it (makeAzure). What the Azure views read
// and write comes with each view; these stay for them.

import { BoardError, failure } from "../shared.js";

// Theme colors and column order for Azure's state categories.
export const CATEGORIES = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"];
const CATEGORY_COLORS = { Proposed: "muted", InProgress: "ansi4", Resolved: "ansi5", Completed: "ansi2", Removed: "dim" };

// The work item types' answer → { states: [{ id, name, category, color }] in
// category order, types: { [type]: [state names] } }.
export function parseAzureTypes(stdout) {
  const types = {};
  const states = new Map();
  const value = JSON.parse(stdout)?.value;
  if (!Array.isArray(value)) throw new BoardError("Azure lieferte keine Work-Item-Typen");
  for (const type of value) {
    types[type.name] = (type.states ?? []).map((s) => s.name);
    for (const s of type.states ?? []) {
      if (!states.has(s.name)) states.set(s.name, { id: s.name, name: s.name, category: s.category, color: CATEGORY_COLORS[s.category] ?? "muted" });
    }
  }
  const order = (s) => (CATEGORIES.indexOf(s.category) + 1 || CATEGORIES.length + 1);
  return { states: [...states.values()].sort((a, b) => order(a) - order(b)), types };
}

// az's words for a request that may have reached Azure but got no clear
// answer: msrest's "Error occurred in request., <requests exception>: …"
// and the requests messages it wraps (ConnectionError, ReadTimeout, …).
const AZ_SENT_FAILURE = /Error occurred in request\.|HTTPSConnectionPool|Connection aborted|Read timed out|ReadTimeout|Max retries/i;
// Azure's answers that it failed itself: the Azure DevOps client's
// "Operation returned a 5xx status code.", TF400898 (an internal error), and
// msrest's RetryError after retrying 408 and 5xx answers ("too many 503
// error responses"), which also names "Max retries" and is tested first.
const AZ_SERVER_ERROR = /Operation returned a 5\d\d status code|TF400898|too many \d+ error responses/i;
// ERROR: answers that are a refusal: rule errors (TF401320), something that
// does not exist, az's own argument errors, and 4xx status lines.
const AZ_REFUSED = /^TF401320\b|does not exist|^argument |the following arguments are required|unrecognized arguments|Operation returned a 4\d\d status code|requires user authentication/i;

// What went wrong with an az call that ran, from its ERROR: line (WARNING:
// lines are left out; without an ERROR: line, from all it printed). Missing
// sign-in or extension are marked unavailable (BoardError). With
// `write`, a known refusal form (AZ_REFUSED) is a refusal, as are the
// sign-in, extension and project answers below; anything else (a request
// without a clear answer, a server error, az's own crash or interrupt, a
// failure without an ERROR: line) leaves open whether the change landed.
export function azFailure({ code, stderr }, on = null, { write = false } = {}) {
  const lines = String(stderr ?? "").split("\n").filter((l) => l.trim() && !/^WARNING:/.test(l));
  const errorLine = lines.find((l) => /^ERROR:/.test(l));
  const said = (errorLine ?? lines[0] ?? "").replace(/^ERROR:\s*/, "").trim();
  const az = on ? `az auf ${on}` : "az";
  // A crash's traceback may hold any words; az's own line says what failed.
  const subject = errorLine ? said : lines.join("\n");
  if (AZ_SERVER_ERROR.test(subject)) return failure(`Azure antwortete mit einem Fehler (${az}): ${said}`, { write, unclear: true });
  if (AZ_SENT_FAILURE.test(subject)) return failure(`Azure nicht erreichbar (${az}): ${said}`, { write, unclear: true });
  if (/Before you can run Azure DevOps commands|az (devops )?login/i.test(said)) {
    return new BoardError(`${az} ist nicht angemeldet (az login oder az devops login)`, { unavailable: true });
  }
  if (/'(boards|devops)' is misspelled or not recognized|is not in the 'az' command group/.test(said)) {
    return new BoardError(`${az}: die Erweiterung azure-devops fehlt (az extension add --name azure-devops)`, { unavailable: true });
  }
  if (/^TF200016:/.test(said)) return new BoardError(`Azure-Projekt unbekannt: ${said}`);
  return failure(on ? `${az}: ${said || `endete mit ${code}`}` : said || `az endete mit ${code}`, { write, unclear: !errorLine || !AZ_REFUSED.test(said) });
}

// The Azure source for the board, as makeGithub's: no view of it reads
// anything yet, so each shows what its kind says (KINDS).
export function makeAzure() {
  return { site: "Azure", views: {} };
}
