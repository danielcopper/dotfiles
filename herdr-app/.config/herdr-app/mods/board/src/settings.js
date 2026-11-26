// This machine's settings: a file outside the dotfiles laid over views.json.
// A list set there replaces the views.json list whole, a value overrides,
// an object merges key by key. Where views.json has a list whose entries
// each carry a unique text "id", an object there, keyed by id, merges into
// those entries. A path names keys from the top, an id in place of such a
// list's index.

import { BoardError, CONFIG_NAME, isObject, isText } from "./shared.js";

// Under herdr's app folder, which herdr does not watch outside mods/,
// layouts/, themes/ and its own files, and which stow leaves alone: no
// package has a board/ there, and .stow-local-ignore keeps every
// settings.json out of the herdr-app package.
export const SETTINGS_FILE = "board/settings.json";
export const settingsPath = (appHome) => `${appHome}/${SETTINGS_FILE}`;

export const ORIGIN = { machine: "dieser Rechner", base: `${CONFIG_NAME}.json`, builtin: "Standard" };

const pathText = (path) => `„${path.join(".")}“`;

// A list whose entries can be named by id: objects, each with its own.
export function idList(value) {
  if (!Array.isArray(value) || !value.every((e) => isObject(e) && isText(e.id))) return false;
  return new Set(value.map((e) => e.id)).size === value.length;
}

// The settings file's text (null: there is none) → { settings, errors },
// settings null where the text holds none; `name` names the file.
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

function mergeAt(base, over, path, errors) {
  if (!isObject(over)) return over;
  if (Array.isArray(base)) {
    if (!idList(base)) {
      errors.push(`${pathText(path)} ist in ${ORIGIN.base} eine Liste ohne „id“ je Eintrag: hier nur als ganze Liste`);
      return base;
    }
    for (const id of Object.keys(over)) {
      if (!base.some((e) => e.id === id)) errors.push(`${pathText([...path, id])}: einen Eintrag mit „id“ „${id}“ gibt es in ${ORIGIN.base} nicht`);
    }
    return base.map((e) => (Object.hasOwn(over, e.id) ? mergeAt(e, over[e.id], [...path, e.id], errors) : e));
  }
  const out = isObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(over)) out[key] = mergeAt(out[key], value, [...path, key], errors);
  return out;
}

// views.json's object with this machine's settings over it → { merged,
// errors }; an entry that names nothing to merge into is left out.
export function mergeSettings(base, over) {
  const errors = [];
  return { merged: mergeAt(base, over, [], errors), errors };
}

// Where the value at `path` comes from (ORIGIN): `over` is the settings
// applied, null when none are.
export function originOf(base, over, path) {
  let b = base;
  let m = over ?? undefined;
  for (const key of path) {
    if (m !== undefined && !isObject(m)) return ORIGIN.machine;
    m = m?.[key];
    b = Array.isArray(b) ? b.find((e) => isObject(e) && e.id === key) : isObject(b) ? b[key] : undefined;
  }
  if (m !== undefined) return ORIGIN.machine;
  return b === undefined ? ORIGIN.builtin : ORIGIN.base;
}

// The entry `key` names in `node`: a key of an object, the entry with that
// id in a list set here.
function child(node, key) {
  return Array.isArray(node) ? node.find((e) => isObject(e) && e.id === key) : node[key];
}

// The settings with `value` at `path`; undefined takes the path's value out
// (reset), and the objects it leaves empty with it.
export function withSetting(over, path, value) {
  const top = structuredClone(over);
  const parents = [top];
  let node = top;
  for (const key of path.slice(0, -1)) {
    let next = child(node, key);
    if (next === undefined && value === undefined) return top;
    if (!isObject(next) && !Array.isArray(next)) {
      if (Array.isArray(node)) throw new BoardError(`${pathText(path)}: in der Liste dieses Rechners gibt es keinen Eintrag „${key}“`);
      next = node[key] = {};
    }
    node = next;
    parents.push(node);
  }
  const last = path.at(-1);
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

export const settingsText = (over) => `${JSON.stringify(over, null, 2)}\n`;
