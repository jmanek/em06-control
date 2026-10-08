/**
 * Versioned, portable EM06 setup files.
 *
 * The wire format is deliberately independent from the in-memory UI state.
 * Only this module knows how to accept older files or produce the current
 * canonical representation.
 */

export const SETUP_FORMAT = 'em06-hub-setup';
export const CURRENT_SETUP_VERSION = 3;
export const PROFILE_COUNT = 4;
export const KEY_COUNT = 8;
export const MAX_COMBO_KEYS = 5;

const integer = (value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return value;
};

function normalizeKey(key, label) {
  if (!key || typeof key !== 'object' || Array.isArray(key)) throw new Error(`${label} must be an object`);
  return { type: integer(Number(key.type), `${label}.type`, { max: 65535 }), param: integer(Number(key.param), `${label}.param`, { max: 65535 }) };
}

function normalizeShortcut(combo, label) {
  if (combo === null || combo === undefined) return null;
  if (!Array.isArray(combo) || combo.length > MAX_COMBO_KEYS) throw new Error(`${label} must contain 0 to ${MAX_COMBO_KEYS} keys`);
  return combo.map((key, index) => {
    if (!key || typeof key !== 'object' || Array.isArray(key)) throw new Error(`${label}[${index}] must be an object`);
    return { type: integer(Number(key.type), `${label}[${index}].type`, { max: 1 }), value: integer(Number(key.value), `${label}[${index}].value`, { max: 255 }) };
  });
}

function normalizeProfile(profile, index, { allowMissingShortcuts = false } = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Profile ${index + 1} must be an object`);
  if (!Array.isArray(profile.keys) || profile.keys.length !== KEY_COUNT) throw new Error(`Profile ${index + 1} must contain exactly ${KEY_COUNT} keys`);
  const shortcuts = profile.shortcuts === undefined && allowMissingShortcuts ? Array(KEY_COUNT).fill(null) : profile.shortcuts;
  if (!Array.isArray(shortcuts) || shortcuts.length !== KEY_COUNT) throw new Error(`Profile ${index + 1} must contain exactly ${KEY_COUNT} shortcut entries`);
  const macros = profile.macros === undefined ? {} : profile.macros;
  if (!macros || typeof macros !== 'object' || Array.isArray(macros)) throw new Error(`Profile ${index + 1}.macros must be an object`);
  const normalizedMacros = {};
  for (const [slot, name] of Object.entries(macros)) {
    integer(Number(slot), `Profile ${index + 1}.macros slot`, { max: 255 });
    if (typeof name !== 'string' || name.length > 30) throw new Error(`Profile ${index + 1}.macros.${slot} must be a string of 30 characters or fewer`);
    normalizedMacros[String(Number(slot))] = name;
  }
  return {
    keys: profile.keys.map((key, keyIndex) => normalizeKey(key, `Profile ${index + 1}.keys[${keyIndex}]`)),
    shortcuts: shortcuts.map((combo, keyIndex) => normalizeShortcut(combo, `Profile ${index + 1}.shortcuts[${keyIndex}]`)),
    macros: normalizedMacros,
  };
}

function normalizeProfiles(profiles, options) {
  if (!Array.isArray(profiles) || profiles.length !== PROFILE_COUNT) throw new Error(`Setup must contain exactly ${PROFILE_COUNT} profiles`);
  return profiles.map((profile, index) => normalizeProfile(profile, index, options));
}

/** Convert the current in-memory profiles into the canonical export shape. */
export function serializeSetup(profiles) {
  return JSON.stringify({
    format: SETUP_FORMAT,
    version: CURRENT_SETUP_VERSION,
    profiles: normalizeProfiles(profiles),
  }, null, 2);
}

function migrateV2(value) {
  // v2 had the same key/shortcut data, but did not preserve macro names.
  return { ...value, version: 3, profiles: value.profiles.map((profile) => ({ ...profile, macros: {} })) };
}

function migrateV1(value) {
  // v1 was the pre-shortcut export shape: key records only.
  return { ...value, version: 2, profiles: value.profiles.map((profile) => ({ ...profile, shortcuts: Array(KEY_COUNT).fill(null) })) };
}

function migrate(value) {
  if (value.version === 1) return migrateV2(migrateV1(value));
  if (value.version === 2) return migrateV2(value);
  if (value.version === CURRENT_SETUP_VERSION) return value;
  if (value.version > CURRENT_SETUP_VERSION) throw new Error(`Setup version ${value.version} is newer than this app supports (latest is ${CURRENT_SETUP_VERSION})`);
  throw new Error(`Unsupported setup version ${value.version}`);
}

/** Parse, validate, migrate, and return canonical in-memory profile data. */
export function parseSetup(text) {
  let value;
  try { value = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('Setup file is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Setup file must contain a JSON object');
  if (value.format !== SETUP_FORMAT) throw new Error(`Unsupported setup format ${String(value.format ?? '(missing)')}`);
  integer(value.version, 'Setup version', { min: 1, max: Number.MAX_SAFE_INTEGER });
  const migrated = migrate(value);
  return normalizeProfiles(migrated.profiles, { allowMissingShortcuts: false });
}
