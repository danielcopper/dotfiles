// A GitHub project's fields as the board reads them: per kind of field, an
// item's value of it, and items in a view's order, in the groups of its
// "Group by" field and by its sort keys. sources/github.js reads the values
// from GitHub's answers; a table (kinds/table.js, ui/shapes/table.js) draws
// its rows' values and places a changed row anew by the same rules.

// Theme colors for GitHub's named colors: a Projects v2 option's and an
// issue type's (IssueTypeColor), which share the names.
export const GITHUB_COLORS = {
  GRAY: "muted", BLUE: "ansi4", GREEN: "ansi2", YELLOW: "ansi3", ORANGE: "ansi11", RED: "ansi1", PINK: "ansi13", PURPLE: "ansi5",
};

// The id of the column and of the group of the items without a value,
// outside the ids of the others (a group's is `v:` and its value's key).
export const NO_VALUE = "none";

const lower = (text) => String(text ?? "").toLowerCase();
const textValue = (name) => (name ? { key: name, name, rank: lower(name) } : null);
const countValue = (n) => ({ key: String(n), name: String(n), rank: n });

// Per type of a project's field, an item's value of it as the board groups,
// sorts and draws it: { key (the value's own), name (as a column, group or
// cell names it), rank (its place: a number, else a text compared as such),
// color (a single-select option's, as a theme name) }, or null for no value.
// `byName`: the items' query reads it by name (fieldValueByName, `value`);
// of the others an item's card holds it. A field of a type not here is one
// the board does not read.
const VALUES = {
  SINGLE_SELECT: {
    byName: true,
    of(field, value) {
      const at = (field.options ?? []).findIndex((o) => (value?.optionId ? o.id === value.optionId : o.name === value?.name));
      if (at < 0) return null;
      const option = field.options[at];
      return { key: option.id, name: option.name, rank: at, color: GITHUB_COLORS[option.color] ?? "muted" };
    },
  },
  ITERATION: {
    byName: true,
    of(field, value) {
      const at = (field.iterations ?? []).findIndex((i) => i.id === value?.iterationId);
      if (at >= 0) return { key: value.iterationId, name: field.iterations[at].title, rank: at };
      return value?.iterationId ? { key: value.iterationId, name: value.title ?? value.iterationId, rank: -1 } : null;
    },
  },
  NUMBER: { byName: true, of: (_f, value) => (typeof value?.number === "number" ? countValue(value.number) : null) },
  DATE: { byName: true, of: (_f, value) => (typeof value?.date === "string" && value.date ? { key: value.date, name: value.date, rank: value.date } : null) },
  TEXT: { byName: true, of: (_f, value) => textValue(typeof value?.text === "string" ? value.text : null) },
  // None linked counts as no value, an empty cell as on GitHub.
  LINKED_PULL_REQUESTS: { byName: true, of: (_f, value) => (value?.pullRequests?.totalCount > 0 ? countValue(value.pullRequests.totalCount) : null) },
  TITLE: { of: (_f, _v, card) => textValue(card.title) },
  ASSIGNEES: { of: (_f, _v, card) => textValue(card.assignees.join(", ")) },
  LABELS: { of: (_f, _v, card) => textValue(card.labels.join(", ")) },
  MILESTONE: { of: (_f, _v, card) => textValue(card.milestone) },
  REPOSITORY: { of: (_f, _v, card) => textValue(card.repo) },
  PARENT_ISSUE: { of: (_f, _v, card) => (card.parent === null ? null : textValue(card.parentTitle ?? `#${card.parent}`)) },
  ISSUE_TYPE: { of: (_f, _v, card) => textValue(card.type) },
  SUB_ISSUES_PROGRESS: {
    of: (_f, _v, card) => (card.sub ? { key: `${card.sub.done}/${card.sub.total}`, name: `${card.sub.done}/${card.sub.total}`, rank: card.sub.done / card.sub.total } : null),
  },
};
export const readable = (field) => Object.hasOwn(VALUES, field.type);
export const readByName = (field) => VALUES[field.type]?.byName === true;
export const valueOf = (field, value, card) => VALUES[field.type]?.of(field, value, card) ?? null;

// Where a table's row holds a field's value: "cell" (read by name, in the
// row's cells), "card" (the row's card holds it, read as it draws), or null
// (a kind the board does not read).
export const fromOf = (field) => (!readable(field) ? null : readByName(field) ? "cell" : "card");
export const cardValue = (field, card) => valueOf(field, null, card);

const byRank = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

// Two ranks by a sort key, those without one (null) last whichever the
// direction.
function bySort(a, b, direction) {
  const none = (rank) => rank === null || rank === undefined;
  if (none(a) || none(b)) return Number(none(a)) - Number(none(b));
  const diff = byRank(a, b);
  return direction === "DESC" ? -diff : diff;
}

export const groupId = (value) => (value ? `v:${value.key}` : NO_VALUE);

// The groups of a view's "Group by" field `field` (a board's swimlanes, a
// table's groups): one per value its items hold (`entries`, each with its
// `groupValue`), in the field's order (a single-select's options, an
// iteration's iterations, else by value), the items without one last.
export function groupsOf(field, entries) {
  const seen = new Map();
  for (const e of entries) if (e.groupValue && !seen.has(e.groupValue.key)) seen.set(e.groupValue.key, e.groupValue);
  const groups = [...seen.values()].sort((a, b) => byRank(a.rank, b.rank)).map((v) => ({ id: groupId(v), name: v.name, color: v.color ?? "muted" }));
  if (entries.some((e) => !e.groupValue)) groups.push({ id: NO_VALUE, name: `Ohne ${field.name}`, color: "dim" });
  return groups;
}

export function orderEntry(order, groupBy, sorts, value) {
  const groupValue = groupBy ? value(groupBy) : null;
  return { order, groupValue, group: groupId(groupValue), ranks: sorts.map((s, k) => value(s.field, k)?.rank ?? null) };
}

// Items in the order a view shows them (`entries`, each with its `group`'s
// id, the `ranks` of its sort keys and its place in GitHub's order, `order`):
// by their group's place in `groups` where the view groups, then by the
// sort keys `sorts` ([{ direction }]) one after the other, those without a
// value last, then in GitHub's order.
export function viewOrder(entries, groups, sorts) {
  const groupAt = new Map((groups ?? []).map((g, i) => [g.id, i]));
  return [...entries].sort((a, b) => {
    if (groups) {
      const group = groupAt.get(a.group) - groupAt.get(b.group);
      if (group) return group;
    }
    for (const [k, s] of sorts.entries()) {
      const diff = bySort(a.ranks[k], b.ranks[k], s.direction);
      if (diff) return diff;
    }
    return a.order - b.order;
  });
}
