// This machine's settings over views.json; where they lie, how they merge
// and how they are written: README, "herdr app". A path names keys from the
// top, an entry of a list by its "id".

import { BoardError, CONFIG_NAME, isObject, isText } from "./shared.js";

export const SETTINGS_FILE = "board/settings.json";
export const settingsPath = (appHome) => `${appHome}/${SETTINGS_FILE}`;

export const ORIGIN = { machine: "dieser Rechner", base: `${CONFIG_NAME}.json`, builtin: "Standard" };

const pathText = (path) => `„${path.join(".")}“`;
const pathKey = (path) => JSON.stringify(path);
const hasId = (entry) => isObject(entry) && isText(entry.id);

export const entryById = (list, id) => list.find((e) => hasId(e) && e.id === id);

function child(node, key) {
  if (Array.isArray(node)) return entryById(node, key);
  return isObject(node) ? node[key] : undefined;
}

function valueAt(node, keys) {
  for (const key of keys) {
    if (node === undefined) return undefined;
    node = child(node, key);
  }
  return node;
}

export function readSettings(text, name) {
  if (text === null || text === undefined) return { settings: {}, errors: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { settings: null, errors: [`${name} ist kein gültiges JSON: ${e.message}`] };
  }
  return isObject(raw) ? { settings: raw, errors: [] } : { settings: null, errors: [`${name}: Oben muss ein Objekt stehen`] };
}

function mergeAt(base, over, path, out) {
  if (!isObject(over)) {
    out.set.set(pathKey(path), over);
    for (let i = 1; i < path.length; i++) out.below.add(pathKey(path.slice(0, i)));
    return over;
  }
  if (!Array.isArray(base)) {
    const merged = isObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(over)) merged[key] = mergeAt(merged[key], value, [...path, key], out);
    return merged;
  }
  if (!base.some(hasId)) {
    out.errors.push(`${pathText(path)} hat in ${ORIGIN.base} keinen Eintrag mit eigener „id“: hier nur als ganze Liste`);
    return base;
  }
  const merged = [...base];
  for (const [id, value] of Object.entries(over)) {
    const at = base.indexOf(entryById(base, id));
    if (at < 0) out.errors.push(`${pathText([...path, id])}: einen Eintrag mit „id“ „${id}“ gibt es in ${ORIGIN.base} nicht`);
    else merged[at] = mergeAt(base[at], value, [...path, id], out);
  }
  return merged;
}

// → { merged, errors, origin }: origin(path) is one of ORIGIN, never this
// machine's where the merge refused what it set.
export function mergeSettings(base, over) {
  const out = { errors: [], set: new Map(), below: new Set() };
  const merged = mergeAt(base, over, [], out);
  const origin = (path) => {
    for (let i = 1; i <= path.length; i++) {
      const key = pathKey(path.slice(0, i));
      if (out.set.has(key)) return valueAt(out.set.get(key), path.slice(i)) === undefined ? ORIGIN.builtin : ORIGIN.machine;
    }
    if (out.below.has(pathKey(path))) return ORIGIN.machine;
    return valueAt(base, path) === undefined ? ORIGIN.builtin : ORIGIN.base;
  };
  return { merged, errors: out.errors, origin };
}

// An undefined `value` resets: it takes the value out, and the objects that
// leaves empty.
export function withSetting(settings, path, value) {
  const top = structuredClone(settings);
  const parents = [top];
  for (const [i, key] of path.slice(0, -1).entries()) {
    const node = parents.at(-1);
    let next = child(node, key);
    if (next === undefined || (!isObject(next) && !Array.isArray(next))) {
      if (value === undefined) return top;
      if (next !== undefined) throw new BoardError(`${pathText(path)}: ${pathText(path.slice(0, i + 1))} ist auf diesem Rechner ein Wert, kein Objekt`);
      if (Array.isArray(node)) throw new BoardError(`${pathText(path)}: in der Liste dieses Rechners gibt es keinen Eintrag „${key}“`);
      next = node[key] = {};
    }
    parents.push(next);
  }
  const node = parents.at(-1);
  const last = path.at(-1);
  if (Array.isArray(node)) throw new BoardError(`${pathText(path)}: ein Eintrag einer Liste dieses Rechners ändert sich nur in seinen Werten oder mit der ganzen Liste`);
  if (value !== undefined) {
    node[last] = value;
    return top;
  }
  delete node[last];
  for (let i = parents.length - 1; i > 0; i--) {
    if (!isObject(parents[i]) || Object.keys(parents[i]).length) break;
    const parent = parents[i - 1];
    if (Array.isArray(parent)) break;
    delete parent[path[i - 1]];
  }
  return top;
}

// herdr's refusals of a write whose expected text is stale (mod_files.rs).
export const staleRefusal = (e) => /^The file changed (outside Herdr|while saving)\./.test(String(e?.message ?? e));
export const CHANGED_MEANWHILE = "die Datei hat sich inzwischen geändert; bitte die Änderung noch einmal machen";

export const settingsText = (settings) => `${JSON.stringify(settings, null, 2)}\n`;

// The file's text (null: there is none) after `changes`, [path, value] each:
// { text } (null: still none) or { error }.
export function settingsAfter(text, changes, name) {
  const { settings, errors } = readSettings(text, name);
  if (!settings) return { error: errors[0] };
  try {
    const next = changes.reduce((s, [path, value]) => withSetting(s, path, value), settings);
    return { text: text === null && !Object.keys(next).length ? null : settingsText(next) };
  } catch (e) {
    if (!(e instanceof BoardError)) throw e;
    return { error: e.message };
  }
}

export function sameAtPaths(then, now, changes, name) {
  const before = readSettings(then, name).settings;
  const after = readSettings(now, name).settings;
  if (!before || !after) return false;
  return changes.every(([path]) => JSON.stringify(valueAt(before, path)) === JSON.stringify(valueAt(after, path)));
}
