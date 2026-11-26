// This machine's settings over views.json; where they lie, how they merge
// and how they are written: README, "herdr app". A path names keys from the
// top, an entry of a list by its name: the value of the key `nameKeyAt(path
// of the list)` names (config.js; null: settings set the list only as a
// whole), which each function that walks a path takes.

import { BoardError, CONFIG_NAME, isObject, isText } from "./shared.js";

export const SETTINGS_FILE = "board/settings.json";
export const settingsFileIn = (appHome) => `${appHome}/${SETTINGS_FILE}`;

export const ORIGIN = { machine: "dieser Rechner", base: `${CONFIG_NAME}.json`, builtin: "Standard" };

export const pathText = (path) => `„${path.join(".")}“`;
const pathKey = (path) => JSON.stringify(path);
// A name is a text, or a number (a project's), which a path names as its
// digits.
const hasName = (entry, key) => isObject(entry) && (isText(entry[key]) || Number.isInteger(entry[key]));
const sameName = (own, name) => String(own) === String(name);

export const entryByName = (list, name, key) => list.find((e) => hasName(e, key) && sameName(e[key], name));

function child(node, key, path, nameKeyAt) {
  if (Array.isArray(node)) {
    const nameKey = nameKeyAt(path);
    return nameKey === null ? undefined : entryByName(node, key, nameKey);
  }
  return isObject(node) ? node[key] : undefined;
}

export function valueAt(node, keys, nameKeyAt) {
  for (const [i, key] of keys.entries()) {
    if (node === undefined) return undefined;
    node = child(node, key, keys.slice(0, i), nameKeyAt);
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
  const nameKey = out.nameKeyAt(path);
  if (nameKey === null) {
    out.errors.push(`${pathText(path)} lässt sich hier nur als ganze Liste setzen`);
    return base;
  }
  if (!base.some((e) => hasName(e, nameKey))) {
    out.errors.push(`${pathText(path)} hat in ${ORIGIN.base} keinen Eintrag mit eigenem Namen („${nameKey}“): hier nur als ganze Liste`);
    return base;
  }
  const merged = [...base];
  for (const [name, value] of Object.entries(over)) {
    const at = base.indexOf(entryByName(base, name, nameKey));
    if (at < 0) {
      out.errors.push(`${pathText([...path, name])}: einen Eintrag mit „${nameKey}“ „${name}“ gibt es in ${ORIGIN.base} nicht`);
      continue;
    }
    let own = value;
    if (isObject(value) && Object.hasOwn(value, nameKey) && !sameName(value[nameKey], name)) {
      out.errors.push(`${pathText([...path, name, nameKey])}: der Name des Eintrags ändert sich nur in ${ORIGIN.base}`);
      own = Object.fromEntries(Object.entries(value).filter(([key]) => key !== nameKey));
    }
    merged[at] = mergeAt(base[at], own, [...path, name], out);
  }
  return merged;
}

// → { merged, errors, origin }: origin(path) is one of ORIGIN, never this
// machine's where the merge refused what it set.
export function mergeSettings(base, over, nameKeyAt) {
  const out = { errors: [], set: new Map(), below: new Set(), nameKeyAt };
  const merged = mergeAt(base, over, [], out);
  const origin = (path) => {
    for (let i = 1; i <= path.length; i++) {
      const key = pathKey(path.slice(0, i));
      if (out.set.has(key)) return valueAt(out.set.get(key), path.slice(i), (rest) => nameKeyAt([...path.slice(0, i), ...rest])) === undefined ? ORIGIN.builtin : ORIGIN.machine;
    }
    if (out.below.has(pathKey(path))) return ORIGIN.machine;
    return valueAt(base, path, nameKeyAt) === undefined ? ORIGIN.builtin : ORIGIN.base;
  };
  return { merged, errors: out.errors, origin };
}

const copied = (value) =>
  Array.isArray(value) ? value.map(copied) : isObject(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copied(v)])) : value;

// An undefined `value` resets: it takes the value out, and the objects that
// leaves empty.
export function withSetting(settings, path, value, nameKeyAt) {
  const top = copied(settings);
  const parents = [top];
  for (const [i, key] of path.slice(0, -1).entries()) {
    const node = parents.at(-1);
    let next = child(node, key, path.slice(0, i), nameKeyAt);
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
export const CHANGED_SINCE = "die Datei hat sich inzwischen geändert";
export const CHANGED_MEANWHILE = `${CHANGED_SINCE}; bitte die Änderung noch einmal machen`;

export const settingsText = (settings) => `${JSON.stringify(settings, null, 2)}\n`;

// The file's text (null: there is none) after `changes`, [path, value] each:
// { text } (null: still none) or { error }.
export function settingsAfter(text, changes, name, nameKeyAt) {
  const { settings, errors } = readSettings(text, name);
  if (!settings) return { error: errors[0] };
  try {
    const next = changes.reduce((s, [path, value]) => withSetting(s, path, value, nameKeyAt), settings);
    return { text: text === null && !Object.keys(next).length ? null : settingsText(next) };
  } catch (e) {
    if (!(e instanceof BoardError)) throw e;
    return { error: e.message };
  }
}

export function sameAtPaths(then, now, changes, name, nameKeyAt) {
  const before = readSettings(then, name).settings;
  const after = readSettings(now, name).settings;
  if (!before || !after) return false;
  return changes.every(([path]) => JSON.stringify(valueAt(before, path, nameKeyAt)) === JSON.stringify(valueAt(after, path, nameKeyAt)));
}
